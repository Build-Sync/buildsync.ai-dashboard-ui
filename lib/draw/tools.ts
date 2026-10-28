/**
 * lib/draw/tools.ts
 *
 * WHAT   The drawing, placing, annotating and measuring commands, one ToolDef each, registered by command name:
 *        LINE PLINE SPLINE RECTANG CIRCLE ARC HATCH · WALL DOOR WINDOW SLAB ROOF STAIR COLUMN BEAM RAMP ROOM ·
 *        FOUNDATION FRAMING TRUSS BRACE CONNECT · DUCT PIPE TRAY FIRE · FURN MEPLIB STRLIB IMAGE TEXT NOTE ·
 *        (the fixture tools ELEC PLUMB HVAC FIXT EQUIP, WIRE, PIPECONNECT and SOLAR are in tools-mep.ts; POOL, ROCK,
 *        ROAD, SIGN, DRAIN, GUTTER … in tools-site.ts) · DIM LEADER TAG SECTIONLINE ELEVMARK DETAIL GRIDLINE MARKUP PIN ·
 *        LABEL (names a place: shown on the plan and floating in 3D) · PROPLINE (the property line, by clicks or
 *        by typed bearings and distances; stored on the project's site, lib/geo.ts) ·
 *        DIST AREA VOLUME ANGLE ELEV ID CLEAR · VIEWELEV (an elevation along two points at any angle, around a
 *        circle (unrolled), along a drawn line or wall, or of a side N, S, E, W: a mark on the plan and its own sheet)
 *        VIEWSECTION (a cut line, then the side to look at: a section mark and a section sheet) · SHED TREE BUSH
 *        FLOWERS SEPTIC (site objects, sized in the tool bar, placed by a click or a typed x,y). Generic factories (pathTool, twoPoint, boundary, place, pickHost)
 *        keep each tool to a few lines.
 * FOR    lib/commands.ts starts these through beginTool(name); the viewport sends clicks, the command line sends
 *        typed points. Every tool ends in put(), which checks the layer lock, switches the layer on and commits
 *        one undoable change.
 * DEBUG  - A tool "does nothing": read its prompt (viewport and command line) for the step it wants, e.g.
 *          DOOR needs a click ON a wall; FRAMING needs a click on a wall, slab, roof or foundation.
 *        - Something is drawn but invisible: MEP layers start hidden (the tools switch them on); framing and
 *          trusses show in Section cut or X-ray; a foundation is below grade (Section cut / X-ray, and dashed
 *          in the plan).
 *        - Typed points: x,y · @dx,dy · @distance<angle · a distance (direction from the cursor) · C closes ·
 *          U removes the last point · R switches a boundary tool to a rectangle, and turns what a placing tool puts
 *          down next a quarter (turnPlacing; the Turn 90° shortcuts do the same while the tool runs).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { azimuth, bearingText, boundaryInfo, fmtSiteArea, isPlaced, UNPLACED } from "../geo";
import { elementDetails, levelLabel } from "../scene";
import type { Category, LevelKey, V2 } from "../scene/types";
import type { LayerId } from "../types";
import { compassName, lineAngleLength, lineFrom, lineView, sideOf, type ElevLine } from "../elevation";
import { BOXES, META, boxPoly, frameOfElement, str } from "./compose";
import { FURNITURE, pieceOf, planShapes } from "./furniture";
import { add2, angleBetween, angleDeg, arcFrom3, arcPts, circlePts, closestOnSeg, dist2, dot2, mid2, mul2, orientedRect, perp2, polyArea, polyLength, rectPts, sub2, unit2 } from "./geom";
import { enclosureAt } from "./enclose";
import { lastImage, pickImage, takeQueued } from "./image";
import { OPTIONS, TYPE_DEFS } from "./options";
import type { OptDef } from "./options";
import { mkItem, register, storeyOf, type ClickInfo, type ToolDef, type ToolEnv } from "./session";
import { parseLen } from "./snap";
import type { Sheet, WsState } from "../store/workspace-store";
import type { DrawnItem, ItemKind, Params, Preview, ToolSession } from "./types";
import type { Change } from "./change";

/* ── small helpers ────────────────────────────────────────────────────── */
type Shape = Preview["shapes"][number];
const shp = (pts: V2[], o: Partial<Shape> = {}): Shape => ({ pts, tone: "ghost", ...o });
const prev = (shapes: Shape[], labels: Preview["labels"] = []): Preview => ({ shapes, labels });
const lenLabel = (env: ToolEnv, a: V2, b: V2) => ({ at: mid2(a, b), text: env.fmt(dist2(a, b)) });
const fmtArea = (sqft: number, sys: ToolEnv["sys"]) => (sys === "imperial" ? `${sqft.toFixed(1)} sf` : `${(sqft * 0.092903).toFixed(2)} m²`);
const fmtVol = (cf: number, sys: ToolEnv["sys"]) => (sys === "imperial" ? `${(cf / 27).toFixed(2)} cy (${cf.toFixed(1)} cf)` : `${(cf * 0.0283168).toFixed(2)} m³`);

/** The layer an item lives on (devices follow their system). */
function layerOfItem(it: DrawnItem): LayerId {
  if (it.kind === "device") return ({ electrical: "electrical", plumbing: "plumbing", hvac: "hvac", fire: "fire" } as Record<string, LayerId>)[str(it, "rk", "electrical")] ?? "electrical";
  if (it.kind === "slab") return it.level === "level1" || it.level === "foundation" ? "foundation" : it.level === "site" ? "landscape" : "interior";
  return META[it.kind].layer;
}

/** Turn a layer on (the MEP layers start hidden, so drawing a duct would otherwise show nothing). */
function showLayer(env: ToolEnv, id: LayerId): void {
  const st = env.s;
  const l = st.project.layers.find((x) => x.id === id);
  if (!l || l.visible) return;
  st.patch({ project: { ...st.project, layers: st.project.layers.map((x) => (x.id === id ? { ...x, visible: true } : x)) } });
  env.say("info", `${l.name} layer turned on`);
}

/** Commit new items as one undo step, unless a layer is locked. Returns whether it was committed. */
export function put(env: ToolEnv, label: string, items: DrawnItem[], change: Change = {}): boolean {
  for (const it of items) {
    const layer = env.s.project.layers.find((l) => l.id === layerOfItem(it));
    if (layer?.locked) {
      env.toast(`The ${layer.name} layer is locked. Unlock it to draw.`, "warn");
      return false;
    }
  }
  for (const it of items) showLayer(env, layerOfItem(it));
  env.commit(label, { ...change, add: [...(change.add ?? []), ...items] });
  env.say("ok", `✓ ${label}${items.length > 1 ? ` (${items.length} items)` : ""}`);
  return true;
}

/** Parameters and material of a type from TYPE_DEFS. */
function typed(kind: ItemKind, value: string): { p: Params; material?: string } {
  const d = (TYPE_DEFS[kind] ?? []).find((t) => t.value === value) ?? TYPE_DEFS[kind]?.[0];
  return { p: { ...(d?.p ?? {}), type: d?.label ?? "" }, material: d?.material };
}

/* ── generic factories ────────────────────────────────────────────────── */
/** Points until Enter (or C to close): polylines, splines, runs, markups. */
function pathTool(cfg: { first: string; next: string; min: number; closable: boolean; commit: (pts: V2[], closed: boolean, env: ToolEnv) => void; layer?: LayerId }): ToolDef {
  return {
    begin: (env) => cfg.layer && showLayer(env, cfg.layer),
    prompt: (s) => (s.pts.length ? cfg.next : cfg.first),
    click: (s, c, env) => {
      const l = s.pts[s.pts.length - 1];
      if (l && dist2(l, c.pt) < 0.01) return; // the second click of a double click
      if (cfg.closable && s.pts.length >= 3 && dist2(s.pts[0], c.pt) < 0.3) {
        cfg.commit(s.pts, true, env);
        env.again();
        return;
      }
      env.set({ pts: [...s.pts, c.pt] });
    },
    enter: (s, env) => {
      if (s.pts.length >= cfg.min) {
        cfg.commit(s.pts, false, env);
        env.again();
      } else if (!s.pts.length) env.done();
      else env.say("warn", `⚠ Specify at least ${cfg.min} points, or Esc to cancel.`);
    },
    text: (s, t, env) => {
      if (/^c(lose)?$/i.test(t) && cfg.closable && s.pts.length >= 3) {
        cfg.commit(s.pts, true, env);
        env.again();
        return true;
      }
      return false;
    },
    preview: (s, cur, env) => {
      if (!s.pts.length) return null;
      const l = s.pts[s.pts.length - 1];
      return prev([shp([...s.pts, cur])], [lenLabel(env, l, cur)]);
    },
  };
}

/** Two points, then an object: rectangle, circle, beam, stair … */
function twoPoint(cfg: { first: string; second: string; label: string; build: (a: V2, b: V2, env: ToolEnv) => DrawnItem[] | null; ghost?: (a: V2, b: V2, env: ToolEnv) => Preview; min?: number; layer?: LayerId; text?: ToolDef["text"] }): ToolDef {
  return {
    begin: (env) => cfg.layer && showLayer(env, cfg.layer),
    prompt: (s) => (s.pts.length ? cfg.second : cfg.first),
    click: (s, c, env) => {
      if (!s.pts.length) return env.next("second", { pts: [c.pt] });
      const a = s.pts[0];
      if (dist2(a, c.pt) < (cfg.min ?? 0.05)) return env.toast("The two points are the same.", "warn");
      const items = cfg.build(a, c.pt, env);
      if (items?.length) put(env, cfg.label, items);
      env.again();
    },
    enter: (s, env) => (s.pts.length ? env.again() : env.done()),
    text: cfg.text,
    preview: (s, cur, env) => (s.pts.length ? (cfg.ghost ? cfg.ghost(s.pts[0], cur, env) : prev([shp([s.pts[0], cur])], [lenLabel(env, s.pts[0], cur)])) : null),
  };
}

/** A closed boundary (polygon, or a rectangle with R or with two points + Enter): slab, roof, foundation. */
function boundary(cfg: { kind: ItemKind; label: string; prompt: string; params: (env: ToolEnv) => { p: Params; material?: string }; layer?: LayerId; level?: LevelKey; z?: (env: ToolEnv) => number }): ToolDef {
  const commit = (pts: V2[], env: ToolEnv, rect: boolean) => {
    const poly = rect ? rectPts(pts[0], pts[1]) : pts;
    if (Math.abs(polyArea(poly)) < 0.5) return env.toast("That boundary has no area.", "warn");
    const { p, material } = cfg.params(env);
    const where: Partial<DrawnItem> = { closed: true };
    if (cfg.level) where.level = cfg.level;
    if (cfg.z) where.z = cfg.z(env);
    put(env, cfg.label, [mkItem(env, cfg.kind, poly, material ? { ...p, material } : p, where)]);
    env.again();
  };
  return {
    begin: (env) => cfg.layer && showLayer(env, cfg.layer),
    prompt: (s) => (s.data.rect ? (s.pts.length ? "Specify opposite corner:" : "Specify first corner:") : s.pts.length ? "Specify next point [Enter = close, R = rectangle, U = undo]:" : `${cfg.prompt} (R = rectangle)`),
    click: (s, c, env) => {
      const l = s.pts[s.pts.length - 1];
      if (l && dist2(l, c.pt) < 0.01) return;
      if (s.data.rect) {
        if (s.pts.length) return commit([s.pts[0], c.pt], env, true);
        return env.set({ pts: [c.pt] });
      }
      if (s.pts.length >= 3 && dist2(s.pts[0], c.pt) < 0.3) return commit(s.pts, env, false);
      env.set({ pts: [...s.pts, c.pt] });
    },
    enter: (s, env) => {
      if (s.pts.length === 2) commit(s.pts, env, true);
      else if (s.pts.length >= 3) commit(s.pts, env, false);
      else if (!s.pts.length) env.done();
      else env.say("warn", "⚠ A boundary needs at least two points (a rectangle) or three.");
    },
    text: (s, t, env) => {
      if (/^r(ect(angle)?)?$/i.test(t)) {
        env.set({ data: { ...s.data, rect: 1 } });
        return true;
      }
      if (/^c(lose)?$/i.test(t) && s.pts.length >= 3) {
        commit(s.pts, env, false);
        return true;
      }
      return false;
    },
    preview: (s, cur) => {
      if (!s.pts.length) return null;
      if (s.data.rect || s.pts.length === 1) return prev([shp(s.data.rect ? rectPts(s.pts[0], cur) : [s.pts[0], cur], { closed: !!s.data.rect, fill: true })]);
      return prev([shp([...s.pts, cur], { closed: true, fill: true })]);
    },
  };
}

/** One click places something. */
function place(cfg: { prompt: string; label: string; build: (pt: V2, c: ClickInfo, env: ToolEnv) => DrawnItem[] | null; ghost?: (pt: V2, env: ToolEnv) => Preview; begin?: ToolDef["begin"] }): ToolDef {
  return {
    begin: cfg.begin,
    prompt: () => cfg.prompt,
    click: (_s, c, env) => {
      const items = cfg.build(c.pt, c, env);
      if (items?.length) put(env, cfg.label, items);
    },
    enter: (_s, env) => env.done(),
    preview: (_s, cur, env) => (cfg.ghost ? cfg.ghost(cur, env) : null),
    // R turns what is placed next a quarter turn (for a tool whose tool bar has a turn)
    text: (_s, t, env) => {
      if (!/^r$/i.test(t.trim())) return false;
      const rot = turnPlacing(env.s, env.session.tool, 90);
      if (rot === null) return false;
      env.say("info", `Turned to ${rot}°`);
      return true;
    },
  };
}

/** Does this tool place something that turns (a "rot" in its tool bar)? */
export const turnsWhenPlacing = (tool: string): boolean => !!OPTIONS[tool]?.some((o) => o.key === "rot");

/**
 * Turn what a placing tool puts down next by `by` degrees (R, or the Rotate 90° shortcuts while it runs). Returns the
 * new turn, or null when the tool has nothing to turn.
 */
export function turnPlacing(s: WsState, tool: string, by: number): number | null {
  if (!turnsWhenPlacing(tool)) return null;
  const cur = Number(s.toolOpts[tool]?.rot ?? OPTIONS[tool].find((o) => o.key === "rot")?.def ?? 0) || 0;
  const rot = (((cur + by) % 360) + 360) % 360;
  s.patch({ toolOpts: { ...s.toolOpts, [tool]: { ...(s.toolOpts[tool] ?? {}), rot } } });
  return rot;
}

/** Click an existing element of the right kind. */
function pickHost(cfg: { prompt: string; cats: Category[]; build: (id: string, name: string, env: ToolEnv) => DrawnItem[] | null; label: string }): ToolDef {
  return {
    prompt: () => cfg.prompt,
    click: (_s, c, env) => {
      const el = c.hit ? env.scene.elementById[c.hit] : undefined;
      if (!el || !cfg.cats.includes(el.category)) return env.toast(`Click ${cfg.cats.map((k) => k.toLowerCase()).join(", ")}.`, "warn");
      const items = cfg.build(el.id, el.name, env);
      if (items?.length) put(env, cfg.label, items);
    },
    enter: (_s, env) => env.done(),
  };
}

const boxGhost = (w: number, d: number, rot = 0) => (pt: V2): Preview => {
  const r = (rot * Math.PI) / 180;
  const u: V2 = [Math.cos(r), Math.sin(r)];
  const v = perp2(u);
  const poly = ([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as V2[]).map(([a, b]) => add2(pt, add2(mul2(u, a), mul2(v, b))));
  return prev([shp(poly, { closed: true, fill: true })]);
};

/* ══ DRAW ═════════════════════════════════════════════════════════════════ */
register("LINE", {
  prompt: (s) => (s.pts.length ? "Specify next point [Enter = finish, U = undo]:" : "Specify first point:"),
  click: (s, c, env) => {
    const a = s.pts[0];
    if (!a) return env.set({ pts: [c.pt] });
    if (dist2(a, c.pt) < 0.01) return;
    if (put(env, "Line", [mkItem(env, "line", [a, c.pt])])) env.set({ pts: [c.pt] });
  },
  enter: (s, env) => (s.pts.length ? env.again() : env.done()),
  preview: (s, cur, env) => (s.pts.length ? prev([shp([s.pts[0], cur])], [lenLabel(env, s.pts[0], cur)]) : null),
});

register("PLINE", pathTool({ first: "Specify start point:", next: "Specify next point [Enter = finish, C = close, U = undo]:", min: 2, closable: true, commit: (pts, closed, env) => void put(env, "Polyline", [mkItem(env, "polyline", pts, {}, { closed })]) }));
register("SPLINE", pathTool({ first: "Specify first point:", next: "Specify next point [Enter = finish, U = undo]:", min: 3, closable: false, commit: (pts, _c, env) => void put(env, "Spline", [mkItem(env, "spline", pts)]) }));
register("MARKUP", {
  ...pathTool({ first: "Specify markup start point:", next: "Specify next point [Enter = finish]:", min: 2, closable: false, layer: "annotation", commit: (pts, _c, env) => void put(env, "Markup", [mkItem(env, "markup", pts, { text: env.opt("text", "") })]) }),
});

register("RECTANG", twoPoint({ first: "Specify first corner point:", second: "Specify opposite corner (or @width,height):", label: "Rectangle", build: (a, b, env) => (Math.abs(b[0] - a[0]) < 0.01 || Math.abs(b[1] - a[1]) < 0.01 ? null : [mkItem(env, "rect", rectPts(a, b), {}, { closed: true })]), ghost: (a, b, env) => prev([shp(rectPts(a, b), { closed: true })], [{ at: mid2(a, b), text: `${env.fmt(Math.abs(b[0] - a[0]))} × ${env.fmt(Math.abs(b[1] - a[1]))}` }]) }));

register("CIRCLE", twoPoint({
  first: "Specify center point for circle:",
  second: "Specify radius (click, or type a number):",
  label: "Circle",
  build: (a, b, env) => [mkItem(env, "circle", [a, b])],
  ghost: (a, b, env) => prev([shp(circlePts(a, dist2(a, b)), { closed: true }), shp([a, b])], [lenLabel(env, a, b)]),
  // a typed radius finishes the circle without a second click
  text: (s, t, env) => {
    const r = s.pts.length === 1 ? parseLen(t, env.sys) : null;
    if (!r || r <= 0) return false;
    put(env, "Circle", [mkItem(env, "circle", [s.pts[0], [s.pts[0][0] + r, s.pts[0][1]]])]);
    env.again();
    return true;
  },
}));

register("ARC", {
  prompt: (s) => (s.pts.length === 0 ? "Specify start point of arc:" : s.pts.length === 1 ? "Specify second point of arc:" : "Specify end point of arc:"),
  click: (s, c, env) => {
    if (s.pts.length < 2) return env.set({ pts: [...s.pts, c.pt] });
    if (!arcFrom3(s.pts[0], s.pts[1], c.pt)) return env.toast("The three points are in a line. Pick another end point.", "warn");
    put(env, "Arc", [mkItem(env, "arc", [s.pts[0], s.pts[1], c.pt])]);
    env.again();
  },
  enter: (s, env) => (s.pts.length ? env.again() : env.done()),
  preview: (s, cur) => {
    if (s.pts.length === 1) return prev([shp([s.pts[0], cur])]);
    if (s.pts.length === 2) {
      const arc = arcFrom3(s.pts[0], s.pts[1], cur);
      return prev([shp(arc ? arcPts(arc, 32) : [s.pts[0], s.pts[1], cur])]);
    }
    return null;
  },
});

register("HATCH", {
  prompt: () => "Pick internal point (inside a closed shape, room or walls):",
  options: () => [{ key: "pattern", label: "Pattern", type: "select", def: "diag", options: [{ value: "diag", label: "Diagonal" }, { value: "cross", label: "Cross-hatch" }, { value: "dots", label: "Dots" }, { value: "solid", label: "Solid" }] }],
  click: (_s, c, env) => {
    const poly = enclosureAt(env.scene, env.level, c.pt, c.hit);
    if (!poly) return env.toast("No closed boundary found there. Close the shape or the walls around it, then click inside.", "warn");
    // the click point is kept: the hatch re-finds its boundary when the walls or the shape around it move
    put(env, "Hatch", [mkItem(env, "hatch", poly, { pattern: env.opt("pattern", "diag"), sx: c.pt[0], sy: c.pt[1] }, { closed: true })]);
  },
  enter: (_s, env) => env.done(),
});

/* ══ BUILDING ═════════════════════════════════════════════════════════════ */
/** A wall of the chosen type and height from a to b. */
function wallItem(env: ToolEnv, a: V2, b: V2): DrawnItem {
  const t = typed("wall", env.opt("wtype", "cmu8"));
  const params: Params = { ...t.p, ...(t.material ? { material: t.material } : {}), bearing: env.opt("bearing", false) };
  const h = env.optAuto("height", 0);
  if (h > 0) params.height = h;
  return mkItem(env, "wall", [a, b], params);
}

register("WALL", {
  prompt: (s) => (s.pts.length ? "Specify next wall end point [Enter = finish, C = close, U = undo]:" : "Specify wall start point:"),
  click: (s, c, env) => {
    const a = s.pts[0];
    if (!a) return env.set({ pts: [c.pt], data: { ...s.data, fx: c.pt[0], fy: c.pt[1] } });
    if (dist2(a, c.pt) < 0.05) return;
    if (!put(env, "Wall", [wallItem(env, a, c.pt)])) return;
    const closing = s.data.fx !== undefined && dist2([Number(s.data.fx), Number(s.data.fy)], c.pt) < 0.3;
    if (closing) env.again();
    else env.set({ pts: [c.pt] });
  },
  enter: (s, env) => (s.pts.length ? env.again() : env.done()),
  text: (s, t, env) => {
    if (!/^c(lose)?$/i.test(t) || !s.pts.length || s.data.fx === undefined) return false;
    const first: V2 = [Number(s.data.fx), Number(s.data.fy)];
    if (dist2(s.pts[0], first) > 0.05) put(env, "Wall", [wallItem(env, s.pts[0], first)]);
    env.again();
    return true;
  },
  preview: (s, cur, env) => {
    if (!s.pts.length) return null;
    const t = typed("wall", env.opt("wtype", "cmu8")).p.thick as number;
    return prev([shp(orientedRect(s.pts[0], cur, t), { closed: true, fill: true })], [lenLabel(env, s.pts[0], cur)]);
  },
});

/** DOOR and WINDOW: click a wall; the opening is cut at that spot. */
function opening(kind: "door" | "window"): ToolDef {
  const hostAt = (env: ToolEnv, hit: string | null, at: (z: number) => V2 | null, fallback: V2) => {
    const f = hit ? frameOfElement(env.scene, hit) : null;
    const el = hit ? env.scene.elementById[hit] : undefined;
    if (!f || !el) return null;
    const t = typed(kind, env.opt(kind === "door" ? "dtype" : "wtype", kind === "door" ? "single" : "fixed"));
    const w = (t.p.w as number) ?? 3;
    const sill = (t.p.sill as number) ?? (kind === "door" ? 0 : 3);
    const head = (t.p.head as number) ?? (kind === "door" ? 6.67 : 7);
    const p = at(f.z0 + (sill + head) / 2) ?? fallback;
    const pos = dot2(sub2(p, f.A), f.dir);
    const pos0 = Math.max(0.25, Math.min(f.len - w - 0.25, pos - w / 2));
    return { f, el, t, w, sill, head, at: pos0 };
  };
  return {
    prompt: () => `Click a wall to host the ${kind}:`,
    click: (_s, c, env) => {
      const h = hostAt(env, c.hit, c.at, c.pt);
      if (!h) return env.toast(`Click on a wall to place the ${kind}.`, "warn");
      if (h.f.len < h.w + 0.5) return env.toast(`That wall is too short for a ${h.w.toFixed(1)} ft ${kind}.`, "warn");
      const clash = env.s.drawn.some((o) => (o.kind === "door" || o.kind === "window") && o.p.host === h.el.id && Math.abs((o.p.at as number) - h.at) < ((o.p.w as number) + h.w) / 2);
      if (clash) return env.toast("That spot already has a door or window. Click further along the wall.", "warn");
      const centre = add2(h.f.A, mul2(h.f.dir, h.at + h.w / 2));
      const p: Params = { ...h.t.p, host: h.el.id, at: h.at, w: h.w, sill: h.sill, head: h.head, ...(h.t.material ? { material: h.t.material } : {}) };
      if (kind === "door") {
        p.hinge = env.opt("hinge", "start");
        p.swing = Number(env.opt("swing", "1"));
      }
      put(env, kind === "door" ? "Door" : "Window", [mkItem(env, kind, [centre], p, { level: h.el.level, z: h.f.z0 })]);
    },
    enter: (_s, env) => env.done(),
    preview: (_s, cur, env) => {
      const hover = env.s.hover;
      const h = hostAt(env, hover, () => null, cur);
      if (!h) return null;
      const a = add2(h.f.A, mul2(h.f.dir, h.at));
      const b = add2(h.f.A, mul2(h.f.dir, h.at + h.w));
      return prev([shp(orientedRect(a, b, h.f.thick + 0.3), { closed: true, fill: true })], [{ at: mid2(a, b), text: env.fmt(h.w) }]);
    },
  };
}
register("DOOR", opening("door"));
register("WINDOW", opening("window"));

register("SLAB", boundary({ kind: "slab", label: "Slab", prompt: "Specify slab boundary:", params: (env) => typed("slab", env.opt("stype", "s6")) }));
// a roof sits on top of the storey of the active level; a foundation sits at the foundation level
register("ROOF", boundary({ kind: "roof", label: "Roof", prompt: "Pick roof boundary:", params: (env) => typed("roof", env.opt("rtype", "tile")), level: "roof", z: (env) => env.z + storeyOf(env) }));
register("FOUNDATION", boundary({ kind: "foundation", label: "Foundation", prompt: "Specify foundation boundary:", params: (env) => ({ p: { thick: env.opt("thick", 1) }, material: META.foundation.material }), level: "foundation", z: (env) => env.scene.levelZ.foundation }));

register("STAIR", twoPoint({
  first: "Specify stair start point (bottom):",
  second: "Specify stair end point (top of the run):",
  label: "Stair",
  min: 1,
  build: (a, b, env) => {
    const t = typed("stair", env.opt("ttype", "concrete"));
    const rise = env.optAuto("rise", storeyOf(env));
    return [mkItem(env, "stair", [a, b], { ...t.p, width: env.opt("width", 3.5), rise, ...(t.material ? { material: t.material } : {}) })];
  },
  ghost: (a, b, env) => prev([shp(orientedRect(a, b, env.opt("width", 3.5)), { closed: true, fill: true })], [lenLabel(env, a, b)]),
}));

register("COLUMN", place({
  prompt: "Specify column location:",
  label: "Column",
  build: (pt, _c, env) => {
    const t = typed("column", env.opt("ctype", "conc12"));
    const p: Params = { ...t.p, ...(t.material ? { material: t.material } : {}) };
    const h = env.optAuto("height", 0);
    if (h > 0) p.height = h;
    return [mkItem(env, "column", [pt], p)];
  },
  ghost: (pt, env) => {
    const t = typed("column", env.opt("ctype", "conc12"));
    return boxGhost(t.p.size as number, t.p.size as number)(pt);
  },
}));

register("BEAM", twoPoint({
  first: "Specify beam start point:",
  second: "Specify beam end point:",
  label: "Beam",
  build: (a, b, env) => {
    const t = typed("beam", env.opt("btype", "conc"));
    return [mkItem(env, "beam", [a, b], { ...t.p, ...(t.material ? { material: t.material } : {}) })];
  },
  ghost: (a, b, env) => prev([shp(orientedRect(a, b, 0.67), { closed: true, fill: true })], [lenLabel(env, a, b)]),
}));

register("RAMP", twoPoint({
  first: "Specify ramp start point (bottom):",
  second: "Specify ramp end point (top):",
  label: "Ramp",
  min: 1,
  build: (a, b, env) => {
    const L = dist2(a, b);
    env.say("info", `Ramp ${env.fmt(L)} long rises ${env.fmt(L / 12)} (1:12 slope)`);
    return [mkItem(env, "ramp", [a, b], { width: env.opt("width", 4), rise: L / 12 })];
  },
  ghost: (a, b, env) => prev([shp(orientedRect(a, b, env.opt("width", 4)), { closed: true, fill: true })], [{ at: mid2(a, b), text: `${env.fmt(dist2(a, b))} · rise ${env.fmt(dist2(a, b) / 12)}` }]),
}));

register("ROOM", {
  prompt: () => "Click inside a closed boundary (walls or a closed shape):",
  options: () => [{ key: "name", label: "Name", type: "text", def: "Room" }],
  click: (_s, c, env) => {
    const poly = enclosureAt(env.scene, env.level, c.pt, c.hit);
    if (!poly) return env.toast("That space is not closed. Close the gaps (a door, a wall or a line) or draw a closed shape, then click inside.", "warn");
    const area = Math.abs(polyArea(poly));
    const name = env.opt("name", "Room") || "Room";
    const n = env.s.drawn.filter((i) => i.kind === "room").length + 1;
    // the click point is kept: the room re-finds its walls (and its area) whenever they move
    if (put(env, "Room", [mkItem(env, "room", poly, { label: name, sx: c.pt[0], sy: c.pt[1] }, { closed: true, name: `${name} ${n}` })])) env.say("info", `${name} ${n}: ${fmtArea(area, env.sys)}`);
  },
  enter: (_s, env) => env.done(),
});

/* ══ STRUCTURE ════════════════════════════════════════════════════════════ */
register("FRAMING", pickHost({
  prompt: "Select host element (wall, slab, roof or foundation):",
  cats: ["Wall", "Partition", "Slab", "Roof", "Foundation"],
  label: "Framing",
  build: (id, name, env) => {
    env.say("info", "Framing is drawn in Section cut or X-ray.");
    return [mkItem(env, "framing", [], { host: id, spacing: env.opt("spacing", 1.333) }, { name: `Framing – ${name}` })];
  },
}));

register("TRUSS", pickHost({
  prompt: "Select roof boundary (a roof or slab):",
  cats: ["Roof", "Slab"],
  label: "Trusses",
  build: (id, name, env) => {
    env.say("info", "Trusses are drawn in Section cut or X-ray.");
    return [mkItem(env, "truss", [], { host: id, spacing: env.opt("spacing", 2) }, { name: `Trusses – ${name}`, level: "roof" })];
  },
}));

register("BRACE", twoPoint({
  first: "Specify brace start point (bottom):",
  second: "Specify brace end point (top):",
  label: "Brace",
  build: (a, b, env) => [mkItem(env, "brace", [a, b], { height: storeyOf(env) })],
}));

register("CONNECT", {
  prompt: (s) => (s.picks.length ? "Select the second member:" : "Select two members to connect (first member):"),
  click: (s, c, env) => {
    const el = c.hit ? env.scene.elementById[c.hit] : undefined;
    if (!el || el.system === "Drafting") return env.toast("Click a structural member (wall, column, beam, slab …).", "warn");
    if (!s.picks.length) return env.next("second", { picks: [el.id] });
    const a = env.scene.elementById[s.picks[0]];
    if (!a || a.id === el.id) return env.toast("Pick a different member.", "warn");
    const mid = (k: 0 | 1 | 2): number => {
      const lo = Math.max(a.min[k], el.min[k]);
      const hi = Math.min(a.max[k], el.max[k]);
      if (lo <= hi) return (lo + hi) / 2;
      return a.max[k] < el.min[k] ? (a.max[k] + el.min[k]) / 2 : (el.max[k] + a.min[k]) / 2;
    };
    const at: V2 = [mid(0), mid(1)];
    put(env, "Connection", [mkItem(env, "connection", [at], { size: 1, a: a.id, b: el.id }, { z: mid(2), name: `Connection ${a.name} – ${el.name}` })]);
    env.again();
  },
  enter: (_s, env) => env.done(),
});

/* ══ MEP ══════════════════════════════════════════════════════════════════ */
const heightOpt = (env: ToolEnv, auto: number) => env.optAuto("h", auto);

register("DUCT", pathTool({ first: "Specify duct start point:", next: "Specify next point [Enter = finish, U = undo]:", min: 2, closable: false, layer: "hvac", commit: (pts, _c, env) => void put(env, "Duct", [mkItem(env, "duct", pts, { h: heightOpt(env, storeyOf(env) - 1.2) })]) }));
register("PIPE", pathTool({ first: "Specify pipe start point:", next: "Specify next point [Enter = finish, U = undo]:", min: 2, closable: false, layer: "plumbing", commit: (pts, _c, env) => void put(env, "Pipe", [mkItem(env, "pipe", pts, { h: heightOpt(env, storeyOf(env) - 0.8) })]) }));
register("TRAY", pathTool({ first: "Specify tray start point:", next: "Specify next point [Enter = finish, U = undo]:", min: 2, closable: false, layer: "electrical", commit: (pts, _c, env) => void put(env, "Cable tray", [mkItem(env, "tray", pts, { h: heightOpt(env, storeyOf(env) - 0.5) })]) }));

const device = (env: ToolEnv, pt: V2, rk: "electrical" | "plumbing" | "hvac" | "fire", shape: string, name: string, h: number): DrawnItem =>
  mkItem(env, "device", [pt], { rk, shape, h }, { name: `${name} ${env.s.drawn.filter((i) => i.kind === "device").length + 1}` });

register("FIRE", place({
  prompt: "Specify sprinkler head location:",
  label: "Fire protection",
  begin: (env) => showLayer(env, "fire"),
  build: (pt, _c, env) => [device(env, pt, "fire", env.opt("shape", "head"), env.opt("shape", "head") === "unit" ? "Alarm" : "Sprinkler head", storeyOf(env) - 0.5)],
  ghost: boxGhost(0.8, 0.8),
}));

/** The furniture piece the FURN tool places now, and its turn. */
const furnChoice = (env: ToolEnv) => ({ pc: pieceOf(env.opt("type", "sofa")) ?? FURNITURE.sofa, rot: env.opt("rot", 0) });
register("FURN", {
  ...place({
    prompt: "",
    label: "Furniture",
    begin: (env) => {
      showLayer(env, "furniture");
      // in 3D the roof hides the rooms: cut the model above the floor so the pieces can be seen where they go
      if (env.s.view === "3d" && !env.s.cutaway) {
        env.s.patch({ cutaway: true });
        env.say("info", "Cutaway on: the model is cut 4 ft above the floor so you can see into the rooms (CUTAWAY turns it off)");
      }
    },
    build: (pt, _c, env) => {
      const { pc, rot } = furnChoice(env);
      const n = env.s.drawn.filter((i) => i.kind === "furniture").length + 1;
      return [mkItem(env, "furniture", [pt], { w: pc.w, d: pc.d, h: pc.h, rot, type: pc.id }, { name: `${pc.label.split(" (")[0]} ${n}` })];
    },
    // the piece as the plan will draw it: every part's outline, the lowest filled
    ghost: (pt, env) => {
      const { pc, rot } = furnChoice(env);
      return prev(planShapes(pc, pt, rot).map((poly, i) => shp(poly, { closed: true, fill: i === 0 })), [{ at: pt, text: `${pc.label.split(" (")[0]} · ${env.fmt(pc.w)} × ${env.fmt(pc.d)}` }]);
    },
  }),
  prompt: (_s, env) => `Click to place the ${furnChoice(env).pc.label.toLowerCase()} (type R to turn it 90°, or pick another piece in the tool bar):`,
  // R turns the piece a quarter turn before it is placed
  text: (_s, t, env) => {
    if (!/^r$/i.test(t.trim())) return false;
    const rot = (env.opt("rot", 0) + 90) % 360;
    env.s.patch({ toolOpts: { ...env.s.toolOpts, FURN: { ...(env.s.toolOpts.FURN ?? {}), rot } } });
    env.say("info", `Turned to ${rot}°`);
    return true;
  },
});
register("MEPLIB", place({
  prompt: "Click in the viewport to place an MEP part:",
  label: "MEP part",
  build: (pt, _c, env) => {
    const part = env.opt("part", "outlet");
    const map: Record<string, ["electrical" | "plumbing" | "hvac" | "fire", string, string, number]> = {
      outlet: ["electrical", "outlet", "Outlet", 1.3],
      light: ["electrical", "light", "Light", storeyOf(env) - 0.5],
      panel: ["electrical", "panel", "Panel", 5],
      valve: ["plumbing", "valve", "Valve", 1.5],
      diffuser: ["hvac", "unit", "Diffuser", storeyOf(env) - 0.3],
      head: ["fire", "head", "Sprinkler head", storeyOf(env) - 0.5],
    };
    const [rk, shape, name, h] = map[part] ?? map.outlet;
    return [device(env, pt, rk, shape, name, h)];
  },
  ghost: boxGhost(0.8, 0.8),
}));
register("STRLIB", place({
  prompt: "Click in the viewport to place a structural part:",
  label: "Structural part",
  build: (pt, _c, env) => {
    const part = env.opt("part", "steelcol");
    const b = BOXES[part] ?? BOXES.steelcol;
    if (part === "steelcol") return [mkItem(env, "column", [pt], { size: 0.67, height: storeyOf(env), shape: "rect", type: "Steel HSS 8\"", material: "Steel HSS 8×8×⅜, ASTM A500 Gr. B" }, { name: `Steel Column ${env.s.drawn.filter((i) => i.kind === "column").length + 1}` })];
    return [mkItem(env, "foundation", [[pt[0] - b.w / 2, pt[1] - b.d / 2], [pt[0] + b.w / 2, pt[1] - b.d / 2], [pt[0] + b.w / 2, pt[1] + b.d / 2], [pt[0] - b.w / 2, pt[1] + b.d / 2]], { thick: b.h }, { closed: true, name: `Footing Pad ${env.s.drawn.filter((i) => i.kind === "foundation").length + 1}`, z: env.scene.levelZ.foundation })];
  },
  ghost: (pt, env) => boxGhost(env.opt("part", "steelcol") === "footing" ? 3 : 0.8, env.opt("part", "steelcol") === "footing" ? 3 : 0.8)(pt),
}));

/* ══ INSERT / ANNOTATE ════════════════════════════════════════════════════ */
const textTool = (kind: "text" | "note" | "pin", prompt: string, label: string, dflt: string) =>
  place({ prompt, label, build: (pt, _c, env) => [mkItem(env, kind, [pt], { text: env.opt("text", dflt) || dflt })] });
register("TEXT", textTool("text", "Specify text location (type the text in the tool bar first):", "Text", "Text"));
register("NOTE", textTool("note", "Specify note location:", "Note", "Note"));
register("PIN", textTool("pin", "Click to pin a note to the model:", "Pin", "Pin"));
register("LABEL", place({
  prompt: "Click the place to name (type the name in the tool bar first):",
  label: "Label",
  build: (pt, _c, env) => {
    const text = env.opt("text", "Kitchen").trim() || "Place";
    return [mkItem(env, "label", [pt], { text }, { name: text })];
  },
  begin: (env) => {
    if (!env.s.labels) env.s.patch({ labels: true });
  },
}));

/* ══ SITE: the property line ═════════════════════════════════════════════ */
/** Save the property line on the site (placing the site on the map stays a separate step). */
function commitPropertyLine(env: ToolEnv, pts: V2[]): void {
  if (pts.length < 3 || Math.abs(polyArea(pts)) < 1) return env.toast("A property line needs at least three corners around an area.", "warn");
  const site = env.s.project.site ?? UNPLACED;
  const info = boundaryInfo(site, pts);
  env.commit("Property line", { site: { ...site, boundary: pts.map((p) => [p[0], p[1]] as V2) } });
  env.say("ok", `✓ Property line: ${pts.length} corners, ${fmtSiteArea(info.area, env.sys !== "imperial")}, perimeter ${env.fmt(info.perimeter)}`);
  if (!isPlaced(env.s.project.site)) env.say("info", "  Place the site on the map (Insert → Site Location) to give each corner its latitude and longitude.");
  env.s.setPanel("site");
  env.done();
}

register(["PROPLINE", "BOUNDARY"], {
  prompt: (s) =>
    s.data.rect
      ? s.pts.length ? "Specify opposite corner:" : "Specify first corner:"
      : s.pts.length
        ? "Next corner, or a bearing and distance (N45°30'E 120) [Enter or C = close, U = undo]:"
        : "Specify the first corner of the property line (R = rectangle):",
  click: (s, c, env) => {
    const l = s.pts[s.pts.length - 1];
    if (l && dist2(l, c.pt) < 0.01) return;
    if (s.data.rect) {
      if (s.pts.length) return commitPropertyLine(env, rectPts(s.pts[0], c.pt));
      return env.set({ pts: [c.pt] });
    }
    if (s.pts.length >= 3 && dist2(s.pts[0], c.pt) < 0.3) return commitPropertyLine(env, s.pts);
    env.set({ pts: [...s.pts, c.pt] });
  },
  enter: (s, env) => {
    if (s.pts.length >= 3) commitPropertyLine(env, s.pts);
    else if (s.pts.length === 2) commitPropertyLine(env, rectPts(s.pts[0], s.pts[1]));
    else env.done();
  },
  text: (s, t, env) => {
    if (/^r(ect(angle)?)?$/i.test(t)) {
      env.set({ data: { ...s.data, rect: 1 } });
      return true;
    }
    if (/^c(lose)?$/i.test(t) && s.pts.length >= 3) {
      commitPropertyLine(env, s.pts);
      return true;
    }
    return false;
  },
  preview: (s, cur, env) => {
    if (!s.pts.length) return null;
    const site = env.s.project.site ?? UNPLACED;
    if (s.data.rect) return prev([shp(rectPts(s.pts[0], cur), { closed: true, dashed: true })]);
    const l = s.pts[s.pts.length - 1];
    const course = `${bearingText(azimuth(site, l, cur))}  ${env.fmt(dist2(l, cur))}`;
    return prev([shp([...s.pts, cur], { closed: s.pts.length >= 2, dashed: true })], [{ at: mid2(l, cur), text: course }]);
  },
});

register("IMAGE", {
  begin: (env) => {
    const ready = takeQueued();
    if (ready) return env.set({ data: { ...env.session.data, img: ready.name } });
    void pickImage().then((img) => {
      if (img) env.set({ data: { ...env.session.data, img: img.name } });
    });
  },
  prompt: (s) => (s.data.img ? `Specify insertion point for ${String(s.data.img)}:` : "Choose an image file, then click to place it:"),
  click: (_s, c, env) => {
    const img = lastImage();
    if (!img) {
      void pickImage().then((i) => i && env.set({ data: { ...env.session.data, img: i.name } }));
      return;
    }
    const w = Math.max(0.5, env.opt("w", 6));
    put(env, "Image", [mkItem(env, "image", [c.pt], { src: img.src, w, h: (w * img.h) / img.w, file: img.name }, { name: img.name })]);
  },
  enter: (_s, env) => env.done(),
});

register("DIM", {
  prompt: (s) => (s.pts.length === 0 ? "Specify first extension line origin:" : s.pts.length === 1 ? "Specify second extension line origin:" : "Specify dimension line location:"),
  click: (s, c, env) => {
    if (s.pts.length < 2) {
      if (s.pts.length === 1 && dist2(s.pts[0], c.pt) < 0.05) return;
      return env.set({ pts: [...s.pts, c.pt] });
    }
    const [a, b] = s.pts;
    const off = dot2(perp2(unit2(sub2(b, a))), sub2(c.pt, a));
    put(env, "Dimension", [mkItem(env, "dim", [a, b], { off: Math.abs(off) < 0.2 ? 2 : off })]);
    env.again();
  },
  enter: (s, env) => (s.pts.length ? env.again() : env.done()),
  preview: (s, cur, env) => {
    if (s.pts.length === 1) return prev([shp([s.pts[0], cur])], [lenLabel(env, s.pts[0], cur)]);
    if (s.pts.length === 2) {
      const [a, b] = s.pts;
      const n = mul2(perp2(unit2(sub2(b, a))), dot2(perp2(unit2(sub2(b, a))), sub2(cur, a)));
      return prev([shp([a, add2(a, n), add2(b, n), b])], [{ at: mid2(add2(a, n), add2(b, n)), text: env.fmt(dist2(a, b)) }]);
    }
    return null;
  },
});

register("LEADER", twoPoint({ first: "Specify leader start point (the arrow tip):", second: "Specify the text location:", label: "Leader", layer: "annotation", build: (a, b, env) => [mkItem(env, "leader", [a, b], { text: env.opt("text", "Note") || "Note" })] }));

register("TAG", {
  prompt: () => "Select element to tag:",
  click: (_s, c, env) => {
    const el = c.hit ? env.scene.elementById[c.hit] : undefined;
    if (!el || el.system === "Drafting") return env.toast("Click a model element to tag it.", "warn");
    put(env, "Tag", [mkItem(env, "tag", [c.pt], { text: `${el.name} (${el.id})`, tx: (el.min[0] + el.max[0]) / 2, ty: (el.min[1] + el.max[1]) / 2, target: el.id })]);
  },
  enter: (_s, env) => env.done(),
});

const letter = (n: number) => String.fromCharCode(65 + (n % 26));
register("SECTIONLINE", twoPoint({
  first: "Specify section line start:",
  second: "Specify section line end:",
  label: "Section mark",
  layer: "annotation",
  build: (a, b, env) => [mkItem(env, "secmark", [a, b], { text: letter(env.s.drawn.filter((i) => i.kind === "secmark").length) })],
}));
register("ELEVMARK", place({ prompt: "Specify elevation mark point:", label: "Elevation mark", build: (pt, _c, env) => [mkItem(env, "elevmark", [pt], { text: `EL ${env.z >= 0 ? "+" : "−"}${Math.abs(env.z).toFixed(2)}` })] }));
register("DETAIL", twoPoint({
  first: "Specify detail center:",
  second: "Specify detail radius:",
  label: "Detail",
  layer: "annotation",
  build: (a, b, env) => [mkItem(env, "detail", [a, b], { text: `D${env.s.drawn.filter((i) => i.kind === "detail").length + 1}` })],
  ghost: (a, b, env) => prev([shp(circlePts(a, dist2(a, b)), { closed: true })], [lenLabel(env, a, b)]),
}));
register("GRIDLINE", twoPoint({
  first: "Specify grid line start:",
  second: "Specify grid line end:",
  label: "Grid line",
  layer: "annotation",
  build: (a, b, env) => {
    const horizontal = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
    const same = env.s.drawn.filter((i) => i.kind === "gridline" && (Math.abs(i.pts[1][0] - i.pts[0][0]) >= Math.abs(i.pts[1][1] - i.pts[0][1])) === horizontal).length;
    return [mkItem(env, "gridline", [a, b], { text: horizontal ? letter(same) : String(same + 1) })];
  },
}));

/* ══ VIEWS: elevations and sections on their own sheets ═══════════════════ */
const SIDE_NAME = { N: "North", S: "South", E: "East", W: "West" } as const;
type Side = keyof typeof SIDE_NAME;

/** The next `count` free sheet ids with a prefix ("EL-1", "EL-2" …). */
function nextSheetIds(env: ToolEnv, prefix: string, count: number): string[] {
  const out: string[] = [];
  for (let n = 1; out.length < count; n++) if (!env.s.sheets.some((x) => x.id === `${prefix}-${n}`)) out.push(`${prefix}-${n}`);
  return out;
}

/** Make the elevation sheet(s) chosen in the tool bar and open the last one. */
function makeElevations(env: ToolEnv): void {
  const side = env.opt("dir", "N");
  const dirs: Side[] = side === "all" ? ["N", "S", "E", "W"] : [side as Side];
  const ids = nextSheetIds(env, "EL", dirs.length);
  const sheets: Sheet[] = dirs.map((dir, i) => ({ id: ids[i], name: `${ids[i]} ${SIDE_NAME[dir]} Elevation`, kind: "elevation", view: { dir, title: `${SIDE_NAME[dir].toUpperCase()} ELEVATION` }, user: true }));
  env.commit(dirs.length > 1 ? "Elevations" : `${SIDE_NAME[dirs[0]]} elevation`, { addSheets: sheets, openSheet: ids[ids.length - 1] });
  env.say("ok", `✓ ${sheets.map((s) => s.name).join(", ")} ${sheets.length > 1 ? "are" : "is"} on ${sheets.length > 1 ? "their own sheets" : "its own sheet"}. The Model tab brings you back.`);
  env.done();
}

/* ── elevations at any angle (two points), around a circle, or along a drawn line ── */
type ElevMode = "line" | "circle" | "pick" | "side";
const elevMode = (env: ToolEnv): ElevMode => env.opt("mode", "line") as ElevMode;
const marksSoFar = (env: ToolEnv) => env.s.drawn.filter((i) => i.kind === "elevline" || i.kind === "elevarc").length;

/** The angle typed in the tool bar (degrees, counter-clockwise from east); NaN when the box is empty (any angle). */
const typedAngle = (env: ToolEnv): number => {
  const t = env.opt("angle", "").trim();
  return t ? Number(t.replace("°", "")) : NaN;
};

/** The second point of a line elevation, held to the tool bar's angle and length when they are set. */
function elevEnd(env: ToolEnv, a: V2, cur: V2, data: ToolSession["data"]): V2 {
  const ang = typeof data.angle === "number" ? data.angle : typedAngle(env);
  const L = env.optAuto("len", 0);
  const free = sub2(cur, a);
  if (Number.isFinite(ang)) {
    const u: V2 = [Math.cos((ang * Math.PI) / 180), Math.sin((ang * Math.PI) / 180)];
    const along = L > 0 ? L : dot2(free, u);
    return add2(a, mul2(u, along));
  }
  if (L > 0) return add2(a, mul2(unit2(free[0] || free[1] ? free : [1, 0]), L));
  return cur;
}

/** Commit a line elevation: its mark on the plan and its sheet, opened. */
function makeLineElevation(env: ToolEnv, line: ElevLine): void {
  if (dist2(line.a, line.b) < 1) return env.toast("Make the elevation line at least 1 ft long.", "warn");
  const n = marksSoFar(env) + 1;
  const [id] = nextSheetIds(env, "EL", 1);
  const lv = lineView(line);
  const side = compassName(lv.bearing);
  const { angle, length } = lineAngleLength(line.a, line.b);
  const mark = mkItem(env, "elevline", [line.a, line.b], { look: line.look, text: String(n), sheet: id }, { ...elevPlace(env), name: `Elevation ${n}` });
  const dir = (["N", "E", "S", "W"] as Side[])[Math.round(lv.bearing / 90) % 4];
  const sheet: Sheet = { id, name: `${id} Elevation ${n}`, kind: "elevation", view: { dir, title: `ELEVATION ${n} · FROM THE ${side.toUpperCase()}`, mark: mark.id }, user: true };
  if (put(env, `Elevation ${n}`, [mark], { addSheets: [sheet], openSheet: id })) env.say("info", `${sheet.name}: ${env.fmt(length)} at ${angle.toFixed(1)}°, looking from the ${side.toLowerCase()}. Drag its ends on the plan, or type an angle and length on the sheet, to adjust it.`);
  env.done();
}

/** Commit a circular elevation: its mark (centre and radius) and its sheet. */
function makeCircleElevation(env: ToolEnv, c: V2, r: number, start: number): void {
  if (r < 2) return env.toast("Make the radius at least 2 ft.", "warn");
  const n = marksSoFar(env) + 1;
  const [id] = nextSheetIds(env, "EL", 1);
  const sweep = Math.max(10, Math.min(360, env.opt("sweep", 360)));
  const t = (start * Math.PI) / 180;
  const mark = mkItem(env, "elevarc", [c, [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]], { sweep, text: String(n), sheet: id }, { ...elevPlace(env), name: `Circular Elevation ${n}` });
  const sheet: Sheet = { id, name: `${id} Circular Elevation ${n}`, kind: "elevation", view: { dir: "S", title: `CIRCULAR ELEVATION ${n} · R ${env.fmt(r)} · ${sweep}° UNROLLED`, mark: mark.id }, user: true };
  if (put(env, `Circular elevation ${n}`, [mark], { addSheets: [sheet], openSheet: id })) env.say("info", `${sheet.name}: everything seen from a circle of radius ${env.fmt(r)} looking in, unrolled into one strip. Drag the centre or the radius point on the plan, or type a radius on the sheet.`);
  env.done();
}

/** Elevation marks lie on the ground of the Site level, so they show on every plan. */
const elevPlace = (env: ToolEnv): Partial<DrawnItem> => ({ level: "site", z: env.scene.grade });
/** The middle of the building: where a view looks when Enter is pressed instead of a click. */
const buildingCentre = (env: ToolEnv): V2 => {
  const f = env.scene.footprint;
  return [(f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2];
};

/** The segment of a drawn line, polyline, wall or rectangle nearest a point, or a built-in wall's centre line. */
function pickedLine(env: ToolEnv, hit: string | null, near: V2): [V2, V2] | null {
  const it = env.item(hit);
  if (it && it.pts.length >= 2 && !isDraftKindLike(it.kind)) {
    let best: { d: number; a: V2; b: V2 } | null = null;
    const n = it.pts.length;
    const closed = !!it.closed || it.kind === "rect";
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = it.pts[i];
      const b = it.pts[(i + 1) % n];
      const cp = closestOnSeg(near, a, b);
      if (!best || cp.d < best.d) best = { d: cp.d, a, b };
    }
    return best ? [best.a, best.b] : null;
  }
  const f = hit ? frameOfElement(env.scene, hit) : null;
  return f ? [f.A, add2(f.A, mul2(f.dir, f.len))] : null;
}
const isDraftKindLike = (k: ItemKind) => k === "text" || k === "note" || k === "pin" || k === "label" || k === "tag" || k === "image";

register(["VIEWELEV", "ELEVATION"], {
  options: (env) => {
    const mode = elevMode(env);
    const base: OptDef[] = [{ key: "mode", label: "Type", type: "select", def: "line", options: [{ value: "line", label: "Two points (any angle)" }, { value: "circle", label: "Circular (centre + radius)" }, { value: "pick", label: "Along a drawn line or wall" }, { value: "side", label: "A side: N, S, E, W" }] }];
    if (mode === "line") return [...base, { key: "angle", label: "Angle °", type: "text", def: "" }, { key: "len", label: "Length", type: "number", def: 0, unit: "ft", auto: true, min: 0 }];
    if (mode === "circle") return [...base, { key: "radius", label: "Radius", type: "number", def: 0, unit: "ft", auto: true, min: 0 }, { key: "sweep", label: "Sweep", type: "number", def: 360, unit: "°", min: 10, max: 360 }];
    if (mode === "side") return [...base, { key: "dir", label: "Side", type: "select", def: "N", options: [{ value: "N", label: "North" }, { value: "S", label: "South" }, { value: "E", label: "East" }, { value: "W", label: "West" }, { value: "all", label: "All four" }] }];
    return base;
  },
  prompt: (s, env) => {
    const mode = elevMode(env);
    if (mode === "side") return "Choose the side in the tool bar, then Create elevation (or click in the drawing):";
    if (mode === "circle") return s.pts.length ? "Specify the radius (click, or type a number):" : "Specify the centre of the circle (Enter = the middle of the building):";
    if (s.step === "side") return "Click on the side to look at (Enter = towards the building):";
    if (mode === "pick") return "Click a drawn line, polyline or wall to place the elevation along it:";
    if (s.pts.length) return `Specify the second point${typeof s.data.angle === "number" ? ` (held at ${s.data.angle}°)` : ""}, or type @length<angle:`;
    return "Specify the first point of the elevation line (any angle; <angle locks the direction):";
  },
  click: (s, c, env) => {
    const mode = elevMode(env);
    if (mode === "side") return makeElevations(env);
    if (s.step === "side" && s.pts.length === 2) return makeLineElevation(env, { a: s.pts[0], b: s.pts[1], look: sideOf(s.pts[0], s.pts[1], c.pt) });
    if (mode === "circle") {
      if (!s.pts.length) {
        const r = env.optAuto("radius", 0);
        if (r > 0) return makeCircleElevation(env, c.pt, r, 270);
        return env.next("radius", { pts: [c.pt] });
      }
      const r = dist2(s.pts[0], c.pt);
      return makeCircleElevation(env, s.pts[0], r, angleDeg(sub2(c.pt, s.pts[0])));
    }
    if (mode === "pick") {
      const seg = pickedLine(env, c.hit, c.pt);
      if (!seg) return env.toast("Click a drawn line, polyline, rectangle or a wall.", "warn");
      return env.next("side", { pts: seg });
    }
    if (!s.pts.length) {
      const L = env.optAuto("len", 0);
      const ang = typedAngle(env);
      if (L > 0 && Number.isFinite(ang)) return env.next("side", { pts: [c.pt, lineFrom(c.pt, ang, L)] });
      return env.set({ pts: [c.pt] });
    }
    const b = elevEnd(env, s.pts[0], c.pt, s.data);
    if (dist2(s.pts[0], b) < 1) return env.toast("Make the elevation line at least 1 ft long.", "warn");
    env.next("side", { pts: [s.pts[0], b] });
  },
  enter: (s, env) => {
    const mode = elevMode(env);
    if (mode === "side") return makeElevations(env);
    if (s.step === "side" && s.pts.length === 2) return makeLineElevation(env, { a: s.pts[0], b: s.pts[1], look: sideOf(s.pts[0], s.pts[1], buildingCentre(env)) });
    if (mode === "circle" && !s.pts.length) {
      const r = env.optAuto("radius", 0);
      if (r > 0) return makeCircleElevation(env, buildingCentre(env), r, 270);
      return env.next("radius", { pts: [buildingCentre(env)] });
    }
    if (s.pts.length) return env.again();
    env.done();
  },
  text: (s, t, env) => {
    const lock = /^<\s*(-?\d+(?:\.\d+)?)\s*°?$/.exec(t);
    if (lock && elevMode(env) === "line") {
      env.set({ data: { ...s.data, angle: Number(lock[1]) } });
      env.say("info", `Direction held at ${Number(lock[1])}°`);
      return true;
    }
    const r = elevMode(env) === "circle" && s.pts.length === 1 ? parseLen(t, env.sys) : null;
    if (r && r > 0) {
      makeCircleElevation(env, s.pts[0], r, 270);
      return true;
    }
    return false;
  },
  apply: (s, env) => {
    if (elevMode(env) === "side") return makeElevations(env);
    if (s.step === "side" && s.pts.length === 2) return makeLineElevation(env, { a: s.pts[0], b: s.pts[1], look: sideOf(s.pts[0], s.pts[1], buildingCentre(env)) });
    env.toast("Click two points in the drawing (or switch the Type to a side).", "info");
  },
  applyLabel: "Create elevation",
  preview: (s, cur, env) => {
    const mode = elevMode(env);
    if (mode === "circle") {
      if (!s.pts.length) {
        const r = env.optAuto("radius", 0);
        return r > 0 ? prev([shp(circlePts(cur, r, 48), { closed: true, dashed: true })], [{ at: cur, text: `R ${env.fmt(r)}` }]) : null;
      }
      const r = dist2(s.pts[0], cur);
      return prev([shp(circlePts(s.pts[0], r, 48), { closed: true, dashed: true }), shp([s.pts[0], cur])], [{ at: mid2(s.pts[0], cur), text: `R ${env.fmt(r)}` }]);
    }
    if (s.step === "side" && s.pts.length === 2) {
      const [a, b] = s.pts;
      const look = sideOf(a, b, cur);
      const v = lineView({ a, b, look }).v;
      const m = mid2(a, b);
      const tip = add2(m, mul2(v, Math.max(3, dist2(a, b) * 0.15)));
      return prev([shp([a, b], { dashed: true }), shp([m, tip])], [{ at: tip, text: "looking this way" }]);
    }
    if (s.pts.length === 1) {
      const b = elevEnd(env, s.pts[0], cur, s.data);
      const { angle, length } = lineAngleLength(s.pts[0], b);
      return prev([shp([s.pts[0], b], { dashed: true })], [{ at: mid2(s.pts[0], b), text: `${env.fmt(length)} · ${angle.toFixed(1)}°` }]);
    }
    return null;
  },
});

/** The end of a section line: straight east–west or north–south from its start. */
const straight = (a: V2, b: V2): V2 => (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? [b[0], a[1]] : [a[0], b[1]]);

register("VIEWSECTION", {
  prompt: (s) => (s.pts.length === 0 ? "Specify the start of the section line:" : s.pts.length === 1 ? "Specify the end of the section line (it runs east–west or north–south):" : "Click on the side to look at:"),
  click: (s, c, env) => {
    if (s.pts.length === 0) return env.set({ pts: [c.pt] });
    if (s.pts.length === 1) {
      const b = straight(s.pts[0], c.pt);
      if (dist2(s.pts[0], b) < 1) return env.toast("Make the section line at least 1 ft long.", "warn");
      return env.next("side", { pts: [s.pts[0], b] });
    }
    const [a, b] = s.pts;
    const ew = Math.abs(a[1] - b[1]) < 1e-9;
    const at = ew ? a[1] : a[0];
    const keep: 1 | -1 = (ew ? c.pt[1] : c.pt[0]) >= at ? 1 : -1;
    const dir: Side = ew ? (keep > 0 ? "S" : "N") : keep > 0 ? "W" : "E";
    const letter = String.fromCharCode(65 + (env.s.drawn.filter((i) => i.kind === "secmark").length % 26));
    const [id] = nextSheetIds(env, "SC", 1);
    const mark = mkItem(env, "secmark", [a, b], { text: letter, lx: ew ? 0 : keep, ly: ew ? keep : 0, sheet: id });
    const sheet: Sheet = { id, name: `${id} Section ${letter}–${letter}`, kind: "section", view: { dir, cut: { axis: ew ? 1 : 0, at, keep }, title: `SECTION ${letter}–${letter}` }, user: true };
    if (put(env, `Section ${letter}–${letter}`, [mark], { addSheets: [sheet], openSheet: id })) env.say("info", `${sheet.name} opened on its own sheet. The Model tab brings you back.`);
    env.done();
  },
  enter: (s, env) => (s.pts.length ? env.again() : env.done()),
  preview: (s, cur) => {
    if (s.pts.length === 1) return prev([shp([s.pts[0], straight(s.pts[0], cur)], { dashed: true })]);
    if (s.pts.length === 2) {
      const [a, b] = s.pts;
      const ew = Math.abs(a[1] - b[1]) < 1e-9;
      const m = mid2(a, b);
      const sign = (ew ? cur[1] - a[1] : cur[0] - a[0]) >= 0 ? 1 : -1;
      const tip: V2 = ew ? [m[0], m[1] + 3 * sign] : [m[0] + 3 * sign, m[1]];
      return prev([shp([a, b], { dashed: true }), shp([m, tip])], [{ at: tip, text: "looking this way" }]);
    }
    return null;
  },
});

/* ══ SITE OBJECTS: sheds, trees, bushes, flower beds, septic systems ═════ */
/** Where site objects stand: on the ground (finished grade), on the Site level, so they show on every plan. */
const onSite = (env: ToolEnv): Partial<DrawnItem> => ({ level: "site", z: env.scene.grade });

register("SHED", place({
  prompt: "Click where the shed goes, or type its centre (x,y). Width, depth, height, roof and rotation are in the tool bar:",
  label: "Shed",
  begin: (env) => showLayer(env, "site"),
  build: (pt, _c, env) => {
    const n = env.s.drawn.filter((i) => i.kind === "shed").length + 1;
    const w = env.opt("w", 8);
    const d = env.opt("d", 10);
    env.say("info", `Shed ${n}: ${env.fmt(w)} × ${env.fmt(d)} (${fmtArea(w * d, env.sys)}), centre ${env.fmt(pt[0])}, ${env.fmt(pt[1])}`);
    return [mkItem(env, "shed", [pt], { w, d, h: env.opt("h", 7.5), rot: Number(env.opt("rot", "0")), roof: env.opt("roof", "gable") }, { ...onSite(env), name: `Shed ${n}` })];
  },
  ghost: (pt, env) => {
    const w = env.opt("w", 8);
    const d = env.opt("d", 10);
    const g = boxGhost(w, d, Number(env.opt("rot", "0")))(pt);
    return { ...g, labels: [{ at: pt, text: `${env.fmt(w)} × ${env.fmt(d)}` }] };
  },
}));

const SPECIES: Record<string, string> = { shade: "Shade Tree", palm: "Palm", pine: "Pine", shrub: "Bush" };
/** TREE and BUSH: one click (or a typed x,y) per plant; size from the tool bar. */
function plantTool(bush: boolean): ToolDef {
  return place({
    prompt: bush ? "Click where the bush goes (or type x,y). Height and spread are in the tool bar:" : "Click where the tree goes (or type x,y). Kind, height and canopy are in the tool bar:",
    label: bush ? "Bush" : "Tree",
    begin: (env) => showLayer(env, "site"),
    build: (pt, _c, env) => {
      const species = bush ? "shrub" : env.opt("species", "shade");
      const n = env.s.drawn.filter((i) => i.kind === "tree" && (i.p.species === "shrub") === bush).length + 1;
      const bloom = bush ? env.opt("bloom", "") : "";
      return [mkItem(env, "tree", [pt], { species, h: env.opt("h", bush ? 3.5 : 22), r: env.opt("r", bush ? 2.5 : 8), ...(bloom ? { bloom } : {}) }, { ...onSite(env), name: `${bloom ? "Flowering " : ""}${SPECIES[species] ?? "Tree"} ${n}` })];
    },
    ghost: (pt, env) => prev([shp(circlePts(pt, env.opt("r", bush ? 2.5 : 8), 28), { closed: true, fill: true })]),
  });
}
register("TREE", plantTool(false));
register("BUSH", plantTool(true));

register("FLOWERS", boundary({ kind: "flowers", label: "Flower bed", prompt: "Outline the flower bed", params: (env) => ({ p: { h: env.opt("h", 0.7), mix: env.opt("mix", "mixed") } }), level: "site", z: (env) => env.scene.grade, layer: "landscape" }));

register("SEPTIC", place({
  prompt: "Click where the septic tank goes (or type x,y). Size, drain-field trenches and their distance are in the tool bar:",
  label: "Septic system",
  begin: (env) => showLayer(env, "utilities"),
  build: (pt, _c, env) => {
    const n = env.s.drawn.filter((i) => i.kind === "septic").length + 1;
    const gal = Number(env.opt("gal", "1000"));
    const rows = env.opt("rows", 3);
    const fp = env.scene.footprint;
    // the tank must stay 5 ft from the building
    const gap = Math.max(fp.x0 - pt[0], pt[0] - fp.x1, fp.y0 - pt[1], pt[1] - fp.y1);
    if (gap < 8) env.toast(`The tank is ${env.fmt(Math.max(0, gap))} from the building: most codes ask for at least 5 ft from the tank's side (about 8 ft to its centre).`, "warn");
    env.say("info", `Septic system ${n}: ${gal.toLocaleString("en-US")} gal tank${rows ? `, ${rows} drain-field trenches × ${env.fmt(env.opt("len", 36))}` : ""}. Below ground: see it dashed on the plans, or View → Below Grade.`);
    return [mkItem(env, "septic", [pt], { gal, rows, len: env.opt("len", 36), dist: env.opt("dist", 10), rot: Number(env.opt("rot", "0")) }, { ...onSite(env), name: `Septic System ${n} (${gal.toLocaleString("en-US")} gal)` })];
  },
  ghost: (pt, env) => {
    const gal = Number(env.opt("gal", "1000"));
    const rot = Number(env.opt("rot", "0"));
    const tl = gal >= 1500 ? 10.5 : gal >= 1250 ? 9.8 : 9;
    const shapes = [shp(boxPoly(pt, tl, 5.5, rot), { closed: true, fill: true })];
    const rows = env.opt("rows", 3);
    const r = (rot * Math.PI) / 180;
    const u: V2 = [Math.cos(r), Math.sin(r)];
    const v = perp2(u);
    const at = (x: number, y: number): V2 => add2(pt, add2(mul2(u, x), mul2(v, y)));
    const len = env.opt("len", 36);
    for (let i = 0; i < rows; i++) {
      const y = 2.75 + env.opt("dist", 10) + 3 + i * 6;
      shapes.push(shp(orientedRect(at(-len / 2, y), at(len / 2, y), 2), { closed: true, dashed: true }));
    }
    return prev(shapes, [{ at: pt, text: `${gal.toLocaleString("en-US")} gal` }]);
  },
}));

/* ══ MEASURE ══════════════════════════════════════════════════════════════ */
const done = (env: ToolEnv, title: string, text: string, pts: V2[], closed = false) => {
  env.measure({ title, text, pts, closed });
  env.say("ok", `✓ ${title}: ${text}`);
  env.toast(`${title}: ${text}`, "info");
};

register("DIST", {
  prompt: (s) => (s.pts.length ? "Specify second point:" : "Specify first point:"),
  click: (s, c, env) => {
    if (!s.pts.length) {
      env.measure(null);
      return env.next("second", { pts: [c.pt] });
    }
    const [a, b] = [s.pts[0], c.pt];
    done(env, "Distance", `${env.fmt(dist2(a, b))}  (Δx ${env.fmt(b[0] - a[0])}, Δy ${env.fmt(b[1] - a[1])}, ${angleDeg(sub2(b, a)).toFixed(1)}°)`, [a, b]);
    env.again();
  },
  enter: (s, env) => (s.pts.length ? env.again() : env.done()),
  preview: (s, cur, env) => (s.pts.length ? prev([shp([s.pts[0], cur], { tone: "measure" })], [lenLabel(env, s.pts[0], cur)]) : null),
});

register("AREA", {
  prompt: (s) => (s.pts.length ? "Specify next corner [Enter = calculate, U = undo]:" : "Specify first corner point (or click inside a closed shape):"),
  click: (s, c, env) => {
    if (!s.pts.length && c.hit) {
      const it = env.item(c.hit);
      const poly = it && it.pts.length >= 3 && (it.closed || it.kind === "rect") ? it.pts : null;
      if (poly) {
        done(env, "Area", `${fmtArea(Math.abs(polyArea(poly)), env.sys)}  (perimeter ${env.fmt(polyLength(poly, true))})`, poly, true);
        return;
      }
    }
    const l = s.pts[s.pts.length - 1];
    if (l && dist2(l, c.pt) < 0.01) return;
    env.set({ pts: [...s.pts, c.pt] });
  },
  enter: (s, env) => {
    if (s.pts.length >= 3) {
      done(env, "Area", `${fmtArea(Math.abs(polyArea(s.pts)), env.sys)}  (perimeter ${env.fmt(polyLength(s.pts, true))})`, s.pts, true);
      env.again();
    } else if (!s.pts.length) env.done();
    else env.say("warn", "⚠ Area needs at least three points.");
  },
  preview: (s, cur) => (s.pts.length ? prev([shp([...s.pts, cur], { closed: true, fill: true, tone: "measure" })]) : null),
});

register("VOLUME", {
  prompt: () => "Select object:",
  click: (_s, c, env) => {
    const el = c.hit ? env.scene.elementById[c.hit] : undefined;
    if (!el) return env.toast("Click a model element to measure its volume.", "warn");
    const d = elementDetails(env.scene, el);
    const vol = d.geometry.find(([k]) => k === "Volume")?.[1] ?? "—";
    const cy = parseFloat(vol);
    const text = el.keys.length ? (env.sys === "imperial" ? `${el.name}: ${vol}` : `${el.name}: ${fmtVol(cy * 27, env.sys)}`) : `${el.name} has no solid volume`;
    done(env, "Volume", text, [[el.min[0], el.min[1]], [el.max[0], el.min[1]], [el.max[0], el.max[1]], [el.min[0], el.max[1]]], true);
  },
  enter: (_s, env) => env.done(),
});

/** Direction of the segment of an item nearest to a point. */
function segDir(it: DrawnItem, near: V2): V2 | null {
  let best: { d: number; dir: V2 } | null = null;
  for (let i = 0; i + 1 < it.pts.length; i++) {
    const cp = closestOnSeg(near, it.pts[i], it.pts[i + 1]);
    if (!best || cp.d < best.d) best = { d: cp.d, dir: unit2(sub2(it.pts[i + 1], it.pts[i])) };
  }
  return best?.dir ?? null;
}

register("ANGLE", {
  prompt: (s) => (s.picks.length ? "Select second line:" : s.pts.length === 0 ? "Select first line, or specify the angle vertex:" : s.pts.length === 1 ? "Specify first arm end point:" : "Specify second arm end point:"),
  click: (s, c, env) => {
    const it = env.item(c.hit);
    const linear = it && it.pts.length >= 2 && ["line", "polyline", "wall", "beam", "rect", "duct", "pipe", "tray", "brace"].includes(it.kind);
    if (s.picks.length) {
      const first = env.item(s.picks[0]);
      if (!first || !linear || !it) return env.toast("Click a second line.", "warn");
      const d1 = segDir(first, c.pt) ?? [1, 0];
      const d2 = segDir(it, c.pt) ?? [1, 0];
      const raw = angleBetween(d1, d2) % 180;
      done(env, "Angle", `${raw.toFixed(2)}° (supplement ${(180 - raw).toFixed(2)}°)`, [first.pts[0], first.pts[first.pts.length - 1]]);
      return env.again();
    }
    if (s.pts.length === 0 && linear && it) return env.next("second", { picks: [it.id] });
    if (s.pts.length < 2) return env.set({ pts: [...s.pts, c.pt] });
    const [v, a] = s.pts;
    const ang = angleBetween(sub2(a, v), sub2(c.pt, v));
    done(env, "Angle", `${Math.min(ang, 360 - ang).toFixed(2)}°`, [a, v, c.pt]);
    env.again();
  },
  enter: (_s, env) => env.again(),
  preview: (s, cur) => (s.pts.length ? prev([shp([...(s.pts.length === 2 ? [s.pts[1], s.pts[0]] : [s.pts[0]]), cur], { tone: "measure" })]) : null),
});

register("ELEV", {
  prompt: () => "Pick a point:",
  click: (_s, c, env) => {
    const el = c.hit ? env.scene.elementById[c.hit] : undefined;
    const lv = `${levelLabel(env.level)} at ${env.z >= 0 ? "+" : "−"}${env.fmt(Math.abs(env.z))}`;
    const extra = el ? `; ${el.name}: bottom ${env.fmt(el.min[2])}, top ${env.fmt(el.max[2])}` : "";
    done(env, "Elevation", `${lv}${extra}`, [c.pt]);
  },
  enter: (_s, env) => env.done(),
});

register("ID", {
  prompt: () => "Specify point:",
  click: (_s, c, env) => done(env, "Coordinate", `X = ${env.fmt(c.pt[0])}, Y = ${env.fmt(c.pt[1])}, Z = ${env.fmt(env.z)}`, [c.pt]),
  enter: (_s, env) => env.done(),
});

register("CLEAR", {
  prompt: (s) => (s.picks.length ? "Select second object:" : "Select first object:"),
  click: (s, c, env) => {
    const el = c.hit ? env.scene.elementById[c.hit] : undefined;
    if (!el) return env.toast("Click a model element.", "warn");
    if (!s.picks.length) return env.next("second", { picks: [el.id] });
    const a = env.scene.elementById[s.picks[0]];
    if (!a || a.id === el.id) return env.toast("Pick a different object.", "warn");
    const gap = (k: 0 | 1 | 2) => Math.max(0, a.min[k] - el.max[k], el.min[k] - a.max[k]);
    const gx = gap(0);
    const gy = gap(1);
    const gz = gap(2);
    const hz = Math.hypot(gx, gy);
    const near = (k: 0 | 1): number => (a.max[k] < el.min[k] ? (a.max[k] + el.min[k]) / 2 : el.max[k] < a.min[k] ? (el.max[k] + a.min[k]) / 2 : (Math.max(a.min[k], el.min[k]) + Math.min(a.max[k], el.max[k])) / 2);
    const mid: V2 = [near(0), near(1)];
    const ca: V2 = [(a.min[0] + a.max[0]) / 2, (a.min[1] + a.max[1]) / 2];
    const cb: V2 = [(el.min[0] + el.max[0]) / 2, (el.min[1] + el.max[1]) / 2];
    const clear = Math.hypot(hz, gz);
    done(env, "Clearance", `${env.fmt(clear)} between ${a.name} and ${el.name} (horizontal ${env.fmt(hz)}, vertical ${env.fmt(gz)})${clear === 0 ? " — they touch or overlap" : ""}`, [ca, mid, cb]);
    env.again();
  },
  enter: (_s, env) => env.done(),
});

/* the helpers the site and MEP tools (tools-site.ts, tools-mep.ts) share */
export { boundary, boxGhost, onSite, pathTool, place, prev, shp, showLayer };
