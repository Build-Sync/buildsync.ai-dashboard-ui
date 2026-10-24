/**
 * components/workspace/Palettes/Health.tsx
 *
 * WHAT   The Plan Health palette: a 0-100 score ring with a period selector, a plain-English summary and four
 *        sub-scores (compliance, structural, cost, schedule) that link to their palettes (Schedule opens the
 *        Timeline dock).
 * FOR    The overall status of the open project, from project.health in the workspace store; the same score
 *        shows as a chip in the status bar.
 * DEBUG  - A brand-new project has a score of 0: the ring and the sub-scores show "—", as does the status-bar
 *          chip.
 *        - The numbers change with the period selector: they come from project.health.ranges[range].
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Icon } from "@/components/icons";
import { Segmented } from "@/components/ui/controls";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import type { HealthRange, PaletteId } from "@/lib/types";
import { cn, fmtSigned } from "@/lib/utils";

/* Plan Health Score: ring, plain-English summary and four sub-score bars that link to their palettes.
 * (spec §10.8) */

const tone = (n: number) => (n >= 80 ? "var(--ok)" : n >= 60 ? "var(--warn)" : "var(--bad)");

const SUBS: { key: "compliance" | "structural" | "cost" | "schedule"; label: string; to: PaletteId | "timeline"; hint: string }[] = [
  { key: "compliance", label: "Compliance", to: "compliance", hint: "Open the Compliance palette" },
  { key: "structural", label: "Structural", to: "stress-test", hint: "Open the Stress Test palette" },
  { key: "cost", label: "Cost", to: "cost", hint: "Open the Cost palette" },
  { key: "schedule", label: "Schedule", to: "timeline", hint: "Open the Timeline dock" },
];

/** The Plan Health palette. */
export function Health() {
  const ws = useWsApi();
  const health = useWs((s) => s.project.health);
  const range = useWs((s) => s.healthRange);
  const empty = health.score === 0;
  const snap = health.ranges[range];
  const R = 46;
  const C = 2 * Math.PI * R;

  return (
    <div className="p-3" data-testid="palette-health">
      <div className="mb-3 flex justify-end">
        <Segmented<HealthRange>
          label="Health range"
          size="sm"
          value={range}
          onChange={(v) => ws.getState().setHealthRange(v)}
          options={[
            { value: "all", label: "All time" },
            { value: "30d", label: "Last 30 days" },
            { value: "version", label: "This version" },
          ]}
        />
      </div>

      <div className="flex items-center gap-4">
        <div className="relative size-[7.5rem] shrink-0" role="img" aria-label={`Plan Health Score ${snap.score} out of 100`}>
          <svg viewBox="0 0 110 110" className="size-full -rotate-90">
            <circle cx="55" cy="55" r={R} fill="none" stroke="var(--line)" strokeWidth="9" />
            <circle cx="55" cy="55" r={R} fill="none" stroke={tone(snap.score)} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(snap.score / 100) * C} ${C}`} className="transition-[stroke-dasharray] duration-700" />
          </svg>
          <div className="absolute inset-0 grid place-content-center text-center">
            <div className="mono text-[1.75rem] font-semibold leading-none text-t1" data-testid="health-score">
              {empty ? "—" : snap.score}
            </div>
            <div className="mono text-[0.6875rem] text-t3">/ 100</div>
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[0.6875rem] font-semibold uppercase tracking-wide text-t3">Plan Health Score</div>
          {!empty && (
            <div className={cn("mt-1 flex items-center gap-1 text-[0.8125rem] font-medium", snap.delta >= 0 ? "text-ok" : "text-bad")}>
              <Icon name={snap.delta >= 0 ? "arrowUp" : "arrowDown"} size={14} />
              {fmtSigned(snap.delta)} pts <span className="font-normal text-t3">{range === "30d" ? "in 30 days" : "since last version"}</span>
            </div>
          )}
        </div>
      </div>

      <p className="mt-3 text-[0.75rem] leading-relaxed text-t2">{health.summary}</p>

      <ul className="mt-4 space-y-2">
        {SUBS.map((s) => {
          const v = snap[s.key];
          return (
            <li key={s.key}>
              <button
                onClick={() => (s.to === "timeline" ? (ws.getState().setTab("analyze"), ws.getState().toggleDock("timeline", true), ws.getState().setTimeline({ open: true })) : ws.getState().setPanel(s.to))}
                className="group block w-full rounded-md border border-line bg-panel-alt px-2.5 py-2 text-left transition-colors hover:border-accent"
                title={s.hint}
              >
                <div className="flex items-center justify-between text-[0.75rem]">
                  <span className="font-medium text-t1">{s.label}</span>
                  <span className="flex items-center gap-1 text-t2">
                    <span className="mono font-semibold" style={{ color: empty ? undefined : tone(v) }}>
                      {empty ? "—" : v}
                    </span>
                    <Icon name="chevRight" size={12} className="text-t3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${v}%`, background: tone(v) }} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
