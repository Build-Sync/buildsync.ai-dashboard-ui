/**
 * components/workspace/Palettes/Council.tsx
 *
 * WHAT   The Agent Council palette: a decision is put to several connected agents; each takes a role and votes,
 *        and the palette shows the votes and the outcome.
 * FOR    Second opinions on a design decision. It needs two or more connected agents; otherwise it explains how
 *        to connect more.
 * DEBUG  - Run is disabled: the question is empty or a council is already running.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { AgentLogo } from "@/components/ui/AgentLogo";
import { Pill, Spinner } from "@/components/ui/controls";
import { AGENT_META } from "@/lib/agents";
import { useApp } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import type { Vote } from "@/lib/services/analysis";

const VOTE: Record<Vote, { label: string; tone: "ok" | "warn" | "bad" }> = {
  support: { label: "Support", tone: "ok" },
  conditional: { label: "Conditional", tone: "warn" },
  oppose: { label: "Oppose", tone: "bad" },
};

/* Agent Council: a decision goes to several connected agents; each takes a role and votes.
 * Needs 2+ connected agents (spec §10.8). */
export function Council() {
  const ws = useWsApi();
  const council = useWs((s) => s.council);
  const agents = useApp((s) => s.agents);
  const connected = agents.filter((a) => a.connected);
  const enough = connected.length >= 2;

  if (!enough) {
    return (
      <div className="p-4" data-testid="palette-council">
        <div className="rounded-xl border border-dashed border-line p-4 text-center">
          <div className="mx-auto mb-3 flex justify-center -space-x-2">
            {connected.map((a) => (
              <AgentLogo key={a.id} id={a.id} className="ring-2 ring-panel" />
            ))}
            <span className="grid size-7 place-items-center rounded-lg border border-dashed border-t3 bg-panel text-t3">
              <Icon name="plus" size={14} />
            </span>
          </div>
          <p className="text-[0.8125rem] font-semibold text-t1">Connect another agent</p>
          <p className="mx-auto mt-1 max-w-[16rem] text-[0.75rem] text-t2">The Council needs two or more connected agents so they can debate a decision and vote.</p>
          <Link href="/settings/integrations" className="btn btn-primary mt-3 h-7">
            Open Connectors
          </Link>
        </div>
      </div>
    );
  }

  const r = council.result;
  const total = r ? r.cards.length : 0;
  return (
    <div data-testid="palette-council">
      <div className="space-y-2 border-b border-soft p-3">
        <label className="label-xs" htmlFor="council-q">
          Decision
        </label>
        <textarea id="council-q" rows={2} className="input h-auto resize-none py-1.5" value={council.question} onChange={(e) => ws.getState().setCouncilQuestion(e.target.value)} placeholder="Should we switch to a steel frame?" />
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {connected.map((a) => (
              <AgentLogo key={a.id} id={a.id} size={20} className="ring-2 ring-panel" />
            ))}
          </div>
          <span className="flex-1 text-[0.6875rem] text-t3">{connected.length} agents will take roles</span>
          <button className="btn btn-primary h-7" disabled={council.running || !council.question.trim()} onClick={() => void ws.getState().runCouncil(council.question.trim(), connected.map((a) => a.id))} data-testid="run-council">
            {council.running ? <Spinner size={13} /> : <Icon name="council" size={13} />} Convene
          </button>
        </div>
      </div>

      {r ? (
        <div className="p-3" data-testid="council-result">
          <div className="rounded-lg border border-line bg-panel-alt p-2.5">
            <div className="flex items-center gap-1.5 text-[0.6875rem] text-t3">
              <Icon name="council" size={12} /> Tally
            </div>
            <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-line">
              {(["support", "conditional", "oppose"] as Vote[]).map((v) => (
                <div key={v} style={{ width: `${(r.tally[v] / total) * 100}%`, background: `var(--${VOTE[v].tone})` }} />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[0.75rem]">
              {(["support", "conditional", "oppose"] as Vote[]).map((v) => (
                <span key={v} className="text-t2">
                  <b className="mono" style={{ color: `var(--${VOTE[v].tone})` }}>
                    {r.tally[v]}
                  </b>{" "}
                  {VOTE[v].label}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[0.75rem] font-medium text-t1">{r.verdict}</p>
          </div>
          <ul className="mt-3 space-y-2">
            {r.cards.map((c) => (
              <li key={c.role} className="rounded-lg border border-line bg-panel p-2.5">
                <div className="flex items-center gap-2">
                  <AgentLogo id={c.agentId} size={24} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.75rem] font-semibold text-t1">{c.role}</div>
                    <div className="text-[0.625rem] text-t3">{AGENT_META[c.agentId].name}</div>
                  </div>
                  <Pill tone={VOTE[c.vote].tone}>{VOTE[c.vote].label}</Pill>
                </div>
                <p className="mt-1.5 text-[0.75rem] leading-snug text-t2">{c.argument}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="px-3 py-6 text-center text-[0.75rem] text-t3">{council.running ? "The agents are debating…" : "Put a big decision to the Council. Each agent takes a role and casts a vote."}</p>
      )}
    </div>
  );
}
