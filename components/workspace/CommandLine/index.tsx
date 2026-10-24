/**
 * components/workspace/CommandLine/index.tsx
 *
 * WHAT   The command line at the bottom of the workspace: a short history log, suggestion chips, the input with
 *        Tab completion and Up / Down recall of earlier inputs, controls (voice, attach a file, reference the
 *        selection, clear context, AI history), pending agent proposals and the agent selector.
 * FOR    Typing a known command (LINE, ZOOM, GRID …) runs it locally; anything else is sent to the active AI
 *        agent together with the model context (useRunner().submit → runInput in lib/commands.ts). Agents only
 *        propose edits; each proposal is a ProposalCard to accept or reject.
 * OS     Enter and arrow keys that confirm an IME candidate are ignored (isComposingKey). Autocorrect,
 *        autocapitalise and spell-check are off so macOS and iPadOS leave command names alone.
 * DEBUG  - Typing does nothing: submit ignores empty text and is blocked while `cmdBusy` (an agent is
 *          answering).
 *        - Voice input is a mock: it fills in a sample command after 1.8 s; no microphone is used.
 *        - Up / Down recall: the list is kept in component state and holds the last 40 entries.
 *        - The input is focused when the workspace `cmdFocus` counter changes (setCmdInput with focus = true).
 *          Ctrl+9 / ⌘9 (CMDLINE in lib/commands.ts) shows or hides the whole command line.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { AgentLogo } from "@/components/ui/AgentLogo";
import { anchorOf, type Anchor } from "@/components/ui/Menu";
import { Spinner } from "@/components/ui/controls";
import { tip } from "@/components/ui/Tooltip";
import { AGENT_META } from "@/lib/agents";
import { COMMANDS } from "@/lib/commands";
import { isComposingKey } from "@/lib/platform";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import type { HistoryKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useRunner } from "../hooks";
import { AgentMenu } from "./AgentMenu";
import { ProposalCard } from "./ProposalCard";

/* Command line (bottom): history · suggestion chips · input · controls · agent selector.
 * Known commands run locally; anything else goes to the active agent with model context. */

const CHIPS = [
  "Run a structural analysis",
  "Find all clashes",
  "Why is this beam failing?",
  "Estimate the cost of this building",
  "Change all exterior walls to concrete",
];

const KIND_CLASS: Record<HistoryKind, string> = {
  cmd: "text-t2",
  ok: "text-ok",
  ai: "text-accent",
  warn: "text-warn",
  info: "text-t1/90",
};

/** The bottom command line with history, input, controls and agent selector. */
export function CommandLine() {
  const ws = useWsApi();
  const appApi = useAppApi();
  const { submit } = useRunner();
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const agentBtn = useRef<HTMLButtonElement>(null);
  const history = useApp((s) => s.history);
  const agents = useApp((s) => s.agents);
  const active = useApp((s) => s.activeAgentId);
  const sendFiles = useApp((s) => s.settings.ai.sendFiles);
  const value = useWs((s) => s.cmdInput);
  const focusTick = useWs((s) => s.cmdFocus);
  const busy = useWs((s) => s.cmdBusy);
  const proposals = useWs((s) => s.proposals);
  const selection = useWs((s) => s.selection);
  const agentOpen = useWs((s) => s.agentMenu);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [recall, setRecall] = useState<{ list: string[]; i: number }>({ list: [], i: -1 });
  const [listening, setListening] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [attached, setAttached] = useState<string | null>(null);

  const agent = agents.find((a) => a.id === active) ?? agents[0];
  const connectedCount = agents.filter((a) => a.connected).length;

  useEffect(() => {
    if (focusTick) input.current?.focus();
  }, [focusTick]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [history.length]);

  // the toolbar's "Switch Agent" command opens the menu
  useEffect(() => {
    if (agentOpen) {
      setAnchor(anchorOf(agentBtn.current, { up: true, right: true }));
      ws.getState().setAgentMenu(false);
    }
  }, [agentOpen, ws]);

  const token = value.trim().toUpperCase();
  const suggestions = useMemo(() => {
    if (!token || /\s/.test(value.trim()) || token.length < 1) return [];
    const out = new Set<string>();
    for (const d of COMMANDS) {
      for (const n of [d.name, ...(d.aliases ?? [])]) {
        if (n.length > token.length && n.startsWith(token) && !n.includes(" ") && !n.startsWith("-")) out.add(n);
      }
    }
    return [...out].sort((a, b) => a.length - b.length).slice(0, 6);
  }, [token, value]);

  const send = () => {
    const text = value.trim();
    if (!text || busy) return;
    setRecall((r) => ({ list: [text, ...r.list.slice(0, 40)], i: -1 }));
    ws.getState().setCmdInput("", false);
    setAttached(null);
    submit(attached ? `${text} [attached: ${attached}]` : text);
  };

  const mic = () => {
    if (listening) return;
    setListening(true);
    appApi.getState().toast("Listening… (voice input is mocked)", "info");
    setTimeout(() => {
      setListening(false);
      ws.getState().setCmdInput("Find all clashes");
    }, 1800);
  };

  const shown = history.slice(-4);

  return (
    <section aria-label="Command line" className="shrink-0 border-t border-line bg-chrome" data-testid="cmdline">
      <div ref={log} className="mono max-h-[4.75rem] overflow-y-auto px-3 pt-1.5 text-[0.6875rem] leading-[1.45]" role="log" aria-live="polite" aria-label="Command history">
        {shown.map((h) => (
          <div key={h.id} className={cn("truncate", KIND_CLASS[h.kind])} title={h.text}>
            {h.text}
          </div>
        ))}
      </div>

      {showHistory && (
        <div className="anim-pop absolute bottom-[8.2rem] right-3 z-40 flex max-h-72 w-[30rem] flex-col rounded-lg border border-line bg-chrome shadow-pop">
          <div className="flex items-center justify-between border-b border-soft px-3 py-1.5">
            <span className="label-xs !text-t1">AI history</span>
            <div className="flex gap-3 text-[0.6875rem]">
              <button className="text-t2 hover:text-t1" onClick={() => appApi.getState().clearHistory()}>
                Clear
              </button>
              <button className="text-t2 hover:text-t1" onClick={() => setShowHistory(false)} aria-label="Close history">
                <Icon name="close" size={12} />
              </button>
            </div>
          </div>
          <div className="mono min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[0.6875rem] leading-[1.5]">
            {history.length === 0 && <span className="text-t3">Nothing yet.</span>}
            {history.map((h) => (
              <div key={h.id} className={cn("whitespace-pre-wrap", KIND_CLASS[h.kind])}>
                {h.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {proposals.map((p) => (
        <ProposalCard key={p.id} p={p} />
      ))}

      <div className="flex gap-1.5 overflow-x-auto px-3 py-1.5" aria-label="Suggestions">
        {CHIPS.map((c) => (
          <button key={c} onClick={() => ws.getState().setCmdInput(c)} className="shrink-0 rounded-full border border-line px-2.5 py-0.5 text-[0.6875rem] text-t2 transition-colors hover:border-accent hover:text-t1">
            {c}
          </button>
        ))}
      </div>

      <div className="relative flex h-9 items-center gap-1.5 border-t border-soft px-2">
        <button aria-label="Close command line" onClick={() => ws.getState().toggleDock("cmdline", false)} className="grid size-6 place-items-center rounded text-t3 hover:bg-t1/10 hover:text-t1" {...tip("Close", "Hide the command line", "CMDLINE")}>
          <Icon name="close" size={13} />
        </button>
        <span className="text-accent" aria-hidden="true">
          <Icon name="ask" size={15} />
        </span>
        <div className="relative min-w-0 flex-1">
          {suggestions.length > 0 && (
            <ul className="mono absolute bottom-full left-0 mb-1 flex gap-1 rounded-md border border-line bg-chrome px-1.5 py-1 text-[0.6875rem] shadow-pop" role="listbox" aria-label="Command suggestions">
              {suggestions.map((s) => (
                <li key={s}>
                  <button role="option" aria-selected={false} className="rounded px-1.5 py-px text-t2 hover:bg-accent/20 hover:text-t1" onClick={() => ws.getState().setCmdInput(s)}>
                    {s}
                  </button>
                </li>
              ))}
              <li className="px-1 text-t3">Tab</li>
            </ul>
          )}
          <input
            ref={input}
            data-testid="cmd-input"
            aria-label="Command line"
            value={value}
            onChange={(e) => ws.getState().setCmdInput(e.target.value, false)}
            onKeyDown={(e) => {
              if (isComposingKey(e)) return; // Enter / arrows confirm an IME candidate; they are not commands
              if (e.key === "Enter") {
                e.preventDefault();
                send();
              } else if (e.key === "Tab" && suggestions.length) {
                e.preventDefault();
                ws.getState().setCmdInput(suggestions[0], false);
              } else if (e.key === "ArrowUp" && recall.list.length) {
                e.preventDefault();
                const i = Math.min(recall.i + 1, recall.list.length - 1);
                setRecall({ ...recall, i });
                ws.getState().setCmdInput(recall.list[i], false);
              } else if (e.key === "ArrowDown" && recall.i >= 0) {
                e.preventDefault();
                const i = recall.i - 1;
                setRecall({ ...recall, i });
                ws.getState().setCmdInput(i >= 0 ? recall.list[i] : "", false);
              } else if (e.key === "Escape") {
                ws.getState().setCmdInput("", false);
                ws.getState().setTool(null);
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="Type a command (SECTION, 2D, STRESS, SETTINGS…) or ask BuildSync AI in plain English"
            className="mono h-7 w-full bg-transparent text-[0.75rem] text-t1 outline-none placeholder:text-t3"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>
        {attached && (
          <span className="mono flex shrink-0 items-center gap-1 rounded bg-t1/10 px-1.5 py-0.5 text-[0.625rem] text-t2">
            <Icon name="file" size={10} /> {attached}
            <button aria-label="Remove attachment" onClick={() => setAttached(null)}>
              <Icon name="close" size={9} />
            </button>
          </span>
        )}
        {busy && <Spinner size={14} />}
        <div className="flex items-center gap-0.5 border-l border-soft pl-1.5">
          <button aria-label="Voice input" aria-pressed={listening} onClick={mic} className={cn("grid size-6 place-items-center rounded hover:bg-t1/10", listening ? "text-bad anim-pulse" : "text-t2 hover:text-t1")} {...tip("Voice", "Dictate a command or question", "VOICE")}>
            <Icon name="mic" size={14} />
          </button>
          <label className="grid size-6 cursor-pointer place-items-center rounded text-t2 hover:bg-t1/10 hover:text-t1" {...tip("Attach file / image", sendFiles ? "Sent to the active agent with your prompt" : "Stays on BuildSync: 'Send project files to agents' is off", "ATTACH")}>
            <Icon name="paperclip" size={14} />
            <input
              type="file"
              className="sr-only"
              accept="image/*,.pdf,.dwg,.dxf"
              aria-label="Attach file or image"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setAttached(f.name);
                  appApi.getState().log("info", `Attached ${f.name}${sendFiles ? "" : " (stays on BuildSync; agents don't receive files)"}`);
                }
                e.target.value = "";
              }}
            />
          </label>
          <button
            aria-label="Reference selection"
            disabled={!selection.length}
            onClick={() => ws.getState().setCmdInput(`${value}${value && !value.endsWith(" ") ? " " : ""}@${selection[0]}${selection.length > 1 ? ` (+${selection.length - 1})` : ""} `)}
            className="grid size-6 place-items-center rounded text-t2 hover:bg-t1/10 hover:text-t1 disabled:opacity-35"
            {...tip("Reference selection", selection.length ? `Insert @${selection[0]} into the prompt` : "Select an element first", "@")}
          >
            <Icon name="target" size={14} />
          </button>
          <button
            aria-label="Clear context"
            onClick={() => {
              ws.getState().clearSelection();
              appApi.getState().log("info", "Context cleared: no selection is shared with the agent");
            }}
            className="grid size-6 place-items-center rounded text-t2 hover:bg-t1/10 hover:text-t1"
            {...tip("Clear context", "Clear the selection shared with the agent", "CLEARCTX")}
          >
            <Icon name="trash" size={14} />
          </button>
          <button aria-label="AI history" aria-pressed={showHistory} onClick={() => setShowHistory(!showHistory)} className={cn("grid size-6 place-items-center rounded hover:bg-t1/10", showHistory ? "text-accent" : "text-t2 hover:text-t1")} {...tip("AI history", "Show the full command and AI log", "HISTORY")}>
            <Icon name="history" size={14} />
          </button>
        </div>
        <button
          ref={agentBtn}
          onClick={() => setAnchor(anchorOf(agentBtn.current, { up: true, right: true }))}
          aria-haspopup="menu"
          data-testid="agent-selector"
          className="flex h-6 items-center gap-1.5 rounded-md border border-line px-2 text-[0.75rem] text-t1 transition-colors hover:border-accent"
          {...tip("Active agent", `${connectedCount} connected. Click to switch or manage connectors`, "AGENT")}
        >
          {agent.connected ? <AgentLogo id={agent.id} size={14} className="!rounded" /> : <span className="size-2 rounded-full bg-t3" />}
          <span className="size-1.5 rounded-full" style={{ background: agent.connected ? "var(--ok)" : "var(--t3)" }} />
          {AGENT_META[agent.id].name}
          <Icon name="chevDown" size={12} className="text-t3" />
        </button>
        <AgentMenu anchor={anchor} onClose={() => setAnchor(null)} />
      </div>
    </section>
  );
}
