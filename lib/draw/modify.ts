/**
 * lib/draw/modify.ts
 *
 * WHAT   The editing commands and the transform they share. planTransform(state, scene, ids, T, copy) turns a
 *        move / rotate / scale / mirror into one Change: drawn items get new points and sizes, built-in elements
 *        get an XForm (or, when copied, become a "clone" item), doors and windows slide along their wall, walls
 *        take their openings with them, and items attached to a moved host follow it. The tools: MOVE COPY
 *        ROTATE SCALE MIRROR OFFSET TRIM EXTEND FILLET CHAMFER ARRAY SPLIT JOIN ALIGN, and CHTYPE CHMAT CHDIM
 *        "ATTACH HOST" DETACH. Direct manipulation: planMove (a mouse drag of the selection: points of drawn items
 *        that sit on a moved point follow it, a wall keeps its openings where they were, built-in elements
 *        inside a moved built-in wall move with it and those touching it stretch, a built-in door or window
 *        slides along its wall) and planGrip (one point of a drawn item, and what is joined there). The sizes CHDIM
 *        edits are also typed in Properties → Size: sizeFields / sizeOf / withSize (a turn kept to 0–359°, a solar
 *        array's name kept true to its output).
 * FOR    The Home → Modify and Properties ribbon panels (via lib/commands.ts); also reused by Copy / Paste /
 *        Duplicate. Selection-first tools start from the current selection, or ask you to click objects and press
 *        Enter.
 * DEBUG  - "can't be rotated": a built-in element with gable or roof pieces (extruded along Y) can only be moved,
 *          scaled, mirrored along an axis, or turned 180° (see canTransform in compose.ts).
 *        - TRIM / EXTEND / FILLET work on single lines, walls, beams, ducts, pipes and trays; a polyline or
 *          rectangle is exploded into lines first (the log says so).
 *        - An opening vanished after a split: openings that straddle the cut are removed with a message.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { isLinkedId, linkOf, type ProjectLink } from "../links";
import { levelLabel } from "../scene";
import type { Category, Scene, V2 } from "../scene/types";
import type { WsState } from "../store/workspace-store";
import { uid } from "../utils";
import type { CommandCtx } from "../commands";
import { applyChange, type Change } from "./change";
import { appendStage, canTransform, frameOfElement, num, str } from "./compose";
import {
  add2, affApply, affDet, affMirror, affMul, affRotate, affScale, affScaleOf, affTranslate, angleDeg, arcFrom3, arcPts, circlePts, closestOnSeg, dist2, dot2, IDENT, lerp2, lineIntersect,
  mul2, polyArea, segIntersect, splinePts, sub2, unit2, type Aff,
} from "./geom";
import { MATERIALS, TYPE_DEFS, type OptDef } from "./options";
import { mkItem, register, setToolOpt, type ToolDef, type ToolEnv } from "./session";
import { sceneOf as sceneOfState } from "./scene-of";
import { FENCE_HEIGHT, type FenceType } from "./site";
import type { DrawnItem, ItemKind, Params, Preview, XForm } from "./types";

/* ── transforms ───────────────────────────────────────────────────────── */
/** A plan transform plus the matching change of height (scale about zc, then move by dz). */
export interface Tx {
  aff: Aff;
  dz?: number;
  sz?: number;
  zc?: number;
}

const SCALE_KEYS: Partial<Record<ItemKind, string[]>> = {
  wall: ["thick", "height"], slab: ["thick"], roof: ["thick"], foundation: ["thick"], stair: ["width", "rise"], ramp: ["width", "rise"],
  column: ["size", "height"], beam: ["width", "depth"], furniture: ["w", "d", "h"], fixture: ["w", "d", "h"], equipment: ["w", "d", "h"],
  dim: ["off"], image: ["w", "h"], connection: ["size"], shed: ["w", "d", "h"], tree: ["h", "r"],
  pool: ["l", "w"], rock: ["size"], fence: ["h"], road: ["width"], sidewalk: ["width"], signal: ["arm"], drain: ["len"],
};
const ROT_KINDS = new Set<ItemKind>(["furniture", "fixture", "equipment", "column", "shed", "septic", "pool", "sign", "signal", "drain", "solar"]);
const LINEAR2: ItemKind[] = ["line", "wall", "beam", "duct", "pipe", "tray", "brace"];
const isOpening = (it: DrawnItem) => it.kind === "door" || it.kind === "window";

/** Compose two height maps: first `a`, then `b` (z' = sz·z + dz form with zc = 0). */
function composeZ(a: { sz: number; zc: number; dz: number }, b: { sz: number; zc: number; dz: number }): { sz: number; zc: number; dz: number } {
  const c = b.zc - b.sz * b.zc + b.sz * (a.zc - a.sz * a.zc + a.dz) + b.dz;
  return { sz: a.sz * b.sz, zc: 0, dz: c };
}

/** A drawn item with the transform applied (same id). */
export function transformItem(it: DrawnItem, t: Tx): DrawnItem {
  const k = affScaleOf(t.aff);
  const sz = t.sz ?? 1;
  const zc = t.zc ?? 0;
  const p: Params = { ...it.p };
  for (const key of SCALE_KEYS[it.kind] ?? []) if (typeof p[key] === "number") p[key] = (p[key] as number) * (key === "height" || key === "rise" || key === "h" ? sz : k);
  if (ROT_KINDS.has(it.kind)) {
    const theta = angleDeg([t.aff[0], t.aff[1]]);
    const rot = num(it, "rot", 0);
    p.rot = affDet(t.aff) < 0 ? theta - rot : rot + theta;
  }
  if (it.kind === "tag" && typeof p.tx === "number") {
    const q = affApply(t.aff, [p.tx as number, p.ty as number]);
    p.tx = q[0];
    p.ty = q[1];
  }
  const out: DrawnItem = { ...it, pts: it.pts.map((q) => affApply(t.aff, q)), p, z: zc + (it.z - zc) * sz + (t.dz ?? 0) };
  if (it.kind === "clone" && it.aff) {
    const z = composeZ({ sz: num(it, "sz", 1), zc: num(it, "zc", 0), dz: it.dz ?? 0 }, { sz, zc, dz: t.dz ?? 0 });
    out.aff = affMul(t.aff, it.aff);
    out.dz = z.dz;
    out.p = { ...p, sz: z.sz, zc: 0 };
  }
  return out;
}

/** Merge two changes into one (later wins on the same id). */
export function mergeChange(a: Change, b: Change): Change {
  return {
    add: [...(a.add ?? []), ...(b.add ?? [])],
    replace: [...(a.replace ?? []), ...(b.replace ?? [])],
    remove: [...(a.remove ?? []), ...(b.remove ?? [])],
    xf: { ...(a.xf ?? {}), ...(b.xf ?? {}) },
    hide: [...(a.hide ?? []), ...(b.hide ?? [])],
    set: { ...(a.set ?? {}), ...(b.set ?? {}) },
  };
}

/** A copy of an item with a fresh id (and a fresh id for each hosted opening). */
function cloneItem(it: DrawnItem, extra: Partial<DrawnItem> = {}): DrawnItem {
  return { ...it, id: uid("U"), p: { ...it.p }, pts: it.pts.map((q) => [...q] as V2), ...extra };
}

/** What moving / copying these ids by a transform does. `moved` lists the ids that were really changed. */
export function planTransform(s: WsState, scene: Scene, ids: string[], t: Tx, copy: boolean): { change: Change; newIds: string[]; skipped: string[] } {
  const change: Change = { add: [], replace: [], xf: {} };
  const newIds: string[] = [];
  const skipped: string[] = [];
  const idSet = new Set(ids);
  const z = { sz: t.sz ?? 1, zc: t.zc ?? 0, dz: t.dz ?? 0 };
  // items attached to a moved host follow it
  const all = new Set(ids);
  for (const it of s.drawn) if (typeof it.p.attach === "string" && idSet.has(it.p.attach)) all.add(it.id);
  for (const id of all) {
    const it = scene.items?.[id];
    if (it) {
      if (typeof it.p.host === "string" && all.has(it.p.host) && !isOpening(it)) continue; // framing and trusses follow their host
      if (isOpening(it)) {
        if (typeof it.p.host === "string" && all.has(it.p.host)) continue; // the wall carries it along
        const f = frameOfElement(scene, str(it, "host", ""));
        const pureMove = Math.abs(t.aff[0] - 1) < 1e-9 && Math.abs(t.aff[1]) < 1e-9 && Math.abs(t.aff[2]) < 1e-9 && Math.abs(t.aff[3] - 1) < 1e-9;
        if (!f || !pureMove) {
          skipped.push(id);
          continue;
        }
        const c = affApply(t.aff, it.pts[0]);
        const w = num(it, "w", 3);
        const at = Math.max(0.25, Math.min(f.len - w - 0.25, dot2(sub2(c, f.A), f.dir) - w / 2));
        const moved: DrawnItem = { ...it, pts: [add2(f.A, mul2(f.dir, at + w / 2))], p: { ...it.p, at } };
        if (copy) {
          const n = cloneItem(moved, { name: `${it.name} copy` });
          change.add!.push(n);
          newIds.push(n.id);
        } else change.replace!.push(moved);
        continue;
      }
      const moved = transformItem(it, t);
      if (copy) {
        const n = cloneItem(moved, { name: `${it.name} copy` });
        change.add!.push(n);
        newIds.push(n.id);
        // a copied wall takes its doors and windows along
        if (it.kind === "wall")
          for (const o of s.drawn.filter((x) => isOpening(x) && x.p.host === it.id)) change.add!.push(cloneItem(o, { p: { ...o.p, host: n.id }, pts: [affApply(t.aff, o.pts[0])] }));
        // …and so does framing laid out on it
        for (const f of s.drawn.filter((x) => (x.kind === "framing" || x.kind === "truss") && x.p.host === it.id)) change.add!.push(cloneItem(f, { p: { ...f.p, host: n.id } }));
      } else change.replace!.push(moved);
      continue;
    }
    const el = scene.elementById[id];
    if (!el) continue;
    if (!canTransform(scene, id, t.aff)) {
      skipped.push(id);
      continue;
    }
    const cur = s.xf[id] ?? { aff: IDENT, dz: 0 };
    const zz = composeZ({ sz: cur.sz ?? 1, zc: cur.zc ?? 0, dz: cur.dz }, z);
    // an element that was stretched (or slid) keeps those stages; this change is added after them
    const next: XForm = cur.win || cur.then || cur.slide ? appendStage(cur, { aff: t.aff, dz: t.dz ?? 0, sz: t.sz, zc: t.zc }) : { aff: affMul(t.aff, cur.aff), dz: zz.dz, sz: zz.sz, zc: 0 };
    if (copy) {
      const n: DrawnItem = { id: uid("U"), kind: "clone", name: `${el.name} copy`, level: el.level, z: 0, pts: [], p: { sz: zz.sz, zc: 0 }, src: id, aff: next.aff, dz: next.dz };
      change.add!.push(n);
      newIds.push(n.id);
    } else change.xf![id] = next;
  }
  return { change, newIds, skipped };
}

/**
 * The links after a move of some of their elements: a pure move shifts each whole linked project; anything else is
 * refused with a note (a linked project is read-only here). Undefined when no link moves.
 */
function movedLinks(s: WsState, linked: string[], t: Tx, copy: boolean, toast: (text: string, tone?: "warn") => void): ProjectLink[] | undefined {
  if (!linked.length) return undefined;
  const moving = new Set(linked.map(linkOf));
  const pure = !copy && t.aff[0] === 1 && t.aff[1] === 0 && t.aff[2] === 0 && t.aff[3] === 1 && !(t.dz ?? 0);
  if (!pure) {
    toast("A linked project is read-only here: it moves as a whole (Move or drag), and turns in the Links palette. Open it to edit it, or Merge a copy.", "warn");
    return undefined;
  }
  return (s.project.links ?? []).map((l) => (moving.has(l.id) ? { ...l, at: [l.at[0] + t.aff[4], l.at[1] + t.aff[5]] as V2 } : l));
}

/** Apply a plan transform to ids, report what was skipped, and select the copies. */
function runTransform(env: ToolEnv, label: string, all: string[], t: Tx, copy: boolean): string[] {
  // a linked project moves as a whole; its single elements are read-only here
  const links = movedLinks(env.s, all.filter(isLinkedId), t, copy, env.toast);
  // locked elements (and elements on a locked layer) stay where they are
  const layers = env.s.project.layers;
  const own = all.filter((id) => !isLinkedId(id));
  const ids = own.filter((id) => !env.s.locked.includes(id) && !layers.find((l) => l.id === env.scene.elementById[id]?.layer)?.locked);
  if (ids.length < own.length) env.toast(`${own.length - ids.length} locked element(s) were left alone.`, "warn");
  const r = planTransform(env.s, env.scene, ids, t, copy);
  if (r.skipped.length) env.toast(`${r.skipped.length} element(s) can't take that change (gables and roof pieces only move, scale, mirror along an axis, or turn 180°; doors slide only along their wall).`, "warn");
  if (!(r.change.add?.length || r.change.replace?.length || Object.keys(r.change.xf ?? {}).length || links)) return [];
  env.commit(label, links ? { ...r.change, links } : r.change);
  env.say("ok", `✓ ${label}: ${ids.length} object(s)`);
  if (copy && r.newIds.length) env.s.select(r.newIds);
  return r.newIds;
}

/* ── previews ─────────────────────────────────────────────────────────── */
/** Ghost outlines of ids under a transform (their points, or their bounding box). */
function ghosts(env: ToolEnv, ids: string[], t: Tx): Preview["shapes"] {
  const out: Preview["shapes"] = [];
  for (const id of ids.slice(0, 80)) {
    const it = env.item(id);
    if (it && it.pts.length > 1 && !isOpening(it) && it.kind !== "circle") {
      const closed = !!it.closed || it.kind === "rect" || it.pts.length > 2;
      out.push({ pts: it.pts.map((p) => affApply(t.aff, p)), closed: closed && it.kind !== "polyline" ? true : !!it.closed, tone: "ghost" });
      continue;
    }
    const el = env.scene.elementById[id];
    if (!el) continue;
    const box: V2[] = [[el.min[0], el.min[1]], [el.max[0], el.min[1]], [el.max[0], el.max[1]], [el.min[0], el.max[1]]];
    out.push({ pts: box.map((p) => affApply(t.aff, p)), closed: true, tone: "ghost" });
  }
  return out;
}

/** The centre of a set of elements (plan). */
function centreOf(env: ToolEnv, ids: string[]): V2 {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of ids) {
    const e = env.scene.elementById[id];
    if (!e) continue;
    x0 = Math.min(x0, e.min[0]); y0 = Math.min(y0, e.min[1]); x1 = Math.max(x1, e.max[0]); y1 = Math.max(y1, e.max[1]);
  }
  return x0 === Infinity ? [0, 0] : [(x0 + x1) / 2, (y0 + y1) / 2];
}

/* ── selection-first scaffolding ──────────────────────────────────────── */
/** Does an id name something a modify tool can act on? (not terrain) */
const editable = (env: ToolEnv, id: string): boolean => {
  const e = env.scene.elementById[id];
  return !!e && e.layer !== "topography";
};

/** Tool prompts and the "select objects" step shared by every selection-first tool. */
function selecting(env: ToolEnv): void {
  const sel = env.s.selection.filter((id) => editable(env, id));
  if (sel.length) env.set({ step: "base", picks: sel });
  else env.set({ step: "select", picks: [] });
}

/** Click handling of the "select" step: add or remove the clicked element; returns true when it handled the click. */
function selectClick(step: string, picks: string[], hit: string | null, env: ToolEnv): boolean {
  if (step !== "select") return false;
  if (!hit || !editable(env, hit)) {
    env.toast("Click the objects to edit, then press Enter.", "info");
    return true;
  }
  const locked = env.s.locked.includes(hit) || env.s.project.layers.find((l) => l.id === env.scene.elementById[hit]?.layer)?.locked;
  if (locked) {
    env.toast(`${env.scene.elementById[hit]?.name ?? hit} is locked`, "warn");
    return true;
  }
  const next = picks.includes(hit) ? picks.filter((p) => p !== hit) : [...picks, hit];
  env.s.select(next);
  env.set({ picks: env.s.selection.length ? Array.from(new Set([...next, ...env.s.selection])) : next });
  return true;
}

/** Enter at the "select" step: move on once something is selected. */
function selectEnter(next: string, env: ToolEnv): void {
  const picks = env.session.picks;
  if (!picks.length) {
    env.toast("Nothing selected. Click objects first, then press Enter.", "warn");
    return;
  }
  env.next(next);
}

const SELECT_PROMPT = "Select objects (click them, then Enter):";

/* ══ MOVE / COPY ══════════════════════════════════════════════════════════ */
function moveCopy(copy: boolean): ToolDef {
  return {
    begin: selecting,
    prompt: (s) => (s.step === "select" ? SELECT_PROMPT : s.step === "base" ? "Specify base point:" : copy ? "Specify second point [Enter = finish]:" : "Specify second point:"),
    click: (s, c, env) => {
      if (selectClick(s.step, s.picks, c.hit, env)) return;
      if (s.step === "base") return env.next("target", { pts: [c.pt] });
      const d = sub2(c.pt, s.pts[0]);
      if (Math.hypot(d[0], d[1]) < 1e-6) return;
      runTransform(env, copy ? "Copy" : "Move", s.picks, { aff: affTranslate(d[0], d[1]) }, copy);
      if (copy) return;
      env.next("base", { pts: [] });
    },
    enter: (s, env) => (s.step === "select" ? selectEnter("base", env) : copy && s.step === "target" ? env.next("base", { pts: [] }) : env.done()),
    preview: (s, cur, env) => (s.step === "target" ? { shapes: [...ghosts(env, s.picks, { aff: affTranslate(cur[0] - s.pts[0][0], cur[1] - s.pts[0][1]) }), { pts: [s.pts[0], cur], tone: "ghost" }], labels: [{ at: cur, text: env.fmt(dist2(s.pts[0], cur)) }] } : null),
  };
}
register("MOVE", moveCopy(false));
register("COPY", moveCopy(true));

/* ══ ROTATE ═══════════════════════════════════════════════════════════════ */
register("ROTATE", {
  begin: selecting,
  prompt: (s) => (s.step === "select" ? SELECT_PROMPT : s.step === "base" ? "Specify base point:" : "Specify rotation angle (type degrees, or click):"),
  click: (s, c, env) => {
    if (selectClick(s.step, s.picks, c.hit, env)) return;
    if (s.step === "base") return env.next("angle", { pts: [c.pt] });
    const a = angleDeg(sub2(c.pt, s.pts[0]));
    runTransform(env, "Rotate", s.picks, { aff: affRotate((a * Math.PI) / 180, s.pts[0][0], s.pts[0][1]) }, false);
    env.next("base", { pts: [] });
  },
  enter: (s, env) => (s.step === "select" ? selectEnter("base", env) : env.done()),
  text: (s, t, env) => {
    if (s.step !== "angle") return false;
    const a = Number(t.replace("°", ""));
    if (!Number.isFinite(a)) return false;
    runTransform(env, "Rotate", s.picks, { aff: affRotate((a * Math.PI) / 180, s.pts[0][0], s.pts[0][1]) }, false);
    env.next("base", { pts: [] });
    return true;
  },
  preview: (s, cur, env) => (s.step === "angle" ? { shapes: [...ghosts(env, s.picks, { aff: affRotate((angleDeg(sub2(cur, s.pts[0])) * Math.PI) / 180, s.pts[0][0], s.pts[0][1]) }), { pts: [s.pts[0], cur], tone: "ghost" }], labels: [{ at: cur, text: `${angleDeg(sub2(cur, s.pts[0])).toFixed(1)}°` }] } : null),
});

/* ══ SCALE ════════════════════════════════════════════════════════════════ */
const scaleTx = (k: number, base: V2, env: ToolEnv): Tx => ({ aff: affScale(k, base[0], base[1]), sz: k, zc: env.z });
register("SCALE", {
  begin: selecting,
  prompt: (s) => (s.step === "select" ? SELECT_PROMPT : s.step === "base" ? "Specify base point:" : s.step === "factor" ? "Specify scale factor (type a number, or click a reference length):" : "Specify the new length:"),
  click: (s, c, env) => {
    if (selectClick(s.step, s.picks, c.hit, env)) return;
    if (s.step === "base") return env.next("factor", { pts: [c.pt] });
    const base = s.pts[0];
    if (s.step === "factor") {
      if (dist2(base, c.pt) < 0.05) return env.toast("Click further from the base point.", "warn");
      return env.next("newlen", { data: { ...s.data, ref: dist2(base, c.pt) } });
    }
    const k = dist2(base, c.pt) / Number(s.data.ref);
    if (k < 0.01 || k > 100) return env.toast("That scale factor is out of range (0.01 to 100).", "warn");
    runTransform(env, "Scale", s.picks, scaleTx(k, base, env), false);
    env.next("base", { pts: [], data: {} });
  },
  enter: (s, env) => (s.step === "select" ? selectEnter("base", env) : env.done()),
  text: (s, t, env) => {
    if (s.step !== "factor") return false;
    const k = Number(t);
    if (!Number.isFinite(k) || k < 0.01 || k > 100) return false;
    runTransform(env, "Scale", s.picks, scaleTx(k, s.pts[0], env), false);
    env.next("base", { pts: [], data: {} });
    return true;
  },
  preview: (s, cur, env) => {
    if (s.step === "factor") return { shapes: [{ pts: [s.pts[0], cur], tone: "ghost" }], labels: [] };
    if (s.step === "newlen") {
      const k = dist2(s.pts[0], cur) / Number(s.data.ref);
      return { shapes: [...ghosts(env, s.picks, scaleTx(k, s.pts[0], env)), { pts: [s.pts[0], cur], tone: "ghost" }], labels: [{ at: cur, text: `×${k.toFixed(2)}` }] };
    }
    return null;
  },
});

/* ══ MIRROR ═══════════════════════════════════════════════════════════════ */
register("MIRROR", {
  begin: (env) => {
    const sel = env.s.selection.filter((id) => editable(env, id));
    env.set({ step: sel.length ? "first" : "select", picks: sel });
  },
  prompt: (s) => (s.step === "select" ? SELECT_PROMPT : s.pts.length ? "Specify second point of the mirror line:" : "Specify first point of the mirror line:"),
  click: (s, c, env) => {
    if (selectClick(s.step, s.picks, c.hit, env)) return;
    if (!s.pts.length) return env.next("second", { pts: [c.pt] });
    if (dist2(s.pts[0], c.pt) < 0.05) return env.toast("The two points are the same.", "warn");
    const keep = env.opt("keep", true);
    runTransform(env, "Mirror", s.picks, { aff: affMirror(s.pts[0], c.pt) }, keep);
    env.next("first", { pts: [] });
  },
  enter: (s, env) => (s.step === "select" ? selectEnter("first", env) : env.done()),
  preview: (s, cur, env) => (s.pts.length ? { shapes: [...ghosts(env, s.picks, { aff: affMirror(s.pts[0], dist2(s.pts[0], cur) < 0.05 ? [s.pts[0][0] + 1, s.pts[0][1]] : cur) }), { pts: [s.pts[0], cur], dashed: true, tone: "ghost" }], labels: [] } : null),
});

/* ══ geometry of items (offset, trim, extend, fillet, split, join) ═══════ */
/** The segments an item or element presents to trim / extend / intersect. */
function segmentsOf(env: ToolEnv, id: string): [V2, V2][] {
  const it = env.item(id);
  const out: [V2, V2][] = [];
  const path = (pts: V2[], closed: boolean) => {
    for (let i = 0; i + 1 < pts.length; i++) out.push([pts[i], pts[i + 1]]);
    if (closed && pts.length > 2) out.push([pts[pts.length - 1], pts[0]]);
  };
  if (it) {
    if (it.kind === "circle" && it.pts.length > 1) path(circlePts(it.pts[0], dist2(it.pts[0], it.pts[1]), 48), true);
    else if (it.kind === "arc") {
      const a = arcFrom3(it.pts[0], it.pts[1], it.pts[2]);
      path(a ? arcPts(a, 32) : it.pts, false);
    } else if (it.kind === "spline") path(splinePts(it.pts, 8), false);
    else if (it.pts.length > 1) path(it.pts, !!it.closed || it.kind === "rect");
    return out;
  }
  const f = frameOfElement(env.scene, id);
  if (f) return [[f.A, add2(f.A, mul2(f.dir, f.len))]];
  const e = env.scene.elementById[id];
  if (e) path([[e.min[0], e.min[1]], [e.max[0], e.min[1]], [e.max[0], e.max[1]], [e.min[0], e.max[1]]], true);
  return out;
}

/** Drawn linear items that trim / extend / fillet can change directly. */
const isLinear = (it: DrawnItem | undefined): boolean => !!it && LINEAR2.includes(it.kind) && it.pts.length === 2;

/** Explode a polyline or rectangle into lines; returns the line items (the original is removed by the caller). */
function explode(env: ToolEnv, it: DrawnItem): DrawnItem[] {
  const closed = !!it.closed || it.kind === "rect";
  const segs: [V2, V2][] = [];
  for (let i = 0; i + 1 < it.pts.length; i++) segs.push([it.pts[i], it.pts[i + 1]]);
  if (closed) segs.push([it.pts[it.pts.length - 1], it.pts[0]]);
  return segs.map(([a, b]) => mkItem(env, "line", [a, b], {}, { level: it.level, z: it.z }));
}

/** Make sure the clicked item is a single linear item: explode polylines and rectangles. Returns the segment under the click. */
function linearAt(env: ToolEnv, id: string | null, near: V2): { item: DrawnItem; exploded: Change | null } | null {
  const it = env.item(id);
  if (!it) return null;
  if (isLinear(it)) return { item: it, exploded: null };
  if ((it.kind === "polyline" || it.kind === "rect") && it.pts.length > 1) {
    const lines = explode(env, it);
    let best = lines[0];
    let bd = Infinity;
    for (const l of lines) {
      const d = closestOnSeg(near, l.pts[0], l.pts[1]).d;
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    env.say("info", `Exploded ${it.name} into ${lines.length} lines`);
    return { item: best, exploded: { remove: [it.id], add: lines } };
  }
  return null;
}

/** Reassign the doors and windows of a wall to the pieces it was cut into: pieces cover [from, to] of the old wall. */
function reassignOpenings(s: WsState, wallId: string, pieces: { id: string; from: number; to: number }[]): { replace: DrawnItem[]; remove: string[]; lost: number } {
  const replace: DrawnItem[] = [];
  const remove: string[] = [];
  for (const o of s.drawn.filter((x) => isOpening(x) && x.p.host === wallId)) {
    const at = num(o, "at", 0);
    const w = num(o, "w", 3);
    const home = pieces.find((p) => at >= p.from - 1e-6 && at + w <= p.to + 1e-6);
    if (home) replace.push({ ...o, p: { ...o.p, host: home.id, at: at - home.from } });
    else remove.push(o.id);
  }
  return { replace, remove, lost: remove.length };
}

/** A copy of an item moved so its points are `pts`. */
const withPts = (it: DrawnItem, pts: V2[], extra: Partial<DrawnItem> = {}): DrawnItem => ({ ...it, pts, ...extra });

/* ══ OFFSET ═══════════════════════════════════════════════════════════════ */
/** The parallel copy of an item at distance d on the side of `click`; null when it cannot be offset. */
function offsetOf(env: ToolEnv, it: DrawnItem, d: number, click: V2): DrawnItem | null {
  const sideOf = (a: V2, b: V2) => (dot2([-(b[1] - a[1]), b[0] - a[0]], sub2(click, a)) >= 0 ? 1 : -1);
  if (it.kind === "circle" && it.pts.length > 1) {
    const r = dist2(it.pts[0], it.pts[1]);
    const out = dist2(it.pts[0], click) > r;
    const nr = out ? r + d : r - d;
    if (nr <= 0.01) return null;
    const u = unit2(sub2(it.pts[1], it.pts[0]));
    return cloneItem(it, { pts: [it.pts[0], add2(it.pts[0], mul2(u, nr))] });
  }
  if (it.kind === "arc" && it.pts.length === 3) {
    const a = arcFrom3(it.pts[0], it.pts[1], it.pts[2]);
    if (!a) return null;
    const out = dist2(a.c, click) > a.r;
    const nr = out ? a.r + d : a.r - d;
    if (nr <= 0.01) return null;
    return cloneItem(it, { pts: it.pts.map((p) => add2(a.c, mul2(unit2(sub2(p, a.c)), nr))) });
  }
  if (it.pts.length < 2) return null;
  const closed = !!it.closed || it.kind === "rect";
  const pts = it.pts;
  let sign = 1;
  if (closed && pts.length >= 3) {
    // inside the shape → inward; outside → outward (left of a counter-clockwise outline is inward)
    const ccw = polyArea(pts) > 0 ? 1 : -1;
    const inside = pointInside(click, pts);
    sign = (inside ? 1 : -1) * ccw;
  } else {
    let best = Infinity;
    for (let i = 0; i + 1 < pts.length; i++) {
      const cp = closestOnSeg(click, pts[i], pts[i + 1]);
      if (cp.d < best) {
        best = cp.d;
        sign = sideOf(pts[i], pts[i + 1]);
      }
    }
  }
  const moved = offsetPath(pts, d * sign, closed);
  return moved.length >= 2 ? cloneItem(it, { pts: moved }) : null;
}

function pointInside(p: V2, poly: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Offset of a path with mitred corners (left of the direction for positive d). */
function offsetPath(pts: V2[], d: number, closed: boolean): V2[] {
  const n = pts.length;
  const segs = closed ? n : n - 1;
  const lines: [V2, V2][] = [];
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const u = unit2(sub2(b, a));
    const nn = mul2([-u[1], u[0]], d);
    lines.push([add2(a, nn), add2(b, nn)]);
  }
  const out: V2[] = [];
  if (!closed) out.push(lines[0][0]);
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
    const prev = lines[(i - 1 + segs) % segs];
    const next = lines[i % segs];
    const hit = lineIntersect(prev[0], prev[1], next[0], next[1]);
    out.push(hit ? hit.pt : next[0]);
  }
  if (!closed) out.push(lines[segs - 1][1]);
  return out;
}

register("OFFSET", {
  prompt: (s, env) => (s.step === "side" ? "Specify the side to offset to (click):" : `Select object to offset (distance ${env.fmt(env.opt("dist", 2))}; type a number to change it):`),
  click: (s, c, env) => {
    if (s.step === "side") {
      const it = env.item(s.picks[0]);
      if (!it) return env.again();
      const copy = offsetOf(env, it, env.opt("dist", 2), c.pt);
      if (!copy) env.toast("That offset is not possible (too large for the shape).", "warn");
      else {
        // a copied wall keeps its type; its doors and windows do not come along
        env.commit("Offset", { add: [{ ...copy, name: `${it.name} offset` }] });
        env.say("ok", `✓ Offset ${env.fmt(env.opt("dist", 2))}`);
      }
      return env.next("first", { picks: [] });
    }
    const it = env.item(c.hit);
    if (it && it.pts.length >= 2 && !isOpening(it) && it.kind !== "framing" && it.kind !== "truss") return env.next("side", { picks: [it.id] });
    // a built-in wall offsets by copying it sideways
    const f = c.hit ? frameOfElement(env.scene, c.hit) : null;
    if (f && c.hit) {
      const side = dot2(f.nrm, sub2(c.pt, f.A)) >= 0 ? 1 : -1;
      const d = env.opt("dist", 2);
      runTransform(env, "Offset", [c.hit], { aff: affTranslate(f.nrm[0] * d * side, f.nrm[1] * d * side) }, true);
      return;
    }
    env.toast("Click a line, polyline, circle, arc, wall, beam or other drawn object to offset.", "warn");
  },
  enter: (_s, env) => env.done(),
  text: (_s, t, env) => {
    const d = Number(t);
    if (!Number.isFinite(d) || d <= 0) return false;
    setToolOpt(env.ctx, "OFFSET", "dist", d);
    env.say("ok", `Offset distance ${env.fmt(d)}`);
    return true;
  },
  preview: (s, cur, env) => {
    if (s.step !== "side") return null;
    const it = env.item(s.picks[0]);
    const copy = it && offsetOf(env, it, env.opt("dist", 2), cur);
    return copy ? { shapes: [{ pts: copy.kind === "circle" ? circlePts(copy.pts[0], dist2(copy.pts[0], copy.pts[1]), 48) : copy.pts, closed: !!copy.closed || copy.kind === "rect" || copy.kind === "circle", tone: "ghost" }], labels: [] } : null;
  },
});

/* ══ TRIM / EXTEND ════════════════════════════════════════════════════════ */
function edgesStep(env: ToolEnv): void {
  env.set({ step: "edges", picks: [] });
}

/** The segments of every selected cutting edge, or of everything drawn when none was picked. */
function edgeSegments(env: ToolEnv, picks: string[], except: string): [V2, V2][] {
  const ids = picks.length ? picks : [...(env.scene.drafts ?? []).map((d) => d.id), ...env.s.drawn.filter((d) => d.kind === "wall").map((d) => d.id)];
  return ids.filter((id) => id !== except).flatMap((id) => segmentsOf(env, id));
}

register("TRIM", {
  begin: edgesStep,
  prompt: (s) => (s.step === "edges" ? "Select cutting edges (click them, then Enter; Enter alone = all objects):" : "Click the part of a line to trim:"),
  click: (s, c, env) => {
    if (s.step === "edges") {
      if (!c.hit) return env.toast("Click the objects that cut, then press Enter.", "info");
      const picks = s.picks.includes(c.hit) ? s.picks.filter((p) => p !== c.hit) : [...s.picks, c.hit];
      env.s.select(picks);
      return env.set({ picks });
    }
    const target = linearAt(env, c.hit, c.pt);
    if (!target) return env.toast("Click a line, wall, beam, duct, pipe, tray, polyline or rectangle to trim.", "warn");
    const it = target.item;
    const [p0, p1] = it.pts;
    const edges = edgeSegments(env, s.picks, it.id).concat(target.exploded?.add?.filter((l) => l.id !== it.id).flatMap((l) => [[l.pts[0], l.pts[1]] as [V2, V2]]) ?? []);
    const cuts: number[] = [];
    for (const [e0, e1] of edges) {
      const h = segIntersect(p0, p1, e0, e1);
      if (h && h.t > 1e-6 && h.t < 1 - 1e-6) cuts.push(h.t);
    }
    if (!cuts.length) return env.toast("No cutting edge crosses that object.", "warn");
    cuts.sort((a, b) => a - b);
    const tc = closestOnSeg(c.pt, p0, p1).t;
    const before = [0, ...cuts.filter((t) => t < tc)].pop() as number;
    const after = [...cuts.filter((t) => t > tc), 1][0];
    const len = dist2(p0, p1);
    const pieces: { id: string; from: number; to: number; pts: V2[] }[] = [];
    if (before > 1e-6) pieces.push({ id: it.id, from: 0, to: before * len, pts: [p0, lerp2(p0, p1, before)] });
    if (after < 1 - 1e-6) pieces.push({ id: pieces.length ? uid("U") : it.id, from: after * len, to: len, pts: [lerp2(p0, p1, after), p1] });
    if (!pieces.length) return env.toast("Nothing to trim there.", "warn");
    const ch: Change = { replace: [], add: [], remove: [...(target.exploded?.remove ?? [])] };
    if (target.exploded?.add) ch.add!.push(...target.exploded.add.filter((l) => l.id !== it.id));
    pieces.forEach((pc, i) => {
      const item = withPts(it, pc.pts, i === 0 ? {} : { id: pc.id });
      if (i === 0 && pc.id === it.id) {
        if (target.exploded) ch.add!.push(item);
        else ch.replace!.push(item);
      } else ch.add!.push(item);
    });
    if (it.kind === "wall") {
      const re = reassignOpenings(env.s, it.id, pieces);
      ch.replace!.push(...re.replace);
      ch.remove!.push(...re.remove);
      if (re.lost) env.toast(`${re.lost} door or window in the trimmed part was removed.`, "info");
    }
    if (pieces.length === 1 && pieces[0].id !== it.id) ch.remove!.push(it.id);
    env.commit("Trim", ch);
    env.say("ok", "✓ Trim");
  },
  enter: (s, env) => (s.step === "edges" ? env.next("trim") : env.done()),
});

register("EXTEND", {
  begin: edgesStep,
  prompt: (s) => (s.step === "edges" ? "Select boundary edges (click them, then Enter; Enter alone = all objects):" : "Click the end of a line to extend:"),
  click: (s, c, env) => {
    if (s.step === "edges") {
      if (!c.hit) return env.toast("Click the boundary objects, then press Enter.", "info");
      const picks = s.picks.includes(c.hit) ? s.picks.filter((p) => p !== c.hit) : [...s.picks, c.hit];
      env.s.select(picks);
      return env.set({ picks });
    }
    const target = linearAt(env, c.hit, c.pt);
    if (!target) return env.toast("Click a line, wall, beam, duct, pipe, tray, polyline or rectangle to extend.", "warn");
    const it = target.item;
    const [p0, p1] = it.pts;
    const atStart = closestOnSeg(c.pt, p0, p1).t < 0.5;
    const end = atStart ? p0 : p1;
    const dir = unit2(atStart ? sub2(p0, p1) : sub2(p1, p0));
    let best: { t: number; pt: V2 } | null = null;
    for (const [e0, e1] of edgeSegments(env, s.picks, it.id)) {
      const h = lineIntersect(end, add2(end, dir), e0, e1);
      if (h && h.t > 1e-6 && h.u >= -1e-9 && h.u <= 1 + 1e-9 && (!best || h.t < best.t)) best = { t: h.t, pt: h.pt };
    }
    if (!best) return env.toast("No boundary edge in that direction.", "warn");
    const item = withPts(it, atStart ? [best.pt, p1] : [p0, best.pt]);
    const ch: Change = target.exploded ? { remove: target.exploded.remove, add: [...(target.exploded.add ?? []).filter((l) => l.id !== it.id), item] } : { replace: [item] };
    env.commit("Extend", ch);
    env.say("ok", `✓ Extended by ${env.fmt(best.t)}`);
  },
  enter: (s, env) => (s.step === "edges" ? env.next("extend") : env.done()),
});

/* ══ FILLET / CHAMFER ═════════════════════════════════════════════════════ */
interface Corner {
  P: V2;
  uA: V2;
  uB: V2;
  farA: V2;
  farB: V2;
  lenA: number;
  lenB: number;
  theta: number;
}

function cornerOf(a: DrawnItem, ca: V2, b: DrawnItem, cb: V2): Corner | null {
  const hit = lineIntersect(a.pts[0], a.pts[1], b.pts[0], b.pts[1]);
  if (!hit) return null;
  const P = hit.pt;
  const dirA = unit2(sub2(a.pts[1], a.pts[0]));
  const dirB = unit2(sub2(b.pts[1], b.pts[0]));
  const uA = dot2(sub2(ca, P), dirA) >= 0 ? dirA : mul2(dirA, -1);
  const uB = dot2(sub2(cb, P), dirB) >= 0 ? dirB : mul2(dirB, -1);
  const farA = dot2(sub2(a.pts[0], P), uA) > dot2(sub2(a.pts[1], P), uA) ? a.pts[0] : a.pts[1];
  const farB = dot2(sub2(b.pts[0], P), uB) > dot2(sub2(b.pts[1], P), uB) ? b.pts[0] : b.pts[1];
  const lenA = dot2(sub2(farA, P), uA);
  const lenB = dot2(sub2(farB, P), uB);
  const theta = Math.acos(Math.max(-1, Math.min(1, dot2(uA, uB))));
  if (lenA < 1e-6 || lenB < 1e-6 || theta < 1e-3 || theta > Math.PI - 1e-3) return null;
  return { P, uA, uB, farA, farB, lenA, lenB, theta };
}

function cornerTool(kind: "fillet" | "chamfer"): ToolDef {
  return {
    prompt: (s) => (s.picks.length ? `Select second ${kind === "fillet" ? "line" : "line"}:` : `Select first line (${kind === "fillet" ? "radius" : "distance"} comes from the tool bar):`),
    click: (s, c, env) => {
      const target = linearAt(env, c.hit, c.pt);
      if (!target) return env.toast("Click a line, wall, beam, duct, pipe, tray, polyline or rectangle edge.", "warn");
      if (!s.picks.length) {
        // keep exploded lines for the second click: store the click and the item id, commit the explode at the end
        return env.next("second", { picks: [target.item.id], pts: [c.pt], data: { ...s.data, ex: target.exploded ? JSON.stringify({ remove: target.exploded.remove, add: target.exploded.add }) : "", a: JSON.stringify(target.item) } });
      }
      const a = JSON.parse(String(s.data.a)) as DrawnItem;
      const b = target.item;
      if (a.id === b.id) return env.toast("Pick a different line.", "warn");
      const corner = cornerOf(a, s.pts[0], b, c.pt);
      if (!corner) return env.toast("Those lines are parallel. Pick two lines that meet.", "warn");
      const wallLike = a.kind === "wall" || b.kind === "wall";
      const d = wallLike ? 0 : kind === "fillet" ? env.opt("radius", 2) : env.opt("dist", 2);
      const ex = s.data.ex ? (JSON.parse(String(s.data.ex)) as { remove: string[]; add: DrawnItem[] }) : null;
      const ch: Change = { replace: [], add: [], remove: [] };
      if (ex) {
        ch.remove!.push(...ex.remove);
        ch.add!.push(...ex.add.filter((l) => l.id !== a.id));
      }
      if (target.exploded) {
        ch.remove!.push(...(target.exploded.remove ?? []));
        ch.add!.push(...(target.exploded.add ?? []).filter((l) => l.id !== b.id));
      }
      const put2 = (it: DrawnItem, pts: V2[]) => {
        const item = withPts(it, pts);
        if ((ex && it.id === a.id) || (target.exploded && it.id === b.id)) ch.add!.push(item);
        else ch.replace!.push(item);
      };
      const { P, uA, uB, farA, farB, lenA, lenB, theta } = corner;
      if (d <= 1e-6) {
        put2(a, [farA, P]);
        put2(b, [farB, P]);
      } else {
        const t = kind === "fillet" ? d / Math.tan(theta / 2) : d;
        if (t > lenA - 1e-6 || t > lenB - 1e-6) return env.toast(`The ${kind === "fillet" ? "radius" : "distance"} is too large for these lines.`, "warn");
        const TA = add2(P, mul2(uA, t));
        const TB = add2(P, mul2(uB, t));
        put2(a, [farA, TA]);
        put2(b, [farB, TB]);
        if (kind === "chamfer") ch.add!.push(mkItem(env, "line", [TA, TB], {}, { level: a.level, z: a.z }));
        else {
          const bis = unit2(add2(uA, uB));
          const C = add2(P, mul2(bis, d / Math.sin(theta / 2)));
          const mid = sub2(C, mul2(bis, d));
          ch.add!.push(mkItem(env, "arc", [TA, mid, TB], {}, { level: a.level, z: a.z }));
        }
      }
      env.commit(kind === "fillet" ? "Fillet" : "Chamfer", ch);
      env.say("ok", `✓ ${kind === "fillet" ? "Fillet" : "Chamfer"}`);
      env.again();
    },
    enter: (_s, env) => env.done(),
  };
}
register("FILLET", cornerTool("fillet"));
register("CHAMFER", cornerTool("chamfer"));

/* ══ ARRAY ════════════════════════════════════════════════════════════════ */
function arrayChange(env: ToolEnv, ids: string[], center: V2): { change: Change; count: number } {
  let change: Change = {};
  let count = 0;
  const type = env.opt("type", "rect");
  const build = (t: Tx) => {
    const r = planTransform(env.s, env.scene, ids, t, true);
    change = mergeChange(change, r.change);
    count += r.newIds.length;
  };
  if (type === "polar") {
    const n = Math.max(2, Math.round(env.opt("count", 6)));
    const total = env.opt("angle", 360);
    const step = total >= 360 ? total / n : total / (n - 1);
    for (let i = 1; i < n; i++) build({ aff: affRotate(((step * i) * Math.PI) / 180, center[0], center[1]) });
  } else {
    const rows = Math.max(1, Math.round(env.opt("rows", 2)));
    const cols = Math.max(1, Math.round(env.opt("cols", 3)));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) if (r || c) build({ aff: affTranslate(c * env.opt("dx", 10), r * env.opt("dy", 10)) });
  }
  return { change, count };
}

function runArray(s: { picks: string[]; pts: V2[] }, env: ToolEnv): void {
  if (!s.picks.length) return void env.toast("Select objects first.", "warn");
  const center = s.pts[0] ?? centreOf(env, s.picks);
  const { change, count } = arrayChange(env, s.picks, center);
  if (!count) return void env.toast("The array would add nothing.", "warn");
  env.commit("Array", change);
  env.say("ok", `✓ Array: ${count} new object(s)`);
}

register("ARRAY", {
  begin: (env) => {
    const sel = env.s.selection.filter((id) => editable(env, id));
    env.set({ step: sel.length ? "ready" : "select", picks: sel });
  },
  prompt: (s, env) => (s.step === "select" ? SELECT_PROMPT : env.opt("type", "rect") === "polar" ? "Set the options, click the centre point (optional), then Apply or Enter:" : "Set rows, columns and spacing in the tool bar, then Apply or Enter:"),
  click: (s, c, env) => {
    if (selectClick(s.step, s.picks, c.hit, env)) return;
    if (env.opt("type", "rect") === "polar") env.set({ pts: [c.pt] });
  },
  enter: (s, env) => (s.step === "select" ? selectEnter("ready", env) : runArray(s, env)),
  apply: (s, env) => runArray(s, env),
  applyLabel: "Create array",
  preview: (s, cur, env) => {
    if (s.step !== "ready" || env.opt("type", "rect") !== "polar") return null;
    const c = s.pts[0] ?? cur;
    return { shapes: [{ pts: [c, add2(c, [0.5, 0])], tone: "ghost" }], labels: [{ at: c, text: "centre" }] };
  },
});

/* ══ SPLIT ════════════════════════════════════════════════════════════════ */
register("SPLIT", {
  prompt: () => "Click the point where to split:",
  click: (_s, c, env) => {
    const it = env.item(c.hit);
    if (!it || isOpening(it) || it.pts.length < 2 || it.closed || it.kind === "rect" || it.kind === "circle" || it.kind === "arc" || it.kind === "spline" || it.kind === "framing" || it.kind === "truss")
      return env.toast("Click a line, wall, beam, duct, pipe, tray or polyline to split it.", "warn");
    let seg = 0;
    let best = Infinity;
    let at: V2 = it.pts[0];
    for (let i = 0; i + 1 < it.pts.length; i++) {
      const cp = closestOnSeg(c.pt, it.pts[i], it.pts[i + 1]);
      if (cp.d < best) {
        best = cp.d;
        seg = i;
        at = cp.pt;
      }
    }
    const a = [...it.pts.slice(0, seg + 1), at];
    const b = [at, ...it.pts.slice(seg + 1)];
    if (dist2(a[a.length - 2], at) < 0.05 || dist2(at, b[1]) < 0.05) return env.toast("Click away from the ends.", "warn");
    const second = withPts(it, b, { id: uid("U"), name: `${it.name} (2)` });
    const ch: Change = { replace: [withPts(it, a)], add: [second] };
    if (it.kind === "wall") {
      const L1 = dist2(it.pts[0], at);
      const re = reassignOpenings(env.s, it.id, [{ id: it.id, from: 0, to: L1 }, { id: second.id, from: L1, to: dist2(it.pts[0], it.pts[1]) }]);
      ch.replace!.push(...re.replace);
      ch.remove = re.remove;
      if (re.lost) env.toast(`${re.lost} door or window sat on the cut and was removed.`, "info");
    }
    env.commit("Split", ch);
    env.say("ok", `✓ Split ${it.name}`);
  },
  enter: (_s, env) => env.done(),
});

/* ══ JOIN ═════════════════════════════════════════════════════════════════ */
const JOINABLE: ItemKind[] = ["line", "polyline", "wall", "beam", "duct", "pipe", "tray"];
const near = (a: V2, b: V2) => dist2(a, b) < 0.06;

function joinTwo(a: DrawnItem, b: DrawnItem): DrawnItem | null {
  const polyA = a.kind === "polyline" || a.kind === "line";
  const polyB = b.kind === "polyline" || b.kind === "line";
  const kindOk = a.kind === b.kind || (polyA && polyB);
  if (!kindOk || a.closed || b.closed) return null;
  const strip = a.kind === "wall" || a.kind === "beam";
  let pts: V2[] | null = null;
  const A = a.pts;
  const B = b.pts;
  if (near(A[A.length - 1], B[0])) pts = [...A, ...B.slice(1)];
  else if (near(A[A.length - 1], B[B.length - 1])) pts = [...A, ...[...B].reverse().slice(1)];
  else if (near(A[0], B[B.length - 1])) pts = [...B, ...A.slice(1)];
  else if (near(A[0], B[0])) pts = [...[...B].reverse(), ...A.slice(1)];
  if (!pts) return null;
  if (strip) {
    // walls and beams stay single straight members: only collinear ones join
    const d1 = unit2(sub2(A[1], A[0]));
    const d2 = unit2(sub2(B[1], B[0]));
    if (Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) > 0.01) return null;
    pts = [pts[0], pts[pts.length - 1]];
  }
  return { ...a, pts, kind: a.kind === "line" && pts.length > 2 ? "polyline" : a.kind === "line" && b.kind === "polyline" ? "polyline" : a.kind };
}

register("JOIN", {
  begin: (env) => {
    const sel = env.s.selection.filter((id) => JOINABLE.includes(env.item(id)?.kind as ItemKind));
    env.set({ step: sel.length > 1 ? "ready" : "select", picks: sel });
  },
  prompt: (s) => (s.step === "select" ? "Select the objects to join (click them, then Enter):" : "Press Enter to join, or click to add more objects:"),
  click: (s, c, env) => {
    const it = env.item(c.hit);
    if (!it || !JOINABLE.includes(it.kind)) return env.toast("Click lines, polylines, walls, beams, ducts, pipes or trays that touch end to end.", "warn");
    const picks = s.picks.includes(it.id) ? s.picks.filter((p) => p !== it.id) : [...s.picks, it.id];
    env.s.select(picks);
    env.set({ picks, step: picks.length > 1 ? "ready" : "select" });
  },
  enter: (s, env) => {
    const items = s.picks.map((id) => env.item(id)).filter((x): x is DrawnItem => !!x);
    if (items.length < 2) return void env.toast("Select two or more objects.", "warn");
    const list = [...items];
    let joined = true;
    while (joined && list.length > 1) {
      joined = false;
      for (let i = 0; i < list.length && !joined; i++)
        for (let j = i + 1; j < list.length && !joined; j++) {
          const m = joinTwo(list[i], list[j]);
          if (m) {
            list.splice(j, 1);
            list[i] = m;
            joined = true;
          }
        }
    }
    if (list.length === items.length) return void env.toast("Nothing to join: objects must meet end to end (walls and beams must also be in line).", "warn");
    const keepIds = new Set(list.map((l) => l.id));
    const ch: Change = { replace: list, remove: items.filter((i) => !keepIds.has(i.id)).map((i) => i.id) };
    // openings of a joined wall: shift by the distance the wall grew at its start
    for (const l of list.filter((x) => x.kind === "wall")) {
      const orig = items.find((i) => i.id === l.id);
      const shift = orig ? dist2(l.pts[0], orig.pts[0]) : 0;
      for (const o of env.s.drawn.filter((x) => isOpening(x) && items.some((i) => i.id === x.p.host))) {
        const host = items.find((i) => i.id === o.p.host);
        const off = host ? dist2(l.pts[0], host.pts[0]) : shift;
        ch.replace!.push({ ...o, p: { ...o.p, host: l.id, at: num(o, "at", 0) + off } });
      }
    }
    env.commit("Join", ch);
    env.say("ok", `✓ Joined ${items.length} objects into ${list.length}`);
    env.s.clearSelection();
    env.again();
  },
});

/* ══ ALIGN ════════════════════════════════════════════════════════════════ */
register("ALIGN", {
  begin: selecting,
  prompt: (s) => (s.step === "select" ? SELECT_PROMPT : s.pts.length % 2 === 0 ? `Specify ${s.pts.length ? "second" : "first"} source point${s.pts.length ? " (or Enter to finish)" : ""}:` : `Specify ${s.pts.length > 1 ? "second" : "first"} destination point:`),
  click: (s, c, env) => {
    if (selectClick(s.step, s.picks, c.hit, env)) return;
    const pts = [...s.pts, c.pt];
    if (pts.length < 4) return env.next("align", { pts });
    align(s.picks, pts, env);
  },
  enter: (s, env) => {
    if (s.step === "select") return selectEnter("base", env);
    if (s.pts.length === 2) return align(s.picks, s.pts, env);
    env.done();
  },
  preview: (s, cur) => (s.pts.length === 1 || s.pts.length === 3 ? { shapes: [{ pts: [s.pts[s.pts.length - 1], cur], tone: "ghost" }], labels: [] } : null),
});

function align(ids: string[], pts: V2[], env: ToolEnv): void {
  const [s1, d1, s2, d2] = pts;
  let aff = affTranslate(d1[0] - s1[0], d1[1] - s1[1]);
  if (s2 && d2) {
    const rot = ((angleDeg(sub2(d2, d1)) - angleDeg(sub2(s2, s1))) * Math.PI) / 180;
    aff = affMul(affTranslate(d1[0], d1[1]), affMul(affRotate(rot), affTranslate(-s1[0], -s1[1])));
  }
  runTransform(env, "Align", ids, { aff }, false);
  env.next("base", { pts: [] });
}

/* ══ CHTYPE / CHMAT / CHDIM / ATTACH / DETACH ═════════════════════════════ */
const CAT_KIND: Partial<Record<Category, ItemKind>> = { Wall: "wall", Partition: "wall", Door: "door", Window: "window", Slab: "slab", Roof: "roof", Column: "column", Beam: "beam", Stair: "stair" };

/** The kind of the first picked element (drawn kind, or the built-in element's category as a kind). */
function kindOfPick(env: ToolEnv, id: string | undefined): ItemKind | null {
  if (!id) return null;
  const it = env.item(id);
  if (it && it.kind !== "clone") return it.kind;
  const el = env.scene.elementById[id];
  return el ? (CAT_KIND[el.category] ?? null) : null;
}

/** Selection-first for the property tools: select, Enter, then the tool bar + Apply. */
const propertyTool = (cfg: { prompt: string; options: (env: ToolEnv) => OptDef[]; apply: (picks: string[], env: ToolEnv) => void; applyLabel: string; onReady?: (picks: string[], env: ToolEnv) => void }): ToolDef => ({
  begin: (env) => {
    const sel = env.s.selection.filter((id) => editable(env, id));
    env.set({ step: sel.length ? "ready" : "select", picks: sel });
    if (sel.length) cfg.onReady?.(sel, env);
  },
  prompt: (s) => (s.step === "select" ? SELECT_PROMPT : cfg.prompt),
  click: (s, c, env) => {
    if (selectClick(s.step, s.picks, c.hit, env)) return;
    if (s.step === "ready" && c.hit && editable(env, c.hit)) {
      env.s.select([c.hit]);
      env.set({ picks: [c.hit] });
      cfg.onReady?.([c.hit], env);
    }
  },
  enter: (s, env) => {
    if (s.step === "select") {
      selectEnter("ready", env);
      cfg.onReady?.(env.session.picks, env);
    } else cfg.apply(s.picks, env);
  },
  options: (env) => (env.session.step === "select" ? [] : cfg.options(env)),
  apply: (s, env) => cfg.apply(s.picks, env),
  applyLabel: cfg.applyLabel,
});

register("CHTYPE", propertyTool({
  prompt: "Choose the new type in the tool bar, then Apply:",
  applyLabel: "Change type",
  options: (env) => {
    const kind = kindOfPick(env, env.session.picks[0]);
    const defs = kind ? TYPE_DEFS[kind] : undefined;
    if (!defs) return [{ key: "none", label: "Type", type: "select", def: "", options: [{ value: "", label: "No types for this element" }] }];
    return [{ key: "type", label: "Type", type: "select", def: defs[0].value, options: defs.map((d) => ({ value: d.value, label: d.label })) }];
  },
  apply: (picks, env) => {
    const kind = kindOfPick(env, picks[0]);
    const defs = kind ? TYPE_DEFS[kind] : undefined;
    const def = defs?.find((d) => d.value === env.opt("type", defs[0]?.value ?? ""));
    if (!kind || !defs || !def) return void env.toast("This element has no alternative types.", "warn");
    const replace: DrawnItem[] = [];
    const types: Record<string, string> = { ...env.s.types };
    const mats: Record<string, string> = { ...env.s.materialOverrides };
    let n = 0;
    for (const id of picks) {
      if (kindOfPick(env, id) !== kind) continue;
      n++;
      const it = env.item(id);
      if (it && it.kind !== "clone") replace.push({ ...it, p: { ...it.p, ...(def.p ?? {}), type: def.label, ...(def.material ? { material: def.material } : {}) } });
      else {
        types[id] = def.label;
        if (def.material) mats[id] = def.material;
      }
    }
    env.commit("Change type", { replace, set: { types, materialOverrides: mats } });
    env.say("ok", `✓ ${n} element(s) changed to ${def.label}`);
  },
}));

register("CHMAT", propertyTool({
  prompt: "Choose the material in the tool bar, then Apply:",
  applyLabel: "Apply material",
  options: () => [{ key: "material", label: "Material", type: "select", def: "Concrete", options: MATERIALS.map((m) => ({ value: m.id, label: m.id })) }],
  apply: (picks, env) => {
    const m = MATERIALS.find((x) => x.id === env.opt("material", "Concrete")) ?? MATERIALS[0];
    const replace: DrawnItem[] = [];
    const mats = { ...env.s.materialOverrides };
    const cols = { ...env.s.elColors };
    for (const id of picks) {
      const it = env.item(id);
      if (it && it.kind !== "clone") replace.push({ ...it, p: { ...it.p, material: m.text } });
      mats[id] = m.text;
      cols[id] = m.swatch;
    }
    env.commit("Change material", { replace, set: { materialOverrides: mats, elColors: cols } });
    env.say("ok", `✓ ${picks.length} element(s) set to ${m.id}`);
  },
}));

/** The size fields CHDIM offers for each kind of drawn item: key, label, unit. */
const DIM_FIELDS: Partial<Record<ItemKind, [string, string, OptDef["unit"]][]>> = {
  wall: [["length", "Length", "ft"], ["height", "Height", "ft"], ["thick", "Thickness", "in"]],
  beam: [["length", "Length", "ft"], ["width", "Width", "in"], ["depth", "Depth", "in"]],
  line: [["length", "Length", "ft"]],
  slab: [["thick", "Thickness", "in"]], roof: [["thick", "Thickness", "in"]], foundation: [["thick", "Thickness", "in"]],
  column: [["size", "Size", "in"], ["height", "Height", "ft"]],
  stair: [["width", "Width", "ft"], ["rise", "Rise", "ft"]], ramp: [["width", "Width", "ft"]],
  door: [["w", "Width", "ft"], ["head", "Height", "ft"]], window: [["w", "Width", "ft"], ["sill", "Sill", "ft"], ["head", "Head", "ft"]],
  furniture: [["w", "Width", "ft"], ["d", "Depth", "ft"], ["h", "Height", "ft"], ["rot", "Rotation", "°"]],
  fixture: [["w", "Width", "ft"], ["d", "Depth", "ft"], ["h", "Height", "ft"], ["rot", "Rotation", "°"]],
  equipment: [["w", "Width", "ft"], ["d", "Depth", "ft"], ["h", "Height", "ft"], ["rot", "Rotation", "°"]],
  duct: [["h", "Height above floor", "ft"]], pipe: [["h", "Height above floor", "ft"]], tray: [["h", "Height above floor", "ft"]],
  circle: [["radius", "Radius", "ft"]], dim: [["off", "Offset", "ft"]],
  shed: [["w", "Width", "ft"], ["d", "Depth", "ft"], ["h", "Wall height", "ft"], ["rot", "Rotation", "°"]],
  tree: [["h", "Height", "ft"], ["r", "Canopy radius", "ft"]],
  septic: [["rows", "Drain-field trenches", ""], ["len", "Trench length", "ft"], ["dist", "Gap to the field", "ft"], ["rot", "Rotation", "°"]],
  flowers: [["h", "Height", "ft"]],
  pool: [["l", "Length", "ft"], ["w", "Width", "ft"], ["depth", "Depth", "ft"], ["deck", "Deck", "ft"], ["rot", "Rotation", "°"]],
  rock: [["size", "Size", "ft"], ["count", "How many", ""]],
  fence: [["h", "Height", "ft"]],
  road: [["width", "Pavement width", "ft"]],
  sidewalk: [["width", "Width", "ft"]],
  sign: [["rot", "Faces", "°"]],
  signal: [["arm", "Arm length", "ft"], ["rot", "Arm points", "°"]],
  drain: [["len", "Trench length", "ft"], ["rot", "Rotation", "°"]],
  solar: [["rows", "Rows", ""], ["cols", "Panels per row", ""], ["pw", "Panel width", "ft"], ["pl", "Panel length", "ft"], ["watts", "Watts per panel", ""], ["tilt", "Tilt", "°"]],
};

/** The sizes of a drawn item that can be typed in (CHDIM, Properties → Size): [key, label, unit]. */
export function sizeFields(kind: ItemKind): [string, string, OptDef["unit"]][] {
  return DIM_FIELDS[kind] ?? [];
}

/** The current value of one of those sizes. */
export const sizeOf = (it: DrawnItem, key: string): number => dimValue(it, key);

/** Can a size be zero (a turn, a tilt) or must it be more than zero (a length)? */
export const sizeMayBeZero = (key: string): boolean => key === "rot" || key === "tilt" || key === "off";

/**
 * The item with one size changed (a length or radius moves its second point; the rest are parameters), or null when
 * the value is not allowed (not a number, or zero or less where a size must be more).
 */
export function withSize(it: DrawnItem, key: string, v: number): DrawnItem | null {
  // a turn is any angle (kept to 0–359°); a tilt or an offset may be 0; everything else must be more than 0
  if (!Number.isFinite(v) || (key !== "rot" && (sizeMayBeZero(key) ? v < 0 : v <= 0))) return null;
  if ((key === "length" || key === "radius") && it.pts.length > 1) return withPts(it, [it.pts[0], add2(it.pts[0], mul2(unit2(sub2(it.pts[1], it.pts[0])), v))]);
  const next: DrawnItem = { ...it, p: { ...it.p, [key]: key === "rot" ? ((v % 360) + 360) % 360 : v } };
  // a solar array's name carries its output: keep it true
  if (it.kind === "solar" && /\(\d+(\.\d+)? kW/.test(it.name)) next.name = it.name.replace(/\(\d+(\.\d+)? kW/, `(${((num(next, "rows", 2) * num(next, "cols", 6) * num(next, "watts", 400)) / 1000).toFixed(1)} kW`);
  return next;
}
const TEXT_KINDS: ItemKind[] = ["text", "note", "pin", "label", "leader", "tag", "markup", "secmark", "gridline", "detail"];

/** The current value of a CHDIM field of an item. */
function dimValue(it: DrawnItem, key: string): number {
  if (key === "length") return it.pts.length > 1 ? dist2(it.pts[0], it.pts[1]) : 0;
  if (key === "radius") return it.pts.length > 1 ? dist2(it.pts[0], it.pts[1]) : 0;
  if (it.kind === "fence" && key === "h") return num(it, "h", FENCE_HEIGHT[str(it, "type", "privacy") as FenceType] ?? 6);
  const d = it.kind === "wall" && key === "height" ? 10 : it.kind === "wall" && key === "thick" ? 0.67 : (SIZE_DEFAULTS[it.kind]?.[key] ?? 0);
  return num(it, key, d);
}

/** The sizes the composer assumes when an item does not say (older items, made before a size was added). */
const SIZE_DEFAULTS: Partial<Record<ItemKind, Record<string, number>>> = {
  solar: { rows: 2, cols: 6, pw: 3.4, pl: 5.6, watts: 400, tilt: 22 },
  pool: { l: 32, w: 16, depth: 6, deck: 4 },
  rock: { size: 3, count: 1 },
  road: { width: 24 },
  sidewalk: { width: 5 },
  signal: { arm: 20 },
  drain: { len: 8 },
};

register("CHDIM", propertyTool({
  prompt: "Edit the sizes in the tool bar, then Apply:",
  applyLabel: "Apply sizes",
  onReady: (picks, env) => {
    const it = env.item(picks[0]);
    if (!it) return void env.toast("CHDIM edits the size of things you drew. Use SCALE to resize built-in elements.", "info");
    const vals: Record<string, number | string | boolean> = {};
    for (const [k] of DIM_FIELDS[it.kind] ?? []) vals[k] = dimValue(it, k);
    if (TEXT_KINDS.includes(it.kind)) vals.text = str(it, "text", "");
    env.s.patch({ toolOpts: { ...env.s.toolOpts, CHDIM: vals } });
  },
  options: (env) => {
    const it = env.item(env.session.picks[0]);
    if (!it) return [{ key: "none", label: "Size", type: "select", def: "", options: [{ value: "", label: "Built-in element: use SCALE to resize" }] }];
    const defs: OptDef[] = (DIM_FIELDS[it.kind] ?? []).map(([key, label, unit]) => ({ key, label, type: "number" as const, unit, def: dimValue(it, key) }));
    if (TEXT_KINDS.includes(it.kind)) defs.push({ key: "text", label: "Text", type: "text", def: str(it, "text", "") });
    return defs.length ? defs : [{ key: "none", label: "Size", type: "select", def: "", options: [{ value: "", label: "Nothing to resize for this element" }] }];
  },
  apply: (picks, env) => {
    const first = env.item(picks[0]);
    if (!first) return void env.toast("CHDIM edits the size of things you drew. Use SCALE to resize built-in elements.", "info");
    const vals = env.s.toolOpts.CHDIM ?? {};
    const replace: DrawnItem[] = [];
    for (const id of picks) {
      const it = env.item(id);
      if (!it || it.kind !== first.kind) continue;
      let next: DrawnItem = { ...it, p: { ...it.p } };
      for (const [k] of DIM_FIELDS[it.kind] ?? []) {
        const v = vals[k];
        if (typeof v !== "number") continue;
        next = withSize(next, k, v) ?? next;
      }
      if (typeof vals.text === "string" && TEXT_KINDS.includes(it.kind)) next.p.text = vals.text;
      replace.push(next);
    }
    env.commit("Change dimensions", { replace });
    env.say("ok", `✓ Changed ${replace.length} element(s)`);
  },
}));

register("ATTACH HOST", {
  begin: (env) => {
    const sel = env.s.selection.filter((id) => !!env.item(id));
    env.set({ step: sel.length ? "host" : "select", picks: sel });
  },
  prompt: (s) => (s.step === "select" ? "Select the elements to attach (the ones you drew), then Enter:" : "Select the host element to attach to:"),
  click: (s, c, env) => {
    if (s.step === "select") {
      const it = env.item(c.hit);
      if (!it) return void env.toast("Only elements you drew can be attached.", "warn");
      const picks = s.picks.includes(it.id) ? s.picks.filter((p) => p !== it.id) : [...s.picks, it.id];
      env.s.select(picks);
      return env.set({ picks });
    }
    const host = c.hit ? env.scene.elementById[c.hit] : undefined;
    if (!host || s.picks.includes(host.id)) return void env.toast("Click the host element (a wall, slab, roof or beam).", "warn");
    const replace: DrawnItem[] = [];
    for (const id of s.picks) {
      const it = env.item(id);
      if (!it) continue;
      if (isOpening(it)) {
        const f = frameOfElement(env.scene, host.id);
        if (!f) {
          env.toast("A door or window can only be attached to a wall.", "warn");
          continue;
        }
        const w = num(it, "w", 3);
        const at = Math.max(0.25, Math.min(f.len - w - 0.25, dot2(sub2(it.pts[0], f.A), f.dir) - w / 2));
        replace.push({ ...it, level: host.level, pts: [add2(f.A, mul2(f.dir, at + w / 2))], p: { ...it.p, host: host.id, at } });
      } else replace.push({ ...it, z: host.max[2], level: host.level, p: { ...it.p, attach: host.id } });
    }
    if (!replace.length) return;
    env.commit("Attach", { replace });
    env.say("ok", `✓ Attached ${replace.length} element(s) to ${host.name} (${levelLabel(host.level)})`);
    env.again();
  },
  enter: (s, env) => (s.step === "select" ? selectEnter("host", env) : env.done()),
});

/** Detach these drawn elements from what they hang on. */
function detach(env: ToolEnv, ids: string[]): void {
  const replace: DrawnItem[] = [];
  let blocked = 0;
  for (const id of ids) {
    const it = env.item(id);
    if (!it) continue;
    if (isOpening(it) || it.kind === "framing" || it.kind === "truss") blocked++;
    else if (typeof it.p.attach === "string") {
      const p = { ...it.p };
      delete p.attach;
      replace.push({ ...it, p });
    }
  }
  if (blocked) env.toast("Doors, windows, framing and trusses are part of their host: delete them instead.", "info");
  if (replace.length) {
    env.commit("Detach", { replace });
    env.say("ok", `✓ Detached ${replace.length} element(s)`);
  } else if (!blocked) env.toast("Nothing attached to detach.", "info");
  env.done();
}

// like ATTACH HOST: with a selection it acts at once; without one it asks for the elements, then Enter
register("DETACH", {
  begin: (env) => {
    const sel = env.s.selection.filter((id) => !!env.item(id));
    if (sel.length) detach(env, sel);
  },
  prompt: () => "Select the elements to detach (the ones you drew), then Enter:",
  click: (s, c, env) => {
    const it = env.item(c.hit);
    if (!it) return void env.toast("Only elements you drew can be attached or detached.", "warn");
    const picks = s.picks.includes(it.id) ? s.picks.filter((p) => p !== it.id) : [...s.picks, it.id];
    env.s.select(picks);
    env.set({ picks });
  },
  enter: (s, env) => (s.picks.length ? detach(env, s.picks) : env.done()),
});

/* ══ DIRECT MANIPULATION: drag to move, drag a grip ═══════════════════════ */
/** Drawn kinds whose points follow when a point they share is moved (walls joined at a corner stay joined). */
const FOLLOW: ItemKind[] = ["wall", "beam", "line", "polyline", "spline", "duct", "pipe", "tray", "brace", "slab", "roof", "foundation", "rect", "dim", "leader", "markup"];
const RIGID: Category[] = ["Door", "Window", "Column", "Furniture", "Fixture", "Stair", "Equipment"];

/** Keep a wall's doors and windows where they are in the world after its end points changed (drop those that no longer fit). */
function reanchor(s: WsState, before: DrawnItem, after: DrawnItem): { replace: DrawnItem[]; remove: string[] } {
  const replace: DrawnItem[] = [];
  const remove: string[] = [];
  const d0 = unit2(sub2(before.pts[1], before.pts[0]));
  const d1 = unit2(sub2(after.pts[1], after.pts[0]));
  const L1 = dist2(after.pts[0], after.pts[1]);
  for (const o of s.drawn.filter((x) => isOpening(x) && x.p.host === before.id)) {
    const w = num(o, "w", 3);
    const centre = add2(before.pts[0], mul2(d0, num(o, "at", 0) + w / 2));
    const at = dot2(sub2(centre, after.pts[0]), d1) - w / 2;
    if (at < 0.25 || at + w > L1 - 0.25) remove.push(o.id);
    else replace.push({ ...o, pts: [add2(after.pts[0], mul2(d1, at + w / 2))], p: { ...o.p, at } });
  }
  return { replace, remove };
}

/** Points of other drawn items that sit on a moved point move with it; walls keep their openings in place. */
function followPoints(s: WsState, skip: Set<string>, moves: { from: V2; to: V2 }[]): Change {
  const replace: DrawnItem[] = [];
  const remove: string[] = [];
  for (const it of s.drawn) {
    if (skip.has(it.id) || !FOLLOW.includes(it.kind)) continue;
    let changed = false;
    const pts = it.pts.map((p) => {
      const m = moves.find((mv) => dist2(mv.from, p) < 0.06);
      if (!m) return p;
      changed = true;
      return m.to;
    });
    if (!changed) continue;
    const next = { ...it, pts };
    replace.push(next);
    if (it.kind === "wall") {
      const re = reanchor(s, it, next);
      replace.push(...re.replace);
      remove.push(...re.remove);
    }
  }
  return { replace, remove };
}

/** The built-in wall a built-in door or window sits in. */
function hostOfOpening(scene: Scene, id: string): string | null {
  const o = scene.elementById[id];
  if (!o || (o.category !== "Door" && o.category !== "Window") || scene.items?.[id]) return null;
  const cx = (o.min[0] + o.max[0]) / 2;
  const cy = (o.min[1] + o.max[1]) / 2;
  const host = scene.elements.find(
    (e) => (e.category === "Wall" || e.category === "Partition") && !scene.items?.[e.id] && cx >= e.min[0] - 0.1 && cx <= e.max[0] + 0.1 && cy >= e.min[1] - 0.1 && cy <= e.max[1] + 0.1 && o.min[2] < e.max[2] && o.max[2] > e.min[2],
  );
  return host?.id ?? null;
}

/** A built-in door or window slid along its wall by the part of d that runs along the wall. */
function slideOpening(s: WsState, scene: Scene, id: string, d: V2): XForm | null {
  const hostId = hostOfOpening(scene, id);
  const f = hostId ? frameOfElement(scene, hostId) : null;
  const o = scene.elementById[id];
  if (!hostId || !f || !o) return null;
  const cur = s.xf[id];
  let sl = cur?.slide;
  if (!sl) {
    // the hole the builder cut: windows have a sill ledge 0.1 ft wider each side; door leaves are 0.05 ft narrower
    const us = [o.min[0], o.max[0]].flatMap((x) => [o.min[1], o.max[1]].map((y) => dot2([x, y], f.dir)));
    const u0 = Math.min(...us) - f.u0;
    const u1 = Math.max(...us) - f.u0;
    const win = o.category === "Window";
    const w = u1 - u0 + (win ? -0.2 : 0.1);
    const at0 = u0 + (win ? 0.1 : -0.05);
    const sill = win ? o.min[2] + 0.22 - f.z0 : Math.max(0, o.min[2] - 0.05 - f.z0);
    sl = { host: hostId, at0, at: at0, w, sill, head: o.max[2] + 0.05 - f.z0 };
  }
  const at = Math.max(0.25, Math.min(f.len - sl.w - 0.25, sl.at + dot2(d, f.dir)));
  const step = mul2(f.dir, at - sl.at);
  const base = cur ? { ...cur, slide: undefined } : undefined;
  const moved = base ? appendStage(base, { aff: affTranslate(step[0], step[1]), dz: 0 }) : { aff: affTranslate(step[0], step[1]), dz: 0 };
  return { ...moved, slide: { ...sl, at } };
}

/** Built-in elements around moved built-in walls: what sits inside a wall moves with it, what touches it stretches. */
function builtInFollow(s: WsState, scene: Scene, moved: string[], d: V2): Record<string, XForm> {
  const out: Record<string, XForm> = {};
  const walls = moved.map((id) => scene.elementById[id]).filter((e) => e && !scene.items?.[e.id] && (e.category === "Wall" || e.category === "Partition"));
  for (const E of walls) {
    // tight: what lies within the wall moves with it; wide (1 ft): corner columns and the ends of walls that stop at
    // them are reached too, so joints stay closed
    const T: [number, number, number, number] = [E.min[0] - 0.05, E.min[1] - 0.05, E.max[0] + 0.05, E.max[1] + 0.05];
    const W: [number, number, number, number] = [E.min[0] - 1, E.min[1] - 1, E.max[0] + 1, E.max[1] + 1];
    for (const N of scene.elements) {
      if (moved.includes(N.id) || out[N.id] || scene.items?.[N.id]) continue;
      if (N.layer === "topography" || N.layer === "landscape" || N.category === "Paving" || N.category === "Roof" || N.category === "Truss") continue;
      const zOverlap = N.min[2] < E.max[2] - 0.01 && N.max[2] > E.min[2] + 0.01;
      const below = N.layer === "foundation" && N.max[2] <= E.min[2] + 0.1;
      if (!zOverlap && !below) continue;
      if (N.max[0] < W[0] || N.min[0] > W[2] || N.max[1] < W[1] || N.min[1] > W[3]) continue;
      const inside = N.min[0] >= T[0] && N.max[0] <= T[2] && N.min[1] >= T[1] && N.max[1] <= T[3];
      const cx = (N.min[0] + N.max[0]) / 2;
      const cy = (N.min[1] + N.max[1]) / 2;
      const rigid = RIGID.includes(N.category);
      const move: XForm = { aff: affTranslate(d[0], d[1]), dz: 0 };
      if (inside || (rigid && cx >= W[0] && cx <= W[2] && cy >= W[1] && cy <= W[3])) out[N.id] = appendStage(s.xf[N.id], move);
      else if (!rigid) out[N.id] = appendStage(s.xf[N.id], { ...move, win: W });
    }
  }
  return out;
}

/** Moving a selection by d with everything that is connected adjusting (see the file header). */
export function planMove(s: WsState, scene: Scene, ids: string[], d: V2): { change: Change; skipped: string[]; followed: number } {
  const slides = ids.filter((id) => hostOfOpening(scene, id) && !ids.includes(hostOfOpening(scene, id) as string));
  const rest = ids.filter((id) => !slides.includes(id));
  const base = planTransform(s, scene, rest, { aff: affTranslate(d[0], d[1]) }, false);
  const change: Change = { replace: [...(base.change.replace ?? [])], add: [], remove: [], xf: { ...(base.change.xf ?? {}) } };
  // drawn items: points shared with what moved follow it
  const moved = new Set(rest.filter((id) => scene.items?.[id]));
  for (const it of s.drawn) if (typeof it.p.attach === "string" && moved.has(it.p.attach)) moved.add(it.id);
  const skip = new Set(moved);
  for (const it of s.drawn) if (typeof it.p.host === "string" && moved.has(it.p.host)) skip.add(it.id);
  const moves: { from: V2; to: V2 }[] = [];
  for (const id of moved) {
    const it = scene.items?.[id];
    if (it && !isOpening(it) && it.kind !== "clone") for (const p of it.pts) moves.push({ from: p, to: add2(p, d) });
  }
  const fol = followPoints(s, skip, moves);
  change.replace!.push(...(fol.replace ?? []));
  change.remove!.push(...(fol.remove ?? []));
  // built-in elements: contents of moved walls come along, joined walls and slabs stretch
  const extra = builtInFollow(s, scene, rest, d);
  Object.assign(change.xf!, extra);
  const skipped = [...base.skipped];
  for (const id of slides) {
    const x = slideOpening(s, scene, id, d);
    if (x) change.xf![id] = x;
    else skipped.push(id);
  }
  return { change, skipped, followed: (fol.replace?.length ?? 0) + Object.keys(extra).length };
}

/** Moving one point of a drawn item (a grip): the item reshapes and what shares that point follows. */
export function planGrip(s: WsState, scene: Scene, id: string, index: number, to: V2): Change | null {
  const it = scene.items?.[id];
  if (!it || !it.pts[index]) return null;
  const from = it.pts[index];
  // single-point things, doors and windows, and a circle's centre move as a whole
  if (it.pts.length === 1 || isOpening(it) || (it.kind === "circle" && index === 0) || it.kind === "detail" || it.kind === "clone") return planMove(s, scene, [id], sub2(to, from)).change;
  const next = { ...it, pts: it.pts.map((p, i) => (i === index ? to : p)) };
  const change: Change = { replace: [next], remove: [] };
  if (it.kind === "wall") {
    const re = reanchor(s, it, next);
    change.replace!.push(...re.replace);
    change.remove!.push(...re.remove);
  }
  const skip = new Set([id, ...s.drawn.filter((x) => x.p.host === id).map((x) => x.id)]);
  const fol = followPoints(s, skip, [{ from, to }]);
  change.replace!.push(...(fol.replace ?? []));
  change.remove!.push(...(fol.remove ?? []));
  return change;
}

/** Ghost outlines of ids moved by an affine, for the drag preview (no tool running, so no ToolEnv). */
export function ghostShapes(scene: Scene, ids: string[], aff: Aff): Preview["shapes"] {
  const out: Preview["shapes"] = [];
  for (const id of ids.slice(0, 80)) {
    const it = scene.items?.[id];
    if (it && it.pts.length > 1 && !isOpening(it) && it.kind !== "circle") {
      out.push({ pts: it.pts.map((p) => affApply(aff, p)), closed: !!it.closed || it.kind === "rect", tone: "ghost" });
      continue;
    }
    const el = scene.elementById[id];
    if (!el) continue;
    const box: V2[] = [[el.min[0], el.min[1]], [el.max[0], el.min[1]], [el.max[0], el.max[1]], [el.min[0], el.max[1]]];
    out.push({ pts: box.map((p) => affApply(aff, p)), closed: true, tone: "ghost" });
  }
  return out;
}

/** Commit a drag move (one undo step) and report it in the command line. */
export function commitMove(c: CommandCtx, ids: string[], d: V2): void {
  const s = c.ws.getState();
  const scene = sceneOfState(s);
  // dragging a linked building moves the whole linked project on the parcel
  const links = movedLinks(s, ids.filter(isLinkedId), { aff: [1, 0, 0, 1, d[0], d[1]] }, false, (t, tone) => c.app.getState().toast(t, tone));
  const r = planMove(s, scene, ids.filter((id) => !isLinkedId(id)), d);
  if (r.skipped.length) c.app.getState().toast(`${r.skipped.length} element(s) stayed: gables and roof pieces can't follow that move.`, "warn");
  s.edit("Move", (st) => applyChange(st, links ? { ...r.change, links } : r.change));
  const fmt = (n: number) => `${Math.round(n * 100) / 100}`;
  c.app.getState().log("ok", `✓ Moved ${ids.length} element(s) by ${fmt(d[0])}, ${fmt(d[1])} ft${r.followed ? ` · ${r.followed} connected element(s) adjusted` : ""}`);
}

/** Commit a grip drag (one undo step). */
export function commitGrip(c: CommandCtx, id: string, index: number, to: V2): void {
  const s = c.ws.getState();
  const ch = planGrip(s, sceneOfState(s), id, index, to);
  if (!ch) return;
  s.edit("Reshape", (st) => applyChange(st, ch));
  c.app.getState().log("ok", "✓ Reshaped: the point and everything joined to it moved");
}
