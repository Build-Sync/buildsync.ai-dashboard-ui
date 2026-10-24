import { PHASE_ORDER, type PhaseKey } from "./scene/types";
import type { PhaseState } from "./scene/render";
import type { Phase, Project, TimelinePreset, TimelineWindow } from "./types";
import { addDays, dayOffset, clamp } from "./utils";

export interface DayTask {
  name: string;
  trade: string;
  start: number;
  end: number;
  cost: number;
  crew: number;
  materials: { name: string; qty: number; unit: string }[];
}

export interface DayPhase {
  name: string;
  key?: PhaseKey;
  start: number;
  end: number;
  tasks: DayTask[];
}

export interface Schedule {
  phases: DayPhase[];
  total: number;
  /** multiplier so that the sum of task costs equals the project's hard cost */
  costScale: number;
}

export function buildSchedule(project: Project): Schedule {
  const phases: DayPhase[] = project.schedule.map((p: Phase) => ({
    name: p.name,
    key: p.key as PhaseKey | undefined,
    start: dayOffset(project.startDate, p.start),
    end: dayOffset(project.startDate, p.end),
    tasks: p.tasks.map((t) => ({
      name: t.name,
      trade: t.trade,
      start: dayOffset(project.startDate, t.start),
      end: dayOffset(project.startDate, t.end),
      cost: t.cost ?? 0,
      crew: t.crew ?? 0,
      materials: t.materials ?? [],
    })),
  }));
  const total = Math.max(1, ...phases.map((p) => p.end));
  const sum = phases.reduce((a, p) => a + p.tasks.reduce((b, t) => b + t.cost, 0), 0);
  return { phases, total, costScale: sum > 0 ? project.cost.hard / sum : 1 };
}

export const PRESET_DAYS: Record<Exclude<TimelinePreset, "full" | "custom">, number> = { "1mo": 30, "3mo": 91, "6mo": 182 };

export function windowFor(preset: TimelinePreset, total: number, custom?: { from: number; to: number }): TimelineWindow {
  if (preset === "custom" && custom) {
    const from = clamp(Math.round(custom.from), 0, total);
    const to = clamp(Math.round(custom.to), from + 1, total);
    return { preset, from, to };
  }
  if (preset === "full" || preset === "custom") return { preset: "full", from: 0, to: total };
  return { preset, from: 0, to: Math.min(PRESET_DAYS[preset], total) };
}

export function dayLabel(project: Project, day: number): string {
  const d = addDays(project.startDate, day);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Build state of each scene phase at a given day. Missing phases inherit the previous one. */
export function phaseStateAt(schedule: Schedule, day: number): Partial<Record<PhaseKey, PhaseState>> {
  const byKey = new Map<PhaseKey, { start: number; end: number }>();
  for (const p of schedule.phases) {
    if (!p.key) continue;
    const cur = byKey.get(p.key);
    byKey.set(p.key, { start: cur ? Math.min(cur.start, p.start) : p.start, end: cur ? Math.max(cur.end, p.end) : p.end });
  }
  const out: Partial<Record<PhaseKey, PhaseState>> = {};
  let prev: PhaseState = "built";
  for (const key of PHASE_ORDER) {
    const span = byKey.get(key);
    if (!span) {
      out[key] = prev;
      continue;
    }
    prev = day >= span.end ? "built" : day >= span.start ? "active" : "future";
    out[key] = prev;
  }
  return out;
}

export interface WindowMetrics {
  spent: number;
  spentPct: number;
  /** spent inside [from, to] only */
  spentInWindow: number;
  materials: { name: string; qty: number; unit: string }[];
  crew: number;
  crewByTrade: { trade: string; crew: number }[];
  activeTasks: string[];
}

export function windowMetrics(schedule: Schedule, project: Project, w: TimelineWindow): WindowMetrics {
  const progress = (t: DayTask, d: number) => clamp((d - t.start) / Math.max(1, t.end - t.start), 0, 1);
  let spent = 0;
  let spentFrom = 0;
  const mats = new Map<string, { qty: number; unit: string }>();
  const crewTrade = new Map<string, number>();
  const active: string[] = [];
  let crew = 0;
  for (const ph of schedule.phases) {
    for (const t of ph.tasks) {
      const pTo = progress(t, w.to);
      const pFrom = progress(t, w.from);
      spent += t.cost * pTo;
      spentFrom += t.cost * pFrom;
      for (const m of t.materials) {
        const cur = mats.get(m.name) ?? { qty: 0, unit: m.unit };
        cur.qty += m.qty * (pTo - pFrom);
        mats.set(m.name, cur);
      }
      if (w.to >= t.start && w.to <= t.end) {
        crew += t.crew;
        crewTrade.set(t.trade, (crewTrade.get(t.trade) ?? 0) + t.crew);
        active.push(t.name);
      }
    }
  }
  const s = schedule.costScale;
  return {
    spent: Math.round(spent * s),
    spentPct: project.cost.hard ? Math.round(((spent * s) / project.cost.hard) * 100) : 0,
    spentInWindow: Math.round((spent - spentFrom) * s),
    materials: [...mats.entries()]
      .map(([name, v]) => ({ name, qty: Math.round(v.qty * 10) / 10, unit: v.unit }))
      .filter((m) => m.qty > 0)
      .sort((a, b) => b.qty - a.qty),
    crew,
    crewByTrade: [...crewTrade.entries()].map(([trade, c]) => ({ trade, crew: c })).sort((a, b) => b.crew - a.crew),
    activeTasks: active,
  };
}
