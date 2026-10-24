/**
 * components/workspace/CommandLine/ProposalCard.tsx
 *
 * WHAT   A card showing one edit proposed by an AI agent: who proposes it, the title, the cost change, a before
 *        / after list of the changes, and Reject / Accept buttons.
 * FOR    Edit safety: agents only propose; nothing changes in the model until the user accepts, and the
 *        affected elements glow amber in the viewport while the proposal is pending. Accept and Reject call
 *        acceptProposal / rejectProposal in the workspace store.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Icon } from "@/components/icons";
import { AgentLogo } from "@/components/ui/AgentLogo";
import { AGENT_META } from "@/lib/agents";
import { useApp } from "@/lib/store/app-provider";
import { useWsApi } from "@/lib/store/workspace-provider";
import type { Proposal } from "@/lib/types";
import { fmtMoney } from "@/lib/utils";

/* Edit safety (spec §10.10): agents only PROPOSE model edits. Every proposal shows a preview diff
 * with Accept / Reject. While pending, the affected elements glow amber in the viewport. */
export function ProposalCard({ p }: { p: Proposal }) {
  const ws = useWsApi();
  const currency = useApp((s) => s.settings.units.currency);
  return (
    <div className="anim-pop mx-2 mb-1.5 rounded-lg border border-warn/50 bg-warn/5" role="group" aria-label={`Proposed edit: ${p.title}`} data-testid="proposal">
      <div className="flex items-center gap-2 border-b border-warn/25 px-2.5 py-1.5">
        <AgentLogo id={p.agentId} size={18} />
        <span className="text-[0.75rem] text-t2">
          <b className="text-t1">{AGENT_META[p.agentId].name}</b> proposes
        </span>
        <span className="min-w-0 flex-1 truncate text-[0.75rem] font-semibold text-t1">{p.title}</span>
        {p.costDelta !== undefined && (
          <span className="mono text-[0.6875rem] font-semibold" style={{ color: p.costDelta <= 0 ? "var(--ok)" : "var(--warn)" }}>
            {p.costDelta < 0 ? "−" : "+"}
            {fmtMoney(Math.abs(p.costDelta), currency)}
          </span>
        )}
      </div>
      <div className="max-h-24 overflow-y-auto px-2.5 py-1.5">
        <table className="w-full text-[0.6875rem]">
          <tbody>
            {p.changes.map((c) => (
              <tr key={c.target} className="align-top">
                <td className="w-[28%] pr-2 text-t3">{c.target}</td>
                <td className="pr-1 text-bad line-through decoration-bad/50">{c.from}</td>
                <td className="px-1 text-t3">
                  <Icon name="arrowRight" size={10} />
                </td>
                <td className="text-ok">{c.to}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 border-t border-warn/25 px-2.5 py-1.5">
        <span className="flex-1 text-[0.625rem] text-t3">Preview only. Nothing changes until you accept. Requires PE review when it touches load-bearing elements.</span>
        <button className="btn !h-6 px-2.5 text-[0.6875rem]" onClick={() => ws.getState().rejectProposal(p.id)}>
          Reject
        </button>
        <button className="btn btn-primary !h-6 px-2.5 text-[0.6875rem]" onClick={() => ws.getState().acceptProposal(p.id)} data-testid="accept-proposal">
          <Icon name="check" size={12} /> Accept
        </button>
      </div>
    </div>
  );
}
