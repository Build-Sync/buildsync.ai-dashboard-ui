/**
 * lib/services/ai.ts
 *
 * WHAT   Stub of AI routing: classifyPrompt sorts a plain-English prompt into a task (Prompt-to-Plan, stress,
 *        cost, compliance or chat), routePrompt picks the agent from the routing table (falling back to the
 *        active agent when the chosen one is not connected) and returns a canned answer, plus a Proposal when
 *        the prompt asks for a model edit (detectEdit).
 * FOR    The command line when text is not a command (lib/commands.ts askAgent). Real model calls replace this
 *        behind the same signatures. Agents only ever propose edits.
 * DEBUG  - The wrong task is chosen: classifyPrompt uses keyword patterns, checked in the order p2p, stress,
 *          cost, compliance, chat.
 *        - No proposal appears: detectEdit recognises only three phrasings (concrete walls, steel frame, add a
 *          beam or column).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { AGENT_META, TASK_LABEL } from "../agents";
import type { AgentId, Proposal, TaskKind } from "../types";
import { hash, sleep, uid } from "../utils";

/* AI routing stub: classifies a plain-English prompt into a task, picks the agent from the
 * routing table, and returns a canned answer (plus a proposal for model edits).
 * Real calls replace this behind the same signature. */

/** Model context sent with a prompt (selection, level, view, jurisdiction). */
export interface AiContext {
  selection: string[];
  level: string;
  view: string;
  jurisdiction: string;
  shareContext: boolean;
}

/** An agent's answer: the task, the agent, text lines and an optional proposal. */
export interface AiResponse {
  task: TaskKind;
  agentId: AgentId;
  text: string[];
  proposal?: Proposal;
  /** Set when a different agent than the task default answered */
  fellBack?: boolean;
}

/** Decide which kind of task a prompt is. */
export function classifyPrompt(prompt: string): TaskKind {
  const p = prompt.toLowerCase();
  if (/(\d[\d,]*)\s*(sq|sf|square)|\b\d\s*-?\s*(bed|br)\b|bedroom|starter plan|design a|generate a/.test(p)) return "p2p";
  if (/stress|deflect|why is .* (failing|fail)|beam|load|hurricane|wind|seismic/.test(p)) return "stress";
  if (/cost|price|estimate|budget|how much|\$/.test(p)) return "cost";
  if (/code|complian|egress|fbc|permit|requirement|section|setback|legal/.test(p)) return "compliance";
  return "chat";
}

/** Recognise a request to change the model; returns the proposal effect or null. */
export function detectEdit(prompt: string): Proposal["effect"] | null {
  const p = prompt.toLowerCase();
  if (/(change|make|switch|convert).*(exterior )?walls?.*concrete|concrete.*exterior walls?/.test(p)) return "walls-concrete";
  if (/(switch|change|convert).*(steel)/.test(p)) return "steel-frame";
  if (/add (a )?(beam|post|column)/.test(p)) return "add-beam";
  return null;
}

const CANNED: Record<TaskKind, (ctx: AiContext, prompt: string) => string[]> = {
  compliance: (ctx) => [
    `Checked against ${ctx.jurisdiction}: 12 pass, 3 need review, 2 fail.`,
    "Biggest risk: floor beam B-L1-M1 exceeds the L/360 deflection limit (FBC-B §1604.3.1).",
    "Suggested fix: deepen the beam to 10\" or add a mid-span post. Flagged Requires PE Review.",
  ],
  cost: () => [
    "Hard cost estimate is $392,000 (±6%), $255/sf in Miami-Dade HVHZ.",
    "Largest line: concrete & CMU at $118,400 (30%). Impact glazing adds $58,900.",
    "Switching exterior walls to poured concrete would add about $18,400.",
  ],
  p2p: (_ctx, prompt) => [
    `Starter plan drafted from: “${prompt.slice(0, 64)}${prompt.length > 64 ? "…" : ""}”.`,
    "It passes the 14 code checks I can run, the structural pre-check and the budget target.",
    "Open it with the Prompt to Plan dialog (P2P) to review rooms, cost and schedule.",
  ],
  stress: (ctx) => [
    ctx.selection.length
      ? `Looking at ${ctx.selection[0]}: peak stress is 4.8 ksi at mid-span, 14% over the allowable 4.2 ksi.`
      : "Without a selection I checked the whole frame: the peak is at the Level 2 floor beam.",
    "Deflection is 0.92\" against a 0.60\" limit. Run STRESS to see the full calculation.",
  ],
  chat: (ctx) => [
    `I can see ${ctx.selection.length ? ctx.selection.length + " selected element(s)" : "no selection"} on ${ctx.level} in ${ctx.view}.`,
    "Ask me to check code, estimate cost, explain a failure, or propose a model change.",
  ],
};

/** Route a prompt to an agent and return its (mock) answer. */
export async function routePrompt(args: {
  prompt: string;
  activeAgent: AgentId;
  routing: Record<TaskKind, AgentId | "active">;
  connected: AgentId[];
  ctx: AiContext;
}): Promise<AiResponse> {
  const { prompt, activeAgent, routing, connected, ctx } = args;
  const task = classifyPrompt(prompt);
  const wanted = routing[task] === "active" ? activeAgent : (routing[task] as AgentId);
  const agentId = connected.includes(wanted) ? wanted : activeAgent;
  await sleep(520 + (hash(prompt) % 380));

  const effect = detectEdit(prompt);
  let proposal: Proposal | undefined;
  let text = CANNED[task](ctx, prompt);
  if (effect === "walls-concrete") {
    proposal = {
      id: uid("prop"),
      agentId,
      title: "Change exterior walls to poured concrete",
      effect,
      costDelta: 18_400,
      elementIds: ["W-L1-S", "W-L1-N", "W-L1-W", "W-L1-E", "W-L2-S", "W-L2-N", "W-L2-W", "W-L2-E"],
      changes: [
        { target: "Exterior walls (8 elements)", from: 'CMU 8" grouted', to: 'Cast-in-place concrete 8", f\'c 5000 psi' },
        { target: "Wall colour", from: "Light grey", to: "Concrete grey" },
        { target: "Cost", from: "$118,400", to: "$136,800 (+$18,400)" },
        { target: "Schedule", from: "CMU: 6 weeks", to: "Formwork + pour: 5 weeks" },
      ],
    };
    text = ["I can change all 8 exterior walls to poured concrete. Review the preview, then accept or reject."];
  } else if (effect === "steel-frame") {
    proposal = {
      id: uid("prop"),
      agentId,
      title: "Switch the primary frame to steel",
      effect,
      costDelta: 41_000,
      elementIds: ["C-A1", "C-C1", "C-A3", "C-C3", "B-L1-S", "B-L1-N", "B-L2-S", "B-L2-N"],
      changes: [
        { target: "Tie columns (10)", from: "Reinforced concrete 4-#6", to: "HSS 8×8×3/8 steel columns" },
        { target: "Bond beams (8)", from: "Reinforced concrete", to: "W10×22 steel beams" },
        { target: "Cost", from: "$392,000", to: "$433,000 (+$41,000)" },
        { target: "Corrosion", from: "n/a", to: "Hot-dip galvanized (coastal HVHZ)" },
      ],
    };
    text = ["A steel frame is feasible. It improves uplift capacity but adds cost and lead time. Preview below."];
  } else if (effect === "add-beam") {
    proposal = {
      id: uid("prop"),
      agentId,
      title: "Add a mid-span post under B-L1-M1",
      effect,
      costDelta: 2_900,
      elementIds: ["B-L1-M1"],
      changes: [
        { target: "B-L1-M1 span", from: "18'-0\" clear", to: "9'-0\" + 9'-0\" (post at mid-span)" },
        { target: "Deflection", from: "0.92\"", to: "0.11\" (limit 0.60\")" },
        { target: "Cost", from: "—", to: "+$2,900" },
      ],
    };
    text = ["Adding a post at mid-span brings deflection well inside the limit. Preview below."];
  }

  return { task, agentId, text, proposal, fellBack: agentId !== wanted };
}

/** The "→ Routed to X · task" line shown in the command history. */
export function routeLabel(task: TaskKind, agentId: AgentId): string {
  return `→ Routed to ${AGENT_META[agentId].name} · ${TASK_LABEL[task].toLowerCase()}`;
}
