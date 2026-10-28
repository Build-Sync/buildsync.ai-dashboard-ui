/**
 * lib/elevation.ts
 *
 * WHAT   The geometry of elevations that are not just North, South, East or West:
 *        - a line elevation: two points A → B at any angle (a diagonal façade, a property line); the viewer stands on
 *          one side of the line and looks across it, everything behind the viewer is left out (lineView);
 *        - a circular elevation: a centre and a radius (and a sweep, 360° for the full circle); the viewer walks
 *          around the circle looking in, and the views are laid side by side as one developed (unrolled) strip
 *          (arcFacets: one straight facet per 30°, or less);
 *        - the numbers the tool bar and the sheet show and edit: the angle and length of a line, the radius of a
 *          circle, and points rebuilt from them (lineFrom, compassName).
 * FOR    The Elevation tool (VIEWELEV in lib/draw/tools.ts) stores a mark (drawn item "elevline" or "elevarc") and a
 *        sheet; SheetView draws the sheet from the mark, so dragging the mark's grips or typing an angle or radius
 *        updates the elevation at once.
 * DEBUG  - The view looks the wrong way: `look` (+1 = the left of A → B, −1 = the right); the tool picks it from the
 *          third click, or towards the building when Enter is pressed.
 *        - Bearings: the camera bearing is the compass direction from the building to the viewer (0 = the viewer is
 *          north, looking south), as in lib/scene/camera.ts.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { V2 } from "./scene/types";

/** A line elevation: from A to B, looking to the left of A → B (look 1) or to the right (−1). */
export interface ElevLine {
  a: V2;
  b: V2;
  look: 1 | -1;
}

/** A circular elevation: centre, radius, the angle it starts at (degrees, counter-clockwise from east) and its sweep. */
export interface ElevArc {
  c: V2;
  r: number;
  start: number;
  sweep: number;
}

const len = (v: V2) => Math.hypot(v[0], v[1]);
const norm360 = (d: number) => ((d % 360) + 360) % 360;

/** What a line elevation sees: the viewing direction, the plane that keeps what lies beyond the line, the camera bearing and the screen-right direction along the line. */
export function lineView(e: ElevLine): { v: V2; plane: { n: V2; d: number }; bearing: number; right: V2 } {
  const dx = e.b[0] - e.a[0];
  const dy = e.b[1] - e.a[1];
  const L = Math.hypot(dx, dy) || 1;
  const dir: V2 = [dx / L, dy / L];
  // the left normal of A → B, flipped for look = −1
  const v: V2 = [-dir[1] * e.look, dir[0] * e.look];
  const bearing = norm360((Math.atan2(-v[0], -v[1]) * 180) / Math.PI);
  const b = (bearing * Math.PI) / 180;
  return { v, plane: { n: v, d: v[0] * e.a[0] + v[1] * e.a[1] }, bearing, right: [-Math.cos(b), Math.sin(b)] };
}

/** Which side of A → B a point is on: 1 = left, −1 = right. */
export function sideOf(a: V2, b: V2, p: V2): 1 | -1 {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0 ? 1 : -1;
}

/** The straight facets of a circular elevation, left to right as the viewer walks counter-clockwise looking in. */
export function arcFacets(e: ElevArc, maxStep = 30): ElevLine[] {
  const sweep = Math.max(10, Math.min(360, e.sweep));
  const n = Math.max(2, Math.min(36, Math.ceil(sweep / maxStep)));
  const out: ElevLine[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = ((e.start + (sweep * i) / n) * Math.PI) / 180;
    const t1 = ((e.start + (sweep * (i + 1)) / n) * Math.PI) / 180;
    // counter-clockwise chords: their left side faces the centre, so look = 1 looks in
    out.push({ a: [e.c[0] + e.r * Math.cos(t0), e.c[1] + e.r * Math.sin(t0)], b: [e.c[0] + e.r * Math.cos(t1), e.c[1] + e.r * Math.sin(t1)], look: 1 });
  }
  return out;
}

/** The angle of A → B in degrees (counter-clockwise from east, 0–360) and its length. */
export function lineAngleLength(a: V2, b: V2): { angle: number; length: number } {
  return { angle: norm360((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI), length: len([b[0] - a[0], b[1] - a[1]]) };
}

/** The end point at an angle (degrees, counter-clockwise from east) and length from A. */
export function lineFrom(a: V2, angle: number, length: number): V2 {
  const t = (angle * Math.PI) / 180;
  return [a[0] + Math.cos(t) * length, a[1] + Math.sin(t) * length];
}

/** The nearest compass direction for a bearing ("North", "North-East" …): the side of the building the viewer stands on. */
export function compassName(bearing: number): string {
  const names = ["North", "North-East", "East", "South-East", "South", "South-West", "West", "North-West"];
  return names[Math.round(norm360(bearing) / 45) % 8];
}

/** An elevation mark (a drawn item's points and parameters) as a line or a circle; null when it is neither. */
export function elevOfMark(kind: string, pts: V2[], p: Record<string, unknown>): { line?: ElevLine; arc?: ElevArc } | null {
  if (kind === "elevline" && pts.length >= 2) return { line: { a: pts[0], b: pts[1], look: p.look === -1 ? -1 : 1 } };
  if (kind === "elevarc" && pts.length >= 2) {
    const r = len([pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]]);
    if (r < 0.5) return null;
    const start = norm360((Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]) * 180) / Math.PI);
    return { arc: { c: pts[0], r, start, sweep: typeof p.sweep === "number" ? p.sweep : 360 } };
  }
  return null;
}
