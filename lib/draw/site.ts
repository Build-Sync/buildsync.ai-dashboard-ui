/**
 * lib/draw/site.ts
 *
 * WHAT   The shapes of the things placed on a site, as parts (lib/draw/parts.ts), in project feet with heights above
 *        the finished grade:
 *        - poolParts: a pool (rectangle, oval or freeform) with its water, coping, deck and the buried shell;
 *        - rockParts: a boulder or a cluster of them, irregular and stacked so they read as stone;
 *        - flowerBedParts: a mulch bed filled with flowering clumps in mixed colours and green foliage;
 *        - gravelBedParts: a bed of gravel (or river rock) with its texture;
 *        - roadParts / sidewalkParts: asphalt with lane lines, curb and gutter, sidewalks with control joints;
 *        - signParts / signalParts: a road sign on its post (stop, yield, speed limit, street name, no parking) and
 *          a traffic light on a mast arm with its three lamps;
 *        - drainParts: a curb inlet with its catch basin, an area drain, a trench drain;
 *        - gutterParts: a gutter along an eave with downspouts and splash blocks;
 *        - fenceParts: a fence (wood privacy, picket, chain link, wrought iron, vinyl) or a masonry garden wall.
 *        offsetLine / ribbon / dashes / offsetPolygon are the line helpers they share.
 * FOR    lib/draw/compose.ts (the pool, rock, road … items) and the site tools in lib/draw/tools.ts.
 * DEBUG  - A road corner looks pinched: offsetLine uses mitred corners limited to 3× the offset; very sharp turns
 *          are cut back.
 *        - The same rock looks different after a reload: the shape is seeded from the item's id (seeded()).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { V2 } from "../scene/types";
import { box, disc, place, ring, type Look, type Part } from "./parts";

/* ── small geometry ───────────────────────────────────────────────────── */
const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]];
const mul = (a: V2, k: number): V2 => [a[0] * k, a[1] * k];
const len = (a: V2) => Math.hypot(a[0], a[1]);
const unit = (a: V2): V2 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
/** The left normal of a direction. */
const left = (d: V2): V2 => [-d[1], d[0]];

/** A polyline moved sideways by `d` (positive = to the left of its direction), with mitred corners. */
export function offsetLine(pts: V2[], d: number): V2[] {
  if (pts.length < 2) return pts;
  const out: V2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[i];
    const c = pts[Math.min(pts.length - 1, i + 1)];
    const n0 = i > 0 ? left(unit(sub(b, a))) : null;
    const n1 = i < pts.length - 1 ? left(unit(sub(c, b))) : null;
    if (!n0 || !n1) {
      out.push(add(b, mul((n0 ?? n1)!, d)));
      continue;
    }
    const m = unit(add(n0, n1));
    const cos = m[0] * n1[0] + m[1] * n1[1];
    const k = Math.min(3, 1 / Math.max(0.2, cos));
    out.push(add(b, mul(m, d * k)));
  }
  return out;
}

/** A band `w` wide along a polyline, as one outline. */
export const ribbon = (pts: V2[], w: number): V2[] => [...offsetLine(pts, w / 2), ...offsetLine(pts, -w / 2).reverse()];

/** The pieces of a polyline that are "on" in a dash pattern (dash, gap), each as its own short polyline. */
export function dashes(pts: V2[], dash: number, gap: number): V2[][] {
  const out: V2[][] = [];
  let on = true;
  let left0 = dash;
  let cur: V2[] = [pts[0]];
  for (let i = 0; i + 1 < pts.length; i++) {
    let a = pts[i];
    const b = pts[i + 1];
    let segLeft = len(sub(b, a));
    const dir = unit(sub(b, a));
    while (segLeft > 1e-9) {
      const step = Math.min(segLeft, left0);
      const p = add(a, mul(dir, step));
      if (on) cur.push(p);
      segLeft -= step;
      left0 -= step;
      a = p;
      if (left0 <= 1e-9) {
        if (on && cur.length > 1) out.push(cur);
        on = !on;
        left0 = on ? dash : gap;
        cur = [a];
      }
    }
  }
  if (on && cur.length > 1) out.push(cur);
  return out;
}

/** A closed outline moved outwards by `d` (counter-clockwise outlines; mitred corners). */
export function offsetPolygon(poly: V2[], d: number): V2[] {
  const n = poly.length;
  const area = poly.reduce((s, p, i) => s + (p[0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * p[1]), 0);
  const sign = area >= 0 ? -1 : 1;
  return poly.map((b, i) => {
    const a = poly[(i - 1 + n) % n];
    const c = poly[(i + 1) % n];
    const n0 = mul(left(unit(sub(b, a))), sign);
    const n1 = mul(left(unit(sub(c, b))), sign);
    const m = unit(add(n0, n1));
    const cos = m[0] * n1[0] + m[1] * n1[1];
    return add(b, mul(m, d * Math.min(3, 1 / Math.max(0.2, cos))));
  });
}

/** Is a point inside an outline? */
export function inside(p: V2, poly: V2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** A repeatable random number generator from a text seed (an item's id), so a shape is the same every time. */
export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Parts moved to a point and turned. */
const at = (parts: Part[], c: V2, rot: number) => place(parts, rot, c[0], c[1]);

/* ── pools ────────────────────────────────────────────────────────────── */
/** The shapes a pool can have. */
export const POOL_SHAPES = ["rectangle", "oval", "freeform", "lshape"] as const;
/** One pool shape. */
export type PoolShape = (typeof POOL_SHAPES)[number];

/** The water's outline of a pool, centred on the origin, length along x. */
export function poolOutline(shape: PoolShape, L: number, W: number): V2[] {
  if (shape === "oval") return Array.from({ length: 28 }, (_, i) => [(L / 2) * Math.cos((2 * Math.PI * i) / 28), (W / 2) * Math.sin((2 * Math.PI * i) / 28)] as V2);
  if (shape === "freeform") {
    // a kidney: an oval pinched on one long side
    return Array.from({ length: 32 }, (_, i) => {
      const t = (2 * Math.PI * i) / 32;
      const pinch = 1 - 0.32 * Math.max(0, Math.sin(t)) ** 3 * Math.cos(t * 2) ** 2;
      return [(L / 2) * Math.cos(t), (W / 2) * Math.sin(t) * (Math.sin(t) > 0 ? pinch : 1)] as V2;
    });
  }
  if (shape === "lshape") {
    const a = L / 2;
    const b = W / 2;
    return [[-a, -b], [a, -b], [a, b * 0.1], [a * 0.2, b * 0.1], [a * 0.2, b], [-a, b]];
  }
  return [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]];
}

/** A pool: water a little above grade, a coping band, a deck around it, and the shell below ground. */
export function poolParts(c: V2, rot: number, shape: PoolShape, L: number, W: number, depth: number, deck: number): Part[] {
  const water = poolOutline(shape, L, W);
  const lip = offsetPolygon(water, 0.35);
  const coping = offsetPolygon(water, 1.25);
  const parts: Part[] = [
    { poly: water, z0: 0, z1: 0.06, look: "water" },
    // the waterline tiles, a band just inside the coping
    ...ring(water, lip, 0, 0.1, "chrome"),
    ...ring(lip, coping, 0, 0.28, "concrete"),
    // the shell and the water in it, below ground (sections, X-ray, Below Grade)
    { poly: offsetPolygon(water, 0.6), z0: -depth - 0.6, z1: -0.35, look: "concrete", under: true },
    { poly: water, z0: -depth, z1: -0.3, look: "water", under: true, glass: true },
  ];
  if (deck > 0) parts.push(...ring(coping, offsetPolygon(water, 1.25 + deck), 0, 0.15, "deck").map((p) => ({ ...p, pattern: "speckle" })));
  return at(parts, c, rot);
}

/* ── rocks, gravel and flowers ────────────────────────────────────────── */
/** An irregular outline of `n` corners about the origin, radius r ± 30 %. */
function blob(rand: () => number, r: number, n = 9, rx = 1, ry = 1): V2[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n + rand() * 0.35;
    const k = r * (0.72 + rand() * 0.42);
    return [Math.cos(a) * k * rx, Math.sin(a) * k * ry] as V2;
  });
}

/**
 * One boulder (size = its width, ft) or a cluster of `count`. Each is one irregular outline stacked in tiers that
 * narrow towards the top and lean a little to one side, so it reads as a rounded stone rather than a pile of slabs.
 */
export function rockParts(c: V2, size: number, count: number, seed: string): Part[] {
  const rand = seeded(seed);
  const parts: Part[] = [];
  const profile = [1, 0.96, 0.86, 0.68, 0.4];
  for (let k = 0; k < Math.max(1, Math.min(7, count)); k++) {
    const s = k ? size * (0.45 + rand() * 0.4) : size;
    const off: V2 = k ? [Math.cos(k * 2.4) * size * 0.75, Math.sin(k * 2.4) * size * 0.65] : [0, 0];
    const h = s * (0.45 + rand() * 0.2);
    const outline = blob(rand, s / 2, 11, 1, 0.75 + rand() * 0.4);
    const lean: V2 = [(rand() - 0.5) * s * 0.2, (rand() - 0.5) * s * 0.2];
    profile.forEach((rk, i) => {
      const shift = add(off, mul(lean, i / profile.length));
      parts.push({ poly: outline.map((q) => add(mul(q, rk), shift)), z0: (h * i) / profile.length, z1: (h * (i + 1)) / profile.length, look: "rock" });
    });
  }
  return at(parts, c, 0);
}

/** A gravel or river-rock bed over an outline. */
export const gravelBedParts = (poly: V2[], rock: boolean): Part[] => [{ poly, z0: 0, z1: 0.18, look: rock ? "rock" : "paving", pattern: rock ? "gravel" : "sand" }];

/** The flower colours a bed can have. */
export const FLOWER_MIXES: Record<string, Look[]> = {
  mixed: ["flowerRed", "flowerYellow", "flowerPurple", "flowerWhite"],
  warm: ["flowerRed", "flowerYellow"],
  cool: ["flowerPurple", "flowerWhite"],
  white: ["flowerWhite"],
};

/**
 * A flower bed: mulch over the outline and flowering clumps about a foot apart (jittered so they look planted, not
 * gridded), the colours of the mix among green foliage. h is the height of the tallest plants.
 */
export function flowerBedParts(poly: V2[], h: number, mix: string, seed: string): Part[] {
  const rand = seeded(seed);
  const colours = FLOWER_MIXES[mix] ?? FLOWER_MIXES.mixed;
  const parts: Part[] = [{ poly, z0: 0, z1: 0.18, look: "mulch", pattern: "loam" }];
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const step = 1.05;
  let n = 0;
  for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys) && n < 160; y += step * 0.9) {
    for (let x = Math.min(...xs) + step / 2 + ((Math.round(y / step) % 2) * step) / 2; x < Math.max(...xs) && n < 160; x += step) {
      const p: V2 = [x + (rand() - 0.5) * 0.45, y + (rand() - 0.5) * 0.45];
      if (!inside(p, poly)) continue;
      n++;
      const r = 0.32 + rand() * 0.16;
      const top = 0.18 + h * (0.55 + rand() * 0.45);
      // a green mound with the flowers on top
      parts.push({ ...disc(p[0], p[1], r * 1.15, 0.18, top * 0.75, "foliage", 7) });
      if (rand() < 0.82) parts.push({ ...disc(p[0] + (rand() - 0.5) * 0.1, p[1] + (rand() - 0.5) * 0.1, r * 0.8, top * 0.75, top, colours[Math.floor(rand() * colours.length)], 6) });
    }
  }
  return parts;
}

/* ── roads, sidewalks, signs, signals, drains ─────────────────────────── */
/** What a road has besides its asphalt. */
export interface RoadSpec {
  /** pavement width, ft (two lanes of 12 ft = 24) */
  width: number;
  /** curb and gutter along both edges */
  curb: boolean;
  /** sidewalks: none, one side (left of the drawing direction), or both */
  walks: "none" | "left" | "both";
  /** a double yellow centre line, or a dashed white one between lanes going the same way */
  centre: "double" | "dashed" | "none";
}

/** A road along a centre line: asphalt, centre and edge lines, curb and gutter, a planting strip and sidewalks. */
export function roadParts(pts: V2[], r: RoadSpec): Part[] {
  const w = r.width;
  const parts: Part[] = [{ poly: ribbon(pts, w), z0: 0, z1: 0.08, look: "asphalt" }];
  const paint = (line: V2[], look: Look) => parts.push({ poly: ribbon(line, 0.33), z0: 0.08, z1: 0.095, look });
  if (r.centre === "double") {
    paint(offsetLine(pts, 0.35), "stripeYellow");
    paint(offsetLine(pts, -0.35), "stripeYellow");
  } else if (r.centre === "dashed") for (const d of dashes(pts, 10, 30)) paint(d, "stripeWhite");
  for (const side of [1, -1]) paint(offsetLine(pts, side * (w / 2 - 0.9)), "stripeWhite");
  if (r.curb) {
    for (const side of [1, -1]) {
      parts.push({ poly: ribbon(offsetLine(pts, side * (w / 2 + 0.75)), 1.5), z0: 0, z1: 0.1, look: "concrete" });
      parts.push({ poly: ribbon(offsetLine(pts, side * (w / 2 + 1.75)), 0.5), z0: 0, z1: 0.5, look: "concrete" });
    }
  }
  const walkSides = r.walks === "both" ? [1, -1] : r.walks === "left" ? [1] : [];
  for (const side of walkSides) parts.push(...sidewalkParts(offsetLine(pts, side * (w / 2 + (r.curb ? 2 : 0) + 3 + 2.5)), 5));
  return parts;
}

/** A concrete sidewalk `w` wide along a line, with control joints every 5 ft. */
export function sidewalkParts(pts: V2[], w: number): Part[] {
  const parts: Part[] = [{ poly: ribbon(pts, w), z0: 0, z1: 0.33, look: "concrete" }];
  let run = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const L = len(sub(b, a));
    const dir = unit(sub(b, a));
    const n = left(dir);
    for (let s = 5 - (run % 5); s < L - 0.5; s += 5) {
      const c = add(a, mul(dir, s));
      parts.push({ poly: [add(c, mul(n, w / 2)), add(add(c, mul(n, w / 2)), mul(dir, 0.06)), add(add(c, mul(n, -w / 2)), mul(dir, 0.06)), add(c, mul(n, -w / 2))], z0: 0.33, z1: 0.335, look: "asphalt" });
    }
    run += L;
  }
  return parts;
}

/** The kinds of road sign. */
export const SIGN_TYPES = ["stop", "yield", "speed", "street", "noparking", "oneway"] as const;
/** One kind of road sign. */
export type SignType = (typeof SIGN_TYPES)[number];

/**
 * A road sign on a 7 ft post, its face turned to `rot`. The face is built from thin horizontal bands, so a stop sign
 * reads as an octagon and a yield sign as a triangle from the road.
 */
export function signParts(c: V2, rot: number, type: SignType): Part[] {
  const post = [box(-0.06, -0.06, 0.06, 0.06, 0, type === "street" ? 9 : 8, "metal")];
  const face = (bands: [number, number, number][], look: Look, y0 = -0.14, y1 = -0.08): Part[] => bands.map(([w, z0, z1]) => box(-w / 2, y0, w / 2, y1, z0, z1, look));
  let parts: Part[];
  const base = 6;
  if (type === "stop") {
    const s = 2.5;
    parts = face([[s * 0.42, base, base + s * 0.29], [s, base + s * 0.29, base + s * 0.71], [s * 0.42, base + s * 0.71, base + s]], "signRed");
    parts.push(box(-s * 0.32, -0.15, s * 0.32, -0.14, base + s * 0.4, base + s * 0.6, "signWhite"));
  } else if (type === "yield") {
    const s = 3;
    parts = face([[s * 0.2, base, base + 0.6], [s * 0.45, base + 0.6, base + 1.2], [s * 0.7, base + 1.2, base + 1.8], [s, base + 1.8, base + 2.4]], "signRed");
    parts.push(box(-s * 0.3, -0.15, s * 0.3, -0.14, base + 1.5, base + 2.1, "signWhite"));
  } else if (type === "speed") {
    parts = [box(-1, -0.14, 1, -0.08, base, base + 2.5, "signWhite"), box(-0.55, -0.15, 0.55, -0.14, base + 0.4, base + 1.5, "screen")];
  } else if (type === "noparking") {
    parts = [box(-0.75, -0.14, 0.75, -0.08, base, base + 2, "signWhite"), box(-0.5, -0.15, 0.5, -0.14, base + 0.5, base + 1.5, "signRed")];
  } else if (type === "oneway") {
    parts = [box(-1.5, -0.14, 1.5, -0.08, base + 1.2, base + 1.8, "screen"), box(-1.1, -0.15, 0.9, -0.14, base + 1.4, base + 1.6, "signWhite")];
  } else {
    // two street-name blades across each other at the top of the post
    parts = [box(-1.5, -0.04, 1.5, 0.04, base + 2.4, base + 2.9, "signGreen"), box(-0.04, -1.5, 0.04, 1.5, base + 2.95, base + 3.45, "signGreen")];
  }
  return at([...post, ...parts], c, rot);
}

/**
 * A traffic light: a pole, a mast arm reaching `arm` ft over the road, and signal heads facing the traffic (-y of
 * the arm), each with red, amber and green lamps.
 */
export function signalParts(c: V2, rot: number, arm: number): Part[] {
  const parts: Part[] = [disc(0, 0, 0.35, 0, 20, "metal", 12), disc(0, 0, 0.9, 0, 0.4, "concrete", 12), box(0, -0.25, arm, 0.25, 18, 18.6, "metal")];
  for (const k of arm > 16 ? [0.45, 0.8] : [0.7]) {
    const x = arm * k;
    parts.push(box(x - 0.08, -0.08, x + 0.08, 0.08, 17.2, 18, "metal"));
    parts.push(box(x - 0.55, -0.45, x + 0.55, 0.45, 13.6, 17.2, "screen"));
    const lamps: [Look, number][] = [["lampRed", 16], ["lampAmber", 14.95], ["lampGreen", 13.9]];
    for (const [look, z] of lamps) parts.push(disc(x, -0.5, 0.36, z, z + 0.85, look, 10));
  }
  return at(parts, c, rot);
}

/** The kinds of drain. */
export const DRAIN_TYPES = ["inlet", "area", "trench"] as const;
/** One kind of drain. */
export type DrainType = (typeof DRAIN_TYPES)[number];

/** A storm drain: a curb inlet with a grate and the catch basin under it, a round area drain, or a trench drain. */
export function drainParts(c: V2, rot: number, type: DrainType, length = 8): Part[] {
  if (type === "area") return at([disc(0, 0, 0.55, -0.02, 0.03, "metal", 16), ...[-0.3, -0.1, 0.1, 0.3].map((x) => box(x - 0.03, -0.45, x + 0.03, 0.45, 0.03, 0.05, "screen")), { ...disc(0, 0, 0.6, -3, -0.1, "concrete", 12), under: true }], c, rot);
  if (type === "trench") {
    const parts: Part[] = [box(-length / 2, -0.35, length / 2, 0.35, -0.02, 0.03, "metal")];
    for (let x = -length / 2 + 0.25; x < length / 2; x += 0.4) parts.push(box(x - 0.04, -0.28, x + 0.04, 0.28, 0.03, 0.05, "screen"));
    parts.push({ ...box(-length / 2, -0.45, length / 2, 0.45, -1.2, -0.05, "concrete"), under: true });
    return at(parts, c, rot);
  }
  const parts: Part[] = [box(-1.5, -1, 1.5, 1, -0.02, 0.04, "metal")];
  for (let x = -1.3; x <= 1.31; x += 0.32) parts.push(box(x - 0.05, -0.85, x + 0.05, 0.85, 0.04, 0.07, "screen"));
  parts.push({ ...box(-2, -2, 2, 2, -5, -0.1, "concrete"), under: true });
  return at(parts, c, rot);
}

/**
 * A K-style gutter along an eave from a to b (z = the eave's height), hung on the outside (`out` is the unit
 * vector away from the building), with a downspout, elbow and splash block at each end that is listed.
 */
export function gutterParts(a: V2, b: V2, z: number, out: V2, grade: number, ends: ("a" | "b")[]): Part[] {
  const dir = unit(sub(b, a));
  const off = mul(out, 0.25);
  const a1 = add(a, off);
  const b1 = add(b, off);
  const parts: Part[] = [{ poly: ribbon([a1, b1], 0.42), z0: z - 0.45, z1: z - 0.05, look: "gutter" }];
  for (const e of ends) {
    const p = e === "a" ? add(a1, mul(dir, 0.6)) : add(b1, mul(dir, -0.6));
    const sq = (c: V2, s: number): V2[] => [add(c, [-s, -s]), add(c, [s, -s]), add(c, [s, s]), add(c, [-s, s])];
    parts.push({ poly: sq(p, 0.13), z0: grade + 0.5, z1: z - 0.4, look: "gutter" });
    const kick = add(p, mul(out, 0.45));
    parts.push({ poly: ribbon([p, kick], 0.24), z0: grade + 0.3, z1: grade + 0.55, look: "gutter" });
    parts.push({ poly: ribbon([kick, add(kick, mul(out, 2))], 1), z0: grade, z1: grade + 0.12, look: "concrete" });
  }
  return parts;
}

/* ── fences and garden walls ──────────────────────────────────────────── */
/** The kinds of fence, and the masonry garden wall. */
export const FENCE_TYPES = ["privacy", "picket", "chainlink", "iron", "vinyl", "masonry"] as const;
/** One kind of fence. */
export type FenceType = (typeof FENCE_TYPES)[number];
/** The height each kind starts at, ft. */
export const FENCE_HEIGHT: Record<FenceType, number> = { privacy: 6, picket: 3.5, chainlink: 4, iron: 5, vinyl: 6, masonry: 6 };

/** A rectangle `a` long along `dir` and `b` across it, centred on c. */
const rectAt = (c: V2, dir: V2, a: number, b: number): V2[] => {
  const u = mul(dir, a / 2);
  const v = mul(left(dir), b / 2);
  return [sub(sub(c, u), v), sub(add(c, u), v), add(add(c, u), v), add(sub(c, u), v)];
};

/** Points along a polyline every `step` ft or less, with the direction of the run there; corners always included. */
function stations(pts: V2[], step: number, ends = true): { at: V2; dir: V2 }[] {
  const out: { at: V2; dir: V2 }[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const L = len(sub(b, a));
    if (L < 1e-6) continue;
    const dir = unit(sub(b, a));
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = i === 0 && ends ? 0 : 1; k <= n; k++) {
      if (!ends && k === n && i + 2 === pts.length) break;
      out.push({ at: add(a, mul(dir, (L * k) / n)), dir });
    }
  }
  return out;
}

/** Pieces spaced `gap` apart along a polyline, between its ends (pickets, balusters), at most `cap` of them. */
function spaced(pts: V2[], gap: number, cap = 900): { at: V2; dir: V2 }[] {
  const total = pts.slice(1).reduce((s, q, i) => s + len(sub(q, pts[i])), 0);
  const g = Math.max(gap, total / cap);
  const out: { at: V2; dir: V2 }[] = [];
  let carry = g / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const L = len(sub(b, a));
    if (L < 1e-6) continue;
    const dir = unit(sub(b, a));
    for (let t = carry; t < L; t += g) out.push({ at: add(a, mul(dir, t)), dir });
    carry = (((carry - L) % g) + g) % g;
  }
  return out;
}

/**
 * A fence or garden wall along a polyline (closed when its last point is its first), `h` ft high: posts at the
 * corners and every few feet, with rails and boards (wood privacy), pickets (picket), a see-through mesh (chain
 * link), balusters (wrought iron), panels (vinyl), or a block wall with a cap and piers (masonry).
 */
export function fenceParts(pts: V2[], type: FenceType, h: number): Part[] {
  if (pts.length < 2) return [];
  const parts: Part[] = [];
  const posts = (step: number, size: number, top: number, look: Look) => {
    for (const s of stations(pts, step)) parts.push({ poly: rectAt(s.at, s.dir, size, size), z0: 0, z1: top, look });
  };
  const rail = (w: number, z0: number, z1: number, look: Look, glass = false) => parts.push({ poly: ribbon(pts, w), z0, z1, look, ...(glass ? { glass: true } : {}) });
  switch (type) {
    case "privacy":
      posts(8, 0.33, h + 0.15, "wood");
      rail(0.06, 0.15, h, "wood");
      rail(0.16, 0.8, 1.1, "darkwood");
      rail(0.16, h - 1.1, h - 0.8, "darkwood");
      rail(0.4, h, h + 0.1, "wood");
      break;
    case "vinyl":
      posts(8, 0.42, h + 0.25, "signWhite");
      rail(0.08, 0.2, h - 0.2, "signWhite");
      rail(0.2, h - 0.2, h, "signWhite");
      rail(0.2, 0.05, 0.2, "signWhite");
      break;
    case "picket":
      posts(8, 0.3, h + 0.15, "signWhite");
      rail(0.08, 0.75, 0.9, "signWhite");
      rail(0.08, h - 0.9, h - 0.75, "signWhite");
      spaced(pts, 0.5).forEach((s, i) => parts.push({ poly: rectAt(add(s.at, mul(left(s.dir), 0.07)), s.dir, 0.25, 0.06), z0: 0.25, z1: h - (i % 2 ? 0 : 0.12), look: "signWhite" }));
      break;
    case "chainlink":
      for (const s of stations(pts, 10)) parts.push(disc(s.at[0], s.at[1], 0.1, 0, h + 0.1, "metal", 10));
      rail(0.14, h - 0.14, h, "metal");
      rail(0.03, 0.12, h - 0.14, "metal", true);
      break;
    case "iron":
      posts(6, 0.2, h + 0.2, "screen");
      rail(0.08, 0.35, 0.45, "screen");
      rail(0.08, h - 0.4, h - 0.3, "screen");
      for (const s of spaced(pts, 0.4)) parts.push({ poly: rectAt(s.at, s.dir, 0.06, 0.06), z0: 0.1, z1: h, look: "screen" });
      break;
    case "masonry":
      rail(0.67, 0, h, "stone");
      rail(0.85, h, h + 0.2, "concrete");
      for (const s of stations(pts, 12)) {
        parts.push({ poly: rectAt(s.at, s.dir, 1.33, 1.33), z0: 0, z1: h + 0.4, look: "stone" });
        parts.push({ poly: rectAt(s.at, s.dir, 1.5, 1.5), z0: h + 0.4, z1: h + 0.58, look: "concrete" });
      }
      break;
  }
  return parts;
}
