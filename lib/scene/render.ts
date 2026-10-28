/**
 * lib/scene/render.ts
 *
 * WHAT   The SVG renderer. renderScene takes a scene, a projector, a visual style and the view state (plan cut,
 *        section plane, a `cut` in any of the four directions for section sheets or a `plane` at any angle for
 *        elevations along a line, the Below Grade view, layers, hidden and isolated elements, phase state, tints,
 *        sun) and returns SVG markup:
 *        it clips prisms against the section plane, builds faces, sorts them back to front (painter's algorithm
 *        with cycle breaking), shades them, and adds MEP runs, trees and shadows. Wires and pipes take the look
 *        chosen (`mepLook`): drawing lines (dotted plumbing, dashed electrical, a switch leg as an arc on plans) or
 *        the pipes and cables themselves (cold blue, hot red, drains brown; power yellow, switched legs white). A
 *        light whose switch is on glows. Also colour helpers, the stress colour scale, element outlines and convex
 *        hulls for overlays.
 * FOR    ModelViewport and SheetView. They inject the result with dangerouslySetInnerHTML, so only geometry,
 *        ids and colours from the scene are written into the string (never user text, unless it is escaped);
 *        every element carries a data-el id so clicks can be mapped back to elements. The renderer can later be
 *        replaced by WebGL behind the same input / output types.
 * DEBUG  - Faces flicker or overlap wrongly: sortStats records the cycles broken in the last sort; the pairwise
 *          order is decided by the comparison function after sortStats.
 *        - An element is missing: it can be filtered by layer, hidden, isolated, the plan level, phaseState,
 *          sectionOnly or underground flags. Underground parts (footings, the septic tank) show in a section, X-ray,
 *          wireframe, the Below Grade view (the ground turns see-through and everything above it but the
 *          foundation fades to GHOST_ABOVE), a camera under the ground (Bottom view), and dashed on plans with
 *          `plan.below`.
 *        - A drawn run or device cannot be clicked: only those with `pick` carry a data-el id (a wide invisible
 *          stroke for runs). elColors (CHMAT) overrides an element's colour slot. Trees without `pick` (the
 *          samples') ignore the pointer, so a click on a wall under a canopy reaches the wall.
 *        - A pipe or wire is missing in a plan or the Cutaway: runs are clipped CEILING_ABOVE_CUT above the cut
 *          (the ceiling of storeys up to 12 ft); a run with no sub (the samples') takes its kind from its label.
 *        - A plan outline has no stroke: fill and stroke in theme colours must share one style attribute (paints).
 *        - Seen from inside a room (a projector with an `eye`): faces are culled towards the eye and cut where they
 *          reach behind it (clipNear), boxes reaching behind it overlap everything when sorting, and the eye's side
 *          of the plane between two boxes decides which is nearer (order). A face missing near the edge of the
 *          view: its box was all behind the eye (eyeBox returns null).
 *        - The stress colour scale is 0-4.8 ksi (STRESS_MAX), blue to red.
 *        - Performance: the result is memoised by the viewport on its inputs; keep RenderInput values stable
 *          (Sets and maps are rebuilt only when their source changes).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { LayerId, VisualStyle } from "../types";
import { clamp } from "../utils";
import { clipNear, clipNearLine, type Projector } from "./camera";
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

/** Lighten (k > 0) or darken (k < 0) a hex colour. */
export function shadeHex(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex);
  return toHex([r * k, g * k, b * k]);
}
/** Blend two hex colours by t. */
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
/** Colour for a stress value in ksi. */
export function stressColor(ksi: number): string {
  const t = clamp(ksi / STRESS_MAX, 0, 1);
  for (let i = 1; i < STRESS_STOPS.length; i++) {
    const [t1, c1] = STRESS_STOPS[i];
    const [t0, c0] = STRESS_STOPS[i - 1];
    if (t <= t1) return mixHex(c0, c1, (t - t0) / (t1 - t0));
  }
  return STRESS_STOPS[STRESS_STOPS.length - 1][1];
}
/** Gradient stops for the stress legend and SVG gradient. */
export const STRESS_GRADIENT = STRESS_STOPS;

/* ── input / output ───────────────────────────────────────────────────── */
export type PhaseState = "built" | "active" | "future";

/** A colour wash on an element: material highlight, pending proposal, clash or selection. */
export interface Tint {
  color: string;
  amount: number;
}

/** Everything the renderer needs to draw one frame. */
export interface RenderInput {
  scene: Scene;
  proj: Projector;
  style: VisualStyle;
  /** Plan mode: horizontal cut at `cutZ`, only the listed levels are drawn; `below` adds what is under the ground
   *  (footings, the septic tank) as dashed outlines, as a foundation or site plan shows it. */
  plan: { cutZ: number; levels: LevelKey[]; below?: boolean } | null;
  /** Section plane: material with y < sectionY is removed. */
  sectionY: number | null;
  /**
   * A cut in any of the four directions (overrides sectionY): the plane x = at (axis 0) or y = at (axis 1);
   * keep 1 keeps the material on the greater side, -1 on the smaller side. Used by section sheets.
   */
  cut?: Cut | null;
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
  /** colour of single elements (CHMAT), by element id; overrides the colour slot */
  elColors?: Record<string, string>;
  /** a vertical cut at any angle (elevations along a line): what lies behind the viewer is removed */
  plane?: Plane | null;
  /** the Below Grade view: footings, the septic tank and buried pipes show through a see-through ground */
  belowGrade?: boolean;
  /** the kind of ground (lib/ground.ts): the colour of its cut faces and the texture on its surface */
  ground?: { side: string; pattern: string };
  /** the 3D Cutaway: everything above this height is cut off (cut faces hatched), so rooms and furniture show */
  cutAt?: number | null;
  /** how plumbing and electrical runs look: drawing lines (dotted / dashed) or real pipes and wires */
  mepLook?: MepLook;
}

/** How plumbing and electrical runs are drawn: as on construction drawings, or as the pipes and wires themselves. */
export interface MepLook {
  plumbing: "lines" | "pipes";
  electrical: "lines" | "wires";
}

/** A vertical plane: the material with n · (x, y) ≥ d is kept. */
export interface Plane {
  n: V2;
  d: number;
}

/** The SVG markup and how many faces it contains. */
export interface RenderResult {
  svg: string;
  faceCount: number;
}

/** A section plane: x = at (axis 0) or y = at (axis 1), keeping the greater (1) or smaller (-1) side. */
export interface Cut {
  axis: 0 | 1;
  at: number;
  keep: 1 | -1;
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

/** Clip a plan outline to the half-plane n · p ≥ d; also says which edges lie on the line (they become the cut face). */
function clipPolyPlane(poly: V2[], pl: Plane): { poly: V2[]; on: boolean[] } {
  const f = (p: V2) => pl.n[0] * p[0] + pl.n[1] * p[1] - pl.d;
  const out: V2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const fa = f(a);
    const fb = f(b);
    if (fa >= -1e-9) out.push(a);
    if ((fa >= -1e-9) !== (fb >= -1e-9)) {
      const t = fa / (fa - fb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  const clean = out.filter((p, i) => {
    const q = out[(i + 1) % out.length];
    return Math.abs(p[0] - q[0]) > 1e-7 || Math.abs(p[1] - q[1]) > 1e-7;
  });
  return { poly: clean, on: clean.map((q, i) => Math.abs(f(q)) < 1e-6 && Math.abs(f(clean[(i + 1) % clean.length])) < 1e-6) };
}

function makeClipped(p: Prism, poly: V2[], a0: number, a1: number, capA0: boolean, capA1: boolean, capEdges: boolean[]): Clipped | null {
  if (poly.length < 3 || a1 - a0 < 1e-5) return null;
  const { min, max } = prismBounds({ ...p, poly, a0, a1 });
  return { p, poly, a0, a1, capA0, capA1, capEdges, min, max };
}

function clipPrism(p: Prism, cut: Cut | null, cutZ: number | null, plane: Plane | null = null): Clipped | null {
  let poly = p.poly;
  let a0 = p.a0;
  let a1 = p.a1;
  let capA0 = false;
  let capA1 = false;
  let capEdges: boolean[] | null = null;

  if (plane) {
    const [nx, ny] = plane.n;
    if (p.axis === "z") {
      const c = clipPolyPlane(poly, plane);
      if (c.poly.length < 3) return null;
      if (c.on.some(Boolean)) capEdges = c.on;
      poly = c.poly;
    } else if (Math.abs(ny) < 1e-6) {
      // an XZ outline cut by a plane across X
      const at = plane.d / nx;
      const clipped = clipPoly(poly, 0, at, nx > 0);
      if (clipped.length < 3) return null;
      if (clipped.length !== poly.length || clipped.some((q, i) => q !== poly[i])) {
        capEdges = clipped.map((q, i) => Math.abs(q[0] - at) < 1e-6 && Math.abs(clipped[(i + 1) % clipped.length][0] - at) < 1e-6);
        poly = clipped;
      }
    } else if (Math.abs(nx) < 1e-6) {
      // extruded along Y and cut across Y
      const at = plane.d / ny;
      if (ny > 0) {
        if (a1 <= at) return null;
        if (a0 < at) {
          a0 = at;
          capA0 = true;
        }
      } else {
        if (a0 >= at) return null;
        if (a1 > at) {
          a1 = at;
          capA1 = true;
        }
      }
    } else {
      // a slanted plane through a piece extruded along Y (a roof slope, a gable): kept whole while any corner is kept
      const xs = poly.map((q) => q[0]);
      const corners: V2[] = [[Math.min(...xs), a0], [Math.max(...xs), a0], [Math.min(...xs), a1], [Math.max(...xs), a1]];
      if (!corners.some((q) => nx * q[0] + ny * q[1] >= plane.d)) return null;
    }
  }

  if (cut) {
    const greater = cut.keep > 0;
    if (p.axis === "y" && cut.axis === 1) {
      // extruded along Y and cut across Y: shorten the extrusion, the end face is the cut
      if (greater) {
        if (a1 <= cut.at) return null;
        if (a0 < cut.at) {
          a0 = cut.at;
          capA0 = true;
        }
      } else {
        if (a0 >= cut.at) return null;
        if (a1 > cut.at) {
          a1 = cut.at;
          capA1 = true;
        }
      }
    } else {
      // a plan outline cut by x or y, or an XZ outline cut by x: clip the outline, mark the edges on the plane
      const idx: 0 | 1 = p.axis === "z" ? cut.axis : 0;
      const clipped = clipPoly(poly, idx, cut.at, greater);
      if (clipped.length < 3) return null;
      if (clipped.length !== poly.length || clipped.some((q, i) => q !== poly[i])) {
        capEdges = clipped.map((q, i) => {
          const r = clipped[(i + 1) % clipped.length];
          return Math.abs(q[idx] - cut.at) < 1e-6 && Math.abs(r[idx] - cut.at) < 1e-6;
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
    faces.push({ pts: poly.map(([x, z]) => [x, a1, z] as V3), n: [0, 1, 0], cap: c.capA1 });
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

const WHOLE_SCREEN = { sx0: -1e9, sy0: -1e9, sx1: 1e9, sy1: 1e9, hull: [[-1e9, -1e9], [1e9, -1e9], [1e9, 1e9], [-1e9, 1e9]] as V2[] };

/** The screen box of a bounding box seen from an eye: null when it is all behind the eye, the whole screen when it
 *  reaches behind it (it may be anywhere on screen then). */
function eyeBox(min: V3, max: V3, proj: Projector): ReturnType<typeof screenBox> | null {
  let behind = 0;
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) if (proj.project([x, y, z]).depth < proj.near) behind++;
  if (behind === 8) return null;
  return behind ? WHOLE_SCREEN : screenBox(min, max, proj);
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

/** -1: a must be drawn before b, +1: b before a, 0: unconstrained. With an eye (a room view) the one on the eye's
 *  side of the plane between them is nearer; an eye between the two sees past each to the other. */
function order(a: Item, b: Item, d: V3, eye?: V3): number {
  let verdict = 0;
  for (let k = 0; k < 3; k++) {
    let v = 0;
    if (eye) {
      if (a.max[k] <= b.min[k] + EPS) v = eye[k] <= a.max[k] ? 1 : eye[k] >= b.min[k] ? -1 : 2;
      else if (b.max[k] <= a.min[k] + EPS) v = eye[k] <= b.max[k] ? -1 : eye[k] >= a.min[k] ? 1 : 2;
      if (v === 2) return 0;
    } else {
      if (Math.abs(d[k]) < 1e-6) continue;
      if (a.max[k] <= b.min[k] + EPS) v = d[k] > 0 ? -1 : 1;
      else if (b.max[k] <= a.min[k] + EPS) v = d[k] > 0 ? 1 : -1;
    }
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
    const up = eye || d[2] >= 0 ? 1 : -1;
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

function sortItems(items: Item[], d: V3, eye?: V3): Item[] {
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
      const r = order(a, b, d, eye);
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
/** The fill and stroke attributes of a face: theme colours (CSS variables) go in a single style attribute, since a
 *  browser keeps only the first of two (a plan outline drawn in the theme ink used to lose its stroke). */
function paints(fill: string, stroke: string): string {
  const css = (attr: string, v: string) => (v.startsWith("var(") ? `${attr}:${v}` : "");
  const attr = (name: string, v: string) => (v.startsWith("var(") ? "" : `${name}="${v}"`);
  const style = [css("fill", fill), css("stroke", stroke)].filter(Boolean).join(";");
  return [attr("fill", fill), attr("stroke", stroke), style ? `style="${style}"` : ""].filter(Boolean).join(" ");
}

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

function planPaint(p: Prism, base = "#888888"): PlanPaint | null {
  const ink = "var(--vp-ink)";
  const dim = "var(--vp-ink-dim)";
  switch (p.category) {
    // site objects keep their own colour on the plan (water, asphalt, lane paint, flowers, rocks …)
    case "Pool":
    case "Road":
    case "Sidewalk":
    case "Rock":
    case "Planting":
    case "Sign":
    case "Signal":
    case "Drain":
    case "Gutter":
    case "Solar":
    case "Fence":
      return { fill: base, fillOpacity: 0.7, stroke: shadeHex(base, 0.6), strokeOpacity: 0.9, strokeWidth: 0.5 };
    // electrical devices draw as their plan symbols (mepSvg), not as their small physical parts
    case "Device":
      return null;
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
      // a faint fill so a click inside the outline picks the piece, not the floor under it
      return { fill: ink, fillOpacity: 0.035, stroke: dim, strokeOpacity: 0.85, strokeWidth: 0.7 };
    case "Fixture":
      // sinks, toilets, tubs and the like are drawn firmer than the furniture, as on a plumbing plan
      return { fill: ink, fillOpacity: 0.06, stroke: ink, strokeOpacity: 0.75, strokeWidth: 0.8 };
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

/** How much of the house above the ground still shows in Below Grade (footings under it stay visible). */
const GHOST_ABOVE = 0.2;

/* ── main entry ───────────────────────────────────────────────────────── */
export function renderScene(input: RenderInput): RenderResult {
  const { scene, proj, style, plan, sectionY, colors, layers, hidden, isolated, phaseState, tint, sun } = input;
  const cut: Cut | null = input.cut ?? (sectionY !== null ? { axis: 1, at: sectionY, keep: 1 } : null);
  /** is a point on the removed side of the cut? */
  const plane = input.plane ?? null;
  const cutAway = (x: number, y: number) =>
    (!!cut && (cut.keep > 0 ? (cut.axis === 0 ? x : y) < cut.at : (cut.axis === 0 ? x : y) > cut.at)) || (!!plane && plane.n[0] * x + plane.n[1] * y < plane.d);
  const d = proj.basis.d;
  const seeThrough = style === "xray" || style === "wireframe";
  const sectionOn = cut !== null || plane !== null;
  // Below Grade (or a camera under the ground looking up): the ground is see-through so the foundation shows;
  // Below Grade also fades what stands above the ground, so the footings under the house are not hidden by it
  // a room view stands inside: its eye replaces the view direction for sorting and for which faces are seen
  const eye = proj.eye;
  const below = (!!input.belowGrade || (eye ? eye[2] < scene.grade : d[2] < -0.05)) && !plan;
  const ghostAbove = !!input.belowGrade && !plan;
  const planBelow = !!plan?.below;
  const cutZ = plan ? plan.cutZ : (input.cutAt ?? null);
  const levelSet = plan ? new Set(plan.levels) : null;

  /* collect + clip */
  const items: Item[] = [];
  for (const p of scene.prisms) {
    if (layers[p.layer] === false) continue;
    if (hidden.has(p.id)) continue;
    if (isolated && !isolated.has(p.id)) continue;
    if (levelSet && !levelSet.has(p.level)) continue;
    if (p.sectionOnly && !sectionOn && !seeThrough) continue;
    if (p.underground && !(sectionOn || seeThrough || below || planBelow)) continue;
    if (p.underground && plan && !planBelow) continue;
    if (phaseState && phaseState[p.phase] === "future") continue;
    const clip = clipPrism(p, cut, p.underground && planBelow ? null : cutZ, plane);
    if (!clip) continue;
    const c: Clipped = clip;
    const center: V3 = [(c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, (c.min[2] + c.max[2]) / 2];
    const box = eye ? eyeBox(c.min, c.max, proj) : screenBox(c.min, c.max, proj);
    if (!box) continue;
    items.push({ kind: "prism", clip: c, min: c.min, max: c.max, depth: proj.project(center).depth, ...box });
  }
  if (!plan && layers[TREE_LAYER] !== false) {
    for (const t of scene.trees) {
      if (hidden.has(t.id)) continue;
      if (isolated) continue;
      if (cutAway(t.at[0], t.at[1])) continue;
      const r = t.kind === "palm" ? 1.2 : t.radius * 0.5;
      const min: V3 = [t.at[0] - r, t.at[1] - r, t.at[2]];
      const max: V3 = [t.at[0] + r, t.at[1] + r, t.at[2] + t.height];
      // from an eye, a tree is drawn whole or not at all (its art is flat): only one standing well in front
      if (eye && proj.project(t.at).depth < 2) continue;
      const box = eye ? eyeBox(min, max, proj) : screenBox(min, max, proj);
      if (!box) continue;
      items.push({ kind: "tree", tree: t, min, max, depth: proj.project([t.at[0], t.at[1], t.at[2] + t.height / 2]).depth, ...box });
    }
  }

  const sorted = sortItems(items, d, eye);

  const out: string[] = [];
  let faceCount = 0;
  let terrainDone = false;

  const emitGround = () => {
    if (terrainDone) return;
    terrainDone = true;
    if (layers.topography !== false && !plan && !eye) {
      // contours lie on the ground block (its top is the finished grade); their heights are in their labels
      for (const ct of scene.contours) {
        const pts = ct.pts.map(([x, y]) => proj.project([x, y, scene.grade]));
        let dstr = "";
        pts.forEach((q, i) => (dstr += `${i ? "L" : "M"}${f1(q.x)},${f1(q.y)}`));
        out.push(`<path d="${dstr}${ct.open ? "" : "Z"}" fill="none" style="stroke:var(--vp-ink-dim)" stroke-opacity=".38" stroke-width=".6"/>`);
      }
    }
    if (input.shadows && !sectionOn && !plan && !eye && style === "realistic") out.push(shadowSvg(scene, proj, sun));
  };

  for (const it of sorted) {
    if (it.kind === "tree" && it.tree) {
      if (!terrainDone && d[2] > 0) emitGround();
      const svg = treeSvg(it.tree, proj, input.shadows && !eye && style === "realistic", sun);
      const fade = ghostAbove ? ` opacity="${GHOST_ABOVE}"` : "";
      // a tree that cannot be selected must not catch clicks meant for what is under it
      out.push(it.tree.pick ? `<g data-el="${it.tree.id}"${fade}>${svg}</g>` : `<g pointer-events="none"${fade}>${svg}</g>`);
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
    // Below Grade: the ground is see-through so the footings and the septic tank show under it
    if (below && isTerrain) alpha *= 0.22;
    // …and the house above fades, so what is under it shows; the foundation and buried utilities stay solid
    if (ghostAbove && !isTerrain && !p.underground && p.layer !== "foundation" && p.layer !== "utilities") alpha *= GHOST_ABOVE;
    const dashedBelow = planBelow && !!p.underground;

    const base = input.elColors?.[p.id] ?? baseColor(p, colors);
    const faces = facesOf(c);
    const visible: { f: Face; depth: number }[] = [];
    for (const f of faces) {
      if (p.capOnly && !f.cap && !below && !dashedBelow) continue;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (const q of f.pts) {
        cx += q[0];
        cy += q[1];
        cz += q[2];
      }
      const k = f.pts.length;
      const to: V3 = eye ? [eye[0] - cx / k, eye[1] - cy / k, eye[2] - cz / k] : d;
      const facing = f.n[0] * to[0] + f.n[1] * to[1] + f.n[2] * to[2];
      if (!seeThrough && facing <= 1e-4) continue;
      if (plan && facing <= 1e-4) continue;
      if (seeThrough && isTerrain && !(f.n[2] > 0.5)) continue;
      visible.push({ f, depth: proj.project([cx / k, cy / k, cz / k]).depth });
    }
    visible.sort((a, b) => b.depth - a.depth);

    for (const { f } of visible) {
      const front = eye ? clipNear(f.pts, proj) : f.pts;
      if (front.length < 3) continue;
      const pts = front.map((q) => proj.project(q));
      const points = poly(pts);
      faceCount++;
      let fill: string;
      let fillOp = 1;
      let stroke: string;
      let strokeOp = 0.5;
      let strokeW = 0.5;

      if (plan) {
        const pp = planPaint(p, base);
        if (!pp) continue;
        fill = pp.fill;
        fillOp = dashedBelow ? 0 : pp.fillOpacity;
        stroke = pp.stroke;
        strokeOp = dashedBelow ? 0.75 : pp.strokeOpacity;
        strokeW = dashedBelow ? 0.8 : pp.strokeWidth;
      } else {
        let col = isTerrain && f.n[2] <= 0.5 ? (input.ground?.side ?? FIXED_COLORS.soil) : base;
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
          // window glass, or a see-through part in its own colour (a chain-link mesh)
          const mesh = p.color !== "glass";
          fillOp = mesh ? 0.3 : 0.46;
          fill = shadeHex(mesh ? base : FIXED_COLORS.glass, lightFactor(f.n, sun) * 0.95);
          stroke = mesh ? shadeHex(base, 0.7) : "#cdeaff";
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
        `<polygon ${el} points="${points}" ${paints(fill, stroke)} fill-opacity="${fo.toFixed(2)}" stroke-opacity="${so.toFixed(2)}" stroke-width="${strokeW}" stroke-linejoin="round"${state === "active" ? ' stroke-dasharray="3 2"' : dashedBelow ? ' stroke-dasharray="5 3"' : ""}/>`,
      );
      if (f.cap && !plan && style !== "wireframe") {
        out.push(`<polygon ${el} points="${points}" fill="url(#bs-hatch)" fill-opacity="${(0.55 * alpha).toFixed(2)}" stroke="none"/>`);
      }
      // the ground's texture (grass, sand, clay …) on its surface
      if (isTerrain && input.ground && !plan && f.n[2] > 0.5 && (style === "realistic" || style === "shaded")) {
        out.push(`<polygon ${el} points="${points}" fill="url(#bs-ground-${input.ground.pattern})" fill-opacity="${(0.9 * alpha).toFixed(2)}" stroke="none"/>`);
      }
      // a textured top (a gravel bed, mulch, pavers): in 3D and on the plan
      if (p.pattern && f.n[2] > 0.5 && style !== "wireframe" && style !== "xray") {
        out.push(`<polygon ${el} points="${points}" fill="url(#bs-ground-${p.pattern})" fill-opacity="${(0.85 * alpha).toFixed(2)}" stroke="none"/>`);
      }
    }
    if (isTerrain && !terrainDone && d[2] > 0) emitGround();
  }
  if (!terrainDone && d[2] > 0) emitGround();

  /* trees and bushes on a plan: the canopy seen from above */
  if (plan && layers[TREE_LAYER] !== false && plan.levels.includes("site")) {
    for (const t of scene.trees) {
      if (hidden.has(t.id) || (isolated && !isolated.has(t.id))) continue;
      const svg = treePlanSvg(t, proj);
      out.push(t.pick ? `<g data-el="${t.id}">${svg}</g>` : `<g pointer-events="none">${svg}</g>`);
    }
  }

  /* MEP runs + devices (overlay) */
  out.push(mepSvg(scene, proj, input, cut, seeThrough, hidden, isolated, levelSet, phaseState));

  return { svg: out.join(""), faceCount };
}

/** The layer trees and bushes are drawn on. */
const TREE_LAYER = "site" as const;

/** A tree or bush on a plan: its canopy seen from above (palm fronds, a pine's spokes, a bush's small circle). */
function treePlanSvg(t: Tree, proj: Projector): string {
  const c = proj.project(t.at);
  const R = Math.max(2, t.radius * proj.scale * (t.kind === "shrub" ? 0.6 : 0.95));
  const x = f1(c.x);
  const y = f1(c.y);
  const out: string[] = [];
  if (t.kind === "palm" || t.kind === "pine") {
    // a star of fronds or needles
    const n = t.kind === "palm" ? 9 : 14;
    let d = "";
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const r = i % 2 ? R * (t.kind === "palm" ? 0.35 : 0.72) : R;
      d += `${i ? "L" : "M"}${f1(c.x + Math.cos(a) * r)},${f1(c.y + Math.sin(a) * r)}`;
    }
    out.push(`<path d="${d}Z" fill="#3f8a4e" fill-opacity=".22" stroke="#3f8a4e" stroke-opacity=".9" stroke-width=".8" stroke-linejoin="round"/>`);
  } else {
    // a scalloped canopy (a cloud of leaf clusters)
    const n = t.kind === "shrub" ? 8 : 12;
    let d = "";
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const p0 = [c.x + Math.cos(a0) * R * 0.88, c.y + Math.sin(a0) * R * 0.88];
      const p1 = [c.x + Math.cos(a1) * R * 0.88, c.y + Math.sin(a1) * R * 0.88];
      const am = (a0 + a1) / 2;
      d += `${i ? "" : `M${f1(p0[0])},${f1(p0[1])}`}Q${f1(c.x + Math.cos(am) * R * 1.12)},${f1(c.y + Math.sin(am) * R * 1.12)} ${f1(p1[0])},${f1(p1[1])}`;
    }
    out.push(`<path d="${d}Z" fill="url(#bs-${t.kind === "shrub" ? "bush" : "leaf"})" fill-opacity=".38" stroke="#3f8a4e" stroke-opacity=".95" stroke-width=".8"/>`);
    if (t.kind !== "shrub")
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        out.push(`<line x1="${x}" y1="${y}" x2="${f1(c.x + Math.cos(a) * R * 0.55)}" y2="${f1(c.y + Math.sin(a) * R * 0.55)}" stroke="#2f7140" stroke-opacity=".55" stroke-width=".6"/>`);
      }
    if (t.bloom) for (let i = 0; i < 6; i++) out.push(`<circle cx="${f1(c.x + Math.cos(i * 1.7) * R * 0.5)}" cy="${f1(c.y + Math.sin(i * 1.7) * R * 0.5)}" r="1.3" fill="${t.bloom}"/>`);
  }
  out.push(`<circle cx="${x}" cy="${y}" r="1.4" fill="#6d5336"/>`);
  return out.join("");
}

/* ── MEP overlay ──────────────────────────────────────────────────────── */
/** What a run carries when it does not say: read from its label (P-WST is waste, P-HW hot water …). */
function subOfRun(r: Run): Run["sub"] {
  if (r.kind === "plumbing") return /WST|SAN|DRN|DWV|VENT|SEW|WASTE|DRAIN/i.test(r.label ?? r.id) ? "drain" : /HW|HOT/i.test(r.label ?? r.id) ? "hot" : "cold";
  if (r.kind === "electrical") return "power";
  return undefined;
}

/** The colour of a run: cold water blue, hot red, waste brown; power cable yellow, a switched leg white. */
function runColor(kind: Run["kind"], sub: Run["sub"], colors: AppearanceMap): string {
  if (kind === "plumbing") return sub === "hot" ? "#e5483c" : sub === "drain" ? "#8a7a63" : colors.plumbing;
  if (kind === "electrical") return sub === "switched" ? "#ece8dc" : colors.electrical;
  return mepColor(kind, colors);
}

function mepColor(kind: Run["kind"], colors: AppearanceMap): string {
  if (kind === "electrical") return colors.electrical;
  if (kind === "plumbing") return colors.plumbing;
  if (kind === "hvac") return FIXED_COLORS.hvac;
  if (kind === "structural") return colors.structural;
  return FIXED_COLORS.fire;
}

function mepSvg(
  scene: Scene,
  proj: Projector,
  input: RenderInput,
  cut: Cut | null,
  seeThrough: boolean,
  hidden: ReadonlySet<string>,
  isolated: ReadonlySet<string> | null,
  levelSet: Set<LevelKey> | null,
  phaseState: RenderInput["phaseState"],
): string {
  const { layers, colors } = input;
  const out: string[] = [];
  const plane = input.plane ?? null;
  const sectionOn = cut !== null || plane !== null;
  const ghost = input.ghostMep && !sectionOn && !seeThrough && !input.plan;
  const showBuried = seeThrough || (!!input.belowGrade && !input.plan) || !!input.plan?.below;
  const unit = clamp(proj.scale * 0.11, 0.9, 3.2);
  const look: MepLook = input.mepLook ?? { plumbing: "lines", electrical: "lines" };
  const visibleRun = (r: Run) => {
    if (layers[r.layer] === false) return false;
    if (hidden.has(r.id) || isolated) return false;
    if (levelSet && !levelSet.has(r.level)) return false;
    if (r.underground && !showBuried) return false;
    if (phaseState && phaseState[r.phase] === "future") return false;
    return true;
  };
  const drawRun = (r: Run, pts: V3[]) => {
    const q = pts.map((p) => proj.project(p));
    let dstr = "";
    q.forEach((p, i) => (dstr += `${i ? "L" : "M"}${f1(p.x)},${f1(p.y)}`));
    let w = (r.width ?? 1.6) * unit;
    // a cable tray keeps its own look; wires and pipes take the look chosen for their system
    const sub = r.sub === "tray" ? undefined : (r.sub ?? subOfRun(r));
    const isLink = r.sub === "power" || r.sub === "switched";
    const col = runColor(r.kind, sub, colors);
    const real = (r.kind === "plumbing" && look.plumbing === "pipes") || (r.kind === "electrical" && look.electrical === "wires");
    if (real && sub) {
      // the pipe or cable itself, at its real size: a dark edge, the body and a highlight, a fitting at each bend
      const dia = r.kind === "plumbing" ? (sub === "drain" ? 0.25 : 0.075) : 0.045;
      const pxPerFt = Math.hypot(proj.project([pts[0][0] + 1, pts[0][1], pts[0][2]]).x - q[0].x, proj.project([pts[0][0] + 1, pts[0][1], pts[0][2]]).y - q[0].y) || proj.scale;
      w = Math.max(r.kind === "plumbing" ? 2.2 : 1.4, dia * pxPerFt);
      const op = ghost ? 0.7 : 1;
      out.push(`<path d="${dstr}" fill="none" stroke="${shadeHex(col, 0.45)}" stroke-width="${(w + 1.4).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${op}" data-run="${r.id}" data-look="real"/>`);
      out.push(`<path d="${dstr}" fill="none" stroke="${col}" stroke-width="${w.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${op}"/>`);
      out.push(`<path d="${dstr}" fill="none" stroke="${mixHex(col, "#ffffff", 0.55)}" stroke-width="${(w * 0.3).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${0.75 * op}"/>`);
      if (r.kind === "plumbing") for (let i = 1; i < q.length - 1; i++) out.push(`<circle cx="${f1(q[i].x)}" cy="${f1(q[i].y)}" r="${f1(w * 0.68)}" fill="${shadeHex(col, 0.8)}" stroke="${shadeHex(col, 0.45)}" stroke-width=".6" fill-opacity="${op}"/>`);
    } else if (sub && (r.kind === "plumbing" || r.kind === "electrical")) {
      // drawing lines: plumbing dotted, electrical dashed; on a plan a wire from a switch is drawn as a curved arc
      const dash = r.kind === "plumbing" ? (sub === "drain" ? "6 2 1 2" : "0.1 3.2") : "5 3";
      const lw = r.kind === "plumbing" ? (sub === "drain" ? 1.6 : 2) : 1.3;
      let d = dstr;
      if (r.kind === "electrical" && input.plan && isLink) {
        const a0 = q[0];
        const b0 = q[q.length - 1];
        const L = Math.hypot(b0.x - a0.x, b0.y - a0.y);
        const cx = (a0.x + b0.x) / 2 - ((b0.y - a0.y) / (L || 1)) * L * 0.22;
        const cy = (a0.y + b0.y) / 2 + ((b0.x - a0.x) / (L || 1)) * L * 0.22;
        d = `M${f1(a0.x)},${f1(a0.y)}Q${f1(cx)},${f1(cy)} ${f1(b0.x)},${f1(b0.y)}`;
      }
      out.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${dash}" stroke-opacity="${ghost ? 0.7 : 0.95}" data-run="${r.id}" data-look="lines"/>`);
      if (r.kind === "electrical" && input.plan && isLink) dstr = d;
    } else {
      out.push(
        `<path d="${dstr}" fill="none" stroke="${mepColor(r.kind, colors)}" stroke-width="${w.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${ghost ? 0.55 : 0.95}"${ghost ? ' stroke-dasharray="4 3"' : ""} data-run="${r.id}"/>`,
      );
    }
    // runs the user drew can be selected: a wide invisible stroke carries the element id
    if (r.pick) out.push(`<path d="${dstr}" fill="none" stroke="#000" stroke-opacity="0" stroke-width="${Math.max(10, w + 6).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" data-el="${r.id}"/>`);
  };
  for (const r of scene.runs) {
    if (!visibleRun(r)) continue;
    // section view: only the part of a run in front of the cut plane remains
    let pts = r.pts;
    if (cut) pts = clipRun(pts, cut.axis, cut.at, cut.keep > 0);
    if (plane) pts = pts.filter((q) => plane.n[0] * q[0] + plane.n[1] * q[1] >= plane.d - 1e-6);
    // a plan and a cutaway keep the pipes, wires and ducts of the cut storey (they run in its ceiling and under its
    // slab) and drop what goes on up into the storey above
    if (input.plan) pts = clipRun(pts, 2, input.plan.cutZ + CEILING_ABOVE_CUT, false);
    else if (input.cutAt != null) pts = clipRun(pts, 2, input.cutAt + CEILING_ABOVE_CUT, false);
    if (pts.length < 2) continue;
    // a room view draws only what is in front of the eye (a run passing overhead can come out in two pieces)
    for (const piece of clipNearLine(pts, proj)) drawRun(r, piece);
  }
  const size = clamp(proj.scale * 0.5, 3, 9);
  for (const dv of scene.devices) {
    if (layers[dv.layer] === false) continue;
    if (levelSet && !levelSet.has(dv.level)) continue;
    if (isolated) continue;
    if (cut && (cut.keep > 0 ? dv.at[cut.axis] < cut.at : dv.at[cut.axis] > cut.at)) continue;
    if (plane && plane.n[0] * dv.at[0] + plane.n[1] * dv.at[1] < plane.d) continue;
    if (phaseState && phaseState[dv.phase] === "future") continue;
    const c = proj.project(dv.at);
    if (c.depth < proj.near) continue;
    // a light whose switch is on glows (in 3D and on the plan)
    if (dv.lit) out.push(`<circle cx="${f1(c.x)}" cy="${f1(c.y)}" r="${f1(clamp(proj.scaleAt(dv.at) * 3.2, size * 3, proj.eye ? 420 : 140))}" fill="url(#bs-glow)" pointer-events="none" data-lit="${dv.id}"/>`);
    // a fixture of the catalogue shows its own shape in 3D; its symbol is for the plan
    if (dv.planOnly && !input.plan) continue;
    out.push(dv.pick ? `<g data-el="${dv.id}">${deviceSvg(dv, proj, size, colors, ghost)}<circle cx="${f1(c.x)}" cy="${f1(c.y)}" r="${f1(size + 3)}" fill="#000" fill-opacity="0"/></g>` : deviceSvg(dv, proj, size, colors, ghost));
  }
  return out.join("");
}

/** How far above a plan's or a cutaway's cut (4 ft over the floor) the pipes and wires of the cut storey still
 *  show: its ceiling, for storeys up to 12 ft. */
const CEILING_ABOVE_CUT = 8;

/** The part of a run on one side of a plane square to an axis (above it with `above`), cut where it crosses. */
function clipRun(pts: V3[], k: 0 | 1 | 2, at: number, above: boolean): V3[] {
  const on = (q: V3) => (above ? q[k] >= at : q[k] <= at);
  const kept: V3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (on(a)) kept.push(a);
    if (b && on(a) !== on(b)) {
      const t = (at - a[k]) / (b[k] - a[k]);
      kept.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]);
    }
  }
  return kept;
}

function deviceSvg(dv: Device, proj: Projector, size: number, colors: AppearanceMap, ghost: boolean): string {
  const p = proj.project(dv.at);
  const col = mepColor(dv.kind, colors);
  const op = ghost ? 0.7 : 1;
  const x = f1(p.x);
  const y = f1(p.y);
  const s = size;
  const label = (t: string, dy = 0, k = 1) => `<text x="${x}" y="${f1(p.y + dy)}" font-size="${f1(s * 1.15 * k)}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="${col}" fill-opacity="${op}" font-family="var(--font-data)">${t}</text>`;
  const ring = (r: number) => `<circle cx="${x}" cy="${y}" r="${f1(s * r)}" fill="var(--bg-viewport)" fill-opacity=".85" stroke="${col}" stroke-width="1.1" stroke-opacity="${op}"/>`;
  const bars = (half: number) => `<path d="M${f1(p.x - s * half)},${f1(p.y - s * 0.2)}H${f1(p.x + s * half)}M${f1(p.x - s * half)},${f1(p.y + s * 0.2)}H${f1(p.x + s * half)}" stroke="${col}" stroke-width="1" stroke-opacity="${op}"/>`;
  const boxed = (t: string) => `<rect x="${f1(p.x - s * 1.1)}" y="${f1(p.y - s * 0.65)}" width="${f1(s * 2.2)}" height="${f1(s * 1.3)}" rx="1" fill="var(--bg-viewport)" fill-opacity=".85" stroke="${col}" stroke-width="1" stroke-opacity="${op}"/>${label(t, 0, 0.62)}`;
  switch (dv.shape) {
    case "switch":
      return label("S");
    case "switch3":
      return label("S3", 0, 0.85);
    case "dimmer":
      return label("SD", 0, 0.85);
    case "outlet":
      return ring(0.55) + bars(0.95);
    case "gfci":
      return ring(0.55) + bars(0.95) + label("GFI", s * 1.15, 0.5);
    case "outlet240":
      return ring(0.6) + `<path d="M${x},${f1(p.y - s * 0.6)}V${f1(p.y + s * 0.6)}M${f1(p.x - s * 0.52)},${f1(p.y + s * 0.3)}H${f1(p.x + s * 0.52)}" stroke="${col}" stroke-width="1"/>`;
    case "light":
      return ring(0.6) + `<path d="M${f1(p.x - s * 0.42)},${f1(p.y - s * 0.42)}L${f1(p.x + s * 0.42)},${f1(p.y + s * 0.42)}M${f1(p.x + s * 0.42)},${f1(p.y - s * 0.42)}L${f1(p.x - s * 0.42)},${f1(p.y + s * 0.42)}" stroke="${col}" stroke-width="1" stroke-opacity="${op}"/>`;
    case "recessed":
      return ring(0.45) + `<circle cx="${x}" cy="${y}" r="${f1(s * 0.18)}" fill="${col}" fill-opacity="${op}"/>`;
    case "pendant":
      return ring(0.6) + label("P", 0, 0.7);
    case "sconce":
      return ring(0.5) + `<path d="M${f1(p.x - s * 0.7)},${y}H${f1(p.x + s * 0.7)}" stroke="${col}" stroke-width="1.4"/>`;
    case "fan":
      return ring(0.75) + [45, 135, 225, 315].map((a) => `<path d="M${x},${y}L${f1(p.x + Math.cos((a * Math.PI) / 180) * s * 0.7)},${f1(p.y + Math.sin((a * Math.PI) / 180) * s * 0.7)}" stroke="${col}" stroke-width="1.6" stroke-linecap="round"/>`).join("") + `<circle cx="${x}" cy="${y}" r="${f1(s * 0.15)}" fill="${col}"/>`;
    case "exhaust":
      return boxed("EF");
    case "smoke":
      return ring(0.6) + label("SD", 0, 0.55);
    case "thermostat":
      return ring(0.55) + label("T", 0, 0.75);
    case "meter":
      return ring(0.6) + label("M", 0, 0.75);
    case "inverter":
      return boxed("INV");
    case "battery":
      return boxed("BAT");
    case "ev":
      return boxed("EV");
    case "generator":
      return boxed("GEN");
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
  const s = proj.scaleAt([t.at[0], t.at[1], t.at[2] + t.height / 2]);
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
  const rand = treeRand(t.id);
  const tk = Math.max(1.6, s * 0.5);
  if (t.kind === "pine") {
    // a short trunk and five jagged tiers, narrowing to the tip
    out.push(`<path d="M${f1(base.x)},${f1(base.y)}L${f1(base.x + (top.x - base.x) * 0.22)},${f1(base.y + (top.y - base.y) * 0.22)}" stroke="#5d452c" stroke-width="${f1(tk)}" stroke-linecap="round"/>`);
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const k0 = 0.14 + i * 0.165;
      const k1 = Math.min(1, k0 + 0.3);
      const a = { x: base.x + (top.x - base.x) * k0, y: base.y + (top.y - base.y) * k0 };
      const b = { x: base.x + (top.x - base.x) * k1, y: base.y + (top.y - base.y) * k1 };
      const w = R * (1 - i * 0.17);
      const teeth = 7;
      let d = `M${f1(a.x - w)},${f1(a.y)}`;
      for (let j = 1; j <= teeth; j++) d += `L${f1(a.x - w + (2 * w * (j - 0.5)) / teeth)},${f1(a.y + R * 0.08)}L${f1(a.x - w + (2 * w * j) / teeth)},${f1(a.y)}`;
      d += `L${f1(b.x)},${f1(b.y)}Z`;
      out.push(`<path d="${d}" fill="url(#bs-pine)" stroke="#143823" stroke-width=".6" stroke-linejoin="round"/>`);
    }
    return out.join("");
  }
  if (t.kind === "shrub") {
    // a mound of leafy clusters on a dark base, with blooms when it flowers
    out.push(`<ellipse cx="${f1(base.x)}" cy="${f1(base.y)}" rx="${f1(R * 0.85)}" ry="${f1(R * 0.3)}" fill="#1f4a2a" fill-opacity=".8"/>`);
    const clusters: [number, number, number][] = [[-0.45, -0.25, 0.48], [0.45, -0.22, 0.48], [0, -0.42, 0.55], [-0.22, -0.7, 0.42], [0.25, -0.68, 0.4], [0, -0.9, 0.32]];
    for (const [dx, dy, r] of clusters) out.push(`<circle cx="${f1(base.x + dx * R + (rand() - 0.5) * R * 0.12)}" cy="${f1(base.y + dy * R)}" r="${f1(R * r)}" fill="url(#bs-bush)" stroke="#24552f" stroke-width=".5"/>`);
    if (t.bloom) for (let i = 0; i < 14; i++) out.push(`<circle cx="${f1(base.x + (rand() - 0.5) * R * 1.5)}" cy="${f1(base.y - R * (0.2 + rand() * 0.85))}" r="${f1(Math.max(0.9, R * 0.07))}" fill="${t.bloom}" stroke="#ffffff" stroke-opacity=".5" stroke-width=".3"/>`);
    return out.join("");
  }
  if (t.kind === "palm") {
    // a slightly curved, ringed trunk and a crown of leafy fronds
    const bend = (top.x - base.x) * 0.15 + R * 0.25;
    const mx = (base.x + top.x) / 2 + bend;
    const my = (base.y + top.y) / 2;
    out.push(`<path d="M${f1(base.x)},${f1(base.y)}Q${f1(mx)},${f1(my)} ${f1(top.x)},${f1(top.y)}" fill="none" stroke="#7a5a3a" stroke-width="${f1(tk * 1.15)}" stroke-linecap="round"/>`);
    for (let i = 1; i < 9; i++) {
      const k = i / 9;
      const px = (1 - k) * (1 - k) * base.x + 2 * (1 - k) * k * mx + k * k * top.x;
      const py = (1 - k) * (1 - k) * base.y + 2 * (1 - k) * k * my + k * k * top.y;
      out.push(`<path d="M${f1(px - tk * 0.55)},${f1(py)}h${f1(tk * 1.1)}" stroke="#5a4129" stroke-width=".7"/>`);
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const ex = top.x + Math.cos(a) * R * 1.1;
      const ey = top.y + Math.sin(a) * R * 0.45 + R * 0.22;
      const cx2 = top.x + Math.cos(a) * R * 0.55;
      const cy2 = top.y + Math.sin(a) * R * 0.2 - R * 0.36;
      const nx = -(ey - top.y);
      const ny = ex - top.x;
      const nl = Math.hypot(nx, ny) || 1;
      const wv = R * 0.12;
      out.push(`<path d="M${f1(top.x)},${f1(top.y)}Q${f1(cx2 + (nx / nl) * wv)},${f1(cy2 + (ny / nl) * wv)} ${f1(ex)},${f1(ey)}Q${f1(cx2 - (nx / nl) * wv)},${f1(cy2 - (ny / nl) * wv)} ${f1(top.x)},${f1(top.y)}Z" fill="${i % 2 ? "url(#bs-leaf)" : "url(#bs-leaf-dark)"}" stroke="#1f4d2b" stroke-width=".4"/>`);
    }
    out.push(`<circle cx="${f1(top.x)}" cy="${f1(top.y + R * 0.08)}" r="${f1(R * 0.12)}" fill="#6b4b2a"/>`);
    return out.join("");
  }
  // a shade tree: a trunk forking into two limbs, a crown of leafy clusters shaded from the light
  const fork = { x: base.x + (top.x - base.x) * 0.45, y: base.y + (top.y - base.y) * 0.45 };
  out.push(`<path d="M${f1(base.x)},${f1(base.y)}L${f1(fork.x)},${f1(fork.y)}" stroke="#5d452c" stroke-width="${f1(tk * 1.2)}" stroke-linecap="round"/>`);
  for (const side of [-1, 1]) out.push(`<path d="M${f1(fork.x)},${f1(fork.y)}Q${f1(fork.x + side * R * 0.25)},${f1((fork.y + top.y) / 2)} ${f1(top.x + side * R * 0.35)},${f1(top.y + R * 0.15)}" fill="none" stroke="#5d452c" stroke-width="${f1(tk * 0.7)}" stroke-linecap="round"/>`);
  const crown: [number, number, number][] = [[0, 0.05, 0.62], [-0.55, 0.2, 0.48], [0.55, 0.2, 0.48], [-0.32, -0.32, 0.5], [0.34, -0.3, 0.48], [0, -0.55, 0.42], [-0.7, -0.05, 0.36], [0.72, -0.02, 0.36]];
  for (const [dx, dy, r] of crown) out.push(`<circle cx="${f1(top.x + dx * R + (rand() - 0.5) * R * 0.1)}" cy="${f1(top.y + dy * R * 0.8)}" r="${f1(R * r)}" fill="url(#bs-leaf)" stroke="#1f5230" stroke-width=".5"/>`);
  return out.join("");
}

/** A repeatable jitter per tree, so its clusters do not move between renders. */
function treeRand(id: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
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

/** Screen-space outline, box and hull of an element, for selection overlays. */
export interface ElementOutline {
  hull: V2[];
  grips: V2[];
  box: { x: number; y: number; w: number; h: number };
}

/** Compute an element's screen-space outline for the current projector. */
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

/** Which levels are drawn in the plan for a level. */
export function planLevelsFor(level: LevelKey): LevelKey[] {
  if (level === "foundation") return ["site", "foundation"];
  if (level === "level2") return ["site", "level2"];
  if (level === "roof") return ["site", "level2", "roof"];
  return ["site", "foundation", "level1"];
}
