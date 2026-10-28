/**
 * components/workspace/Palettes/AiAnalysis.tsx
 *
 * WHAT   The AI Analysis palette: pick a connected agent, run an analysis, and read its recommendations (error,
 *        code, structural, design, material, cost-saving …) with cost and impact changes. A chip names the
 *        agent that answered.
 * FOR    Recommendations from external AI agents (lib/services/analysis.ts, mock). "Show" zooms to the element;
 *        "Apply" is the user's explicit approval: it records the recommendation as applied (one undo step) and
 *        adds its cost change to the project total.
 * DEBUG  - Run is disabled: no agent is connected, or a run is in progress; connect one in Settings →
 *          Integrations.
 *        - Apply is disabled: that recommendation is already in `appliedRecs` in the workspace store.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Icon } from "@/components/icons";
import { AgentLogo } from "@/components/ui/AgentLogo";
import { EmptyState, Pill, Select, Spinner } from "@/components/ui/controls";
import { AGENT_META } from "@/lib/agents";
import { REC_LABEL, type RecCategory } from "@/lib/services/analysis";
import { useApp } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import type { AgentId } from "@/lib/types";
import { fmtMoney } from "@/lib/utils";

const TONE: Record<RecCategory, "bad" | "warn" | "ok" | "info" | "neutral"> = {
  error: "bad",
  code: "warn",
  structural: "warn",
  design: "info",
  material: "info",
  "cost-saving": "ok",
  constructability: "neutral",
  efficiency: "ok",
};

/* AI Analysis: "Answered by [agent]" chip + recommendations with cost / impact deltas. */
export function AiAnalysis() {
  const ws = useWsApi();
  const state = useWs((s) => s.aiAnalysis);
  const applied = useWs((s) => s.appliedRecs);
  const agents = useApp((s) => s.agents);
  const active = useApp((s) => s.activeAgentId);
  const currency = useApp((s) => s.settings.units.currency);
  const connected = agents.filter((a) => a.connected);
  const agentId: AgentId | undefined = state.agentId ?? (connected.find((a) => a.id === active) ?? connected[0])?.id;

  const run = (id: AgentId) => void ws.getState().runAnalysis(id);

  return (
    <div data-testid="palette-ai">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-soft px-2.5 py-2">
        {state.agentId ? (
          <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-panel-alt py-0.5 pl-1 pr-2.5 text-[0.6875rem] text-t2" data-testid="answered-by">
            <AgentLogo id={state.agentId} size={16} />
            Answered by <b className="text-t1">{AGENT_META[state.agentId].name}</b>
          </span>
        ) : (
          <span className="text-[0.6875rem] text-t3">Not Run Yet</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Select<AgentId>
            label="Agent"
            className="!h-6 !min-w-[6rem] !px-1.5 !text-[0.6875rem]"
            value={agentId ?? "claude"}
            onChange={(v) => ws.getState().patch({ aiAnalysis: { ...state, agentId: v } })}
            options={agents.map((a) => ({ value: a.id, label: a.name + (a.connected ? "" : " (off)"), disabled: !a.connected }))}
          />
          <button className="btn btn-primary h-6 shrink-0 whitespace-nowrap px-2.5 text-[0.6875rem]" disabled={!agentId || state.running || !connected.length} onClick={() => agentId && run(agentId)} data-testid="run-analysis">
            {state.running ? <Spinner size={12} /> : <Icon name="refresh" size={12} />} {state.items ? "Re-Run" : "Run"}
          </button>
        </div>
      </div>

      {!state.items ? (
        <EmptyState icon="aireview" title={state.running ? "Reviewing the model…" : "No Analysis Yet"} hint="Run a design review to get recommendations for design, structure, materials, cost, constructability and code, plus detected errors." />
      ) : state.items.length === 0 ? (
        <EmptyState icon="aireview" title="Nothing to Review" hint="Add elements to the model first." />
      ) : (
        <ul>
          {state.items.map((r) => {
            const done = applied.includes(r.id);
            return (
              <li key={r.id} className="border-b border-soft/70 px-2.5 py-2.5">
                <div className="flex items-center gap-1.5">
                  <Pill tone={TONE[r.category]}>{REC_LABEL[r.category]}</Pill>
                  {r.costDelta !== undefined && (
                    <span className="mono ml-auto text-[0.6875rem] font-semibold" style={{ color: r.costDelta <= 0 ? "var(--ok)" : "var(--warn)" }}>
                      {r.costDelta < 0 ? "−" : "+"}
                      {fmtMoney(Math.abs(r.costDelta), currency)}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 text-[0.75rem] font-medium leading-snug text-t1">{r.title}</div>
                <p className="mt-0.5 text-[0.6875rem] leading-snug text-t2">{r.detail}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  {r.impact && <span className="text-[0.6875rem] text-t3">{r.impact}</span>}
                  <span className="flex-1" />
                  {r.elementId && (
                    <button className="text-[0.6875rem] text-t2 hover:text-accent" onClick={() => ws.getState().focusElements([r.elementId!])}>
                      Show
                    </button>
                  )}
                  <button className="text-[0.6875rem] font-medium text-accent hover:underline disabled:text-t3 disabled:no-underline" disabled={done} onClick={() => ws.getState().applyRecommendation(r.id)}>
                    {done ? "Applied ✓" : "Apply"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
