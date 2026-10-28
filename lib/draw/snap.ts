/**
 * lib/draw/snap.ts
 *
 * WHAT   Where a click lands: snapPoint turns the raw cursor point into the point a tool uses, the way AutoCAD
 *        does. Object snaps (OSNAP, F3) lock onto end points, mid points, centres, intersections, the
 *        perpendicular foot from the last point and the nearest point on a line, of what is drawn and of the
 *        building (wall centre lines and element outlines). Object snap tracking (OTRACK) keeps a few snap points
 *        the cursor rested on and locks to the horizontal or vertical line through them, so a line can start
 *        level with the midpoint of a wall. Then ORTHO (F8, or hold Shift while drawing) keeps the line
 *        horizontal or vertical from the last point, POLAR (F10) steps the angle, and grid SNAP (F9) rounds.
 *        Also the parsers for typed input: parseLen ("12'-6\"", "6\"", "3.5", "2m", "500mm") and parseTyped
 *        (x,y · @dx,dy · @dist<angle · a surveyor's bearing and distance "N45°30'E 120" · a bare distance in
 *        the direction of the cursor).
 * FOR    ModelViewport (every click and the live cursor, the snap marker and its name) and the command line
 *        (typed points while a tool runs).
 * DEBUG  - A click does not snap: OSNAP must be on (F3) and the mode ticked (the arrow next to OSNAP in the
 *          status bar, or Settings → Grid & Snap). Built-in elements snap to the corners and edge midpoints of
 *          their outline box; walls drawn by the user also snap to the ends and middle of their centre line.
 *        - It snaps to the wrong thing: the closest point snap within about 10 screen pixels wins; perpendicular
 *          and nearest only apply when no end / mid / centre / intersection is in reach.
 *        - A typed number is read in the project's units (feet, metres or millimetres); add ' or " to force
 *          feet and inches. Bearings are true bearings, turned into the plan with the site's north angle.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { dirOfAzimuth, parseBearing } from "../geo";
import type { LevelKey, Scene, V2 } from "../scene/types";
import type { OsnapMode } from "../settings";
import type { MeasureSystem } from "../utils";
import { arcFrom3, arcPts, circlePts, closestOnSeg, dist2, lineIntersect, mid2, segIntersect, splinePts, sub2, unit2 } from "./geom";

/** The status-bar and settings that decide how a point snaps. */
export interface SnapCfg {
  grid: boolean;
  step: number;
  ortho: boolean;
  polar: boolean;
  polarAngle: number;
  osnap: boolean;
  modes: Record<OsnapMode, boolean>;
  /** object snap tracking: lock to the horizontal / vertical through acquired snap points */
  otrack?: boolean;
}

/** What a point snapped to. */
export type SnapKind = "none" | "grid" | "endpoint" | "midpoint" | "center" | "intersection" | "perpendicular" | "nearest" | "ortho" | "polar" | "track";

/** A snapped point, why, and the dotted guide lines to draw (tracking, ortho, polar, perpendicular). */
export interface SnapResult {
  pt: V2;
  kind: SnapKind;
  guides?: [V2, V2][];
}

/** The name AutoCAD shows next to the snap marker. */
export const SNAP_NAME: Record<SnapKind, string> = {
  none: "",
  grid: "Grid",
  endpoint: "Endpoint",
  midpoint: "Midpoint",
  center: "Center",
  intersection: "Intersection",
  perpendicular: "Perpendicular",
  nearest: "Nearest",
  ortho: "Ortho",
  polar: "Polar",
  track: "Tracking",
};

/** Snaps that lock onto a point of an object (and so can be acquired for tracking). */
export const POINT_SNAPS: ReadonlySet<SnapKind> = new Set<SnapKind>(["endpoint", "midpoint", "center", "intersection"]);

type PointMode = "endpoint" | "midpoint" | "center";
interface Candidates {
  pts: { pt: V2; mode: PointMode }[];
  segs: [V2, V2][];
}

const cache = new WeakMap<Scene, Map<LevelKey, Candidates>>();
const CURVED = new Set(["circle", "arc", "spline", "detail"]);
const CLOSED = new Set(["rect", "hatch", "room"]);
const NO_LINES = new Set(["text", "note", "pin", "label", "tag", "elevmark", "image", "dim"]);

/** Snap points and lines of a scene on a level (cached per scene). */
function candidates(scene: Scene, level: LevelKey): Candidates {
  let byLevel = cache.get(scene);
  if (!byLevel) cache.set(scene, (byLevel = new Map()));
  const hit = byLevel.get(level);
  if (hit) return hit;
  const pts: Candidates["pts"] = [];
  const segs: Candidates["segs"] = [];
  const polyline = (ps: V2[], closed: boolean) => {
    for (let i = 1; i < ps.length; i++) segs.push([ps[i - 1], ps[i]]);
    if (closed && ps.length > 2) segs.push([ps[ps.length - 1], ps[0]]);
  };
  const levels: LevelKey[] = level === "level2" ? ["level2"] : level === "roof" ? ["roof", "level2"] : ["level1", "foundation", "site"];
  for (const it of scene.drafts ?? []) {
    if (it.level !== level || !it.pts.length) continue;
    if (CURVED.has(it.kind)) {
      const c = it.pts[0];
      if (it.kind === "circle" || it.kind === "detail") {
        pts.push({ pt: c, mode: "center" });
        if (it.pts[1]) polyline(circlePts(c, dist2(c, it.pts[1]), 64), true);
      } else if (it.kind === "arc" && it.pts.length > 2) {
        const a = arcFrom3(it.pts[0], it.pts[1], it.pts[2]);
        pts.push({ pt: it.pts[0], mode: "endpoint" }, { pt: it.pts[2], mode: "endpoint" });
        if (a) {
          pts.push({ pt: a.c, mode: "center" });
          const ring = arcPts(a, 32);
          pts.push({ pt: ring[16], mode: "midpoint" });
          polyline(ring, false);
        }
      } else {
        pts.push({ pt: it.pts[0], mode: "endpoint" }, { pt: it.pts[it.pts.length - 1], mode: "endpoint" });
        polyline(splinePts(it.pts, 10), false);
      }
      continue;
    }
    const closed = !!it.closed || CLOSED.has(it.kind);
    const lines = !NO_LINES.has(it.kind);
    it.pts.forEach((p, i) => {
      pts.push({ pt: p, mode: "endpoint" });
      if (i > 0 && lines) pts.push({ pt: mid2(it.pts[i - 1], p), mode: "midpoint" });
    });
    if (!lines) continue;
    if (closed && it.pts.length > 2) pts.push({ pt: mid2(it.pts[it.pts.length - 1], it.pts[0]), mode: "midpoint" });
    polyline(it.pts, closed);
  }
  for (const el of scene.elements) {
    if (el.system === "Drafting" || el.layer === "topography" || el.layer === "landscape" || el.category === "Paving" || el.category === "Furniture") continue;
    const item = scene.items?.[el.id];
    if (!levels.includes(item?.level ?? el.level)) continue;
    const [x0, y0] = el.min;
    const [x1, y1] = el.max;
    if (x1 - x0 > 200 || y1 - y0 > 200) continue;
    const box: V2[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    for (const p of box) pts.push({ pt: p, mode: "endpoint" });
    box.forEach((p, i) => pts.push({ pt: mid2(p, box[(i + 1) % 4]), mode: "midpoint" }));
    pts.push({ pt: [(x0 + x1) / 2, (y0 + y1) / 2], mode: "center" });
    polyline(box, true);
    // a wall, beam or run the user drew also snaps to its centre line: its ends and the middle of each segment
    if (item && item.pts.length >= 2 && !item.closed) {
      item.pts.forEach((p, i) => {
        pts.push({ pt: p, mode: "endpoint" });
        if (i > 0) pts.push({ pt: mid2(item.pts[i - 1], p), mode: "midpoint" });
      });
      polyline(item.pts, false);
    }
  }
  const out = { pts, segs };
  byLevel.set(level, out);
  return out;
}

/** The point snap (end, mid, centre, intersection) or line snap (perpendicular, nearest) nearest the cursor, if any. */
function objectSnap(raw: V2, last: V2 | null, c: Candidates, modes: SnapCfg["modes"], tol: number): SnapResult | null {
  let best: SnapResult | null = null;
  let bd = tol;
  for (const p of c.pts) {
    if (!modes[p.mode]) continue;
    const d = dist2(raw, p.pt);
    if (d < bd) {
      bd = d;
      best = { pt: p.pt, kind: p.mode };
    }
  }
  // lines within reach: where they cross, then the perpendicular foot and the nearest point
  const near: [V2, V2][] = [];
  for (const s of c.segs) if (closestOnSeg(raw, s[0], s[1]).d < tol) near.push(s);
  if (modes.intersection && near.length > 1) {
    const n = Math.min(near.length, 40);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const x = segIntersect(near[i][0], near[i][1], near[j][0], near[j][1]);
        if (!x) continue;
        const d = dist2(raw, x.pt);
        // where two joined lines meet is their end point, which is already a candidate
        if (d < bd && !(best && best.kind === "endpoint" && dist2(best.pt, x.pt) < 1e-6)) {
          bd = d;
          best = { pt: x.pt, kind: "intersection" };
        }
      }
  }
  if (best) return best;
  if (modes.perpendicular && last) {
    let pd = tol;
    let perp: SnapResult | null = null;
    for (const [a, b] of near) {
      const foot = lineIntersect(a, b, last, [last[0] - (b[1] - a[1]), last[1] + (b[0] - a[0])]);
      if (!foot || foot.t < -1e-9 || foot.t > 1 + 1e-9) continue;
      const d = dist2(raw, foot.pt);
      if (d < pd && dist2(foot.pt, last) > 1e-6) {
        pd = d;
        perp = { pt: foot.pt, kind: "perpendicular", guides: [[last, foot.pt]] };
      }
    }
    if (perp) return perp;
  }
  if (modes.nearest) {
    let nd = tol;
    let nearest: SnapResult | null = null;
    for (const [a, b] of near) {
      const q = closestOnSeg(raw, a, b);
      if (q.d < nd) {
        nd = q.d;
        nearest = { pt: q.pt, kind: "nearest" };
      }
    }
    if (nearest) return nearest;
  }
  return null;
}

/**
 * The point a click at `raw` lands on. `tol` is the snap reach in feet (about 10 screen pixels); `track` are the
 * snap points acquired for object snap tracking.
 */
export function snapPoint(raw: V2, last: V2 | null, scene: Scene, level: LevelKey, cfg: SnapCfg, tol: number, track: readonly V2[] = []): SnapResult {
  if (cfg.osnap) {
    const hit = objectSnap(raw, last, candidates(scene, level), cfg.modes, tol);
    if (hit) return hit;
  }
  if (cfg.otrack && track.length) {
    // the horizontal and the vertical through an acquired point; through two points, where they cross
    let h: V2 | null = null;
    let v: V2 | null = null;
    let hd = tol;
    let vd = tol;
    for (const t of track) {
      const dy = Math.abs(raw[1] - t[1]);
      const dx = Math.abs(raw[0] - t[0]);
      if (dy < hd) {
        hd = dy;
        h = t;
      }
      if (dx < vd) {
        vd = dx;
        v = t;
      }
    }
    if (h && v && h !== v) {
      const pt: V2 = [v[0], h[1]];
      return { pt, kind: "track", guides: [[h, pt], [v, pt]] };
    }
    const t = h ?? v;
    if (t) {
      const pt: V2 = h ? [raw[0], t[1]] : [t[0], raw[1]];
      if (dist2(pt, t) > 1e-6) return { pt, kind: "track", guides: [[t, pt]] };
    }
  }
  let [x, y] = raw;
  let kind: SnapKind = "none";
  let guides: SnapResult["guides"];
  if (cfg.grid && cfg.step > 0) {
    x = Math.round(x / cfg.step) * cfg.step;
    y = Math.round(y / cfg.step) * cfg.step;
    kind = "grid";
  }
  if (last) {
    const dx = x - last[0];
    const dy = y - last[1];
    if (cfg.ortho) {
      if (Math.abs(dx) >= Math.abs(dy)) y = last[1];
      else x = last[0];
      kind = "ortho";
      guides = [[last, [x, y]]];
    } else if (cfg.polar && Math.hypot(dx, dy) > 1e-6) {
      const step = cfg.polarAngle;
      const a = Math.atan2(dy, dx);
      const q = Math.round((a * 180) / Math.PI / step) * step;
      if (Math.abs(((((a * 180) / Math.PI - q + 540) % 360) - 180)) < 4) {
        const r = Math.hypot(dx, dy);
        x = last[0] + r * Math.cos((q * Math.PI) / 180);
        y = last[1] + r * Math.sin((q * Math.PI) / 180);
        kind = "polar";
        guides = [[last, [x, y]]];
      }
    }
  }
  return guides ? { pt: [x, y], kind, guides } : { pt: [x, y], kind };
}

/* ── typed input ──────────────────────────────────────────────────────── */
/** A length typed by the user, in feet; null when it is not a length. */
export function parseLen(text: string, system: MeasureSystem = "imperial"): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;
  const ftIn = /^(-?\d+(?:\.\d+)?)\s*(?:'|ft)(?:\s*-?\s*(\d+(?:\.\d+)?)\s*(?:"|in)?)?$/.exec(t);
  if (ftIn) return Math.sign(Number(ftIn[1]) || 1) * (Math.abs(Number(ftIn[1])) + (ftIn[2] ? Number(ftIn[2]) / 12 : 0));
  const inch = /^(-?\d+(?:\.\d+)?)\s*(?:"|in)$/.exec(t);
  if (inch) return Number(inch[1]) / 12;
  const mm = /^(-?\d+(?:\.\d+)?)\s*mm$/.exec(t);
  if (mm) return Number(mm[1]) / 304.8;
  const m = /^(-?\d+(?:\.\d+)?)\s*m$/.exec(t);
  if (m) return Number(m[1]) / 0.3048;
  const plain = /^(-?\d+(?:\.\d+)?|-?\.\d+)$/.exec(t);
  if (plain) return system === "imperial" ? Number(plain[1]) : system === "metric-m" ? Number(plain[1]) / 0.3048 : Number(plain[1]) / 304.8;
  return null;
}

/** What typed text means to a tool waiting for a point. */
export type Typed = { kind: "pt"; pt: V2 } | { kind: "dist"; d: number } | null;

/**
 * x,y (absolute) · @dx,dy (from the last point) · @dist<angle or dist<angle (polar from the last point) · a
 * surveyor's bearing and distance from the last point ("N45°30'E 120", "S12d30mW, 40'"; `north` is the site's
 * angle from up-on-the-plan to true north) · a bare distance along `dir` (the direction from the last point to
 * the cursor, ortho-snapped by the caller).
 */
export function parseTyped(text: string, last: V2 | null, dir: V2 | null, system: MeasureSystem = "imperial", north = 0): Typed {
  const t = text.trim();
  if (!t) return null;
  const rel = t.startsWith("@");
  const body = rel ? t.slice(1) : t;
  const base: V2 = rel && last ? last : [0, 0];
  const course = /^([NS].*?[EW])\s*[,\s]\s*(\S.*)$/i.exec(body.trim());
  if (course && last) {
    const az = parseBearing(course[1]);
    const d = parseLen(course[2], system);
    if (az !== null && d !== null) {
      const u = dirOfAzimuth({ north }, az);
      return { kind: "pt", pt: [last[0] + u[0] * d, last[1] + u[1] * d] };
    }
  }
  const polar = /^([^<,]+)<(-?\d+(?:\.\d+)?)$/.exec(body);
  if (polar) {
    const d = parseLen(polar[1], system);
    if (d === null) return null;
    const a = (Number(polar[2]) * Math.PI) / 180;
    const o: V2 = rel || last ? (last ?? [0, 0]) : [0, 0];
    return { kind: "pt", pt: [o[0] + d * Math.cos(a), o[1] + d * Math.sin(a)] };
  }
  const xy = body.split(",");
  if (xy.length === 2) {
    const x = parseLen(xy[0], system);
    const y = parseLen(xy[1], system);
    if (x === null || y === null) return null;
    return { kind: "pt", pt: [base[0] + x, base[1] + y] };
  }
  if (xy.length === 1 && !rel) {
    const d = parseLen(body, system);
    if (d === null) return null;
    if (last && dir) {
      const u = unit2(dir);
      return { kind: "pt", pt: [last[0] + u[0] * d, last[1] + u[1] * d] };
    }
    return { kind: "dist", d };
  }
  return null;
}

/** Unit direction from a to b (east when they coincide). */
export const dirOf = (a: V2, b: V2): V2 => unit2(sub2(b, a));
