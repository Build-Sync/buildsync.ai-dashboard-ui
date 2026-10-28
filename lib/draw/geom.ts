/**
 * lib/draw/geom.ts
 *
 * WHAT   Plain 2D geometry for the drawing tools, no UI and no state: 2D affine transforms (move, rotate, scale,
 *        mirror), vector helpers, segment and line intersection, closest point on a segment, polygon area /
 *        centroid / containment, polyline offset, an arc through three points, circle and spline sampling, and
 *        bounding boxes. Points are [x, y] in feet (X east, Y north), the same as the scene.
 * FOR    lib/draw/compose.ts (turning drawn items into scene geometry), lib/draw/modify.ts (move, rotate, trim,
 *        fillet …), lib/draw/snap.ts and the tool previews all share these functions, so a rotated wall and the
 *        preview of it are computed the same way.
 * DEBUG  - A mirrored shape looks inside out: a mirror has a negative determinant (affDet < 0); callers must
 *          re-wind polygons (compose.ts does it through ccw()).
 *        - offsetPolyline returns the input for a zero distance and drops degenerate (zero-length) segments first.
 *        - lib/draw/geom.test.ts covers every function here; run `npm test`.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { V2 } from "../scene/types";

/** A 2D affine transform [a, b, c, d, e, f]: x' = a·x + c·y + e and y' = b·x + d·y + f. */
export type Aff = [number, number, number, number, number, number];

/** The transform that changes nothing. */
export const IDENT: Aff = [1, 0, 0, 1, 0, 0];

/** Apply a transform to a point. */
export const affApply = (m: Aff, p: V2): V2 => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

/** The transform "first b, then a". */
export const affMul = (a: Aff, b: Aff): Aff => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

/** Determinant of the linear part: negative for a mirror, the area scale otherwise. */
export const affDet = (m: Aff): number => m[0] * m[3] - m[1] * m[2];

/** Uniform scale factor of a transform (the square root of |determinant|). */
export const affScaleOf = (m: Aff): number => Math.sqrt(Math.abs(affDet(m)));

/** Move by (dx, dy). */
export const affTranslate = (dx: number, dy: number): Aff => [1, 0, 0, 1, dx, dy];

/** Rotate by `theta` radians (counter-clockwise) about (cx, cy). */
export function affRotate(theta: number, cx = 0, cy = 0): Aff {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
}

/** Scale by `k` about (cx, cy). */
export const affScale = (k: number, cx = 0, cy = 0): Aff => [k, 0, 0, k, cx - k * cx, cy - k * cy];

/** Mirror across the line through p and q. */
export function affMirror(p: V2, q: V2): Aff {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const l2 = dx * dx + dy * dy || 1;
  const a = (dx * dx - dy * dy) / l2;
  const b = (2 * dx * dy) / l2;
  return [a, b, b, -a, p[0] - a * p[0] - b * p[1], p[1] - b * p[0] + a * p[1]];
}

/** True when the transform keeps axis-aligned shapes axis-aligned (no rotation or shear). */
export const affIsDiagonal = (m: Aff): boolean => Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9;

/** True when the transform is a rotation by a multiple of 90° (with any scale or mirror). */
export const affIsQuarterTurn = (m: Aff): boolean => (Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9) || (Math.abs(m[0]) < 1e-9 && Math.abs(m[3]) < 1e-9);

/* ── vectors ──────────────────────────────────────────────────────────── */
export const add2 = (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]];
export const sub2 = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
export const mul2 = (a: V2, k: number): V2 => [a[0] * k, a[1] * k];
export const dot2 = (a: V2, b: V2): number => a[0] * b[0] + a[1] * b[1];
export const cross2 = (a: V2, b: V2): number => a[0] * b[1] - a[1] * b[0];
export const len2 = (a: V2): number => Math.hypot(a[0], a[1]);
export const dist2 = (a: V2, b: V2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const mid2 = (a: V2, b: V2): V2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export const lerp2 = (a: V2, b: V2, t: number): V2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** Unit vector of `a` ([1, 0] for a zero vector). */
export const unit2 = (a: V2): V2 => {
  const l = len2(a);
  return l < 1e-12 ? [1, 0] : [a[0] / l, a[1] / l];
};
/** The vector turned 90° counter-clockwise. */
export const perp2 = (a: V2): V2 => [-a[1], a[0]];
/** Direction of a vector in degrees, 0° = east, counter-clockwise, in (-180, 180]. */
export const angleDeg = (a: V2): number => (Math.atan2(a[1], a[0]) * 180) / Math.PI;
/** Same point? (within `eps` feet) */
export const same2 = (a: V2, b: V2, eps = 1e-6): boolean => Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;

/** The angle in degrees from direction `a` to direction `b`, 0..360 counter-clockwise. */
export function angleBetween(a: V2, b: V2): number {
  let d = angleDeg(b) - angleDeg(a);
  while (d < 0) d += 360;
  while (d >= 360) d -= 360;
  return d;
}

/* ── segments and lines ───────────────────────────────────────────────── */
/** Closest point of segment ab to p: the point, its parameter t in 0..1 and its distance. */
export function closestOnSeg(p: V2, a: V2, b: V2): { pt: V2; t: number; d: number } {
  const ab = sub2(b, a);
  const l2 = dot2(ab, ab);
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, dot2(sub2(p, a), ab) / l2));
  const pt = lerp2(a, b, t);
  return { pt, t, d: dist2(p, pt) };
}

/** Intersection of the infinite lines ab and cd: the point and the parameters t (along ab) and u (along cd). */
export function lineIntersect(a: V2, b: V2, c: V2, d: V2): { pt: V2; t: number; u: number } | null {
  const r = sub2(b, a);
  const s = sub2(d, c);
  const den = cross2(r, s);
  if (Math.abs(den) < 1e-12) return null;
  const ca = sub2(c, a);
  const t = cross2(ca, s) / den;
  const u = cross2(ca, r) / den;
  return { pt: [a[0] + r[0] * t, a[1] + r[1] * t], t, u };
}

/** Intersection of the segments ab and cd (both parameters within 0..1), or null. */
export function segIntersect(a: V2, b: V2, c: V2, d: V2): { pt: V2; t: number; u: number } | null {
  const hit = lineIntersect(a, b, c, d);
  if (!hit) return null;
  const e = 1e-9;
  return hit.t >= -e && hit.t <= 1 + e && hit.u >= -e && hit.u <= 1 + e ? hit : null;
}

/* ── polygons ─────────────────────────────────────────────────────────── */
/** Signed area (positive = counter-clockwise). */
export function polyArea(pts: V2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Perimeter of a polygon (closed) or polyline (open). */
export function polyLength(pts: V2[], closed: boolean): number {
  let l = 0;
  for (let i = 0; i + 1 < pts.length; i++) l += dist2(pts[i], pts[i + 1]);
  if (closed && pts.length > 2) l += dist2(pts[pts.length - 1], pts[0]);
  return l;
}

/** Centre of area of a polygon (the average of the points for a degenerate one). */
export function polyCentroid(pts: V2[]): V2 {
  const a = polyArea(pts);
  if (Math.abs(a) < 1e-9) return [pts.reduce((s, p) => s + p[0], 0) / (pts.length || 1), pts.reduce((s, p) => s + p[1], 0) / (pts.length || 1)];
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const k = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * k;
    cy += (p[1] + q[1]) * k;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/** Is p inside the polygon? (even-odd rule) */
export function pointInPoly(p: V2, pts: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The smallest axis-aligned box around some points. */
export function bboxOf(pts: V2[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

/** A rectangle as four counter-clockwise points from two opposite corners. */
export const rectPts = (a: V2, b: V2): V2[] => [
  [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
  [Math.max(a[0], b[0]), Math.min(a[1], b[1])],
  [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
  [Math.min(a[0], b[0]), Math.max(a[1], b[1])],
];

/** The four corners of a segment ab thickened to width `t` (centred on the segment), counter-clockwise. */
export function orientedRect(a: V2, b: V2, t: number): V2[] {
  const u = unit2(sub2(b, a));
  const n = mul2(perp2(u), t / 2);
  return [sub2(a, n), sub2(b, n), add2(b, n), add2(a, n)];
}

/* ── offset ───────────────────────────────────────────────────────────── */
/** Drop consecutive duplicate points. */
function dedupe(pts: V2[], closed: boolean): V2[] {
  const out = pts.filter((p, i) => i === 0 || !same2(p, pts[i - 1]));
  if (closed && out.length > 1 && same2(out[0], out[out.length - 1])) out.pop();
  return out;
}

/** A polyline or polygon moved sideways by d (positive = to the left of its direction), with mitred corners. */
export function offsetPolyline(pts: V2[], d: number, closed: boolean): V2[] {
  const p = dedupe(pts, closed);
  const n = p.length;
  if (n < 2 || Math.abs(d) < 1e-12) return p;
  const segs = closed ? n : n - 1;
  const lines: [V2, V2][] = [];
  for (let i = 0; i < segs; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    const nn = mul2(perp2(unit2(sub2(b, a))), d);
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

/* ── curves ───────────────────────────────────────────────────────────── */
/** A circular arc: centre, radius, start and end angle in degrees (counter-clockwise from a0 to a1). */
export interface ArcDef {
  c: V2;
  r: number;
  a0: number;
  a1: number;
}

/** The arc that starts at a, passes through b and ends at c; null when the three points are in a line. */
export function arcFrom3(a: V2, b: V2, c: V2): ArcDef | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a[0] * a[0] + a[1] * a[1];
  const b2 = b[0] * b[0] + b[1] * b[1];
  const c2 = c[0] * c[0] + c[1] * c[1];
  const ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const uy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  const ctr: V2 = [ux, uy];
  const ang = (p: V2) => angleDeg(sub2(p, ctr));
  const aa = ang(a);
  const ac = ang(c);
  const ccw = cross2(sub2(b, a), sub2(c, a)) > 0;
  // sweep from a to c passing through b
  const norm = (x: number) => ((x % 360) + 360) % 360;
  let a0 = aa;
  let a1 = ac;
  if (!ccw) {
    a0 = ac;
    a1 = aa;
  }
  const sweep = norm(a1 - a0);
  return { c: ctr, r: dist2(ctr, a), a0, a1: a0 + (sweep === 0 ? 360 : sweep) };
}

/** Points along an arc, `segs` segments. */
export function arcPts(arc: ArcDef, segs = 32): V2[] {
  const out: V2[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = ((arc.a0 + ((arc.a1 - arc.a0) * i) / segs) * Math.PI) / 180;
    out.push([arc.c[0] + Math.cos(a) * arc.r, arc.c[1] + Math.sin(a) * arc.r]);
  }
  return out;
}

/** Points around a circle (closed: the first point is not repeated). */
export function circlePts(c: V2, r: number, segs = 48): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
  }
  return out;
}

/** A smooth curve through the points (Catmull-Rom), `per` samples per span. */
export function splinePts(pts: V2[], per = 12): V2[] {
  if (pts.length < 3) return pts.slice();
  const out: V2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Shortest distance between two axis-aligned boxes in plan (0 when they overlap). */
export function boxGap(a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }): number {
  const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
  const dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
  return Math.hypot(dx, dy);
}
