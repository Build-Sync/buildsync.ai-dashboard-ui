/**
 * lib/draw/session.ts
 *
 * WHAT   The engine that runs a drawing or editing command: the tool registry (TOOLS, filled in by tools.ts and
 *        modify.ts), the ToolEnv every tool receives (the scene, level, units, options, log / toast, undoable
 *        commit, step changes) and the dispatch the rest of the app calls: beginTool, toolClick, toolEnter,
 *        toolText (typed points and keywords), toolUndo, toolCancel, toolPreview, toolOptions, toolApply.
 *        Also mkItem (a new DrawnItem with a default name, level and height) and snapConfig.
 * FOR    lib/commands.ts starts a tool by name (LINE, WALL, MOVE …); ModelViewport turns clicks into toolClick
 *        and asks for the rubber-band preview; the command line sends typed text and Enter; ToolBar shows the
 *        options and the Apply button. State lives in the workspace store (`session`, `toolOpts`, `measure`).
 * DEBUG  - A click does nothing: there is no session (the command did not start a tool: check TOOLS has its
 *          name) or the tool's click() ignores the current step; look at session.step in the store.
 *        - The prompt does not change: tools must go through env.next(step) (or env.set) so the prompt is rebuilt.
 *        - Typed text is run as a command instead of a point: toolText only claims text that parses as a point,
 *          a distance or a keyword the tool knows; anything else falls through to the command line.
 *        - Every edit goes through env.commit(label, change) so it is one undo step.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { CommandCtx } from "../commands";
import type { LevelKey, Scene, V2 } from "../scene/types";
import type { WsState } from "../store/workspace-store";
import type { HistoryKind } from "../types";
import { fmtLength, uid, type MeasureSystem } from "../utils";
import { applyChange, type Change } from "./change";
import { storeyHeight } from "./compose";
import { sub2 } from "./geom";
import { OPTIONS, type OptDef } from "./options";
import { sceneOf } from "./scene-of";
import { parseLen, parseTyped, type SnapCfg } from "./snap";
import type { DrawnItem, ItemKind, MeasureResult, Params, Preview, ToolSession } from "./types";

/** What a click carries into a tool. */
export interface ClickInfo {
  /** the clicked point on the active level's plane, already snapped */
  pt: V2;
  /** the clicked point on a horizontal plane at another height (for picking a spot on a wall face) */
  at: (z: number) => V2 | null;
  /** the id of the element under the cursor */
  hit: string | null;
  shift: boolean;
  /** true when the point was typed in the command line */
  typed?: boolean;
}

/** Everything a tool can do while it runs. */
export interface ToolEnv {
  ctx: CommandCtx;
  readonly s: WsState;
  readonly scene: Scene;
  readonly level: LevelKey;
  /** elevation of the active level in feet */
  readonly z: number;
  readonly sys: MeasureSystem;
  readonly session: ToolSession;
  say: (kind: HistoryKind, text: string) => void;
  toast: (text: string, tone?: "ok" | "info" | "warn" | "bad") => void;
  /** a tool-bar option of the running tool (the type of `fallback` says what to read) */
  opt: {
    (key: string, fallback: number): number;
    (key: string, fallback: string): string;
    (key: string, fallback: boolean): boolean;
  };
  /** a number option where 0 means "automatic" */
  optAuto: (key: string, auto: number) => number;
  commit: (label: string, change: Change) => void;
  set: (patch: Partial<ToolSession>) => void;
  /** go to another step (rebuilds the prompt and prints it in the command line) */
  next: (step: string, patch?: Partial<ToolSession>) => void;
  /** start over at the first step, keeping the tool active */
  again: () => void;
  /** end the tool */
  done: () => void;
  measure: (m: MeasureResult | null) => void;
  item: (id: string | null | undefined) => DrawnItem | undefined;
  /** a length in feet in the project's units */
  fmt: (ft: number) => string;
}

/** One command's behaviour. Every function is optional except `prompt`. */
export interface ToolDef {
  /** the text shown for the current step */
  prompt: (s: ToolSession, env: ToolEnv) => string;
  /** runs once when the tool starts (turn a layer on, skip to a step when something is selected …) */
  begin?: (env: ToolEnv) => void;
  click?: (s: ToolSession, c: ClickInfo, env: ToolEnv) => void;
  /** Enter, a double click or a right click: finish the object in progress */
  enter?: (s: ToolSession, env: ToolEnv) => void;
  /** typed text that is not a point: keywords like C or R, or a number the step wants; return true when used */
  text?: (s: ToolSession, text: string, env: ToolEnv) => boolean;
  /** the rubber band under the cursor */
  preview?: (s: ToolSession, cursor: V2, env: ToolEnv) => Preview | null;
  /** extra or dynamic tool-bar controls (otherwise OPTIONS[tool]) */
  options?: (env: ToolEnv) => OptDef[];
  /** the Apply button of tools that change a selection with tool-bar values (CHTYPE, CHMAT, CHDIM, ARRAY) */
  apply?: (s: ToolSession, env: ToolEnv) => void;
  applyLabel?: string;
}

/** Every tool by command name (filled in by tools.ts and modify.ts). */
export const TOOLS: Record<string, ToolDef> = {};

/** Register a tool under one or more command names. */
export function register(names: string | string[], def: ToolDef): void {
  for (const n of Array.isArray(names) ? names : [names]) TOOLS[n] = def;
}

/* ── env ──────────────────────────────────────────────────────────────── */
function makeEnv(c: CommandCtx): ToolEnv {
  const ws = c.ws;
  const app = c.app;
  const cur = () => {
    const s = ws.getState().session;
    if (!s) throw new Error("no tool session");
    return s;
  };
  const refresh = (say: boolean) => {
    const s = ws.getState().session;
    if (!s) return;
    const def = TOOLS[s.tool];
    const text = def?.prompt(s, env) ?? "";
    ws.getState().setTool(s.tool, text);
    if (say && text) app.getState().log("info", text);
  };
  const env: ToolEnv = {
    ctx: c,
    get s() {
      return ws.getState();
    },
    get scene() {
      return sceneOf(ws.getState());
    },
    get level() {
      return ws.getState().plan.level;
    },
    get z() {
      return sceneOf(ws.getState()).levelZ[ws.getState().plan.level];
    },
    get sys() {
      return app.getState().settings.units.system;
    },
    get session() {
      return cur();
    },
    say: (kind, text) => app.getState().log(kind, text),
    // a warning is also written to the command line, so it stays in the history after the toast fades
    toast: (text, tone = "ok") => {
      app.getState().toast(text, tone);
      if (tone === "warn" || tone === "bad") app.getState().log("warn", `⚠ ${text}`);
    },
    opt: ((key: string, fallback: number | string | boolean) => {
      const tool = cur().tool;
      const v = ws.getState().toolOpts[tool]?.[key];
      if (v !== undefined && typeof v === typeof fallback) return v;
      const d = OPTIONS[tool]?.find((o) => o.key === key)?.def;
      return d !== undefined && typeof d === typeof fallback ? d : fallback;
    }) as ToolEnv["opt"],
    optAuto: (key, auto) => {
      const v = env.opt(key, 0);
      return v > 0 ? v : auto;
    },
    commit: (label, change) => {
      ws.getState().edit(label, (st) => applyChange(st, change));
    },
    set: (patch) => {
      ws.getState().patch({ session: { ...cur(), ...patch } });
      refresh(false);
    },
    next: (step, patch = {}) => {
      ws.getState().patch({ session: { ...cur(), ...patch, step } });
      refresh(true);
    },
    again: () => {
      ws.getState().patch({ session: { ...cur(), step: "first", pts: [], picks: [], data: {} } });
      refresh(true);
    },
    done: () => {
      ws.getState().setTool(null);
    },
    measure: (m) => ws.getState().patch({ measure: m }),
    item: (id) => (id ? sceneOf(ws.getState()).items?.[id] : undefined),
    fmt: (ft) => fmtLength(ft, app.getState().settings.units.system, app.getState().settings.units.precision),
  };
  return env;
}

const guard = (c: CommandCtx, what: string, fn: () => void): void => {
  try {
    fn();
  } catch (e) {
    c.app.getState().log("warn", `⚠ ${what} failed: ${e instanceof Error ? e.message : String(e)}`);
  }
};

/* ── dispatch ─────────────────────────────────────────────────────────── */
/** Start the tool named `name`. Returns false when there is no such tool (the caller falls back). */
export function beginTool(c: CommandCtx, name: string): boolean {
  const def = TOOLS[name];
  if (!def) return false;
  if (c.ws.getState().reviewMode) {
    c.app.getState().toast("Review mode is read-only.", "warn");
    return true;
  }
  // tools draw in the model: leave a layout sheet so the clicks have somewhere to go
  if (c.ws.getState().layoutTab !== "model") c.ws.getState().setLayoutTab("model");
  c.ws.getState().setTool(name, "");
  c.ws.getState().patch({ measure: null, session: { tool: name, step: "first", pts: [], picks: [], data: {} } });
  const env = makeEnv(c);
  guard(c, name, () => def.begin?.(env));
  const s = c.ws.getState().session;
  if (s && s.tool === name) {
    const text = def.prompt(s, env);
    c.ws.getState().setTool(name, text);
    c.app.getState().log("info", `${name}  ${text}`);
  }
  return true;
}

/** A click in the viewport (or a typed point) for the running tool. */
export function toolClick(c: CommandCtx, info: ClickInfo): void {
  const s = c.ws.getState().session;
  const def = s && TOOLS[s.tool];
  if (!s || !def?.click) return;
  guard(c, s.tool, () => def.click!(s, info, makeEnv(c)));
}

/** Enter / double click / right click: finish what the tool is drawing, or end the tool when it has nothing. */
export function toolEnter(c: CommandCtx): void {
  const s = c.ws.getState().session;
  const def = s && TOOLS[s.tool];
  if (!s || !def) return;
  const env = makeEnv(c);
  guard(c, s.tool, () => {
    if (def.enter) def.enter(s, env);
    else if (!s.pts.length && !s.picks.length) env.done();
  });
}

/** Remove the last point of the object in progress. */
export function toolUndo(c: CommandCtx): boolean {
  const s = c.ws.getState().session;
  if (!s || !s.pts.length) return false;
  const env = makeEnv(c);
  env.set({ pts: s.pts.slice(0, -1) });
  env.say("info", "Last point removed");
  return true;
}

/**
 * Typed text for the running tool: a keyword the tool knows, or a point (x,y · @dx,dy · @d<a) or a distance in the
 * direction of the cursor. Returns true when the tool took it; false lets the command line treat it as a command.
 */
export function toolText(c: CommandCtx, text: string): boolean {
  const s = c.ws.getState().session;
  const def = s && TOOLS[s.tool];
  if (!s || !def) return false;
  const env = makeEnv(c);
  let used = false;
  guard(c, s.tool, () => {
    const t = text.trim();
    if (t.toUpperCase() === "U" && s.pts.length) {
      used = toolUndo(c);
      return;
    }
    if (def.text?.(s, t, env)) {
      used = true;
      return;
    }
    const last = s.pts[s.pts.length - 1] ?? null;
    const cur = c.ws.getState().cursor;
    const dir = last && cur ? sub2([cur.x, cur.y], last) : null;
    const typed = parseTyped(t, last, dir, env.sys, env.s.project.site?.north ?? 0);
    if (typed?.kind === "pt") {
      used = true;
      def.click?.(s, { pt: typed.pt, at: () => typed.pt, hit: null, shift: false, typed: true }, env);
    } else if (typed?.kind === "dist") {
      used = true;
      env.say("warn", "⚠ Specify a point first, or move the cursor to give the distance a direction.");
    }
  });
  return used;
}

/** Cancel the running tool (Esc). */
export function toolCancel(c: CommandCtx): void {
  c.ws.getState().setTool(null);
  c.ws.getState().patch({ measure: null });
}

/** What to draw under the cursor for the running tool. */
export function toolPreview(c: CommandCtx, cursor: V2): Preview | null {
  const s = c.ws.getState().session;
  const def = s && TOOLS[s.tool];
  if (!s || !def?.preview) return null;
  try {
    return def.preview(s, cursor, makeEnv(c));
  } catch {
    return null;
  }
}

/** The tool-bar controls of the running tool. */
export function toolOptions(c: CommandCtx): OptDef[] {
  const s = c.ws.getState().session;
  if (!s) return [];
  const def = TOOLS[s.tool];
  return def?.options ? def.options(makeEnv(c)) : (OPTIONS[s.tool] ?? []);
}

/** The Apply button of the running tool. */
export function toolApply(c: CommandCtx): void {
  const s = c.ws.getState().session;
  const def = s && TOOLS[s.tool];
  if (!s || !def?.apply) return;
  guard(c, s.tool, () => def.apply!(s, makeEnv(c)));
}

/** Change one tool-bar option of a tool (kept per tool for the session). */
export function setToolOpt(c: CommandCtx, tool: string, key: string, value: number | string | boolean): void {
  const s = c.ws.getState();
  s.patch({ toolOpts: { ...s.toolOpts, [tool]: { ...(s.toolOpts[tool] ?? {}), [key]: value } } });
  const sess = c.ws.getState().session;
  if (sess && sess.tool === tool) {
    const def = TOOLS[tool];
    if (def) c.ws.getState().setTool(tool, def.prompt(sess, makeEnv(c)));
  }
}

/* ── items ────────────────────────────────────────────────────────────── */
const LABEL: Record<ItemKind, string> = {
  line: "Line", polyline: "Polyline", rect: "Rectangle", circle: "Circle", arc: "Arc", spline: "Spline", hatch: "Hatch", room: "Room",
  wall: "Wall", door: "Door", window: "Window", slab: "Slab", roof: "Roof", stair: "Stair", column: "Column", beam: "Beam", ramp: "Ramp",
  foundation: "Foundation", framing: "Framing", truss: "Trusses", brace: "Brace", connection: "Connection",
  duct: "Duct", pipe: "Pipe", tray: "Cable Tray", device: "Device", fixture: "Fixture", equipment: "Equipment", furniture: "Furniture",
  text: "Text", note: "Note", dim: "Dimension", leader: "Leader", tag: "Tag", secmark: "Section Mark", elevmark: "Elevation Mark",
  detail: "Detail", gridline: "Grid Line", markup: "Markup", pin: "Pin", label: "Label", image: "Image", clone: "Copy",
  elevline: "Elevation Line", elevarc: "Circular Elevation", shed: "Shed", tree: "Tree", flowers: "Flower Bed", septic: "Septic System", solid: "Imported Element",
  pool: "Pool", fence: "Fence", rock: "Boulder", gravel: "Gravel Bed", road: "Road", sidewalk: "Sidewalk", sign: "Sign", signal: "Traffic Light", drain: "Drain",
  gutter: "Gutter", solar: "Solar Array", wire: "Wire", pipelink: "Pipe",
};

/** The display name of a kind ("Wall"). */
export const labelOf = (k: ItemKind): string => LABEL[k];

/** A new drawn item on the active level, named "Wall 3" (one more than the walls already drawn). */
export function mkItem(env: ToolEnv, kind: ItemKind, pts: V2[], p: Params = {}, extra: Partial<DrawnItem> = {}): DrawnItem {
  const level = extra.level ?? env.level;
  const n = env.s.drawn.filter((i) => i.kind === kind).length + 1;
  return { id: uid("U"), kind, name: `${LABEL[kind]} ${n}`, level, z: env.scene.levelZ[level], pts, p, ...extra };
}

/** Height of a storey of the active level. */
export const storeyOf = (env: ToolEnv, level: LevelKey = env.level): number => storeyHeight(env.scene, level);

/** The status-bar toggles and Settings → Grid & Snap as one SnapCfg. */
export function snapConfig(s: WsState, gs: { snapSpacing: string; polarAngle: number; osnap: SnapCfg["modes"] }, sys: MeasureSystem): SnapCfg {
  return {
    grid: s.toggles.snap,
    step: parseLen(gs.snapSpacing, sys) ?? parseLen(gs.snapSpacing) ?? 0.5,
    ortho: s.toggles.ortho,
    polar: s.toggles.polar,
    polarAngle: gs.polarAngle,
    osnap: s.toggles.osnap,
    modes: gs.osnap,
    otrack: s.toggles.otrack,
  };
}
