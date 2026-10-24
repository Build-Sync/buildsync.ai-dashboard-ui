import type { LayerId, VisualStyle } from "../types";
import { clamp } from "../utils";
import type { Projector } from "./camera";
import { prismBounds } from "./builder";
import {
  FIXED_COLORS,
  type AppearanceMap,
  type Device,
  type LevelKey,
  type PhaseKey,
  type Prism,
  type Run,
  type Scene,
  type SceneElement,
  type Tree,
  type V2,
  type V3,
} from "./types";

/* ── colour helpers ───────────────────────────────────────────────────── */
type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(f, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (c: RGB) =>
  "#" + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");

export function shadeHex(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex);
  return toHex([r * k, g * k, b * k]);
}
export function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

/** Stress colour scale, 0 → 4.8 ksi (blue → green → yellow → red). */
export const STRESS_MAX = 4.8;
const STRESS_STOPS: [number, string][] = [
  [0, "#2f6bff"],
  [0.25, "#21c5d6"],
  [0.5, "#3ecf8e"],
  [0.75, "#f0c63c"],
  [1, "#ef4a4a"],
];
export function stressColor(ksi: number): string {
  const t = clamp(ksi / STRESS_MAX, 0, 1);
  for (let i = 1; i < STRESS_STOPS.length; i++) {
    const [t1, c1] = STRESS_STOPS[i];
    const [t0, c0] = STRESS_STOPS[i - 1];
    if (t <= t1) return mixHex(c0, c1, (t - t0) / (t1 - t0));
  }
  return STRESS_STOPS[STRESS_STOPS.length - 1][1];
}
export const STRESS_GRADIENT = STRESS_STOPS;

/* ── input / output ───────────────────────────────────────────────────── */
export type PhaseState = "built" | "active" | "future";

export interface Tint {
  color: string;
  amount: number;
}

export interface RenderInput {
  scene: Scene;
  proj: Projector;
  style: VisualStyle;
  /** Plan mode: horizontal cut at `cutZ`, only the listed levels are drawn. */
  plan: { cutZ: number; levels: LevelKey[] } | null;
  /** Section plane: material with y < sectionY is removed. */
  sectionY: number | null;
  colors: AppearanceMap;
  layers: Partial<Record<LayerId, boolean>>;
  hidden: ReadonlySet<string>;
  isolated: ReadonlySet<string> | null;
  phaseState: Partial<Record<PhaseKey, PhaseState>> | null;
  shadows: boolean;
  edges: boolean;
  tint: Record<string, Tint>;
  dimOthers: boolean;
  /** direction towards the sun (unit-ish) */
  sun: V3;
  /** MEP drawn as hidden-line ghosts when the building is opaque */
  ghostMep: boolean;
}

export interface RenderResult {
  svg: string;
  faceCount: number;
}

/* ── clipping ─────────────────────────────────────────────────────────── */
interface Clipped {
  p: Prism;
  poly: V2[];
  a0: number;
  a1: number;
  capA0: boolean;
  capA1: boolean;
  capEdges: boolean[];
  min: V3;
  max: V3;
}

function clipPoly(poly: V2[], idx: 0 | 1, value: number, keepGreater: boolean): V2[] {
  const out: V2[] = [];
  const inside = (p: V2) => (keepGreater ? p[idx] >= value - 1e-9 : p[idx] <= value + 1e-9);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ia = inside(a);
    const ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (value - a[idx]) / (b[idx] - a[idx]);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  // drop consecutive duplicates
  return out.filter((p, i) => {
    const q = out[(i + 1) % out.length];
    return Math.abs(p[0] - q[0]) > 1e-7 || Math.abs(p[1] - q[1]) > 1e-7;
  });
}

function makeClipped(p: Prism, poly: V2[], a0: number, a1: number, capA0: boolean, capA1: boolean, capEdges: boolean[]): Clipped | null {
  if (poly.length < 3 || a1 - a0 < 1e-5) return null;
  const { min, max } = prismBounds({ ...p, poly, a0, a1 });
  return { p, poly, a0, a1, capA0, capA1, capEdges, min, max };
}

function clipPrism(p: Prism, sectionY: number | null, cutZ: number | null): Clipped | null {
  let poly = p.poly;
  let a0 = p.a0;
  let a1 = p.a1;
  let capA0 = false;
  let capA1 = false;
  let capEdges: boolean[] | null = null;

  if (sectionY !== null) {
    if (p.axis === "y") {
      if (a1 <= sectionY) return null;
      if (a0 < sectionY) {
        a0 = sectionY;
        capA0 = true;
      }
    } else {
      const clipped = clipPoly(poly, 1, sectionY, true);
      if (clipped.length < 3) return null;
      if (clipped.length !== poly.length || clipped.some((q, i) => q !== poly[i])) {
        capEdges = clipped.map((q, i) => {
          const r = clipped[(i + 1) % clipped.length];
          return Math.abs(q[1] - sectionY) < 1e-6 && Math.abs(r[1] - sectionY) < 1e-6;
        });
        poly = clipped;
      }
    }
  }
  if (cutZ !== null) {
    if (p.axis === "z") {
      if (a0 >= cutZ) return null;
      if (a1 > cutZ) {
        a1 = cutZ;
        capA1 = true;
      }
    } else {
      const clipped = clipPoly(poly, 1, cutZ, false);
      if (clipped.length < 3) return null;
      if (clipped.length !== poly.length || clipped.some((q, i) => q !== poly[i])) {
        capEdges = clipped.map((q, i) => {
          const r = clipped[(i + 1) % clipped.length];
          return Math.abs(q[1] - cutZ) < 1e-6 && Math.abs(r[1] - cutZ) < 1e-6;
        });
        poly = clipped;
      }
    }
  }
  return makeClipped(p, poly, a0, a1, capA0, capA1, capEdges ?? poly.map(() => false));
}

/* ── faces ────────────────────────────────────────────────────────────── */
interface Face {
  pts: V3[];
  n: V3;
  cap: boolean;
}

function facesOf(c: Clipped): Face[] {
  const { poly, a0, a1, p } = c;
  const faces: Face[] = [];
  const n = poly.length;
  if (p.axis === "z") {
    faces.push({ pts: poly.map(([x, y]) => [x, y, a1] as V3), n: [0, 0, 1], cap: c.capA1 });
    faces.push({ pts: poly.map(([x, y]) => [x, y, a0] as V3).reverse(), n: [0, 0, -1], cap: false });
    for (let i = 0; i < n; i++) {
      const [x0, y0] = poly[i];
      const [x1, y1] = poly[(i + 1) % n];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      faces.push({
        pts: [[x0, y0, a0], [x1, y1, a0], [x1, y1, a1], [x0, y0, a1]],
        n: [dy / len, -dx / len, 0],
        cap: c.capEdges[i],
      });
    }
  } else {
    faces.push({ pts: poly.map(([x, z]) => [x, a0, z] as V3), n: [0, -1, 0], cap: c.capA0 });
    faces.push({ pts: poly.map(([x, z]) => [x, a1, z] as V3), n: [0, 1, 0], cap: false });
    for (let i = 0; i < n; i++) {
      const [x0, z0] = poly[i];
      const [x1, z1] = poly[(i + 1) % n];
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      faces.push({
        pts: [[x0, a0, z0], [x1, a0, z1], [x1, a1, z1], [x0, a1, z0]],
        n: [dz / len, 0, -dx / len],
        cap: c.capEdges[i],
      });
    }
  }
  return faces;
}

/* ── painter ordering ─────────────────────────────────────────────────── */
interface Item {
  kind: "prism" | "tree";
  clip?: Clipped;
  tree?: Tree;
  min: V3;
  max: V3;
  depth: number;
  /** projected 2D bounds — only pairs that overlap on screen constrain each other */
  sx0: number;
  sy0: number;
  sx1: number;
  sy1: number;
  /** exact silhouette of the bounding box: convex hull of its projected corners */
  hull: V2[];
}

function screenBox(min: V3, max: V3, proj: Projector): { sx0: number; sy0: number; sx1: number; sy1: number; hull: V2[] } {
  let sx0 = Infinity;
  let sy0 = Infinity;
  let sx1 = -Infinity;
  let sy1 = -Infinity;
  const pts: V2[] = [];
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]])
      for (const z of [min[2], max[2]]) {
        const q = proj.project([x, y, z]);
        pts.push([q.x, q.y]);
        if (q.x < sx0) sx0 = q.x;
        if (q.x > sx1) sx1 = q.x;
        if (q.y < sy0) sy0 = q.y;
        if (q.y > sy1) sy1 = q.y;
      }
  return { sx0, sy0, sx1, sy1, hull: convexHull(pts) };
}

/** Do two convex polygons overlap by more than `tol` px? (separating-axis test) */
function hullsOverlap(a: V2[], b: V2[], tol = 0.6): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      const len = Math.hypot(nx, ny) || 1;
      let a0 = Infinity;
      let a1 = -Infinity;
      let b0 = Infinity;
      let b1 = -Infinity;
      for (const v of a) {
        const t = (v[0] * nx + v[1] * ny) / len;
        if (t < a0) a0 = t;
        if (t > a1) a1 = t;
      }
      for (const v of b) {
        const t = (v[0] * nx + v[1] * ny) / len;
        if (t < b0) b0 = t;
        if (t > b1) b1 = t;
      }
      if (a1 <= b0 + tol || b1 <= a0 + tol) return false;
    }
  }
  return true;
}

const EPS = 1e-3;

/** Painter-sort diagnostics (cycles broken in the last sort). */
export const sortStats = { cycles: 0, cycleItems: [] as string[], path: [] as string[] };

/** -1: a must be drawn before b, +1: b before a, 0: unconstrained. */
function order(a: Item, b: Item, d: V3): number {
  let verdict = 0;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-6) continue;
    let v = 0;
    if (a.max[k] <= b.min[k] + EPS) v = d[k] > 0 ? -1 : 1;
    else if (b.max[k] <= a.min[k] + EPS) v = d[k] > 0 ? 1 : -1;
    if (v !== 0) {
      if (verdict !== 0 && verdict !== v) return 0; // separated both ways: no screen overlap
      verdict = v;
    }
  }
  if (verdict !== 0) return verdict;

  // unseparated pairs: structural rules
  const pa = a.clip?.p;
  const pb = b.clip?.p;
  if (pa && pb) {
    const up = d[2] >= 0 ? 1 : -1;
    if (pa.terrain && pb.underground) return -up;
    if (pb.terrain && pa.underground) return up;
    if (pa.category === "Roof" && pb.level === "roof" && pb.category !== "Roof") return up;
    if (pb.category === "Roof" && pa.level === "roof" && pa.category !== "Roof") return -up;
  }
  return 0;
}

function findCycle(items: Item[], out: number[][], done: boolean[]): string[] {
  const state = new Array<number>(items.length).fill(0);
  const stack: number[] = [];
  const name = (i: number) => items[i].clip?.p.key ?? items[i].tree?.id ?? "?";
  let found: string[] = [];
  const visit = (u: number): boolean => {
    state[u] = 1;
    stack.push(u);
    for (const v of out[u]) {
      if (done[v]) continue;
      if (state[v] === 1) {
        found = stack.slice(stack.indexOf(v)).map(name);
        return true;
      }
      if (state[v] === 0 && visit(v)) return true;
    }
    stack.pop();
    state[u] = 2;
    return false;
  };
  for (let i = 0; i < items.length && !found.length; i++) if (!done[i] && state[i] === 0) visit(i);
  return found;
}

function sortItems(items: Item[], d: V3): Item[] {
  const n = items.length;
  sortStats.cycles = 0;
  sortStats.cycleItems = [];
  sortStats.path = [];
  const out: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const a = items[i];
    for (let j = i + 1; j < n; j++) {
      const b = items[j];
      if (a.sx1 <= b.sx0 || b.sx1 <= a.sx0 || a.sy1 <= b.sy0 || b.sy1 <= a.sy0) continue;
      if (!hullsOverlap(a.hull, b.hull)) continue;
      const r = order(a, b, d);
      if (r < 0) {
        out[i].push(j);
        indeg[j]++;
      } else if (r > 0) {
        out[j].push(i);
        indeg[i]++;
      }
    }
  }
  const done = new Array<boolean>(n).fill(false);
  const result: Item[] = [];
  for (let step = 0; step < n; step++) {
    let pick = -1;
    let pickDepth = -Infinity;
    for (let i = 0; i < n; i++) {
      if (!done[i] && indeg[i] === 0 && items[i].depth > pickDepth) {
        pick = i;
        pickDepth = items[i].depth;
      }
    }
    if (pick < 0) {
      // cycle: break it at the farthest remaining item
      sortStats.cycles++;
      if (sortStats.path.length === 0) sortStats.path = findCycle(items, out, done);
      for (let i = 0; i < n; i++) {
        if (!done[i] && items[i].depth > pickDepth) {
          pick = i;
          pickDepth = items[i].depth;
        }
      }
    }
    if (indeg[pick] > 0) sortStats.cycleItems.push(items[pick].clip?.p.key ?? items[pick].tree?.id ?? "?");
    done[pick] = true;
    result.push(items[pick]);
    for (const j of out[pick]) indeg[j]--;
  }
  return result;
}

/* ── svg string helpers ───────────────────────────────────────────────── */
const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
const paint = (attr: "fill" | "stroke", v: string) => (v.startsWith("var(") ? `style="${attr}:${v}"` : `${attr}="${v}"`);

function poly(points: { x: number; y: number }[]): string {
  let s = "";
  for (let i = 0; i < points.length; i++) s += `${i ? " " : ""}${f1(points[i].x)},${f1(points[i].y)}`;
  return s;
}

function lightFactor(n: V3, sun: V3): number {
  const len = Math.hypot(sun[0], sun[1], sun[2]) || 1;
  const dp = (n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]) / len;
  return clamp(0.5 + 0.58 * Math.max(0, dp), 0.45, 1.1);
}

function baseColor(p: Prism, colors: AppearanceMap): string {
  if (p.color in colors) return colors[p.color as keyof AppearanceMap];
  return FIXED_COLORS[p.color as keyof typeof FIXED_COLORS];
}

interface PlanPaint {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
}

function planPaint(p: Prism): PlanPaint | null {
  const ink = "var(--vp-ink)";
  const dim = "var(--vp-ink-dim)";
  switch (p.category) {
    case "Wall":
    case "Column":
      return { fill: ink, fillOpacity: 0.86, stroke: ink, strokeOpacity: 0.9, strokeWidth: 0.8 };
    case "Partition":
      return { fill: ink, fillOpacity: 0.5, stroke: ink, strokeOpacity: 0.7, strokeWidth: 0.7 };
    case "Foundation":
    case "Footing":
      return { fill: ink, fillOpacity: 0.22, stroke: ink, strokeOpacity: 0.35, strokeWidth: 0.6 };
    case "Beam":
      return null;
    case "Slab":
      return { fill: ink, fillOpacity: 0.05, stroke: ink, strokeOpacity: 0.25, strokeWidth: 0.5 };
    case "Door":
      return { fill: "none", fillOpacity: 0, stroke: FIXED_COLORS.door, strokeOpacity: 1, strokeWidth: 1.4 };
    case "Window":
      return { fill: FIXED_COLORS.glass, fillOpacity: 0.35, stroke: FIXED_COLORS.glass, strokeOpacity: 0.95, strokeWidth: 1 };
    case "Furniture":
    case "Fixture":
      return { fill: "none", fillOpacity: 0, stroke: dim, strokeOpacity: 0.85, strokeWidth: 0.7 };
    case "Stair":
      return { fill: ink, fillOpacity: 0.07, stroke: dim, strokeOpacity: 0.9, strokeWidth: 0.7 };
    case "Paving":
      return { fill: ink, fillOpacity: 0.05, stroke: ink, strokeOpacity: 0.22, strokeWidth: 0.5 };
    case "Landscape":
      return { fill: FIXED_COLORS.landscape, fillOpacity: 0.25, stroke: FIXED_COLORS.landscape, strokeOpacity: 0.8, strokeWidth: 0.7 };
    case "Topography":
      return null;
    default:
      return { fill: "none", fillOpacity: 0, stroke: dim, strokeOpacity: 0.6, strokeWidth: 0.6 };
  }
}

/* ── main entry ───────────────────────────────────────────────────────── */
export function renderScene(input: RenderInput): RenderResult {
  const { scene, proj, style, plan, sectionY, colors, layers, hidden, isolated, phaseState, tint, sun } = input;
  const d = proj.basis.d;
  const seeThrough = style === "xray" || style === "wireframe";
  const sectionOn = sectionY !== null;
  const cutZ = plan ? plan.cutZ : null;
  const levelSet = plan ? new Set(plan.levels) : null;

  /* collect + clip */
  const items: Item[] = [];
  for (const p of scene.prisms) {
    if (layers[p.layer] === false) continue;
    if (hidden.has(p.id)) continue;
    if (isolated && !isolated.has(p.id)) continue;
    if (levelSet && !levelSet.has(p.level)) continue;
    if (p.sectionOnly && !sectionOn && !seeThrough) continue;
    if (p.underground && !(sectionOn || seeThrough)) continue;
    if (p.underground && plan) continue;
    if (phaseState && phaseState[p.phase] === "future") continue;
    const clip = clipPrism(p, sectionY, cutZ);
    if (!clip) continue;
    const c: Clipped = clip;
    const center: V3 = [(c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, (c.min[2] + c.max[2]) / 2];
    items.push({ kind: "prism", clip: c, min: c.min, max: c.max, depth: proj.project(center).depth, ...screenBox(c.min, c.max, proj) });
  }
  if (!plan && layers.site !== false) {
    for (const t of scene.trees) {
      if (hidden.has(t.id)) continue;
      if (isolated) continue;
      if (sectionOn && sectionY !== null && t.at[1] < sectionY) continue;
      const r = t.kind === "palm" ? 1.2 : t.radius * 0.5;
      const min: V3 = [t.at[0] - r, t.at[1] - r, t.at[2]];
      const max: V3 = [t.at[0] + r, t.at[1] + r, t.at[2] + t.height];
      items.push({ kind: "tree", tree: t, min, max, depth: proj.project([t.at[0], t.at[1], t.at[2] + t.height / 2]).depth, ...screenBox(min, max, proj) });
    }
  }

  const sorted = sortItems(items, d);

  const out: string[] = [];
  let faceCount = 0;
  let terrainDone = false;

  const emitGround = () => {
    if (terrainDone) return;
    terrainDone = true;
    if (layers.topography !== false && !plan) {
      for (const ct of scene.contours) {
        const pts = ct.pts.map(([x, y]) => proj.project([x, y, ct.z]));
        let dstr = "";
        pts.forEach((q, i) => (dstr += `${i ? "L" : "M"}${f1(q.x)},${f1(q.y)}`));
        out.push(`<path d="${dstr}Z" fill="none" style="stroke:var(--vp-ink-dim)" stroke-opacity=".38" stroke-width=".6"/>`);
      }
    }
    if (input.shadows && !sectionOn && !plan && style === "realistic") out.push(shadowSvg(scene, proj, sun));
  };

  for (const it of sorted) {
    if (it.kind === "tree" && it.tree) {
      if (!terrainDone && d[2] > 0) emitGround();
      out.push(treeSvg(it.tree, proj, input.shadows && style === "realistic", sun));
      continue;
    }
    const c = it.clip as Clipped;
    const p = c.p;
    const isTerrain = !!p.terrain;
    const state = phaseState?.[p.phase];
    const tn = tint[p.id];
    const dimmed = input.dimOthers && !tn;
    let alpha = 1;
    if (state === "active") alpha *= 0.5;
    if (dimmed) alpha *= 0.28;

    const base = baseColor(p, colors);
    const faces = facesOf(c);
    const visible: { f: Face; depth: number }[] = [];
    for (const f of faces) {
      if (p.capOnly && !f.cap) continue;
      const facing = f.n[0] * d[0] + f.n[1] * d[1] + f.n[2] * d[2];
      if (!seeThrough && facing <= 1e-4) continue;
      if (plan && facing <= 1e-4) continue;
      if (seeThrough && isTerrain && !(f.n[2] > 0.5)) continue;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (const q of f.pts) {
        cx += q[0];
        cy += q[1];
        cz += q[2];
      }
      const k = f.pts.length;
      visible.push({ f, depth: proj.project([cx / k, cy / k, cz / k]).depth });
    }
    visible.sort((a, b) => b.depth - a.depth);

    for (const { f } of visible) {
      const pts = f.pts.map((q) => proj.project(q));
      const points = poly(pts);
      faceCount++;
      let fill: string;
      let fillOp = 1;
      let stroke: string;
      let strokeOp = 0.5;
      let strokeW = 0.5;

      if (plan) {
        const pp = planPaint(p);
        if (!pp) continue;
        fill = pp.fill;
        fillOp = pp.fillOpacity;
        stroke = pp.stroke;
        strokeOp = pp.strokeOpacity;
        strokeW = pp.strokeWidth;
      } else {
        let col = isTerrain && f.n[2] <= 0.5 ? FIXED_COLORS.soil : base;
        if (style === "shaded" && !p.glass) col = mixHex(col, "#9aa3b2", 0.45);
        const k = lightFactor(f.n, sun);
        if (f.cap) {
          fill = mixHex(shadeHex(col, 0.72), "#ffffff", 0.06);
          stroke = "var(--vp-ink)";
          strokeOp = 0.9;
          strokeW = 0.9;
        } else {
          fill = shadeHex(col, k);
          stroke = shadeHex(col, 0.45);
          strokeOp = input.edges && style !== "xray" ? 0.5 : 0.0;
          strokeW = 0.5;
        }
        if (p.glass) {
          fillOp = 0.46;
          fill = shadeHex(FIXED_COLORS.glass, lightFactor(f.n, sun) * 0.95);
          stroke = "#cdeaff";
          strokeOp = 0.6;
        }
        if (style === "wireframe") {
          fill = "none";
          fillOp = 0;
          stroke = f.cap ? "var(--vp-ink)" : shadeHex(col, 1.05);
          strokeOp = 0.9;
          strokeW = 0.8;
        } else if (style === "xray") {
          fillOp = p.glass ? 0.1 : 0.1;
          stroke = shadeHex(col, 1.1);
          strokeOp = 0.6;
          strokeW = 0.7;
        }
      }

      if (tn && !plan) {
        if (fill !== "none" && !fill.startsWith("var(")) fill = mixHex(fill, tn.color, tn.amount);
        if (style === "wireframe" || style === "xray") {
          stroke = tn.color;
          strokeOp = 1;
          strokeW = 1.2;
        }
      } else if (tn && plan) {
        stroke = tn.color;
        strokeOp = 1;
        strokeW = 1.6;
      }

      const fo = fillOp * alpha;
      const so = strokeOp * alpha;
      const el = `data-el="${p.id}"`;
      out.push(
        `<polygon ${el} points="${points}" ${paint("fill", fill)} fill-opacity="${fo.toFixed(2)}" ${paint("stroke", stroke)} stroke-opacity="${so.toFixed(2)}" stroke-width="${strokeW}" stroke-linejoin="round"${state === "active" ? ' stroke-dasharray="3 2"' : ""}/>`,
      );
      if (f.cap && !plan && style !== "wireframe") {
        out.push(`<polygon ${el} points="${points}" fill="url(#bs-hatch)" fill-opacity="${(0.55 * alpha).toFixed(2)}" stroke="none"/>`);
      }
    }
    if (isTerrain && !terrainDone && d[2] > 0) emitGround();
  }
  if (!terrainDone && d[2] > 0) emitGround();

  /* MEP runs + devices (overlay) */
  out.push(mepSvg(scene, proj, input, sectionOn, seeThrough, hidden, isolated, levelSet, phaseState));

  return { svg: out.join(""), faceCount };
}

/* ── MEP overlay ──────────────────────────────────────────────────────── */
function mepColor(kind: Run["kind"], colors: AppearanceMap): string {
  if (kind === "electrical") return colors.electrical;
  if (kind === "plumbing") return colors.plumbing;
  if (kind === "hvac") return FIXED_COLORS.hvac;
  return FIXED_COLORS.fire;
}

function mepSvg(
  scene: Scene,
  proj: Projector,
  input: RenderInput,
  sectionOn: boolean,
  seeThrough: boolean,
  hidden: ReadonlySet<string>,
  isolated: ReadonlySet<string> | null,
  levelSet: Set<LevelKey> | null,
  phaseState: RenderInput["phaseState"],
): string {
  const { layers, colors } = input;
  const out: string[] = [];
  const ghost = input.ghostMep && !sectionOn && !seeThrough && !input.plan;
  const unit = clamp(proj.scale * 0.11, 0.9, 3.2);
  const visibleRun = (r: Run) => {
    if (layers[r.layer] === false) return false;
    if (hidden.has(r.id) || isolated) return false;
    if (levelSet && !levelSet.has(r.level)) return false;
    if (r.underground && !seeThrough) return false;
    if (phaseState && phaseState[r.phase] === "future") return false;
    return true;
  };
  for (const r of scene.runs) {
    if (!visibleRun(r)) continue;
    // section view: only the part of a run in front of the cut plane remains
    let pts = r.pts;
    if (sectionOn && input.sectionY !== null) {
      const sy = input.sectionY;
      const kept: V3[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (a[1] >= sy) kept.push(a);
        if (b && (a[1] >= sy) !== (b[1] >= sy)) {
          const t = (sy - a[1]) / (b[1] - a[1]);
          kept.push([a[0] + t * (b[0] - a[0]), sy, a[2] + t * (b[2] - a[2])]);
        }
      }
      if (kept.length < 2) continue;
      pts = kept;
    }
    if (input.plan) pts = pts.filter((p) => p[2] <= input.plan!.cutZ + 5);
    if (pts.length < 2) continue;
    const q = pts.map((p) => proj.project(p));
    let dstr = "";
    q.forEach((p, i) => (dstr += `${i ? "L" : "M"}${f1(p.x)},${f1(p.y)}`));
    const w = (r.width ?? 1.6) * unit;
    out.push(
      `<path d="${dstr}" fill="none" stroke="${mepColor(r.kind, colors)}" stroke-width="${w.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${ghost ? 0.55 : 0.95}"${ghost ? ' stroke-dasharray="4 3"' : ""} data-run="${r.id}"/>`,
    );
  }
  const size = clamp(proj.scale * 0.5, 3, 9);
  for (const dv of scene.devices) {
    if (layers[dv.layer] === false) continue;
    if (levelSet && !levelSet.has(dv.level)) continue;
    if (isolated) continue;
    if (sectionOn && input.sectionY !== null && dv.at[1] < input.sectionY) continue;
    if (phaseState && phaseState[dv.phase] === "future") continue;
    out.push(deviceSvg(dv, proj, size, colors, ghost));
  }
  return out.join("");
}

function deviceSvg(dv: Device, proj: Projector, size: number, colors: AppearanceMap, ghost: boolean): string {
  const p = proj.project(dv.at);
  const col = mepColor(dv.kind, colors);
  const op = ghost ? 0.7 : 1;
  const x = f1(p.x);
  const y = f1(p.y);
  const s = size;
  switch (dv.shape) {
    case "panel":
      return `<rect x="${f1(p.x - s * 0.7)}" y="${f1(p.y - s)}" width="${f1(s * 1.4)}" height="${f1(s * 2)}" fill="${col}" fill-opacity="${op}" stroke="#101319" stroke-width=".7"/>`;
    case "unit":
      return `<rect x="${f1(p.x - s * 1.1)}" y="${f1(p.y - s * 0.7)}" width="${f1(s * 2.2)}" height="${f1(s * 1.4)}" rx="1" fill="${col}" fill-opacity="${op}" stroke="#101319" stroke-width=".7"/>`;
    case "light":
      return `<circle cx="${x}" cy="${y}" r="${f1(s * 0.5)}" fill="${col}" fill-opacity="${op}" stroke="#101319" stroke-width=".5"/>`;
    case "fixture":
      return `<circle cx="${x}" cy="${y}" r="${f1(s * 0.6)}" fill="none" stroke="${col}" stroke-width="1.2" stroke-opacity="${op}"/><circle cx="${x}" cy="${y}" r="${f1(s * 0.22)}" fill="${col}" fill-opacity="${op}"/>`;
    case "head":
      return `<circle cx="${x}" cy="${y}" r="${f1(s * 0.42)}" fill="${col}" fill-opacity="${op}"/><path d="M${f1(p.x - s * 0.7)},${y}H${f1(p.x + s * 0.7)}M${x},${f1(p.y - s * 0.7)}V${f1(p.y + s * 0.7)}" stroke="${col}" stroke-width=".8"/>`;
    case "valve":
      return `<path d="M${x},${f1(p.y - s * 0.6)}L${f1(p.x + s * 0.6)},${y}L${x},${f1(p.y + s * 0.6)}L${f1(p.x - s * 0.6)},${y}Z" fill="${col}" fill-opacity="${op}"/>`;
    default:
      return `<rect x="${f1(p.x - s * 0.35)}" y="${f1(p.y - s * 0.35)}" width="${f1(s * 0.7)}" height="${f1(s * 0.7)}" fill="${col}" fill-opacity="${op}" stroke="#101319" stroke-width=".4"/>`;
  }
}

/* ── trees + shadows ──────────────────────────────────────────────────── */
function treeSvg(t: Tree, proj: Projector, shadow: boolean, sun: V3): string {
  const base = proj.project(t.at);
  const top = proj.project([t.at[0], t.at[1], t.at[2] + t.height]);
  const s = proj.scale;
  const R = t.radius * s;
  const out: string[] = [];
  if (shadow) {
    const k = (t.height * 0.35) / (sun[2] || 1);
    const sx = -sun[0] * k;
    const sy = -sun[1] * k;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      pts.push(proj.project([t.at[0] + sx + Math.cos(a) * t.radius * 0.8, t.at[1] + sy + Math.sin(a) * t.radius * 0.8, t.at[2]]));
    }
    out.push(`<polygon points="${poly(pts)}" fill="#000" fill-opacity=".16"/>`);
  }
  const lean = (top.x - base.x) * 0.15;
  if (t.kind === "shrub") {
    out.push(`<circle cx="${f1(base.x)}" cy="${f1(base.y - R * 0.3)}" r="${f1(R * 0.55)}" fill="#3a7a47" stroke="#27553a" stroke-width=".6"/>`);
    return out.join("");
  }
  out.push(
    `<path d="M${f1(base.x)},${f1(base.y)}Q${f1((base.x + top.x) / 2 + lean * 3)},${f1((base.y + top.y) / 2)} ${f1(top.x)},${f1(top.y)}" fill="none" stroke="#6d5336" stroke-width="${f1(Math.max(1.6, s * 0.55))}" stroke-linecap="round"/>`,
  );
  if (t.kind === "palm") {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const ex = top.x + Math.cos(a) * R * 1.05;
      const ey = top.y + Math.sin(a) * R * 0.42 + R * 0.18;
      const cx2 = top.x + Math.cos(a) * R * 0.55;
      const cy2 = top.y + Math.sin(a) * R * 0.2 - R * 0.34;
      out.push(
        `<path d="M${f1(top.x)},${f1(top.y)}Q${f1(cx2)},${f1(cy2)} ${f1(ex)},${f1(ey)}" fill="none" stroke="${i % 2 ? "#3f8a4e" : "#2f7140"}" stroke-width="${f1(Math.max(1.6, s * 0.4))}" stroke-linecap="round"/>`,
      );
    }
  } else {
    out.push(`<ellipse cx="${f1(top.x)}" cy="${f1(top.y - R * 0.12)}" rx="${f1(R * 0.95)}" ry="${f1(R * 0.72)}" fill="#2f7140" stroke="#1f5230" stroke-width=".7"/>`);
    out.push(`<ellipse cx="${f1(top.x - R * 0.22)}" cy="${f1(top.y - R * 0.34)}" rx="${f1(R * 0.55)}" ry="${f1(R * 0.4)}" fill="#3f8a4e" fill-opacity=".9"/>`);
  }
  return out.join("");
}

function shadowSvg(scene: Scene, proj: Projector, sun: V3): string {
  const g = scene.grade;
  const pts: V2[] = [];
  const add = (x: number, y: number, z: number) => {
    const h = z - g;
    pts.push([x - (sun[0] / sun[2]) * h, y - (sun[1] / sun[2]) * h]);
  };
  for (const el of scene.elements) {
    if (el.layer !== "walls" && el.layer !== "roof") continue;
    if (el.category === "Door" || el.category === "Window") continue;
    for (const x of [el.min[0], el.max[0]])
      for (const y of [el.min[1], el.max[1]])
        for (const z of [Math.max(el.min[2], g), el.max[2]]) add(x, y, z);
  }
  const hull = convexHull(pts);
  if (hull.length < 3) return "";
  const q = hull.map(([x, y]) => proj.project([x, y, g + 0.02]));
  return `<polygon points="${poly(q)}" fill="#000" fill-opacity=".2"/>`;
}

/* ── geometry helpers for overlays ────────────────────────────────────── */
export function convexHull(points: V2[]): V2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: V2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: V2[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export interface ElementOutline {
  hull: V2[];
  grips: V2[];
  box: { x: number; y: number; w: number; h: number };
}

export function elementOutline(el: SceneElement, proj: Projector): ElementOutline {
  const corners: V2[] = [];
  for (const x of [el.min[0], el.max[0]])
    for (const y of [el.min[1], el.max[1]])
      for (const z of [el.min[2], el.max[2]]) {
        const q = proj.project([x, y, z]);
        corners.push([q.x, q.y]);
      }
  const hull = convexHull(corners);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const x1 = Math.max(...xs);
  const y1 = Math.max(...ys);
  const grips: V2[] = [...hull];
  hull.forEach((p, i) => {
    const q = hull[(i + 1) % hull.length];
    grips.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
  });
  return { hull, grips, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

/** Level plan cut height: 4' above the finished floor. */
export function planCutFor(scene: Scene, level: LevelKey): number {
  return scene.levelZ[level] + 4;
}

export function planLevelsFor(level: LevelKey): LevelKey[] {
  if (level === "level2") return ["site", "level2"];
  if (level === "roof") return ["site", "level2", "roof"];
  return ["site", "foundation", "level1"];
}
