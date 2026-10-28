/**
 * lib/importers.ts
 *
 * WHAT   Real file readers for Insert → Import, all in the browser (nothing is uploaded):
 *        - parseDxf: an AutoCAD DXF (ASCII) drawing: LINE, LWPOLYLINE, POLYLINE / VERTEX, CIRCLE, ARC, POINT, TEXT,
 *          MTEXT; its units ($INSUNITS) and layers; dxfItems turns it into drawn lines, polylines, circles, arcs and
 *          text on the plan, scaled to feet and placed where asked;
 *        - survey points: parsePointsText (CSV / TXT: x,y,z or PNEZD with a header), parseLandXml (CgPoints and TIN
 *          surface points, with its units), parseLas (LAS 1.0–1.4 point clouds from drones, thinned);
 *        - terrainFrom: a ground surface from points (an elevation grid by inverse-distance weighting) and its contour
 *          lines (marching squares, joined into polylines) at a chosen interval;
 *        - parseIfc: the elements of an IFC (STEP) model with their extruded solids, placements and units, as plan
 *          outlines with a bottom and top (ifcItems makes them drawn solids).
 * FOR    components/workspace/Modals/ImportModal.tsx. DWG is AutoCAD's closed binary format and LAZ
 *        is compressed: the dialog asks for a DXF / LAS instead.
 * DEBUG  - A DXF arrives tiny or huge: its $INSUNITS is missing or wrong; the dialog lets you pick the units.
 *        - Survey points are in state-plane coordinates (hundreds of thousands of feet): the dialog centres them on
 *          the building and sets the surveyed ground at the building to the finished grade.
 *        - IFC elements made of meshes (breps) come in as their bounding boxes; extrusions keep their outline.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { Category, Contour, V2, V3 } from "./scene/types";

/* ══ DXF ══════════════════════════════════════════════════════════════════ */

/** One DXF entity, in drawing units. */
export interface DxfEntity {
  type: "line" | "polyline" | "circle" | "arc" | "point" | "text";
  layer: string;
  pts: V2[];
  closed?: boolean;
  r?: number;
  /** arc start and end angles, degrees */
  a0?: number;
  a1?: number;
  text?: string;
  h?: number;
}

/** A parsed DXF drawing. */
export interface DxfDrawing {
  entities: DxfEntity[];
  layers: string[];
  /** the drawing's units from $INSUNITS, or null when it does not say */
  units: LengthUnit | null;
  extents: { x0: number; y0: number; x1: number; y1: number } | null;
  skipped: number;
}

/** Length units files come in. */
export type LengthUnit = "in" | "ft" | "mm" | "cm" | "m" | "usft";

/** Feet per unit. */
export const FEET_PER: Record<LengthUnit, number> = { in: 1 / 12, ft: 1, usft: 1200 / 3937 / 0.3048, mm: 1 / 304.8, cm: 1 / 30.48, m: 1 / 0.3048 };

const INSUNITS: Record<number, LengthUnit> = { 1: "in", 2: "ft", 4: "mm", 5: "cm", 6: "m" };

/** Read an ASCII DXF. Binary DXF and DWG are not readable here. */
export function parseDxf(text: string): DxfDrawing {
  const lines = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isFinite(code)) continue;
    pairs.push([code, lines[i + 1].trim()]);
  }
  let units: LengthUnit | null = null;
  const entities: DxfEntity[] = [];
  let skipped = 0;
  let section = "";
  let i = 0;
  const next = () => pairs[i++];
  while (i < pairs.length) {
    const [c, v] = next();
    if (c === 0 && v === "SECTION") {
      section = pairs[i]?.[1] ?? "";
      i++;
      continue;
    }
    if (c === 0 && v === "ENDSEC") {
      section = "";
      continue;
    }
    if (section === "HEADER" && c === 9 && v === "$INSUNITS") {
      const u = Number(pairs[i]?.[1]);
      units = INSUNITS[u] ?? null;
      i++;
      continue;
    }
    if (section !== "ENTITIES" || c !== 0) continue;
    // gather this entity's group codes up to the next 0
    const type = v;
    const g: [number, string][] = [];
    while (i < pairs.length && pairs[i][0] !== 0) g.push(next());
    const num = (code: number, d = 0) => {
      const f = g.find((p) => p[0] === code);
      return f ? Number(f[1]) : d;
    };
    const layer = g.find((p) => p[0] === 8)?.[1] ?? "0";
    if (type === "LINE") entities.push({ type: "line", layer, pts: [[num(10), num(20)], [num(11), num(21)]] });
    else if (type === "LWPOLYLINE") {
      const xs = g.filter((p) => p[0] === 10).map((p) => Number(p[1]));
      const ys = g.filter((p) => p[0] === 20).map((p) => Number(p[1]));
      const pts = xs.map((x, k) => [x, ys[k] ?? 0] as V2);
      if (pts.length >= 2) entities.push({ type: "polyline", layer, pts, closed: (num(70) & 1) === 1 });
    } else if (type === "POLYLINE") {
      const closed = (num(70) & 1) === 1;
      const pts: V2[] = [];
      while (i < pairs.length && pairs[i][0] === 0 && pairs[i][1] === "VERTEX") {
        next();
        const vg: [number, string][] = [];
        while (i < pairs.length && pairs[i][0] !== 0) vg.push(next());
        const vx = Number(vg.find((p) => p[0] === 10)?.[1] ?? 0);
        const vy = Number(vg.find((p) => p[0] === 20)?.[1] ?? 0);
        pts.push([vx, vy]);
      }
      if (pairs[i]?.[1] === "SEQEND") {
        next();
        while (i < pairs.length && pairs[i][0] !== 0) next();
      }
      if (pts.length >= 2) entities.push({ type: "polyline", layer, pts, closed });
    } else if (type === "CIRCLE") entities.push({ type: "circle", layer, pts: [[num(10), num(20)]], r: num(40) });
    else if (type === "ARC") entities.push({ type: "arc", layer, pts: [[num(10), num(20)]], r: num(40), a0: num(50), a1: num(51) });
    else if (type === "POINT") entities.push({ type: "point", layer, pts: [[num(10), num(20)]] });
    else if (type === "TEXT" || type === "MTEXT") {
      const raw = g.filter((p) => p[0] === 1 || p[0] === 3).map((p) => p[1]).join("");
      const t = raw.replace(/\\P/g, " ").replace(/\\[A-Za-z][^;]*;/g, "").replace(/[{}]/g, "").trim();
      if (t) entities.push({ type: "text", layer, pts: [[num(10), num(20)]], text: t, h: num(40, 1) });
    } else skipped++;
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const e of entities) {
    if (e.type === "arc") {
      // an arc reaches its ends and only the quarter points (0°, 90° …) its sweep passes
      const [cx, cy] = e.pts[0];
      const r = e.r ?? 0;
      const a0 = e.a0 ?? 0;
      let a1 = e.a1 ?? 90;
      if (a1 <= a0) a1 += 360;
      const at = (deg: number) => grow(cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180));
      at(a0);
      at(a1);
      for (let q = Math.ceil(a0 / 90) * 90; q < a1; q += 90) at(q);
      continue;
    }
    for (const [x, y] of e.pts) {
      const r = e.r ?? 0;
      grow(x - r, y - r);
      grow(x + r, y + r);
    }
  }
  return { entities, layers: [...new Set(entities.map((e) => e.layer))], units, extents: Number.isFinite(x0) ? { x0, y0, x1, y1 } : null, skipped };
}

/** A drawn item as plain data (the dialog gives it an id, level and height). */
export interface ItemSpec {
  kind: "line" | "polyline" | "circle" | "arc" | "text" | "solid";
  name: string;
  pts: V2[];
  closed?: boolean;
  p: Record<string, number | string | boolean>;
}

/** DXF entities as drawn items: scaled to feet, then moved by `offset` (feet). */
export function dxfItems(d: DxfDrawing, feetPerUnit: number, offset: V2): ItemSpec[] {
  const P = (q: V2): V2 => [q[0] * feetPerUnit + offset[0], q[1] * feetPerUnit + offset[1]];
  const out: ItemSpec[] = [];
  for (const e of d.entities) {
    const layer = { dxfLayer: e.layer };
    if (e.type === "line") out.push({ kind: "line", name: `${e.layer} line`, pts: e.pts.map(P), p: layer });
    else if (e.type === "polyline") out.push({ kind: "polyline", name: `${e.layer} polyline`, pts: e.pts.map(P), closed: e.closed, p: layer });
    else if (e.type === "circle") {
      const c = P(e.pts[0]);
      out.push({ kind: "circle", name: `${e.layer} circle`, pts: [c, [c[0] + (e.r ?? 1) * feetPerUnit, c[1]]], p: layer });
    } else if (e.type === "arc") {
      // three points on the arc: start, middle and end (DXF arcs run counter-clockwise from a0 to a1)
      const c = e.pts[0];
      const r = e.r ?? 1;
      let a1 = e.a1 ?? 90;
      const a0 = e.a0 ?? 0;
      if (a1 <= a0) a1 += 360;
      const at = (deg: number): V2 => P([c[0] + r * Math.cos((deg * Math.PI) / 180), c[1] + r * Math.sin((deg * Math.PI) / 180)]);
      out.push({ kind: "arc", name: `${e.layer} arc`, pts: [at(a0), at((a0 + a1) / 2), at(a1)], p: layer });
    } else if (e.type === "text") out.push({ kind: "text", name: e.text!.slice(0, 40), pts: [P(e.pts[0])], p: { ...layer, text: e.text! } });
    else if (e.type === "point") {
      const q = P(e.pts[0]);
      const s = 0.25;
      out.push({ kind: "polyline", name: `${e.layer} point`, pts: [[q[0] - s, q[1]], [q[0] + s, q[1]], [q[0], q[1]], [q[0], q[1] - s], [q[0], q[1] + s]], p: layer });
    }
  }
  return out;
}

/* ══ survey points ════════════════════════════════════════════════════════ */

/** Points from a CSV / TXT: a header naming northing / easting / elevation (PNEZD) or x / y / z, or the first three numbers of each row. */
export function parsePointsText(text: string): V3[] {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!rows.length) return [];
  const split = (l: string) => l.split(/[,;\t ]+/);
  const head = split(rows[0]).map((h) => h.toLowerCase());
  const has = (re: RegExp) => head.findIndex((h) => re.test(h));
  let ix = has(/^(x|east|easting|e)$/);
  let iy = has(/^(y|north|northing|n)$/);
  let iz = has(/^(z|elev|elevation|height|h)$/);
  const headed = ix >= 0 && iy >= 0 && iz >= 0;
  const body = headed ? rows.slice(1) : rows;
  const out: V3[] = [];
  for (const r of body) {
    const cells = split(r);
    if (headed) {
      const x = Number(cells[ix]);
      const y = Number(cells[iy]);
      const z = Number(cells[iz]);
      if ([x, y, z].every(Number.isFinite)) out.push([x, y, z]);
      continue;
    }
    const nums = cells.map(Number).filter(Number.isFinite);
    // PNEZD without a header: point number, northing, easting, elevation
    if (nums.length >= 4 && Number.isInteger(nums[0]) && cells.length >= 5) {
      ix = 2;
      iy = 1;
      iz = 3;
      out.push([nums[2], nums[1], nums[3]]);
    } else if (nums.length >= 3) out.push([nums[0], nums[1], nums[2]]);
  }
  return out;
}

/** Points and units of a LandXML file (CgPoints and the points of TIN surfaces; LandXML lists northing, easting, elevation). */
export function parseLandXml(text: string): { points: V3[]; units: LengthUnit | null } {
  const unit = /linearUnit="([^"]+)"/.exec(text)?.[1]?.toLowerCase() ?? "";
  const units: LengthUnit | null = unit.includes("ussurveyfoot") ? "usft" : unit.includes("foot") ? "ft" : unit.includes("milli") ? "mm" : unit.includes("centi") ? "cm" : unit.includes("meter") || unit.includes("metre") ? "m" : null;
  const points: V3[] = [];
  const re = /<(?:CgPoint|P)\b[^>]*>([^<]+)<\/(?:CgPoint|P)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = m[1].trim().split(/\s+/).map(Number);
    if (n.length >= 3 && n.every(Number.isFinite)) points.push([n[1], n[0], n[2]]);
  }
  return { points, units };
}

/** Points of a LAS point cloud (uncompressed LAS 1.0–1.4), thinned to at most `max`. */
export function parseLas(buf: ArrayBuffer, max = 30000): V3[] {
  const v = new DataView(buf);
  if (String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)) !== "LASF") throw new Error("Not a LAS file");
  const offset = v.getUint32(96, true);
  const recLen = v.getUint16(105, true);
  let count = v.getUint32(107, true);
  const minor = v.getUint8(25);
  if (!count && minor >= 4) count = Number(v.getBigUint64(247, true));
  const sx = v.getFloat64(131, true);
  const sy = v.getFloat64(139, true);
  const sz = v.getFloat64(147, true);
  const ox = v.getFloat64(155, true);
  const oy = v.getFloat64(163, true);
  const oz = v.getFloat64(171, true);
  const step = Math.max(1, Math.floor(count / max));
  const out: V3[] = [];
  for (let k = 0; k < count; k += step) {
    const at = offset + k * recLen;
    if (at + 12 > buf.byteLength) break;
    out.push([v.getInt32(at, true) * sx + ox, v.getInt32(at + 4, true) * sy + oy, v.getInt32(at + 8, true) * sz + oz]);
  }
  return out;
}

/* ══ ground surface and contours ══════════════════════════════════════════ */

/** An elevation grid: nx × ny values, `step` feet apart, starting at (x0, y0). */
export interface ElevGrid {
  x0: number;
  y0: number;
  step: number;
  nx: number;
  ny: number;
  z: number[];
}

/** A ground surface and its contours from points (already in feet, in project coordinates). */
export function terrainFrom(points: V3[], interval: number, maxCells = 60): { grid: ElevGrid; contours: Contour[]; lo: number; hi: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const step = Math.max((x1 - x0) / maxCells, (y1 - y0) / maxCells, 0.5);
  const nx = Math.max(2, Math.ceil((x1 - x0) / step) + 1);
  const ny = Math.max(2, Math.ceil((y1 - y0) / step) + 1);
  // inverse-distance weighting from the nearest points (a coarse bucket grid keeps it fast)
  const bucket = new Map<string, V3[]>();
  const key = (x: number, y: number) => `${Math.floor((x - x0) / (step * 4))},${Math.floor((y - y0) / (step * 4))}`;
  for (const p of points) {
    const k = key(p[0], p[1]);
    const list = bucket.get(k);
    if (list) list.push(p);
    else bucket.set(k, [p]);
  }
  const z: number[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * step;
      const y = y0 + j * step;
      const bx = Math.floor((x - x0) / (step * 4));
      const by = Math.floor((y - y0) / (step * 4));
      let num = 0;
      let den = 0;
      let exact: number | null = null;
      for (let r = 1; r <= 6 && den === 0; r++) {
        for (let dx = -r; dx <= r; dx++)
          for (let dy = -r; dy <= r; dy++) {
            for (const p of bucket.get(`${bx + dx},${by + dy}`) ?? []) {
              const d2 = (p[0] - x) ** 2 + (p[1] - y) ** 2;
              if (d2 < 1e-6) exact = p[2];
              const w = 1 / (d2 + 1e-6);
              num += w * p[2];
              den += w;
            }
          }
      }
      z.push(exact ?? (den ? num / den : 0));
    }
  }
  const grid: ElevGrid = { x0, y0, step, nx, ny, z };
  const lo = Math.min(...z);
  const hi = Math.max(...z);
  return { grid, contours: contoursOf(grid, interval), lo, hi };
}

/** Contour lines of a grid every `interval`, joined into polylines (marching squares). */
export function contoursOf(g: ElevGrid, interval: number): Contour[] {
  const at = (i: number, j: number) => g.z[j * g.nx + i];
  const lo = Math.min(...g.z);
  const hi = Math.max(...g.z);
  const out: Contour[] = [];
  // levels strictly inside the range: a contour at the very top or bottom is only a point or the grid's edge
  let first = Math.ceil(lo / interval) * interval;
  if (first <= lo) first += interval;
  let n = 0;
  for (let level = first; level < hi && n < 80; level += interval, n++) {
    const segs: [V2, V2][] = [];
    for (let j = 0; j < g.ny - 1; j++) {
      for (let i = 0; i < g.nx - 1; i++) {
        const c = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
        const p: V2[] = [
          [g.x0 + i * g.step, g.y0 + j * g.step],
          [g.x0 + (i + 1) * g.step, g.y0 + j * g.step],
          [g.x0 + (i + 1) * g.step, g.y0 + (j + 1) * g.step],
          [g.x0 + i * g.step, g.y0 + (j + 1) * g.step],
        ];
        const cross: V2[] = [];
        for (let e = 0; e < 4; e++) {
          const a = c[e];
          const b = c[(e + 1) % 4];
          if ((a < level) !== (b < level)) {
            const t = (level - a) / (b - a);
            cross.push([p[e][0] + t * (p[(e + 1) % 4][0] - p[e][0]), p[e][1] + t * (p[(e + 1) % 4][1] - p[e][1])]);
          }
        }
        if (cross.length === 2) segs.push([cross[0], cross[1]]);
        else if (cross.length === 4) segs.push([cross[0], cross[1]], [cross[2], cross[3]]);
      }
    }
    for (const line of joinSegments(segs)) out.push({ id: `IT-${n}-${out.length}`, z: level, pts: line, label: `${level.toFixed(interval < 1 ? 1 : 0)}'`, open: dist(line[0], line[line.length - 1]) > g.step * 0.01 });
  }
  return out;
}

const dist = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Join loose segments end to end into polylines. */
function joinSegments(segs: [V2, V2][]): V2[][] {
  const k = (p: V2) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
  const ends = new Map<string, number[]>();
  segs.forEach(([a, b], i) => {
    for (const p of [a, b]) {
      const list = ends.get(k(p));
      if (list) list.push(i);
      else ends.set(k(p), [i]);
    }
  });
  const used = new Array(segs.length).fill(false);
  const lines: V2[][] = [];
  for (let s = 0; s < segs.length; s++) {
    if (used[s]) continue;
    used[s] = true;
    const line: V2[] = [segs[s][0], segs[s][1]];
    for (const dir of [1, -1]) {
      for (;;) {
        const tip = dir === 1 ? line[line.length - 1] : line[0];
        const cand = (ends.get(k(tip)) ?? []).find((i) => !used[i]);
        if (cand === undefined) break;
        used[cand] = true;
        const [a, b] = segs[cand];
        const nextPt = k(a) === k(tip) ? b : a;
        if (dir === 1) line.push(nextPt);
        else line.unshift(nextPt);
      }
    }
    if (line.length >= 3) lines.push(line);
  }
  return lines;
}

/* ══ IFC ══════════════════════════════════════════════════════════════════ */

/** An element of an IFC model as a vertical solid: its plan outline, bottom and top (feet). */
export interface IfcSolid {
  id: string;
  type: string;
  name: string;
  category: Category;
  poly: V2[];
  z0: number;
  z1: number;
}

type Ent = { type: string; args: string[] };

/** Split a STEP argument list at top-level commas. */
function stepArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  let q = false;
  for (const ch of s) {
    if (ch === "'" ) q = !q;
    if (!q && ch === "(") depth++;
    if (!q && ch === ")") depth--;
    if (!q && ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const IFC_CAT: Record<string, Category> = {
  IFCWALL: "Wall", IFCWALLSTANDARDCASE: "Wall", IFCSLAB: "Slab", IFCROOF: "Roof", IFCCOLUMN: "Column", IFCBEAM: "Beam",
  IFCDOOR: "Door", IFCWINDOW: "Window", IFCSTAIR: "Stair", IFCSTAIRFLIGHT: "Stair", IFCFOOTING: "Footing", IFCRAILING: "Stair",
  IFCRAMP: "Ramp", IFCPLATE: "Slab", IFCMEMBER: "Framing", IFCCOVERING: "Slab", IFCFURNISHINGELEMENT: "Furniture", IFCBUILDINGELEMENTPROXY: "Equipment",
};

/** The building elements of an IFC (STEP) file as plan solids, in feet. */
export function parseIfc(text: string): { solids: IfcSolid[]; units: LengthUnit; skipped: number } {
  const ents = new Map<string, Ent>();
  const re = /#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*?)\)\s*;\s*(?=#|ENDSEC)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) ents.set(m[1], { type: m[2], args: stepArgs(m[3]) });
  const ref = (s: string | undefined) => (s && s.startsWith("#") ? ents.get(s.slice(1)) : undefined);
  const nums = (s: string) => s.replace(/[()]/g, "").split(",").map((x) => Number(x.trim())).filter(Number.isFinite);
  const list = (s: string) => s.replace(/^\(|\)$/g, "").split(",").map((x) => x.trim()).filter(Boolean);
  // units: metres with a prefix, or a foot conversion
  let units: LengthUnit = "m";
  for (const e of ents.values()) {
    if (e.type === "IFCSIUNIT" && e.args[1]?.includes("LENGTHUNIT")) units = e.args[2]?.includes("MILLI") ? "mm" : e.args[2]?.includes("CENTI") ? "cm" : "m";
    if (e.type === "IFCCONVERSIONBASEDUNIT" && e.args[1]?.includes("LENGTHUNIT") && /FOOT/i.test(e.args[2] ?? "")) units = "ft";
  }
  const k = FEET_PER[units];
  type M = { o: V3; x: V3; y: V3; z: V3 };
  const I: M = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a: V3): V3 => {
    const l = Math.hypot(...a) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const point = (s: string | undefined): V3 => {
    const e = ref(s);
    const n = e ? nums(e.args[0]) : [];
    return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0];
  };
  const dirOf = (s: string | undefined, d: V3): V3 => {
    const e = ref(s);
    if (!e) return d;
    const n = nums(e.args[0]);
    return norm([n[0] ?? 0, n[1] ?? 0, n[2] ?? 0]);
  };
  const axis = (s: string | undefined): M => {
    const e = ref(s);
    if (!e) return I;
    const o = point(e.args[0]);
    if (e.type === "IFCAXIS2PLACEMENT2D") {
      const x = dirOf(e.args[1], [1, 0, 0]);
      return { o, x, y: [-x[1], x[0], 0], z: [0, 0, 1] };
    }
    const z = dirOf(e.args[1], [0, 0, 1]);
    let x = dirOf(e.args[2], Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
    const y = norm(cross(z, x));
    x = norm(cross(y, z));
    return { o, x, y, z };
  };
  const apply = (mm: M, p: V3): V3 => [mm.o[0] + mm.x[0] * p[0] + mm.y[0] * p[1] + mm.z[0] * p[2], mm.o[1] + mm.x[1] * p[0] + mm.y[1] * p[1] + mm.z[1] * p[2], mm.o[2] + mm.x[2] * p[0] + mm.y[2] * p[1] + mm.z[2] * p[2]];
  const compose = (outer: M, inner: M): M => ({ o: apply(outer, inner.o), x: sub(apply(outer, inner.x), outer.o), y: sub(apply(outer, inner.y), outer.o), z: sub(apply(outer, inner.z), outer.o) });
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const placement = (s: string | undefined, depth = 0): M => {
    const e = ref(s);
    if (!e || e.type !== "IFCLOCALPLACEMENT" || depth > 20) return I;
    const parent = e.args[0] && e.args[0] !== "$" ? placement(e.args[0], depth + 1) : I;
    return compose(parent, axis(e.args[1]));
  };
  const profile = (s: string | undefined): V2[] | null => {
    const e = ref(s);
    if (!e) return null;
    if (e.type === "IFCRECTANGLEPROFILEDEF") {
      const pos = axis(e.args[2]);
      const hx = Number(e.args[3]) / 2;
      const hy = Number(e.args[4]) / 2;
      return ([[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]] as V2[]).map(([x, y]) => {
        const q = apply(pos, [x, y, 0]);
        return [q[0], q[1]];
      });
    }
    if (e.type === "IFCARBITRARYCLOSEDPROFILEDEF") {
      const curve = ref(e.args[2]);
      if (curve?.type === "IFCPOLYLINE") return list(curve.args[0]).map((p) => point(p)).map((q) => [q[0], q[1]] as V2);
      if (curve?.type === "IFCINDEXEDPOLYCURVE") {
        const pl = ref(curve.args[0]);
        const coords = pl ? pl.args[0].replace(/^\(\(|\)\)$/g, "").split(/\)\s*,\s*\(/).map((c) => nums(c)) : [];
        return coords.map((c) => [c[0], c[1]] as V2);
      }
    }
    return null;
  };
  const solids: IfcSolid[] = [];
  let skipped = 0;
  for (const [id, e] of ents) {
    const cat = IFC_CAT[e.type];
    if (!cat) continue;
    const name = (e.args[2] ?? "").replace(/^'|'$/g, "") || e.type.replace("IFC", "");
    const place = placement(e.args[5]);
    const shape = ref(e.args[6]);
    const reps = shape ? list(shape.args[2]).map(ref).filter(Boolean) : [];
    let done = false;
    for (const rep of reps) {
      for (const itemRef of list(rep!.args[3] ?? "")) {
        let item = ref(itemRef);
        let local = I;
        // a mapped item (a type's geometry used here) carries its own placement
        if (item?.type === "IFCMAPPEDITEM") {
          const map = ref(item.args[0]);
          local = axis(map?.args[0]);
          const r2 = ref(map?.args[1]);
          item = ref(list(r2?.args[3] ?? "")[0]);
        }
        if (item?.type === "IFCEXTRUDEDAREASOLID") {
          const prof = profile(item.args[0]);
          if (!prof || prof.length < 3) continue;
          const pos = compose(compose(place, local), axis(item.args[1]));
          const dir = dirOf(item.args[2], [0, 0, 1]);
          const depth = Number(item.args[3]);
          const top = prof.map(([x, y]) => apply(pos, [x + dir[0] * depth, y + dir[1] * depth, dir[2] * depth]));
          const bot = prof.map(([x, y]) => apply(pos, [x, y, 0]));
          const all = [...top, ...bot];
          const vertical = Math.abs(pos.z[2] * dir[2] + pos.x[2] * dir[0] + pos.y[2] * dir[1]) > 0.95;
          const outline: V2[] = vertical ? bot.map((q) => [q[0] * k, q[1] * k]) : hull(all.map((q) => [q[0] * k, q[1] * k]));
          solids.push({ id, type: e.type, name, category: cat, poly: outline, z0: Math.min(...all.map((q) => q[2])) * k, z1: Math.max(...all.map((q) => q[2])) * k });
          done = true;
        }
      }
    }
    if (!done) {
      // meshes and anything else: the box around the points of its representation
      const pts: V3[] = [];
      const seen = new Set<string>();
      const walk = (r: string | undefined, d = 0) => {
        if (!r || d > 6 || seen.has(r)) return;
        seen.add(r);
        const x = ref(r);
        // contexts and placements carry origin points that are not part of the shape
        if (!x || x.type.startsWith("IFCGEOMETRICREPRESENTATION") || x.type.startsWith("IFCAXIS2PLACEMENT") || x.type === "IFCDIRECTION") return;
        if (x.type === "IFCCARTESIANPOINT") pts.push(apply(place, point(r)));
        else if (x.type === "IFCCARTESIANPOINTLIST3D") {
          for (const c of x.args[0].replace(/^\(\(|\)\)$/g, "").split(/\)\s*,\s*\(/)) {
            const n = nums(c);
            if (n.length >= 3) pts.push(apply(place, [n[0], n[1], n[2]]));
          }
        } else for (const a of x.args) for (const t of a.match(/#\d+/g) ?? []) walk(t, d + 1);
      };
      for (const rep of reps) for (const it of list(rep!.args[3] ?? "")) walk(it);
      if (pts.length >= 2) {
        const xs = pts.map((q) => q[0] * k);
        const ys = pts.map((q) => q[1] * k);
        const zs = pts.map((q) => q[2] * k);
        solids.push({ id, type: e.type, name, category: cat, poly: [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]], z0: Math.min(...zs), z1: Math.max(...zs) });
      } else skipped++;
    }
  }
  return { solids: solids.filter((s) => s.z1 - s.z0 > 1e-3 && s.poly.length >= 3), units, skipped };
}

/** The convex hull of plan points (monotone chain). */
function hull(pts: V2[]): V2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: V2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: V2[] = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** IFC solids as drawn solids, moved by `offset` (feet). */
export function ifcItems(solids: IfcSolid[], offset: V2, base: number): ItemSpec[] {
  return solids.map((s) => ({
    kind: "solid",
    name: s.name,
    pts: s.poly.map(([x, y]) => [x + offset[0], y + offset[1]] as V2),
    closed: true,
    p: { cat: s.category, z0: s.z0 - base, z1: s.z1 - base, ifc: s.type },
  }));
}
