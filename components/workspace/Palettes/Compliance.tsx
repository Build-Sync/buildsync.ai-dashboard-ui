/**
 * components/workspace/Palettes/Compliance.tsx
 *
 * WHAT   The Compliance palette: the active code set, pass / review / fail counts with a status filter, the
 *        checks grouped by discipline (Structural, Egress & Accessibility, Energy, Fire) each citing its code
 *        section, a Re-run button, and a flag on checks that need PE review.
 * FOR    Code-check results from project.checks. Output is advisory until a licensed PE signs off, so the dock
 *        shows the advisory footer under it.
 * DEBUG  - "No checks yet": the project has no checks; run CODECHECK from the ribbon or command line.
 *        - Re-run is a mock (recheckCompliance in lib/services/analysis.ts); it logs the counts and shows a
 *          toast.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Pill, Spinner } from "@/components/ui/controls";
import { recheckCompliance } from "@/lib/services/analysis";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import type { CheckStatus, CodeCheck } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useRunner } from "../hooks";

const GROUPS: CodeCheck["group"][] = ["Structural", "Egress & Accessibility", "Energy", "Fire"];
const TONE: Record<CheckStatus, "ok" | "warn" | "bad"> = { pass: "ok", review: "warn", fail: "bad" };
const LABEL: Record<CheckStatus, string> = { pass: "Pass", review: "Review", fail: "Fail" };

/* Compliance: code set line, pass/review/fail counts, grouped checks with the section cited. */
export function Compliance() {
  const ws = useWsApi();
  const { ctx } = useRunner();
  const project = useWs((s) => s.project);
  const [filter, setFilter] = useState<CheckStatus | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const counts = { pass: 0, review: 0, fail: 0 } as Record<CheckStatus, number>;
  project.checks.forEach((c) => (counts[c.status] += 1));

  const rerun = async () => {
    setRunning(true);
    ctx.app.getState().log("cmd", "› CODECHECK");
    const r = await recheckCompliance(project);
    setRunning(false);
    ctx.app.getState().log(r.fail ? "warn" : "ok", `Code check complete: ${r.pass} pass · ${r.review} review · ${r.fail} fail`);
    ctx.app.getState().toast(`Code check: ${r.pass} pass, ${r.review} review, ${r.fail} fail`, r.fail ? "warn" : "ok");
  };

  const flagged = project.checks.filter((c) => c.peReview && c.status !== "pass").map((c) => c.id);

  if (!project.checks.length)
    return (
      <div className="p-4 text-[0.75rem] text-t2" data-testid="palette-compliance">
        No checks yet. Draw or import a plan, then run <span className="kbd">CODECHECK</span>.
      </div>
    );

  return (
    <div data-testid="palette-compliance">
      <div className="border-b border-soft px-2.5 py-2">
        <div className="flex items-center gap-1.5 text-[0.75rem]">
          <Icon name="landmark" size={13} className="text-accent" />
          <span className="mono text-t1">{project.jurisdiction.codeSet}</span>
        </div>
        <div className="mt-0.5 text-[0.6875rem] text-t3">{project.jurisdiction.name}</div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {(["pass", "review", "fail"] as CheckStatus[]).map((s) => (
            <button
              key={s}
              aria-pressed={filter === s}
              onClick={() => setFilter(filter === s ? "all" : s)}
              className={cn("rounded-md border px-2 py-1.5 text-center transition-colors", filter === s ? "border-accent bg-accent/15" : "border-line bg-panel-alt hover:border-t3")}
            >
              <div className="mono text-[1.0625rem] font-semibold" style={{ color: `var(--${TONE[s]})` }}>
                {counts[s]}
              </div>
              <div className="text-[0.625rem] uppercase tracking-wide text-t3">{LABEL[s]}</div>
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <button className="btn h-6 flex-1 text-[0.6875rem]" onClick={rerun} disabled={running}>
            {running ? <Spinner size={12} /> : <Icon name="refresh" size={12} />} Run code check
          </button>
          <button className="btn h-6 text-[0.6875rem]" disabled={!flagged.length} onClick={() => ws.getState().sendToPe(flagged)}>
            <Icon name="pesign" size={12} /> PE queue ({flagged.length})
          </button>
        </div>
      </div>

      {GROUPS.map((g) => {
        const list = project.checks.filter((c) => c.group === g && (filter === "all" || c.status === filter));
        if (!list.length) return null;
        return (
          <section key={g}>
            <h3 className="label-xs sticky top-0 z-[1] border-b border-soft bg-panel px-2.5 py-1.5">{g}</h3>
            <ul>
              {list.map((c) => {
                const isOpen = open === c.id;
                return (
                  <li key={c.id} className="border-b border-soft/70">
                    <button onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen} className="flex w-full items-start gap-2 px-2.5 py-2 text-left hover:bg-t1/5">
                      <Pill tone={TONE[c.status]} className="mt-px shrink-0">
                        {LABEL[c.status]}
                      </Pill>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.75rem] leading-snug text-t1">{c.rule}</span>
                        <span className="mono mt-0.5 block text-[0.625rem] text-t3">{c.section}</span>
                      </span>
                      {c.peReview && c.status !== "pass" && (
                        <span className="shrink-0 text-warn" title="Requires PE Review">
                          <Icon name="shieldAlert" size={13} />
                        </span>
                      )}
                    </button>
                    {isOpen && (
                      <div className="anim-fade bg-panel-alt px-2.5 pb-2.5 pt-1">
                        {c.fix && (
                          <p className="text-[0.75rem] leading-snug text-t2">
                            <b className="text-t1">Suggested fix: </b>
                            {c.fix}
                          </p>
                        )}
                        {c.peReview && c.status !== "pass" && <p className="mt-1.5 text-[0.6875rem] font-semibold text-warn">Requires PE Review</p>}
                        {c.elements.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {c.elements.map((e) => (
                              <button key={e} onClick={() => ws.getState().focusElements([e])} className="mono rounded border border-line px-1.5 py-px text-[0.625rem] text-t2 hover:border-accent hover:text-accent">
                                {e}
                              </button>
                            ))}
                            <button onClick={() => ws.getState().focusElements(c.elements)} className="rounded px-1.5 py-px text-[0.625rem] text-accent hover:underline">
                              Show all
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
