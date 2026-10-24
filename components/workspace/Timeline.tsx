"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Segmented } from "@/components/ui/controls";
import { tip } from "@/components/ui/Tooltip";
import { useApp } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { buildSchedule, dayLabel, windowMetrics } from "@/lib/timeline";
import type { TimelinePreset } from "@/lib/types";
import { addDays, cn, fmtMoney, hash } from "@/lib/utils";

/* Timeline dock (collapsible, above the command line):
 * 1. phase tracker  2. Gantt by day / week / month  3. time-window query that drives the viewport,
 * the Cost palette, materials used and crew on site. */

const PRESETS: { id: Exclude<TimelinePreset, "custom">; label: string }[] = [
  { id: "1mo", label: "1 mo" },
  { id: "3mo", label: "3 mo" },
  { id: "6mo", label: "6 mo" },
  { id: "full", label: "Full" },
];
const PX_PER_DAY = { day: 10, week: 3.4, month: 1.25 } as const;
const TRADE_COLORS = ["#4c8dff", "#3ecf8e", "#f0a940", "#8b6cf0", "#2cc4d6", "#e86ab5", "#ef5b5b", "#9ab04a"];
const tradeColor = (t: string) => TRADE_COLORS[hash(t) % TRADE_COLORS.length];

export function Timeline() {
  const ws = useWsApi();
  const project = useWs((s) => s.project);
  const tl = useWs((s) => s.timeline);
  const currency = useApp((s) => s.settings.units.currency);
  const sched = useMemo(() => buildSchedule(project), [project]);
  const metrics = useMemo(() => (tl.window ? windowMetrics(sched, project, tl.window) : null), [tl.window, sched, project]);
  const [from, setFrom] = useState("0");
  const [to, setTo] = useState("90");
  const ppd = PX_PER_DAY[tl.zoom];
  const width = Math.ceil(sched.total * ppd) + 24;

  // timelapse
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!tl.playing) return;
    let day = tl.window && tl.window.to < sched.total ? tl.window.to : 0;
    tick.current = setInterval(() => {
      day = Math.min(sched.total, day + Math.max(2, Math.round(sched.total / 90)));
      ws.getState().setTimeline({ window: { preset: "custom", from: 0, to: day }, open: true });
      if (day >= sched.total) {
        ws.getState().setTimeline({ playing: false });
      }
    }, 110);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tl.playing]);

  const months = useMemo(() => {
    const out: { day: number; label: string }[] = [];
    const start = new Date(`${project.startDate}T00:00:00Z`);
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    for (let i = 0; i < 24; i++) {
      const off = Math.round((d.getTime() - start.getTime()) / 86_400_000);
      if (off > sched.total) break;
      out.push({ day: Math.max(0, off), label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }) });
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return out;
  }, [project.startDate, sched.total]);

  const apply = (preset: TimelinePreset) => ws.getState().setWindow(preset);
  const applyCustom = () => {
    const f = Number(from);
    const t = Number(to);
    if (Number.isFinite(f) && Number.isFinite(t) && t > f) ws.getState().setWindow("custom", { from: f, to: t });
  };

  const win = tl.window;
  const stages = project.stages;

  return (
    <section aria-label="Timeline" className="flex shrink-0 flex-col border-t border-line bg-panel" style={{ height: tl.open ? "17rem" : "1.875rem" }} data-testid="timeline">
      <header className="flex h-[1.875rem] shrink-0 items-center gap-2 border-b border-soft px-2">
        <button aria-expanded={tl.open} aria-label={tl.open ? "Collapse timeline" : "Expand timeline"} onClick={() => ws.getState().setTimeline({ open: !tl.open })} className="grid size-5 place-items-center rounded text-t2 hover:bg-t1/10 hover:text-t1">
          <Icon name={tl.open ? "chevDown" : "chevUp"} size={14} />
        </button>
        <span className="label-xs !text-t1">Timeline</span>
        <div className="ml-2 flex items-center gap-1" role="group" aria-label="Time window presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              aria-pressed={win?.preset === p.id}
              onClick={() => apply(p.id)}
              className={cn("h-5 rounded-full border px-2.5 text-[0.6875rem] font-medium transition-colors", win?.preset === p.id ? "border-accent bg-accent text-on-accent" : "border-line text-t2 hover:border-t3 hover:text-t1")}
              {...tip(`${p.label}`, p.id === "full" ? "Show the whole build" : `What's built, spent and on site in the first ${p.label.replace(" mo", " month(s)")}`, "SCHEDQ")}
            >
              {p.label}
            </button>
          ))}
        </div>
        {tl.open && (
          <div className="ml-1 flex items-center gap-1 text-[0.6875rem] text-t2">
            <span className="text-t3">Custom</span>
            <input aria-label="Window start day" className="input mono !h-5 !w-12 !px-1.5 !text-[0.6875rem]" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span>→</span>
            <input aria-label="Window end day" className="input mono !h-5 !w-12 !px-1.5 !text-[0.6875rem]" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyCustom()} />
            <button className="btn !h-5 px-2 text-[0.6875rem]" onClick={applyCustom}>
              Apply
            </button>
          </div>
        )}
        <button
          onClick={() => ws.getState().setTimeline({ playing: !tl.playing, open: true })}
          className={cn("ml-1 flex h-5 items-center gap-1 rounded-full border px-2 text-[0.6875rem]", tl.playing ? "border-accent bg-accent/15 text-accent" : "border-line text-t2 hover:text-t1")}
          {...tip("Timelapse", "Play the build state day by day in the viewport", "SCHEDQ")}
        >
          <Icon name={tl.playing ? "pause" : "play"} size={11} /> Play
        </button>
        <div className="flex-1" />
        {win && metrics && (
          <div className="mono hidden items-center gap-3 text-[0.6875rem] text-t2 lg:flex" data-testid="window-summary">
            <span>
              <b className="text-t1">Day {win.from}–{win.to}</b> · {dayLabel(project, win.from)} → {dayLabel(project, win.to)}
            </span>
            <span>Spent {fmtMoney(metrics.spent, currency, true)}</span>
            <span>Crew {metrics.crew}</span>
            <button className="text-t3 hover:text-t1" onClick={() => ws.getState().clearWindow()} aria-label="Clear window">
              <Icon name="close" size={12} />
            </button>
          </div>
        )}
        {tl.open && <Segmented size="sm" label="Gantt scale" value={tl.zoom} onChange={(v) => ws.getState().setTimeline({ zoom: v })} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} />}
      </header>

      {tl.open && (
        <div className="flex min-h-0 flex-1 flex-col">
          <ol className="flex shrink-0 gap-1 border-b border-soft px-2 py-1.5" aria-label="Phase tracker">
            {stages.map((st) => (
              <li key={st.name} className={cn("min-w-0 flex-1 rounded-md border px-2 py-1", st.status === "active" ? "border-accent/60 bg-accent/10" : "border-line bg-panel-alt")}>
                <div className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-t1">
                  <span
                    className={cn("grid size-3.5 shrink-0 place-items-center rounded-full border", st.status === "done" ? "border-ok bg-ok text-white" : st.status === "active" ? "border-accent" : "border-t3")}
                    aria-label={st.status}
                  >
                    {st.status === "done" ? <Icon name="check" size={9} strokeWidth={3} /> : st.status === "active" ? <span className="size-1.5 rounded-full bg-accent anim-pulse" /> : null}
                  </span>
                  <span className="truncate">{st.name}</span>
                  <span className="mono ml-auto text-t3">{st.percent}%</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full" style={{ width: `${st.percent}%`, background: st.status === "done" ? "var(--ok)" : "var(--accent)" }} />
                </div>
                <div className="mono mt-1 flex gap-2 text-[0.5625rem] text-t3">
                  <span {...tip("Open tasks", `${st.openTasks} open in ${st.name}`)}>T{st.openTasks}</span>
                  <span {...tip("Open issues", `${st.openIssues} open`)} className={st.openIssues ? "text-warn" : undefined}>
                    I{st.openIssues}
                  </span>
                  <span {...tip("Required approvals", `${st.approvals} approval(s) needed`)}>A{st.approvals}</span>
                </div>
              </li>
            ))}
          </ol>

          {sched.phases.length === 0 ? (
            <p className="p-4 text-[0.75rem] text-t3">No schedule yet. Generate one from the model with Prompt to Plan.</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto" data-testid="gantt">
              <div className="relative" style={{ width: width + 176 }}>
                {/* ruler */}
                <div className="sticky top-0 z-[2] flex h-5 border-b border-soft bg-panel">
                  <div className="sticky left-0 z-[3] w-44 shrink-0 border-r border-soft bg-panel px-2 text-[0.625rem] leading-5 text-t3">Phase / task</div>
                  <div
                    className="relative flex-1 cursor-pointer"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      const day = Math.round((e.clientX - r.left) / ppd);
                      ws.getState().setWindow("custom", { from: 0, to: Math.max(1, Math.min(sched.total, day)) });
                    }}
                    title="Click to query the schedule up to this day"
                  >
                    {months.map((m) => (
                      <div key={m.day} className="absolute top-0 h-full border-l border-soft pl-1 text-[0.5625rem] leading-5 text-t3" style={{ left: m.day * ppd }}>
                        {m.label}
                      </div>
                    ))}
                    {tl.zoom === "day" &&
                      Array.from({ length: Math.ceil(sched.total / 7) }, (_, i) => (
                        <div key={i} className="mono absolute bottom-0 border-l border-soft/70 pl-0.5 text-[0.5rem] leading-3 text-t3" style={{ left: i * 7 * ppd }}>
                          {i * 7}
                        </div>
                      ))}
                  </div>
                </div>

                <div className="relative">
                  {win && (
                    <div className="pointer-events-none absolute bottom-0 top-0 z-[1] border-x border-accent bg-accent/12" style={{ left: 176 + win.from * ppd, width: Math.max(2, (win.to - win.from) * ppd) }} data-testid="gantt-window" />
                  )}
                  {sched.phases.map((p) => (
                    <div key={p.name}>
                      <GanttRow label={p.name} bold left={p.start * ppd} width={Math.max(3, (p.end - p.start) * ppd)} color="var(--accent)" sub={`${dayLabel(project, p.start)} – ${dayLabel(project, p.end)}`} />
                      {tl.zoom !== "month" &&
                        p.tasks.map((t) => (
                          <GanttRow key={t.name} label={t.name} left={t.start * ppd} width={Math.max(3, (t.end - t.start) * ppd)} color={tradeColor(t.trade)} sub={`${t.trade} · ${addDays(project.startDate, t.start).toISOString().slice(5, 10)}`} />
                        ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function GanttRow({ label, left, width, color, bold, sub }: { label: string; left: number; width: number; color: string; bold?: boolean; sub: string }) {
  return (
    <div className={cn("flex border-b border-soft/50", bold ? "h-[1.375rem] bg-panel-alt/60" : "h-[1.125rem]")}>
      <div className={cn("sticky left-0 z-[1] w-44 shrink-0 truncate border-r border-soft px-2 text-[0.6875rem] leading-[inherit]", bold ? "bg-panel-alt font-semibold leading-[1.375rem] text-t1" : "bg-panel pl-4 leading-[1.125rem] text-t2")} title={label}>
        {label}
      </div>
      <div className="relative flex-1">
        <div className="absolute top-1/2 -translate-y-1/2 rounded-sm" style={{ left, width, height: bold ? 10 : 6, background: color, opacity: bold ? 0.95 : 0.8 }} title={`${label} · ${sub}`} />
      </div>
    </div>
  );
}
