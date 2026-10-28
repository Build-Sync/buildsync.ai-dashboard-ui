/**
 * lib/draw/enclose.ts
 *
 * WHAT   enclosureAt(scene, level, point, hit): the closed boundary around a clicked point, as a polygon. It
 *        first looks for a closed shape the user drew around the point (rectangle, circle, closed polyline, room,
 *        slab, roof, foundation); otherwise it flood-fills the free space of the level: walls, partitions,
 *        columns, door and window leaves and drawn lines are barriers, and the result is the outline of the
 *        reached cells. Returns null when the point is on a barrier or the space leaks out of the drawing.
 * FOR    ROOM (define a room from a click) and HATCH (fill the region around a click) in lib/draw/tools.ts.
 * DEBUG  - "Not a closed boundary": a doorway without a door leaf, or a gap in the drawn lines, lets the fill
 *          escape; close the gap (a door, a wall piece or a line). Cased openings are intentionally open.
 *        - The polygon is about a quarter foot inside the walls: the fill works on a 0.2 ft grid.
 *        - Big drawings: the grid is capped at 260,000 cells; larger areas return null.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { LevelKey, Scene, V2 } from "../scene/types";
import { circlePts, dist2, pointInPoly, polyArea } from "./geom";

const CELL = 0.2;
const MAX_CELLS = 260_000;
const BARRIER_CATS = new Set(["Wall", "Partition", "Column", "Door", "Window"]);

/** Closed outlines of the shapes the user drew on a level, with the id of the item (rooms and hatches left out when `own`). */
function closedShapes(scene: Scene, level: LevelKey, own = false): { id: string; poly: V2[] }[] {
  const out: { id: string; poly: V2[] }[] = [];
  for (const it of Object.values(scene.items ?? {})) {
    if (it.level !== level) continue;
    if (own && (it.kind === "room" || it.kind === "hatch")) continue;
    if (it.kind === "rect" || (it.kind === "polyline" && it.closed) || it.kind === "room" || it.kind === "slab" || it.kind === "roof" || it.kind === "foundation") {
      if (it.pts.length >= 3) out.push({ id: it.id, poly: it.pts });
    } else if (it.kind === "circle" && it.pts.length > 1) out.push({ id: it.id, poly: circlePts(it.pts[0], dist2(it.pts[0], it.pts[1]), 48) });
  }
  return out;
}

/** Plan levels whose walls show on a level's plan. */
const levelsOf = (level: LevelKey): LevelKey[] => (level === "level2" ? ["site", "level2"] : level === "roof" ? ["site", "level2", "roof"] : ["site", "foundation", "level1"]);

/**
 * The polygon around `pt`, or null (see the file header). `refresh` is for a room or hatch re-finding its own
 * boundary: other rooms and hatches are then not boundaries.
 */
export function enclosureAt(scene: Scene, level: LevelKey, pt: V2, hit: string | null, refresh = false): V2[] | null {
  const shapes = closedShapes(scene, level, refresh);
  const direct = hit ? shapes.find((s) => s.id === hit) : undefined;
  if (direct) return direct.poly;
  const inside = shapes.filter((s) => pointInPoly(pt, s.poly)).sort((a, b) => Math.abs(polyArea(a.poly)) - Math.abs(polyArea(b.poly)));
  if (inside.length) return inside[0].poly;
  return floodRoom(scene, level, pt);
}

/** Barrier polygons and segments of a level at the plan cut height. */
function barriers(scene: Scene, level: LevelKey): { polys: V2[][]; segs: [V2, V2][] } {
  const cut = scene.levelZ[level] + 4;
  const lv = new Set(levelsOf(level));
  const polys: V2[][] = [];
  for (const p of scene.prisms) {
    if (p.axis !== "z" || !lv.has(p.level) || !BARRIER_CATS.has(p.category) || p.sectionOnly || p.underground) continue;
    if (p.a0 < cut && p.a1 > cut) polys.push(p.poly);
  }
  const segs: [V2, V2][] = [];
  const addPath = (pts: V2[], closed: boolean) => {
    for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]]);
    if (closed && pts.length > 2) segs.push([pts[pts.length - 1], pts[0]]);
  };
  for (const it of Object.values(scene.items ?? {})) {
    if (it.level !== level) continue;
    if (it.kind === "line" || it.kind === "polyline" || it.kind === "rect" || it.kind === "spline") addPath(it.pts, it.kind === "rect" || !!it.closed);
    else if (it.kind === "circle" && it.pts.length > 1) addPath(circlePts(it.pts[0], dist2(it.pts[0], it.pts[1]), 48), true);
  }
  return { polys, segs };
}

function floodRoom(scene: Scene, level: LevelKey, pt: V2): V2[] | null {
  const { polys, segs } = barriers(scene, level);
  if (!polys.length && !segs.length) return null;
  const f = scene.footprint;
  let x0 = Math.min(f.x0, pt[0]);
  let y0 = Math.min(f.y0, pt[1]);
  let x1 = Math.max(f.x1, pt[0]);
  let y1 = Math.max(f.y1, pt[1]);
  for (const poly of polys) for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  for (const [a, b] of segs) for (const [x, y] of [a, b]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  x0 -= 3; y0 -= 3; x1 += 3; y1 += 3;
  const W = Math.ceil((x1 - x0) / CELL);
  const H = Math.ceil((y1 - y0) / CELL);
  if (W * H > MAX_CELLS) return null;
  const wall = new Uint8Array(W * H);
  const cx = (x: number) => Math.floor((x - x0) / CELL);
  const cy = (y: number) => Math.floor((y - y0) / CELL);
  const mark = (x: number, y: number) => {
    const i = cx(x);
    const j = cy(y);
    if (i >= 0 && i < W && j >= 0 && j < H) wall[j * W + i] = 1;
  };
  const edge = (a: V2, b: V2) => {
    const n = Math.max(1, Math.ceil(dist2(a, b) / (CELL / 2)));
    for (let k = 0; k <= n; k++) mark(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n);
  };
  for (const poly of polys) {
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const [x, y] of poly) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
    for (let j = Math.max(0, cy(by0)); j <= Math.min(H - 1, cy(by1)); j++)
      for (let i = Math.max(0, cx(bx0)); i <= Math.min(W - 1, cx(bx1)); i++) if (pointInPoly([x0 + (i + 0.5) * CELL, y0 + (j + 0.5) * CELL], poly)) wall[j * W + i] = 1;
    for (let i = 0; i < poly.length; i++) edge(poly[i], poly[(i + 1) % poly.length]);
  }
  for (const [a, b] of segs) edge(a, b);

  const si = cx(pt[0]);
  const sj = cy(pt[1]);
  if (si < 0 || si >= W || sj < 0 || sj >= H || wall[sj * W + si]) return null;
  const fill = new Uint8Array(W * H);
  const stack: number[] = [sj * W + si];
  fill[sj * W + si] = 1;
  while (stack.length) {
    const c = stack.pop() as number;
    const i = c % W;
    const j = (c - i) / W;
    if (i === 0 || j === 0 || i === W - 1 || j === H - 1) return null; // leaked out of the drawing
    for (const n of [c - 1, c + 1, c - W, c + W]) {
      if (!wall[n] && !fill[n]) {
        fill[n] = 1;
        stack.push(n);
      }
    }
  }

  /* outline: directed boundary edges around the filled cells, chained into loops */
  const key = (i: number, j: number) => j * (W + 1) + i;
  const next = new Map<number, number[]>();
  const add = (ai: number, aj: number, bi: number, bj: number) => {
    const k = key(ai, aj);
    next.set(k, [...(next.get(k) ?? []), key(bi, bj)]);
  };
  const filled = (i: number, j: number) => i >= 0 && i < W && j >= 0 && j < H && fill[j * W + i] === 1;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      if (!fill[j * W + i]) continue;
      if (!filled(i, j - 1)) add(i, j, i + 1, j);
      if (!filled(i + 1, j)) add(i + 1, j, i + 1, j + 1);
      if (!filled(i, j + 1)) add(i + 1, j + 1, i, j + 1);
      if (!filled(i - 1, j)) add(i, j + 1, i, j);
    }
  const world = (k: number): V2 => [x0 + (k % (W + 1)) * CELL, y0 + Math.floor(k / (W + 1)) * CELL];
  let best: V2[] = [];
  let bestArea = 0;
  while (next.size) {
    const start = next.keys().next().value as number;
    const loop: number[] = [start];
    let cur = start;
    for (let guard = 0; guard < MAX_CELLS * 4; guard++) {
      const outs = next.get(cur);
      if (!outs || !outs.length) break;
      const nx = outs.shift() as number;
      if (!outs.length) next.delete(cur);
      cur = nx;
      if (cur === start) break;
      loop.push(cur);
    }
    const poly = loop.map(world);
    const a = Math.abs(polyArea(poly));
    if (a > bestArea) {
      bestArea = a;
      best = poly;
    }
    next.delete(start);
  }
  if (best.length < 3) return null;
  // drop points in the middle of straight runs
  const out: V2[] = [];
  for (let i = 0; i < best.length; i++) {
    const p = best[(i + best.length - 1) % best.length];
    const q = best[i];
    const r = best[(i + 1) % best.length];
    if (Math.abs((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])) > 1e-9) out.push(q);
  }
  return out.length >= 3 ? out : null;
}
