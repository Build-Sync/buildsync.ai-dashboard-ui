/**
 * lib/layout.ts
 *
 * WHAT   How the workspace windows (Model Explorer, palettes, timeline, command line) are arranged, and the named
 *        arrangements ("interfaces") the user can save and switch between:
 *        - three sizes per window: "mid" (normal), "large" and "min" (only the header / tab strip stays), stepped
 *          by the eye button (open eye = large, half-closed = normal, closed = header only);
 *        - a width or height the user dragged on the window's edge (px, used by the normal size);
 *        - the side each side window sits on (left or right), the order of the bottom windows, which windows are
 *          shown, and the order and choice of palette tabs and explorer tabs;
 *        - built-in interfaces (Standard, Drafting, Analysis, Scheduling, Presentation, Mirrored) and the user's
 *          own, saved in localStorage (bs.interfaces); the arrangement in use is saved in bs.layout.
 * FOR    The workspace store keeps the live arrangement (docks, dockSize, dockPx, dockSide, bottomOrder,
 *        paletteTabs, explorerTabs, iface); Workspace.tsx restores and saves it; the Interfaces dialog
 *        (components/workspace/Modals/Interfaces.tsx) edits and switches it. The ribbon at the top and the
 *        status bar at the bottom are not windows: they never move, resize or hide.
 * DEBUG  - The layout resets on every load: localStorage may be blocked (private window); readLayout then
 *          returns nothing and the defaults apply.
 *        - A window opens at the wrong size: DEFAULT_ARRANGEMENT (the timeline starts as just its header); a saved
 *          value that is not valid is ignored field by field (sanitize).
 *        - A palette tab vanished: it was closed with its × (or an interface leaves it out); the "+" chip at the end
 *          of the palette tabs, or View → Interfaces, brings it back. Opening a palette by command also does.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { DockKey } from "./store/workspace-store";
import { EXPLORER_IDS, PALETTE_IDS, type ExplorerId, type PaletteId } from "./types";

/** How much room a window takes: its normal size, a larger one, or just its header. */
export type DockSize = "mid" | "large" | "min";
/** The windows that dock to the left or right of the canvas. */
export type SideDock = "explorer" | "palettes";
/** The windows that dock under the canvas. */
export type BottomDock = "timeline" | "cmdline";
/** The edge of the screen a side window sits on. */
export type Side = "left" | "right";

/** The order the eye button steps through: normal → large → header only → normal. */
export const DOCK_ORDER: readonly DockSize[] = ["mid", "large", "min"];

/** The size after `s` when the eye button is pressed. */
export const nextDockSize = (s: DockSize): DockSize => DOCK_ORDER[(DOCK_ORDER.indexOf(s) + 1) % DOCK_ORDER.length];

/** Every window's size on first load. The timeline has always started as only its header. */
export const DEFAULT_DOCK_SIZE: Record<DockKey, DockSize> = { explorer: "mid", palettes: "mid", timeline: "min", cmdline: "mid" };

/** Every dockable window. */
export const DOCK_KEYS: readonly DockKey[] = ["explorer", "palettes", "timeline", "cmdline"];

/** Window names for tooltips and screen readers. */
export const DOCK_LABEL: Record<DockKey, string> = { explorer: "Model Explorer", palettes: "Palettes", timeline: "Timeline", cmdline: "Command Line" };

/** What pressing the eye does from each size. */
export const DOCK_ACTION: Record<DockSize, string> = { mid: "Enlarge", large: "Minimise", min: "Restore" };

/** The name of each size as the eye shows it. */
export const SIZE_NAME: Record<DockSize, string> = { large: "fully open", mid: "normal", min: "header only" };

/** Smallest and largest width (side windows) or height (bottom windows) a drag can give, in px. */
export const DOCK_PX_LIMITS: Record<DockKey, [number, number]> = { explorer: [190, 640], palettes: [250, 760], timeline: [96, 760], cmdline: [104, 560] };

/** Clamp a dragged size to the window's limits (and to the screen, for bottom windows). */
export function clampDockPx(k: DockKey, px: number, screen?: { w: number; h: number }): number {
  const [lo, hi0] = DOCK_PX_LIMITS[k];
  const hi = screen ? Math.min(hi0, k === "timeline" || k === "cmdline" ? screen.h * 0.7 : screen.w * 0.45) : hi0;
  return Math.round(Math.max(lo, Math.min(hi, px)));
}

/** One full arrangement of the windows. */
export interface Arrangement {
  /** which windows are shown at all */
  shown: Record<DockKey, boolean>;
  size: Record<DockKey, DockSize>;
  /** a width / height the user dragged (normal size only); missing = the default */
  px: Partial<Record<DockKey, number>>;
  side: Record<SideDock, Side>;
  /** the bottom windows from top to bottom */
  bottom: BottomDock[];
  /** palette tabs in order; a palette left out is hidden */
  palettes: PaletteId[];
  /** explorer tabs in order; a tab left out is hidden */
  explorer: ExplorerId[];
}

/** The arrangement a new user starts with. */
export const DEFAULT_ARRANGEMENT: Arrangement = {
  shown: { explorer: true, palettes: true, timeline: true, cmdline: true },
  size: { ...DEFAULT_DOCK_SIZE },
  px: {},
  side: { explorer: "left", palettes: "right" },
  bottom: ["timeline", "cmdline"],
  palettes: [...PALETTE_IDS],
  explorer: [...EXPLORER_IDS],
};

/** A named arrangement. Built-in ones cannot be renamed or deleted. */
export interface Interface {
  id: string;
  name: string;
  /** one line on what it is good for */
  desc: string;
  builtIn?: boolean;
  a: Arrangement;
}

const arr = (patch: Partial<Arrangement>): Arrangement => ({ ...DEFAULT_ARRANGEMENT, ...patch, shown: { ...DEFAULT_ARRANGEMENT.shown, ...patch.shown }, size: { ...DEFAULT_ARRANGEMENT.size, ...patch.size } });

/** The interfaces that come with the app. */
export const BUILT_IN_INTERFACES: Interface[] = [
  { id: "standard", name: "Standard", desc: "Every window at its normal size", builtIn: true, a: DEFAULT_ARRANGEMENT },
  {
    id: "drafting",
    name: "Drafting",
    desc: "Explorer and command line only: the most room to draw",
    builtIn: true,
    a: arr({ shown: { explorer: true, palettes: false, timeline: false, cmdline: true }, palettes: ["properties", "versions", "site"] }),
  },
  {
    id: "analysis",
    name: "Analysis",
    desc: "Large palettes for checks, stress tests and costs; the explorer as a strip",
    builtIn: true,
    a: arr({ size: { explorer: "min", palettes: "large", timeline: "min", cmdline: "mid" }, palettes: ["health", "compliance", "stress-test", "clash", "simulation", "cost", "ai-analysis", "council", "properties"] }),
  },
  {
    id: "scheduling",
    name: "Scheduling",
    desc: "A large timeline with the cost palette",
    builtIn: true,
    a: arr({ size: { explorer: "min", palettes: "mid", timeline: "large", cmdline: "min" }, palettes: ["cost", "health", "issues", "properties"] }),
  },
  {
    id: "presentation",
    name: "Presentation",
    desc: "Only the drawing: every window hidden",
    builtIn: true,
    a: arr({ shown: { explorer: false, palettes: false, timeline: false, cmdline: false } }),
  },
  {
    id: "mirrored",
    name: "Mirrored",
    desc: "Palettes on the left, the explorer on the right",
    builtIn: true,
    a: arr({ side: { explorer: "right", palettes: "left" } }),
  },
];

/** localStorage key of the arrangement in use (and the id of the interface it came from). */
export const LAYOUT_KEY = "bs.layout";
/** localStorage key of the interfaces the user saved. */
export const INTERFACES_KEY = "bs.interfaces";

const isSize = (v: unknown): v is DockSize => v === "mid" || v === "large" || v === "min";
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A valid arrangement from untrusted data: every field that is not valid falls back to the default. */
export function sanitize(raw: unknown): Arrangement {
  const r = isObj(raw) ? raw : {};
  const out: Arrangement = structuredCloneish(DEFAULT_ARRANGEMENT);
  if (isObj(r.shown)) for (const k of DOCK_KEYS) if (typeof r.shown[k] === "boolean") out.shown[k] = r.shown[k] as boolean;
  if (isObj(r.size)) for (const k of DOCK_KEYS) if (isSize(r.size[k])) out.size[k] = r.size[k] as DockSize;
  if (isObj(r.px)) for (const k of DOCK_KEYS) if (typeof r.px[k] === "number" && Number.isFinite(r.px[k])) out.px[k] = clampDockPx(k, r.px[k] as number);
  if (isObj(r.side)) for (const k of ["explorer", "palettes"] as SideDock[]) if (r.side[k] === "left" || r.side[k] === "right") out.side[k] = r.side[k] as Side;
  if (Array.isArray(r.bottom)) {
    const b = r.bottom.filter((x): x is BottomDock => x === "timeline" || x === "cmdline");
    if (b.length === 2 && b[0] !== b[1]) out.bottom = b;
  }
  if (Array.isArray(r.palettes)) out.palettes = [...new Set(r.palettes.filter((x): x is PaletteId => (PALETTE_IDS as readonly unknown[]).includes(x)))];
  if (Array.isArray(r.explorer)) {
    const e = [...new Set(r.explorer.filter((x): x is ExplorerId => (EXPLORER_IDS as readonly unknown[]).includes(x)))];
    if (e.length) out.explorer = e;
  }
  return out;
}

function structuredCloneish(a: Arrangement): Arrangement {
  return { shown: { ...a.shown }, size: { ...a.size }, px: { ...a.px }, side: { ...a.side }, bottom: [...a.bottom], palettes: [...a.palettes], explorer: [...a.explorer] };
}

/** A copy of an arrangement (so a preset is never changed through the live state). */
export const cloneArrangement = structuredCloneish;

/** Do two arrangements look the same? */
export function sameArrangement(a: Arrangement, b: Arrangement): boolean {
  return JSON.stringify(sanitize(a)) === JSON.stringify(sanitize(b));
}

/** The saved arrangement and the interface it came from; null when nothing is saved or storage is blocked. */
export function readLayout(): { a: Arrangement; iface: string | null } | null {
  try {
    const text = localStorage.getItem(LAYOUT_KEY);
    if (!text) return null;
    const raw = JSON.parse(text) as Record<string, unknown>;
    // the first version saved only the three sizes: { explorer: "mid", … }
    if (raw.v !== 2) {
      const size: Partial<Record<DockKey, DockSize>> = {};
      for (const k of DOCK_KEYS) if (isSize(raw[k])) size[k] = raw[k] as DockSize;
      return { a: sanitize({ size: { ...DEFAULT_DOCK_SIZE, ...size } }), iface: null };
    }
    return { a: sanitize(raw.a), iface: typeof raw.iface === "string" ? raw.iface : null };
  } catch {
    return null;
  }
}

/** Save the arrangement in use; silently does nothing when storage is blocked or full. */
export function writeLayout(a: Arrangement, iface: string | null): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ v: 2, a, iface }));
  } catch {
    /* private window or quota: the layout simply is not remembered */
  }
}

/** The interfaces the user saved (built-in ones are not stored). */
export function readInterfaces(): Interface[] {
  try {
    const raw = JSON.parse(localStorage.getItem(INTERFACES_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((x): x is Record<string, unknown> => isObj(x) && typeof x.id === "string" && typeof x.name === "string")
      .map((x) => ({ id: String(x.id), name: String(x.name).slice(0, 60), desc: typeof x.desc === "string" ? x.desc.slice(0, 120) : "Saved by you", a: sanitize(x.a) }));
  } catch {
    return [];
  }
}

/** Save the user's interfaces; returns false when storage is blocked or full. */
export function writeInterfaces(list: Interface[]): boolean {
  try {
    localStorage.setItem(INTERFACES_KEY, JSON.stringify(list.filter((i) => !i.builtIn)));
    return true;
  } catch {
    return false;
  }
}

/** Every interface: the built-in ones, then the user's. */
export function allInterfaces(user: Interface[]): Interface[] {
  return [...BUILT_IN_INTERFACES, ...user];
}

/** The side windows on one edge, outermost first (the explorer is the outer one when both share an edge). */
export function sideDocks(side: Record<SideDock, Side>, edge: Side): SideDock[] {
  const on = (["explorer", "palettes"] as SideDock[]).filter((k) => side[k] === edge);
  return edge === "left" ? on : on.reverse();
}
