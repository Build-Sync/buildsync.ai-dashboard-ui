/**
 * components/workspace/Palettes/Cost.tsx
 *
 * WHAT   The Cost palette: total with range and cost basis, hard / soft / land split, top materials and
 *        workforce. When a Timeline window is set, the figures cover only that window.
 * FOR    Cost estimates from the project and the timeline (lib/timeline.ts windowMetrics). Money is formatted
 *        with the currency in Settings → Units.
 * DEBUG  - Figures look partial: a Timeline window is active (the banner at the top of the palette says so);
 *          clear it in the Timeline dock.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useMemo } from "react";
import { Icon } from "@/components/icons";
import { EmptyState, Section } from "@/components/ui/controls";
import { useApp } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { buildSchedule, dayLabel, windowMetrics } from "@/lib/timeline";
import { fmtMoney } from "@/lib/utils";

/* Cost: total ± range with cost basis, hard / soft / land split, top materials, workforce.
 * Follows the Timeline window when one is set. */
export function Cost() {
  const ws = useWsApi();
  const project = useWs((s) => s.project);
  const win = useWs((s) => s.timeline.window);
  const currency = useApp((s) => s.settings.units.currency);
  const money = (n: number) => fmtMoney(n, currency);
  const c = project.cost;

  const sched = useMemo(() => buildSchedule(project), [project]);
  const metrics = useMemo(() => (win ? windowMetrics(sched, project, win) : null), [win, sched, project]);

  if (!c.total)
    return <EmptyState icon="cost" title="No Cost Model Yet" hint="Draw a plan or use Prompt to Plan and BuildSync will take off quantities and price them." />;

  const split = [
    { k: "Hard", v: c.hard, color: "var(--accent)" },
    { k: "Soft", v: c.soft, color: "#8b6cf0" },
    { k: "Land", v: c.land, color: "#3ecf8e" },
  ];
  const pct = (n: number, d: number) => `${Math.round((n / d) * 100)}%`;
  const maxMat = Math.max(...c.materials.map((m) => m.cost), 1);

  return (
    <div data-testid="palette-cost">
      <div className="border-b border-soft px-3 py-3">
        <div className="mono text-[1.625rem] font-semibold leading-none text-t1" data-testid="cost-total">
          {money(c.total)}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[0.75rem] text-t2">
          <span className="mono">± {money(c.range)}</span>
          <span className="text-t3">({((c.range / c.total) * 100).toFixed(1)}%)</span>
        </div>
        <p className="mt-1.5 text-[0.6875rem] leading-snug text-t3">{c.basis}</p>
      </div>

      {win && metrics && (
        <div className="border-b border-soft bg-accent/10 px-3 py-2.5" data-testid="cost-window">
          <div className="flex items-center justify-between">
            <span className="label-xs !text-accent">Timeline Window</span>
            <button className="text-[0.6875rem] text-t2 hover:text-t1" onClick={() => ws.getState().clearWindow()}>
              Clear
            </button>
          </div>
          <div className="mt-0.5 text-[0.6875rem] text-t2">
            Day {win.from} – {win.to} · {dayLabel(project, win.from)} → {dayLabel(project, win.to)}
          </div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-[0.75rem] text-t2">Spent So Far</span>
            <span className="mono text-[0.9375rem] font-semibold text-t1">{money(metrics.spent)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.min(100, metrics.spentPct)}%` }} />
          </div>
          <div className="mt-1 text-right text-[0.625rem] text-t3">{metrics.spentPct}% of hard cost</div>
        </div>
      )}

      <Section title="Breakdown">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-line">
          {split.map((s) => (
            <div key={s.k} style={{ width: pct(s.v, c.total), background: s.color }} title={`${s.k} ${money(s.v)}`} />
          ))}
        </div>
        <ul className="mt-2 space-y-1">
          {split.map((s) => (
            <li key={s.k} className="flex items-center gap-2 text-[0.75rem]">
              <span className="size-2 rounded-sm" style={{ background: s.color }} />
              <span className="flex-1 text-t2">{s.k} cost</span>
              <span className="mono text-t1">{money(s.v)}</span>
              <span className="mono w-9 text-right text-t3">{pct(s.v, c.total)}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Top Materials">
        <ul className="space-y-2">
          {c.materials.map((m) => (
            <li key={m.name}>
              <div className="flex items-baseline justify-between text-[0.75rem]">
                <span className="text-t1">{m.name}</span>
                <span className="mono text-t2">
                  {money(m.cost)} <span className="text-t3">· {pct(m.cost, c.hard)}</span>
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-accent/70" style={{ width: `${(m.cost / maxMat) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Workforce">
        <table className="w-full text-[0.75rem]">
          <thead>
            <tr className="label-xs text-left">
              <th className="pb-1 font-semibold">Trade</th>
              <th className="pb-1 text-right font-semibold">Crew</th>
              <th className="pb-1 text-right font-semibold">Months</th>
            </tr>
          </thead>
          <tbody>
            {c.workforce.map((w) => (
              <tr key={w.trade} className="border-t border-soft/60">
                <td className="py-1 text-t1">{w.trade}</td>
                <td className="mono py-1 text-right text-t2">{w.headcount}</td>
                <td className="mono py-1 text-right text-t2">{w.months}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {metrics && (
          <p className="mt-2 flex items-center gap-1.5 text-[0.6875rem] text-t2">
            <Icon name="workforce" size={12} className="text-accent" />
            Crew on Site at Day {win!.to}: <b className="mono text-t1">{metrics.crew}</b>
          </p>
        )}
      </Section>

      {metrics && metrics.materials.length > 0 && (
        <Section title="Materials Used in Window">
          <ul className="space-y-1">
            {metrics.materials.slice(0, 8).map((m) => (
              <li key={m.name} className="flex justify-between text-[0.75rem]">
                <span className="text-t2">{m.name}</span>
                <span className="mono text-t1">
                  {m.qty.toLocaleString("en-US")} {m.unit}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
