/**
 * lib/draw/compose.ts
 *
 * WHAT   composeScene(base, items, xf): the scene the viewport actually shows. It starts from the project's
 *        built-in scene, applies the move / rotate / scale overrides (xf) to built-in elements, adds the
 *        geometry of every DrawnItem (walls with door and window openings carved out, slabs, roofs, stairs built
 *        from steps, columns, beams, ramps, foundations, joists and trusses laid out on a host, ducts, pipes,
 *        trays, devices, catalogue fixtures with their ports, the wires and pipes between them (linkPath), solar
 *        arrays, braces, sheds, pools, fences and garden walls, trees and bushes, flower and gravel beds, boulders, roads, sidewalks, signs,
 *        traffic lights, drains, gutters, septic systems …; lights fed by a switch that is on are lit) and lists the flat
 *        2D marks (lines, shapes, text, dimensions, elevation marks …) for
 *        the draft layer. Also the per-kind defaults (META, storeyHeight) and wallFrameOf, the centre line of a
 *        wall that doors and windows are placed on. Transforms of built-in elements can be stages (`then`), a
 *        stretch (`win`: only corners inside a window move) or a slide of a door / window (`slide`: the old hole
 *        is filled and a new one cut). Rooms and hatches made from a click re-find their boundary every time.
 * FOR    Everything that reads a Scene (renderer, Model Explorer, Properties, selection, schedules, quantity
 *        take-off) gets user-drawn elements for free because they are real prisms, runs and elements here.
 *        sceneOf(state) in lib/draw/scene-of.ts memoises the result per (project, drawn, xf).
 * DEBUG  - An item draws nothing: its layer may be off (MEP layers start hidden; the tools switch them on), its
 *          host may be gone (doors and windows need their wall, framing and trusses need their host), or it
 *          has fewer points than its kind needs.
 *        - A door leaves no hole: the host must be a Wall / Partition whose prisms are rectangles; the hole is
 *          cut by carve() in the wall's own frame (wallFrameOf).
 *        - A built-in element cannot be rotated freely: its gable and roof pieces are extruded along Y, which
 *          can only be moved, scaled or turned by 180° (applyXform keeps them axis-aligned).
 *        - Keys must stay unique per prism: new pieces use `${id}#u${n}`.
 *        - A wire or pipe draws nothing: both ends must be fixtures of the catalogue (their ports are collected in
 *          the first pass, links are built after every item). A drain falls from the fixture towards the stack.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { LayerId } from "../types";
import { buildElements, ccw, prismBounds } from "../scene/builder";
import type { Category, ColorKey, Device, DoorSwing, LevelKey, PhaseKey, Prism, Run, RunKind, Scene, SceneElement, SystemName, Tree, V2, V3 } from "../scene/types";
import { add2, affApply, affIsDiagonal, angleDeg, arcFrom3, arcPts, circlePts, dist2, dot2, lerp2, mul2, orientedRect, perp2, splinePts, sub2, unit2 } from "./geom";
import { enclosureAt } from "./enclose";
import type { DrawnItem, ItemKind, XForm } from "./types";
import { fitPiece, pieceOf, placedParts } from "./furniture";
import { LOOK_COLOR, type Part } from "./parts";
import { fixtureBase, fixtureOf } from "./fixtures";
import { FENCE_HEIGHT, drainParts, fenceParts, flowerBedParts, gravelBedParts, gutterParts, poolParts, roadParts, rockParts, sidewalkParts, signParts, signalParts, type DrainType, type FenceType, type PoolShape, type RoadSpec, type SignType } from "./site";

/* ── per-kind metadata ────────────────────────────────────────────────── */
interface Meta {
  cat: Category;
  layer: LayerId;
  system: SystemName;
  color: ColorKey;
  material: string;
  phase: PhaseKey;
}
const m = (cat: Category, layer: LayerId, system: SystemName, color: ColorKey, material: string, phase: PhaseKey): Meta => ({ cat, layer, system, color, material, phase });

const DRAFT = (cat: Category, layer: LayerId = "drafting"): Meta => m(cat, layer, "Drafting", "interior", "—", "site");

/** Category, layer, system, colour, default material and build phase of each kind of drawn item. */
export const META: Record<ItemKind, Meta> = {
  line: DRAFT("Line"),
  polyline: DRAFT("Line"),
  spline: DRAFT("Line"),
  arc: DRAFT("Line"),
  rect: DRAFT("Shape"),
  circle: DRAFT("Shape"),
  hatch: DRAFT("Hatch"),
  room: DRAFT("Room"),
  wall: m("Wall", "walls", "Architectural", "walls", 'CMU 8" grouted, #5 vert. @ 32"', "envelope"),
  door: m("Door", "walls", "Architectural", "door", "Impact-rated solid core door", "envelope"),
  window: m("Window", "walls", "Architectural", "glass", "Laminated impact glass, aluminium frame (HVHZ NOA)", "envelope"),
  slab: m("Slab", "interior", "Structural", "structural", '6" concrete slab, f\'c 4000 psi', "structure1"),
  roof: m("Roof", "roof", "Architectural", "roof", 'Concrete barrel tile on 5/8" ply (HVHZ)', "roof"),
  stair: m("Stair", "interior", "Architectural", "furniture", "Hardwood treads on steel stringer", "structure1"),
  column: m("Column", "walls", "Structural", "structural", "Reinforced concrete 4000 psi, 4-#6", "structure1"),
  beam: m("Beam", "walls", "Structural", "structural", "Reinforced concrete bond beam, 2-#5 top/bot", "structure1"),
  ramp: m("Ramp", "walls", "Architectural", "paving", "Concrete, broom finish (1:12 maximum)", "finishes"),
  foundation: m("Foundation", "foundation", "Structural", "structural", 'Reinforced concrete 4000 psi, #5 @ 12"', "foundation"),
  framing: m("Framing", "walls", "Structural", "furniture", '2×6 SYP No. 2 @ 16" o.c.', "structure1"),
  truss: m("Truss", "roof", "Structural", "structural", "2×6 SYP, 18 ga. gusset plates", "roof"),
  brace: m("Brace", "walls", "Structural", "structural", "Steel angle L4×4×¼", "structure1"),
  connection: m("Connection", "walls", "Structural", "structural", 'Steel plate ⅜" with 4 bolts', "structure1"),
  duct: m("Duct", "hvac", "MEP", "hvac", "Galvanized sheet-metal duct", "mep"),
  pipe: m("Pipe", "plumbing", "MEP", "plumbing", "PVC / copper pipe", "mep"),
  tray: m("Tray", "electrical", "MEP", "electrical", "Ladder cable tray", "mep"),
  device: m("Device", "electrical", "MEP", "electrical", "Device", "mep"),
  fixture: m("Fixture", "furniture", "Interior", "fixture", "Vitreous china", "finishes"),
  equipment: m("Equipment", "hvac", "MEP", "hvac", "Packaged mechanical unit", "mep"),
  furniture: m("Furniture", "furniture", "Interior", "furniture", "Hardwood", "finishes"),
  text: DRAFT("Annotation", "annotation"),
  note: DRAFT("Annotation", "annotation"),
  dim: DRAFT("Annotation", "annotation"),
  leader: DRAFT("Annotation", "annotation"),
  tag: DRAFT("Annotation", "annotation"),
  secmark: DRAFT("Annotation", "annotation"),
  elevmark: DRAFT("Annotation", "annotation"),
  detail: DRAFT("Annotation", "annotation"),
  gridline: DRAFT("Annotation", "annotation"),
  markup: DRAFT("Annotation", "annotation"),
  pin: DRAFT("Annotation", "annotation"),
  label: DRAFT("Annotation", "annotation"),
  image: DRAFT("Annotation", "annotation"),
  elevline: DRAFT("Annotation", "annotation"),
  elevarc: DRAFT("Annotation", "annotation"),
  shed: m("Outbuilding", "site", "Site", "walls", 'Wood frame on a 4" slab, T1-11 siding, asphalt shingles', "finishes"),
  tree: m("Tree", "site", "Site", "landscape", "Live oak, 3\" caliper at planting", "finishes"),
  flowers: m("Planting", "landscape", "Site", "flowers", "Flower bed: perennials in 3\" mulch", "finishes"),
  septic: m("Septic", "utilities", "Site", "septic", "Precast concrete septic tank, two compartments, gravel drain field", "mep"),
  solid: m("Equipment", "walls", "Architectural", "walls", "Imported (IFC)", "structure1"),
  pool: m("Pool", "landscape", "Site", "water", "Gunite pool, plaster finish, 12\" coping, broom-finish deck", "finishes"),
  rock: m("Rock", "landscape", "Site", "rock", "Landscape boulder (limestone)", "finishes"),
  fence: m("Fence", "landscape", "Site", "furniture", "Fence: pressure-treated posts in concrete footings", "finishes"),
  gravel: m("Planting", "landscape", "Site", "paving", "Gravel bed over weed fabric", "finishes"),
  road: m("Road", "civil", "Site", "asphalt", "2\" asphalt over 8\" limerock base, thermoplastic striping", "site"),
  sidewalk: m("Sidewalk", "civil", "Site", "concrete", "4\" concrete sidewalk, joints at 5 ft", "finishes"),
  sign: m("Sign", "civil", "Site", "signRed", "Aluminium sign on a galvanised post (MUTCD)", "finishes"),
  signal: m("Signal", "civil", "Site", "metal", "Traffic signal on a steel mast arm", "finishes"),
  drain: m("Drain", "civil", "Site", "metal", "Cast-iron grate over a precast catch basin", "site"),
  gutter: m("Gutter", "roof", "Architectural", "gutter", "5\" K-style aluminium gutter, 2×3\" downspouts", "roof"),
  solar: m("Solar", "roof", "MEP", "solar", "Monocrystalline panels on aluminium rails", "mep"),
  wire: m("Wire", "electrical", "MEP", "electrical", "NM-B cable (12/2 power, 14/2 switched)", "mep"),
  pipelink: m("Pipe", "plumbing", "MEP", "plumbing", "PEX supply, PVC drain", "mep"),
  clone: m("Wall", "walls", "Architectural", "walls", "Copy", "structure1"),
};

/** Layer, colour and system of an imported solid by its category. */
const SOLID_LOOK: Partial<Record<Category, { layer: LayerId; color: ColorKey; system: SystemName }>> = {
  Wall: { layer: "walls", color: "walls", system: "Architectural" },
  Slab: { layer: "foundation", color: "structural", system: "Structural" },
  Roof: { layer: "roof", color: "roof", system: "Architectural" },
  Column: { layer: "walls", color: "structural", system: "Structural" },
  Beam: { layer: "walls", color: "structural", system: "Structural" },
  Door: { layer: "walls", color: "door", system: "Architectural" },
  Window: { layer: "walls", color: "glass", system: "Architectural" },
  Stair: { layer: "interior", color: "furniture", system: "Architectural" },
  Footing: { layer: "foundation", color: "structural", system: "Structural" },
  Ramp: { layer: "walls", color: "paving", system: "Architectural" },
  Framing: { layer: "walls", color: "furniture", system: "Structural" },
  Furniture: { layer: "furniture", color: "furniture", system: "Interior" },
  Equipment: { layer: "hvac", color: "hvac", system: "MEP" },
};

/** Kinds drawn as flat 2D marks by the draft layer (everything else becomes prisms, runs or devices). */
const DRAFT_KINDS = new Set<ItemKind>(["line", "polyline", "spline", "arc", "rect", "circle", "hatch", "room", "text", "note", "dim", "leader", "tag", "secmark", "elevmark", "detail", "gridline", "markup", "pin", "label", "image", "elevline", "elevarc"]);

/** True for kinds the draft layer draws (flat 2D marks). */
export const isDraftKind = (k: ItemKind): boolean => DRAFT_KINDS.has(k);

/** Ceiling-to-floor height of a level in feet (10 when the level has no storey above it). */
export function storeyHeight(scene: Pick<Scene, "levelZ">, level: LevelKey): number {
  const z = scene.levelZ;
  const h = level === "level1" ? z.level2 - z.level1 : level === "level2" ? z.roof - z.level2 : level === "foundation" ? z.level1 - z.foundation : 10;
  return h > 1 ? h : 10;
}

/** Size, colour and name of the boxes the library and the fixture / equipment tools place: width, depth, height in feet. */
export const BOXES: Record<string, { w: number; d: number; h: number; label: string }> = {
  sofa: { w: 7, d: 3, h: 2.8, label: "Sofa" },
  table: { w: 5, d: 3, h: 2.5, label: "Dining Table" },
  bed: { w: 6.5, d: 5, h: 2, label: "Bed" },
  chair: { w: 1.6, d: 1.6, h: 3, label: "Chair" },
  desk: { w: 5, d: 2.5, h: 2.5, label: "Desk" },
  toilet: { w: 1.5, d: 2.3, h: 2.5, label: "Toilet" },
  sink: { w: 2, d: 1.7, h: 3, label: "Sink" },
  bathtub: { w: 5, d: 2.5, h: 1.8, label: "Bathtub" },
  shower: { w: 3, d: 3, h: 7, label: "Shower" },
  ahu: { w: 4, d: 2.5, h: 3, label: "Air Handler" },
  heater: { w: 1.8, d: 1.8, h: 5, label: "Water Heater" },
  generator: { w: 6, d: 3, h: 4, label: "Generator" },
  panel: { w: 2, d: 0.8, h: 4, label: "Electrical Panel" },
  steelcol: { w: 0.8, d: 0.8, h: 10, label: "Steel Column" },
  footing: { w: 3, d: 3, h: 1.2, label: "Footing Pad" },
};

/* ── small param helpers ──────────────────────────────────────────────── */
/** A numeric parameter of an item, or the default. */
export const num = (it: Pick<DrawnItem, "p">, k: string, d: number): number => (typeof it.p[k] === "number" ? (it.p[k] as number) : d);
/** A text parameter of an item, or the default. */
export const str = (it: Pick<DrawnItem, "p">, k: string, d: string): string => (typeof it.p[k] === "string" ? (it.p[k] as string) : d);

/* ── wall frames and carving ──────────────────────────────────────────── */
/** The centre line of a wall: start point, unit direction, length, thickness and height range. */
export interface Frame {
  A: V2;
  dir: V2;
  nrm: V2;
  len: number;
  thick: number;
  z0: number;
  z1: number;
  /** projection of A on dir: where the wall starts along its axis */
  u0: number;
  /** projection of the centre line on nrm */
  vc: number;
}

/** The frame of a set of rectangular z-prisms (the pieces of one wall), or null when there is none. */
export function wallFrameOf(prisms: Prism[]): Frame | null {
  const zs = prisms.filter((p) => p.axis === "z" && p.poly.length === 4);
  if (!zs.length) return null;
  let best = -1;
  let dir: V2 = [1, 0];
  for (const p of zs)
    for (let i = 0; i < 2; i++) {
      const l = dist2(p.poly[i], p.poly[i + 1]);
      if (l > best + 1e-9) {
        best = l;
        dir = unit2(sub2(p.poly[i + 1], p.poly[i]));
      }
    }
  const nrm = perp2(dir);
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of zs) {
    z0 = Math.min(z0, p.a0);
    z1 = Math.max(z1, p.a1);
    for (const q of p.poly) {
      const u = dot2(q, dir);
      const v = dot2(q, nrm);
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
  }
  const vc = (v0 + v1) / 2;
  return { A: add2(mul2(dir, u0), mul2(nrm, vc)), dir, nrm, len: u1 - u0, thick: v1 - v0, z0, z1, u0, vc };
}

/** The frame of one element of a scene (a wall or partition), or null. */
export function frameOfElement(scene: Scene, id: string): Frame | null {
  const el = scene.elementById[id];
  if (!el || (el.category !== "Wall" && el.category !== "Partition")) return null;
  return wallFrameOf(scene.prisms.filter((p) => p.id === id));
}

interface Hole {
  /** distance along the wall where the hole starts, and its width */
  at: number;
  w: number;
  /** height above the wall's base where it starts and ends */
  sill: number;
  head: number;
}

/** Cut a hole through every rectangular piece of a wall; pieces the hole misses are kept as they are. */
function carve(pieces: Prism[], f: Frame, hole: Hole, nextKey: () => string): Prism[] {
  const hu0 = f.u0 + hole.at;
  const hu1 = hu0 + hole.w;
  const zh0 = f.z0 + hole.sill;
  const zh1 = f.z0 + hole.head;
  const out: Prism[] = [];
  const e = 1e-4;
  const poly = (ua: number, ub: number, va: number, vb: number): V2[] =>
    [[ua, va], [ub, va], [ub, vb], [ua, vb]].map(([u, v]) => add2(mul2(f.dir, u), mul2(f.nrm, v)) as V2);
  for (const p of pieces) {
    if (p.axis !== "z" || p.poly.length !== 4) {
      out.push(p);
      continue;
    }
    let pu0 = Infinity;
    let pu1 = -Infinity;
    let pv0 = Infinity;
    let pv1 = -Infinity;
    for (const q of p.poly) {
      const u = dot2(q, f.dir);
      const v = dot2(q, f.nrm);
      pu0 = Math.min(pu0, u);
      pu1 = Math.max(pu1, u);
      pv0 = Math.min(pv0, v);
      pv1 = Math.max(pv1, v);
    }
    if (hu1 <= pu0 + e || hu0 >= pu1 - e || zh1 <= p.a0 + e || zh0 >= p.a1 - e) {
      out.push(p);
      continue;
    }
    const piece = (ua: number, ub: number, a0: number, a1: number) => {
      if (ub - ua < 0.02 || a1 - a0 < 0.02) return;
      out.push({ ...p, key: nextKey(), poly: poly(ua, ub, pv0, pv1), a0, a1 });
    };
    piece(pu0, Math.max(pu0, hu0), p.a0, p.a1); // left of the hole
    piece(Math.min(pu1, hu1), pu1, p.a0, p.a1); // right of the hole
    const mu0 = Math.max(pu0, hu0);
    const mu1 = Math.min(pu1, hu1);
    piece(mu0, mu1, p.a0, Math.min(p.a1, zh0)); // below
    piece(mu0, mu1, Math.max(p.a0, zh1), p.a1); // above
  }
  return out;
}

/* ── transforms of built-in elements ──────────────────────────────────── */
const zmap = (x: XForm, z: number) => (x.zc ?? 0) + (z - (x.zc ?? 0)) * (x.sz ?? 1) + x.dz;

/** A built-in prism moved, rotated, scaled or stretched (with any further stages); y-extruded pieces (gables, roof slopes) only follow axis-aligned changes. */
export function xformPrism(p: Prism, x: XForm): Prism {
  const out = x.win ? stretchPrism(p, x.win, x.aff[4], x.aff[5]) : movePrism(p, x);
  return x.then ? xformPrism(out, x.then) : out;
}

/** Stretch: corners inside the window move by (dx, dy), the others stay. */
function stretchPrism(p: Prism, win: [number, number, number, number], dx: number, dy: number): Prism {
  const [x0, y0, x1, y1] = win;
  if (p.axis === "z") {
    const poly = p.poly.map(([px, py]) => (px >= x0 && px <= x1 && py >= y0 && py <= y1 ? ([px + dx, py + dy] as V2) : ([px, py] as V2)));
    return { ...p, poly: ccw(poly) };
  }
  // an XZ outline extruded along Y: x moves for corners inside in X, the ends move when they lie inside in Y
  const overlapsY = p.a1 >= y0 && p.a0 <= y1;
  const poly = overlapsY && dx ? ccw(p.poly.map(([px, pz]) => (px >= x0 && px <= x1 ? ([px + dx, pz] as V2) : ([px, pz] as V2)))) : p.poly;
  const overlapsX = p.poly.some(([px]) => px >= x0 && px <= x1);
  let a0 = p.a0;
  let a1 = p.a1;
  if (overlapsX && dy) {
    if (a0 >= y0 && a0 <= y1) a0 += dy;
    if (a1 >= y0 && a1 <= y1) a1 += dy;
  }
  return { ...p, poly, a0: Math.min(a0, a1), a1: Math.max(a0, a1) };
}

/** Add a further move or stretch at the end of a transform's stages. */
export function appendStage(cur: XForm | undefined, stage: XForm): XForm {
  if (!cur) return stage;
  return { ...cur, then: appendStage(cur.then, stage) };
}

function movePrism(p: Prism, x: XForm): Prism {
  if (p.axis === "z") {
    const poly = ccw(p.poly.map((q) => affApply(x.aff, q)));
    const a = zmap(x, p.a0);
    const b = zmap(x, p.a1);
    return { ...p, poly, a0: Math.min(a, b), a1: Math.max(a, b) };
  }
  if (!affIsDiagonal(x.aff)) return p;
  const [sx, , , sy, ex, ey] = x.aff;
  const poly = ccw(p.poly.map(([px, pz]) => [sx * px + ex, zmap(x, pz)] as V2));
  const y0 = sy * p.a0 + ey;
  const y1 = sy * p.a1 + ey;
  return { ...p, poly, a0: Math.min(y0, y1), a1: Math.max(y0, y1) };
}

/** Can this built-in element take the transform? (its y-extruded pieces need an axis-aligned one) */
export function canTransform(scene: Scene, id: string, aff: XForm["aff"]): boolean {
  if (affIsDiagonal(aff)) return true;
  return !scene.prisms.some((p) => p.id === id && p.axis === "y");
}

/* ── composing ────────────────────────────────────────────────────────── */
interface Acc {
  prisms: Prism[];
  runs: Run[];
  devices: Device[];
  swings: DoorSwing[];
  els: SceneElement[];
  trees: Tree[];
  n: number;
  /** where wires and pipes connect to each placed fixture or device, by item id */
  ports: Map<string, Port>;
}

/** Where a wire or pipe meets a fixture: the point, what the fixture is, and its floor. */
interface Port {
  at: V3;
  floor: number;
  ceiling: number;
  system: "electrical" | "plumbing" | "hvac";
  role: string;
  level: LevelKey;
}

const key = (a: Acc, id: string) => `${id}#u${++a.n}`;

function baseOf(it: DrawnItem, meta: Meta, layer?: LayerId) {
  return {
    id: it.id,
    name: it.name,
    category: meta.cat,
    layer: layer ?? meta.layer,
    level: it.level,
    system: meta.system,
    color: meta.color,
    material: str(it, "material", meta.material),
    phase: meta.phase,
  };
}

function addZ(a: Acc, it: DrawnItem, meta: Meta, poly: V2[], z0: number, z1: number, extra: Partial<Prism> = {}): void {
  if (z1 - z0 < 1e-3 || poly.length < 3) return;
  a.prisms.push({ ...baseOf(it, meta), ...extra, key: key(a, it.id), axis: "z", poly: ccw(poly), a0: z0, a1: z1 });
}

/** Parts (lib/draw/parts.ts) as prisms standing at height z, each in its own look. */
function addParts(a: Acc, it: DrawnItem, meta: Meta, parts: Part[], z: number, extra: Partial<Prism> = {}): void {
  for (const p of parts) addZ(a, it, meta, p.poly, z + p.z0, z + p.z1, { ...extra, color: LOOK_COLOR[p.look], ...(p.under ? { underground: true } : {}), ...(p.glass ? { glass: true } : {}), ...(p.pattern ? { pattern: p.pattern } : {}) });
}

function addY(a: Acc, it: DrawnItem, meta: Meta, polyXZ: V2[], y0: number, y1: number, extra: Partial<Prism> = {}): void {
  if (y1 - y0 < 1e-3 || polyXZ.length < 3) return;
  a.prisms.push({ ...baseOf(it, meta), ...extra, key: key(a, it.id), axis: "y", poly: ccw(polyXZ), a0: y0, a1: y1 });
}

/** A rectangle of width w and depth d centred at c and turned by rot degrees. */
export function boxPoly(c: V2, w: number, d: number, rotDeg: number): V2[] {
  const r = (rotDeg * Math.PI) / 180;
  const u: V2 = [Math.cos(r), Math.sin(r)];
  const v = perp2(u);
  const hw = w / 2;
  const hd = d / 2;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([a, b]) => add2(c, add2(mul2(u, a), mul2(v, b))) as V2);
}

const RUN_KIND: Partial<Record<ItemKind, RunKind>> = { duct: "hvac", pipe: "plumbing", tray: "electrical" };
const DEVICE_LAYER: Record<RunKind, LayerId> = { electrical: "electrical", plumbing: "plumbing", hvac: "hvac", fire: "fire", structural: "walls" };

/** Bounding box of a list of 3D points as a SceneElement range. */
function boxOfPts(pts: V3[]): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pts)
    for (let i = 0; i < 3; i++) {
      if (p[i] < min[i]) min[i] = p[i];
      if (p[i] > max[i]) max[i] = p[i];
    }
  return { min, max };
}

/** The plan points a flat 2D item is drawn through (curves sampled), used for its selection box. */
export function draftOutline(it: DrawnItem): V2[] {
  switch (it.kind) {
    case "circle":
      return it.pts.length > 1 ? circlePts(it.pts[0], dist2(it.pts[0], it.pts[1]), 32) : it.pts;
    case "arc": {
      const arc = it.pts.length > 2 ? arcFrom3(it.pts[0], it.pts[1], it.pts[2]) : null;
      return arc ? arcPts(arc, 24) : it.pts;
    }
    case "spline":
      return splinePts(it.pts, 8);
    case "text":
    case "note":
    case "pin":
    case "label":
    case "tag":
    case "elevmark": {
      const w = Math.max(1.5, str(it, "text", "").length * 0.55);
      const [x, y] = it.pts[0] ?? [0, 0];
      return [[x, y], [x + w, y + 1.2]];
    }
    case "image": {
      const [x, y] = it.pts[0] ?? [0, 0];
      return [[x, y], [x + num(it, "w", 4), y + num(it, "h", 3)]];
    }
    case "detail":
    case "elevarc": {
      return it.pts.length > 1 ? circlePts(it.pts[0], dist2(it.pts[0], it.pts[1]), 24) : it.pts;
    }
    case "dim": {
      if (it.pts.length < 2) return it.pts;
      const off = num(it, "off", 2);
      const n = mul2(perp2(unit2(sub2(it.pts[1], it.pts[0]))), off);
      return [it.pts[0], it.pts[1], add2(it.pts[0], n), add2(it.pts[1], n)];
    }
    default:
      return it.pts;
  }
}

/** Build everything one solid item contributes: prisms, runs, devices. Items needing a host are done later. */
function buildSolid(it: DrawnItem, scene: Scene, a: Acc, endJoin: (pt: V2, self: string) => number): void {
  const meta = META[it.kind];
  const H = storeyHeight(scene, it.level);
  const z = it.z;
  const [p0, p1] = it.pts;
  switch (it.kind) {
    case "wall": {
      if (!p1) return;
      const t = num(it, "thick", 0.67);
      const h = num(it, "height", H);
      const dir = unit2(sub2(p1, p0));
      const s = endJoin(p0, it.id);
      const e = endJoin(p1, it.id);
      const A = sub2(p0, mul2(dir, s));
      const B = add2(p1, mul2(dir, e));
      addZ(a, it, meta, orientedRect(A, B, t), z, z + h, { loadBearing: it.p.bearing === true });
      return;
    }
    case "slab": {
      const th = num(it, "thick", 0.5);
      // a slab on the ground floor or the foundation is part of the foundation; a pad out on the site is landscape
      addZ(a, it, meta, it.pts, z - th, z, { loadBearing: true, layer: it.level === "level1" || it.level === "foundation" ? "foundation" : it.level === "site" ? "landscape" : "interior" });
      return;
    }
    case "roof": {
      const th = num(it, "thick", 0.5);
      addZ(a, it, meta, it.pts, z, z + th);
      return;
    }
    case "foundation": {
      const th = num(it, "thick", 1);
      addZ(a, it, meta, it.pts, z - th, z, { loadBearing: true, underground: true });
      return;
    }
    case "column": {
      const s = num(it, "size", 1);
      const h = num(it, "height", H);
      const rot = num(it, "rot", 0);
      const poly = it.p.shape === "round" ? circlePts(p0, s / 2, 14) : boxPoly(p0, s, s, rot);
      addZ(a, it, meta, poly, z, z + h, { loadBearing: true });
      return;
    }
    case "beam": {
      if (!p1) return;
      const w = num(it, "width", 0.67);
      const d = num(it, "depth", 1);
      const top = z + num(it, "height", H);
      addZ(a, it, meta, orientedRect(p0, p1, w), top - d, top, { loadBearing: true });
      return;
    }
    case "stair":
    case "ramp": {
      if (!p1) return;
      const L = dist2(p0, p1);
      if (L < 0.2) return;
      const ramp = it.kind === "ramp";
      const w = num(it, "width", ramp ? 4 : 3.5);
      const rise = ramp ? num(it, "rise", L / 12) : num(it, "rise", H);
      const n = ramp ? Math.max(3, Math.min(20, Math.ceil(L))) : Math.max(2, Math.min(24, Math.ceil(rise / 0.5833)));
      const dir = unit2(sub2(p1, p0));
      for (let i = 0; i < n; i++) {
        const sa = add2(p0, mul2(dir, (L * i) / n));
        const sb = add2(p0, mul2(dir, (L * (i + 1)) / n));
        addZ(a, it, meta, orientedRect(sa, sb, w), z, z + Math.max(0.12, (rise * (i + 1)) / n));
      }
      return;
    }
    case "furniture": {
      // a catalogue piece: its parts (legs, cushions, mattress, pillows …), each in its own look
      const pc = pieceOf(str(it, "type", ""));
      if (pc) {
        const fit = fitPiece(pc, num(it, "w", pc.w), num(it, "d", pc.d), num(it, "rot", 0));
        const sz = num(it, "h", pc.h) / pc.h;
        for (const part of placedParts(pc, p0, fit.rot, fit.sx, fit.sy)) addZ(a, it, meta, part.poly, z + part.z0 * sz, z + part.z1 * sz, { color: LOOK_COLOR[part.look] });
        return;
      }
      addZ(a, it, meta, boxPoly(p0, num(it, "w", 2), num(it, "d", 2), num(it, "rot", 0)), z, z + num(it, "h", 2.5));
      return;
    }
    case "fixture":
    case "equipment": {
      // a catalogue fixture: its parts, its plan symbol, and the port its wires and pipes connect to
      const fxt = fixtureOf(str(it, "type", ""));
      if (fxt) {
        const fmeta: Meta = { ...meta, cat: fxt.category, layer: fxt.layer, system: fxt.system === "plumbing" && fxt.layer === "furniture" ? "Interior" : "MEP" };
        const base = num(it, "base", fixtureBase(fxt, H));
        const rot = num(it, "rot", 0);
        const fit = fitPiece(fxt, num(it, "w", fxt.w), num(it, "d", fxt.d), rot);
        addParts(a, it, fmeta, placedParts(fxt, p0, fit.rot, fit.sx, fit.sy), z + base);
        const port: V3 = [p0[0], p0[1], z + base + fxt.port];
        a.ports.set(it.id, { at: port, floor: z, ceiling: z + H, system: fxt.system, role: fxt.role, level: it.level });
        if (fxt.symbol) {
          const sym: V3 = fxt.mount === "ceiling" ? [p0[0], p0[1], z + base] : port;
          a.devices.push({ id: it.id, layer: fxt.layer, kind: fxt.system === "hvac" ? "hvac" : fxt.system, at: sym, shape: fxt.symbol, label: it.name, phase: meta.phase, level: it.level, pick: true, planOnly: true });
        }
        return;
      }
      addZ(a, it, meta, boxPoly(p0, num(it, "w", 2), num(it, "d", 2), num(it, "rot", 0)), z, z + num(it, "h", 2.5));
      return;
    }
    case "duct":
    case "pipe":
    case "tray": {
      if (it.pts.length < 2) return;
      const h = z + num(it, "h", it.kind === "duct" ? H - 1.2 : it.kind === "pipe" ? H - 0.8 : H - 0.5);
      const pts: V3[] = it.pts.map(([x, y]) => [x, y, h]);
      const rk = RUN_KIND[it.kind] as RunKind;
      a.runs.push({ id: it.id, layer: meta.layer, kind: rk, pts, width: num(it, "width", it.kind === "duct" ? 3.2 : it.kind === "pipe" ? 1.3 : 2.4), label: it.name, phase: meta.phase, level: it.level, pick: true, ...(it.kind === "tray" ? { sub: "tray" as const } : {}) });
      const b = boxOfPts(pts);
      a.els.push({ ...baseOf(it, meta), loadBearing: false, min: [b.min[0], b.min[1], b.min[2] - 0.3], max: [b.max[0], b.max[1], b.max[2] + 0.3], keys: [] });
      return;
    }
    case "brace": {
      if (!p1) return;
      const h = num(it, "height", H);
      const pts: V3[] = [[p0[0], p0[1], z], [p1[0], p1[1], z + h]];
      a.runs.push({ id: it.id, layer: meta.layer, kind: "structural", pts, width: 2.6, label: it.name, phase: meta.phase, level: it.level, pick: true });
      const b = boxOfPts(pts);
      a.els.push({ ...baseOf(it, meta), loadBearing: true, min: b.min, max: b.max, keys: [] });
      return;
    }
    case "device": {
      const rk = (str(it, "rk", "electrical") as RunKind) || "electrical";
      const at: V3 = [p0[0], p0[1], z + num(it, "h", 1.3)];
      const shape = str(it, "shape", "outlet") as Device["shape"];
      a.devices.push({ id: it.id, layer: DEVICE_LAYER[rk], kind: rk, at, shape, label: it.name, phase: meta.phase, level: it.level, pick: true });
      a.ports.set(it.id, { at, floor: z, ceiling: z + H, system: rk === "plumbing" ? "plumbing" : rk === "hvac" ? "hvac" : "electrical", role: shape === "light" ? "light" : shape === "panel" ? "panel" : shape === "outlet" ? "outlet" : "fixture", level: it.level });
      a.els.push({ ...baseOf(it, meta, DEVICE_LAYER[rk]), loadBearing: false, min: [at[0] - 0.4, at[1] - 0.4, at[2] - 0.4], max: [at[0] + 0.4, at[1] + 0.4, at[2] + 0.4], keys: [] });
      return;
    }
    case "connection": {
      const s = num(it, "size", 1);
      addZ(a, it, meta, boxPoly(p0, s, s, 0), z - s / 2, z + s / 2 + 0.15, { loadBearing: true });
      return;
    }
    case "shed": {
      // a garden shed or outbuilding: floor, four walls with a door in the front, and a gable, lean-to or flat roof
      const w = Math.max(3, num(it, "w", 8));
      const d = Math.max(3, num(it, "d", 10));
      const h = Math.max(5, num(it, "h", 7.5));
      const rot = num(it, "rot", 0);
      const th = 0.33;
      const floor = z + 0.35;
      const r = (rot * Math.PI) / 180;
      const u: V2 = [Math.cos(r), Math.sin(r)];
      const v = perp2(u);
      const at = (x: number, y: number): V2 => add2(p0, add2(mul2(u, x), mul2(v, y)));
      addZ(a, it, { ...meta, color: "structural" }, boxPoly(p0, w + 0.4, d + 0.4, rot), z, floor, { loadBearing: true });
      const wall = (x0: number, y0: number, x1: number, y1: number, z0 = floor, z1 = floor + h) => addZ(a, it, meta, orientedRect(at(x0, y0), at(x1, y1), th), z0, z1);
      wall(-w / 2, d / 2 - th / 2, w / 2, d / 2 - th / 2);
      wall(-w / 2 + th / 2, -d / 2 + th, -w / 2 + th / 2, d / 2 - th);
      wall(w / 2 - th / 2, -d / 2 + th, w / 2 - th / 2, d / 2 - th);
      const dw = Math.min(4, w - 1.5);
      const dh = Math.min(6.8, h - 0.5);
      wall(-w / 2, -d / 2 + th / 2, -dw / 2, -d / 2 + th / 2);
      wall(dw / 2, -d / 2 + th / 2, w / 2, -d / 2 + th / 2);
      wall(-dw / 2, -d / 2 + th / 2, dw / 2, -d / 2 + th / 2, floor + dh, floor + h);
      addZ(a, it, { ...meta, color: "door" }, orientedRect(at(-dw / 2 + 0.05, -d / 2 + th / 2), at(dw / 2 - 0.05, -d / 2 + th / 2), 0.15), floor, floor + dh - 0.05);
      const eave = floor + h;
      const roof = str(it, "roof", "gable");
      const square = Math.abs(((rot % 90) + 90) % 90) < 1e-6;
      if (roof === "flat" || !square) {
        addZ(a, it, { ...meta, color: "roof" }, boxPoly(p0, w + 1, d + 1, rot), eave, eave + 0.4);
        return;
      }
      // a sloped roof needs the shed square to the axes: its outline is then an axis-aligned box
      const quarter = Math.round((((rot % 360) + 360) % 360) / 90) % 2 === 1;
      const W = quarter ? d : w;
      const D = quarter ? w : d;
      const x0 = p0[0] - W / 2 - 0.6;
      const x1 = p0[0] + W / 2 + 0.6;
      const y0 = p0[1] - D / 2 - 0.6;
      const y1 = p0[1] + D / 2 + 0.6;
      const roofMeta = { ...meta, color: "roof" as const };
      if (roof === "lean") {
        const rise = (W + 1.2) * (3 / 12);
        addY(a, it, roofMeta, [[x0, eave + rise], [x1, eave], [x1, eave + 0.35], [x0, eave + rise + 0.35]], y0, y1);
        // the side walls fill up under the slope
        const under = (x: number) => eave + (rise * (x1 - x)) / (x1 - x0) - 0.02;
        for (const [ya, yb] of [[p0[1] - D / 2, p0[1] - D / 2 + th], [p0[1] + D / 2 - th, p0[1] + D / 2]]) addY(a, it, meta, [[p0[0] - W / 2, eave], [p0[0] + W / 2, eave], [p0[0] + W / 2, under(p0[0] + W / 2)], [p0[0] - W / 2, under(p0[0] - W / 2)]], ya, yb);
        return;
      }
      const xm = p0[0];
      const rise = (W / 2 + 0.6) * (6 / 12);
      addY(a, it, roofMeta, [[x0, eave], [xm, eave + rise], [xm, eave + rise + 0.35], [x0, eave + 0.35]], y0, y1);
      addY(a, it, roofMeta, [[xm, eave + rise], [x1, eave], [x1, eave + 0.35], [xm, eave + rise + 0.35]], y0, y1);
      const edge = eave + 0.6 * (6 / 12) - 0.02;
      for (const [ya, yb] of [[p0[1] - D / 2, p0[1] - D / 2 + th], [p0[1] + D / 2 - th, p0[1] + D / 2]]) addY(a, it, meta, [[p0[0] - W / 2, eave], [p0[0] + W / 2, eave], [p0[0] + W / 2, edge], [xm, eave + rise - 0.02], [p0[0] - W / 2, edge]], ya, yb);
      return;
    }
    case "tree": {
      const hgt = Math.max(1, num(it, "h", 20));
      const rad = Math.max(0.5, num(it, "r", 7));
      const species = str(it, "species", "shade");
      const kind = (["palm", "shade", "shrub", "pine"].includes(species) ? species : "shade") as Tree["kind"];
      a.trees.push({ id: it.id, at: [p0[0], p0[1], z], kind, height: hgt, radius: rad, pick: true, ...(str(it, "bloom", "") ? { bloom: str(it, "bloom", "") } : {}) });
      a.els.push({ ...baseOf(it, meta), loadBearing: false, min: [p0[0] - rad, p0[1] - rad, z], max: [p0[0] + rad, p0[1] + rad, z + hgt], keys: [] });
      return;
    }
    case "flowers": {
      // mulch with flowering clumps in mixed colours among green foliage (lib/draw/site.ts)
      addParts(a, it, meta, flowerBedParts(it.pts, num(it, "h", 0.7), str(it, "mix", "mixed"), it.id), z);
      return;
    }
    case "gravel":
      addParts(a, it, meta, gravelBedParts(it.pts, it.p.rock === true), z);
      return;
    case "pool":
      addParts(a, it, meta, poolParts(p0, num(it, "rot", 0), str(it, "shape", "rectangle") as PoolShape, num(it, "l", 32), num(it, "w", 16), num(it, "depth", 6), num(it, "deck", 4)), z);
      return;
    case "rock":
      addParts(a, it, meta, rockParts(p0, num(it, "size", 3), num(it, "count", 1), it.id), z);
      return;
    case "road":
      if (it.pts.length < 2) return;
      addParts(a, it, meta, roadParts(it.pts, { width: num(it, "width", 24), curb: it.p.curb !== false, walks: str(it, "walks", "both") as RoadSpec["walks"], centre: str(it, "centre", "double") as RoadSpec["centre"] }), z);
      return;
    case "fence": {
      if (it.pts.length < 2) return;
      const type = str(it, "type", "privacy") as FenceType;
      addParts(a, it, meta, fenceParts(it.closed ? [...it.pts, it.pts[0]] : it.pts, type, num(it, "h", FENCE_HEIGHT[type] ?? 6)), z);
      return;
    }
    case "sidewalk":
      if (it.pts.length < 2) return;
      addParts(a, it, meta, sidewalkParts(it.pts, num(it, "width", 5)), z);
      return;
    case "sign":
      addParts(a, it, meta, signParts(p0, num(it, "rot", 0), str(it, "type", "stop") as SignType), z);
      return;
    case "signal":
      addParts(a, it, meta, signalParts(p0, num(it, "rot", 0), num(it, "arm", 20)), z);
      return;
    case "drain":
      addParts(a, it, meta, drainParts(p0, num(it, "rot", 0), str(it, "type", "inlet") as DrainType, num(it, "len", 8)), z);
      return;
    case "gutter": {
      if (!p1) return;
      const ends = str(it, "ends", "ab");
      addParts(a, it, meta, gutterParts(p0, p1, num(it, "eave", z + H), [num(it, "ox", 0), num(it, "oy", -1)], num(it, "grade", scene.grade), [...(ends.includes("a") ? (["a"] as const) : []), ...(ends.includes("b") ? (["b"] as const) : [])]), 0);
      return;
    }
    case "solar":
      buildSolar(it, a, meta);
      return;
    case "solid": {
      // an imported element keeps its own category, so it lands on the right layer with the right colour
      const cat = str(it, "cat", "Equipment") as Category;
      const look = SOLID_LOOK[cat] ?? SOLID_LOOK.Equipment!;
      addZ(a, it, { ...meta, cat, layer: look.layer, color: look.color, system: look.system }, it.pts, z + num(it, "z0", 0), z + num(it, "z1", 1), { glass: cat === "Window", loadBearing: cat === "Wall" || cat === "Column" || cat === "Beam" || cat === "Slab" || cat === "Footing" });
      return;
    }
    case "septic": {
      // a septic system: the buried tank with two lids at grade, a distribution box and the drain field beyond it
      const gal = num(it, "gal", 1000);
      const tl = gal >= 1500 ? 10.5 : gal >= 1250 ? 9.8 : 9;
      const tw = 5.5;
      const rot = num(it, "rot", 0);
      const r = (rot * Math.PI) / 180;
      const u: V2 = [Math.cos(r), Math.sin(r)];
      const v = perp2(u);
      const at = (x: number, y: number): V2 => add2(p0, add2(mul2(u, x), mul2(v, y)));
      const buried = { underground: true };
      const top = z - 1.2;
      addZ(a, it, meta, boxPoly(p0, tl, tw, rot), top - 5, top, buried);
      for (const fx of [-0.28, 0.28]) addZ(a, it, meta, circlePts(at(tl * fx, 0), 0.85, 14), z - 0.05, z + 0.22);
      const rows = Math.max(0, Math.min(8, Math.round(num(it, "rows", 3))));
      if (!rows) return;
      const flen = Math.max(10, num(it, "len", 36));
      const gap = Math.max(4, num(it, "dist", 10));
      const spacing = 6;
      const yb = tw / 2 + gap;
      addZ(a, it, { ...meta, color: "paving" }, boxPoly(at(0, yb), 2, 2, rot), top - 1.6, top - 0.2, buried);
      for (let i = 0; i < rows; i++) {
        const y = yb + 3 + i * spacing;
        addZ(a, it, { ...meta, color: "paving" }, orientedRect(at(-flen / 2, y), at(flen / 2, y), 2), z - 3, z - 1, buried);
      }
      return;
    }
    default:
      return;
  }
}

/**
 * The path of a wire or pipe between two ports. Wires and supply pipes rise into the ceiling, run across and drop
 * to the other end (hot water a little below cold, so both show); a drain goes down under the floor and falls
 * 1/4" per foot from `from` (the fixture) to `to` (the stack it drains into).
 */
export function linkPath(from: Pick<Port, "at" | "floor" | "ceiling">, to: Pick<Port, "at" | "floor" | "ceiling">, sub: NonNullable<Run["sub"]>): V3[] {
  const A = from.at;
  const B = to.at;
  let pts: V3[];
  if (sub === "drain") {
    const depth = Math.min(from.floor, to.floor) - 1;
    const run = Math.abs(B[0] - A[0]) + Math.abs(B[1] - A[1]);
    const fall = (run * 0.25) / 12;
    const kx = run ? Math.abs(B[0] - A[0]) / run : 0;
    pts = [[A[0], A[1], Math.min(A[2], from.floor + 0.3)], [A[0], A[1], depth], [B[0], A[1], depth - fall * kx], [B[0], B[1], depth - fall], [B[0], B[1], Math.min(B[2], to.floor + 0.3)]];
  } else {
    const ceil = Math.min(from.ceiling, to.ceiling) - (sub === "hot" ? 0.6 : sub === "cold" ? 0.4 : 0.2);
    pts = [A, [A[0], A[1], ceil], [B[0], A[1], ceil], [B[0], B[1], ceil], B];
  }
  return pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1], q[2] - pts[i - 1][2]) > 0.01);
}

/** A wire or a pipe between two fixtures, as a run (selectable, on its layer). */
function buildLink(it: DrawnItem, a: Acc): void {
  const from = a.ports.get(str(it, "from", ""));
  const to = a.ports.get(str(it, "to", ""));
  if (!from || !to) return;
  const electrical = it.kind === "wire";
  const sub = str(it, "sub", electrical ? "power" : "cold") as NonNullable<Run["sub"]>;
  // a drain is drawn from the stack to the fixture, but the waste runs the other way: it falls towards the stack
  const pts = sub === "drain" && from.role === "sewer" ? linkPath(to, from, sub).reverse() : linkPath(from, to, sub);
  a.runs.push({ id: it.id, layer: electrical ? "electrical" : "plumbing", kind: electrical ? "electrical" : "plumbing", sub, pts, width: electrical ? 0.8 : sub === "drain" ? 2.4 : 1.2, label: it.name, phase: "mep", level: from.level, pick: true });
  const b = boxOfPts(pts);
  a.els.push({ ...baseOf({ ...it, level: from.level }, META[it.kind]), loadBearing: false, min: [b.min[0] - 0.2, b.min[1] - 0.2, b.min[2] - 0.2], max: [b.max[0] + 0.2, b.max[1] + 0.2, b.max[2] + 0.2], keys: [] });
}

/** Lights fed by a switch that is on glow, and so do lights wired on from a lit one (a daisy chain). */
function lightUp(items: DrawnItem[], a: Acc): void {
  const on = new Set(items.filter((i) => i.kind === "fixture" && i.p.on === true && fixtureOf(str(i, "type", ""))?.role === "switch").map((i) => i.id));
  if (!on.size) return;
  const wires = items.filter((i) => i.kind === "wire");
  const lit = new Set<string>();
  const queue = [...on];
  while (queue.length) {
    const id = queue.shift()!;
    for (const w of wires) {
      if (str(w, "from", "") !== id) continue;
      const t = str(w, "to", "");
      if (lit.has(t) || on.has(t)) continue;
      lit.add(t);
      queue.push(t);
    }
  }
  for (const d of a.devices) if (lit.has(d.id)) d.lit = true;
}

/**
 * A solar array: rows × columns of panels tilted to the roof (or racked on the ground), uphill towards `rot`
 * (a multiple of 90°, so a panel is a straight extrusion), each a dark cell surface on a silver frame.
 */
function buildSolar(it: DrawnItem, a: Acc, meta: Meta): void {
  const c = it.pts[0];
  if (!c) return;
  const rows = Math.max(1, Math.min(12, Math.round(num(it, "rows", 2))));
  const cols = Math.max(1, Math.min(30, Math.round(num(it, "cols", 6))));
  const pw = num(it, "pw", 3.4);
  const pl = num(it, "pl", 5.6);
  const gap = 0.1;
  const t = (num(it, "tilt", 22) * Math.PI) / 180;
  const rot = Math.round(num(it, "rot", 90) / 90) * 90;
  const u: V2 = [Math.round(Math.cos((rot * Math.PI) / 180)), Math.round(Math.sin((rot * Math.PI) / 180))];
  const v: V2 = [-u[1], u[0]];
  const zc = num(it, "zc", it.z + 10);
  const along = pl * Math.cos(t);
  const th = 0.14;
  const ground = it.p.ground === true;
  const frameMeta: Meta = { ...meta, color: "metal" };
  for (let i = 0; i < rows; i++) {
    const s = (i - (rows - 1) / 2) * (along + gap);
    for (let j = 0; j < cols; j++) {
      const q = (j - (cols - 1) / 2) * (pw + gap);
      const P = add2(add2(c, mul2(u, s)), mul2(v, q));
      const zs = zc + s * Math.tan(t);
      const zLo = zs - (along / 2) * Math.tan(t);
      const zHi = zs + (along / 2) * Math.tan(t);
      const lo = add2(P, mul2(u, -along / 2));
      const hi = add2(P, mul2(u, along / 2));
      if (u[0] !== 0) {
        const xa = lo[0];
        const xb = hi[0];
        addY(a, it, frameMeta, [[xa, zLo - 0.06], [xb, zHi - 0.06], [xb, zHi], [xa, zLo]], P[1] - pw / 2 - 0.04, P[1] + pw / 2 + 0.04);
        addY(a, it, meta, [[xa, zLo], [xb, zHi], [xb, zHi + th], [xa, zLo + th]], P[1] - pw / 2, P[1] + pw / 2);
      } else {
        // sloping along y: thin stepped strips (they read as the panel's rows of cells)
        const steps = 6;
        for (let k = 0; k < steps; k++) {
          const s0 = lerp2(lo, hi, k / steps);
          const s1 = lerp2(lo, hi, (k + 1) / steps);
          const zk = zLo + ((k + 0.5) / steps) * (zHi - zLo);
          const half = mul2(v, pw / 2);
          addZ(a, it, meta, [sub2(s0, half), add2(s0, half), add2(s1, half), sub2(s1, half)], zk, zk + th);
        }
      }
      // ground racking: a post under the low and the high edge of each panel
      if (ground) for (const [e, ze] of [[lo, zLo], [hi, zHi]] as [V2, number][]) addZ(a, it, frameMeta, boxPoly(e, 0.25, 0.25, 0), it.z, ze - 0.06);
    }
  }
}

/** The bounds of every prism that has this id. */
function boundsOf(prisms: Prism[], id: string): { min: V3; max: V3 } | null {
  let min: V3 | null = null;
  let max: V3 | null = null;
  for (const p of prisms) {
    if (p.id !== id) continue;
    const b = prismBounds(p);
    min = min ? ([Math.min(min[0], b.min[0]), Math.min(min[1], b.min[1]), Math.min(min[2], b.min[2])] as V3) : b.min;
    max = max ? ([Math.max(max[0], b.max[0]), Math.max(max[1], b.max[1]), Math.max(max[2], b.max[2])] as V3) : b.max;
  }
  return min && max ? { min, max } : null;
}

/** Joists, studs or rafters laid out on a host element. */
function buildFraming(it: DrawnItem, a: Acc): void {
  const meta = META.framing;
  const host = str(it, "host", "");
  const hostPrisms = a.prisms.filter((p) => p.id === host);
  const b = boundsOf(a.prisms, host);
  if (!b) return;
  const cat = hostPrisms[0]?.category;
  const spacing = Math.max(0.5, num(it, "spacing", 1.333));
  const level = hostPrisms[0]?.level ?? it.level;
  const item: DrawnItem = { ...it, level };
  if (cat === "Wall" || cat === "Partition") {
    const f = wallFrameOf(hostPrisms);
    if (!f) return;
    const n = Math.min(80, Math.floor((f.len - 0.6) / spacing));
    for (let i = 0; i <= n; i++) {
      const u = f.u0 + 0.3 + i * spacing;
      const c = add2(mul2(f.dir, u), mul2(f.nrm, f.vc));
      addZ(a, item, meta, boxPoly(c, 0.125, Math.max(0.3, f.thick * 0.7), angleDeg(f.dir)), f.z0 + 0.25, f.z1 - 0.25, { sectionOnly: true });
    }
    return;
  }
  // floors, roofs and slabs: joists across the shorter span, spaced along the longer side
  const dx = b.max[0] - b.min[0];
  const dy = b.max[1] - b.min[1];
  const alongX = dx >= dy;
  const len = alongX ? dx : dy;
  const span = alongX ? dy : dx;
  const n = Math.min(80, Math.floor((len - 0.6) / spacing));
  const top = b.min[2];
  for (let i = 0; i <= n; i++) {
    const s = (alongX ? b.min[0] : b.min[1]) + 0.3 + i * spacing;
    const poly: V2[] = alongX ? [[s - 0.0625, b.min[1]], [s + 0.0625, b.min[1]], [s + 0.0625, b.max[1]], [s - 0.0625, b.max[1]]] : [[b.min[0], s - 0.0625], [b.max[0], s - 0.0625], [b.max[0], s + 0.0625], [b.min[0], s + 0.0625]];
    addZ(a, item, meta, poly, top - Math.min(0.8, span / 12), top, { sectionOnly: true });
  }
}

/** Roof trusses spanning X, spaced along Y, under a host element. */
function buildTrusses(it: DrawnItem, a: Acc): void {
  const meta = META.truss;
  const host = str(it, "host", "");
  const b = boundsOf(a.prisms, host);
  if (!b) return;
  const spacing = Math.max(1, num(it, "spacing", 2));
  const x0 = b.min[0];
  const x1 = b.max[0];
  const xm = (x0 + x1) / 2;
  const rise = Math.max(1, (x1 - x0) / 6);
  const zb = b.min[2] - rise - 0.4;
  const n = Math.min(24, Math.floor((b.max[1] - b.min[1] - 0.4) / spacing));
  const item: DrawnItem = { ...it, level: "roof" };
  for (let i = 0; i <= n; i++) {
    const y = b.min[1] + 0.2 + i * spacing;
    const extra = { sectionOnly: true, loadBearing: true };
    addY(a, item, meta, [[x0, zb], [x1, zb], [x1, zb + 0.4], [x0, zb + 0.4]], y, y + 0.17, extra);
    addY(a, item, meta, [[x0, zb + 0.45], [xm, zb + rise - 0.05], [xm, zb + rise + 0.35], [x0, zb + 0.85]], y, y + 0.17, extra);
    addY(a, item, meta, [[xm, zb + rise - 0.05], [x1, zb + 0.45], [x1, zb + 0.85], [xm, zb + rise + 0.35]], y, y + 0.17, extra);
  }
}

/** The element a flat 2D item is selected by: no prisms, just a thin box around its points. */
function draftElement(it: DrawnItem): SceneElement {
  const meta = META[it.kind];
  const pts = draftOutline(it);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = xs.length ? Math.min(...xs) : 0;
  const x1 = xs.length ? Math.max(...xs) : 0;
  const y0 = ys.length ? Math.min(...ys) : 0;
  const y1 = ys.length ? Math.max(...ys) : 0;
  return { ...baseOf(it, meta), loadBearing: false, min: [x0, y0, it.z], max: [x1, y1, it.z + 0.05], keys: [] };
}

/**
 * The scene to show: the built-in scene with the overrides applied plus everything the user drew. Returns `base`
 * itself when there is nothing to add, so memoised consumers do not recompute.
 */
export function composeScene(base: Scene, items: DrawnItem[], xf: Record<string, XForm>): Scene {
  const hasXf = Object.keys(xf).length > 0;
  if (!items.length && !hasXf) return base;
  const a: Acc = { prisms: [], runs: [], devices: [], swings: [], els: [], trees: [], n: 0, ports: new Map() };

  /* 1. built-in prisms, moved / rotated / scaled where the user changed them */
  for (const p of base.prisms) {
    const x = xf[p.id];
    a.prisms.push(x ? xformPrism(p, x) : p);
  }

  /* 1b. built-in doors and windows slid along their wall: fill the old hole, cut the new one */
  for (const x of Object.values(xf)) {
    const sl = x.slide;
    if (!sl) continue;
    const pieces = a.prisms.filter((p) => p.id === sl.host);
    const f = wallFrameOf(pieces);
    if (!f || !pieces.length) continue;
    const corner = (u: number, v: number): V2 => add2(mul2(f.dir, f.u0 + u), mul2(f.nrm, v));
    const v0 = f.vc - f.thick / 2;
    const v1 = f.vc + f.thick / 2;
    const filler: Prism = { ...pieces[0], key: key(a, sl.host), poly: ccw([corner(sl.at0, v0), corner(sl.at0 + sl.w, v0), corner(sl.at0 + sl.w, v1), corner(sl.at0, v1)]), a0: f.z0 + sl.sill, a1: f.z0 + sl.head };
    const cut = carve([...pieces, filler], f, { at: sl.at, w: sl.w, sill: sl.sill, head: sl.head }, () => key(a, sl.host));
    a.prisms = a.prisms.filter((p) => p.id !== sl.host).concat(cut);
  }

  /* 2. clones of built-in elements (copies made by COPY, ARRAY, MIRROR, PASTE …) */
  for (const it of items) {
    if (it.kind !== "clone" || !it.src || !it.aff) continue;
    const x: XForm = { aff: it.aff, dz: it.dz ?? 0, sz: num(it, "sz", 1), zc: num(it, "zc", 0) };
    for (const p of base.prisms) {
      if (p.id !== it.src) continue;
      const moved = xformPrism(p, x);
      a.prisms.push({ ...moved, id: it.id, name: it.name, key: key(a, it.id), layer: p.layer, level: it.level });
    }
  }

  /* 3. solids that stand on their own */
  const walls = items.filter((i) => i.kind === "wall" && i.pts.length > 1);
  const endJoin = (pt: V2, self: string): number => {
    for (const w of walls) {
      if (w.id === self) continue;
      if (dist2(w.pts[0], pt) < 0.02 || dist2(w.pts[1], pt) < 0.02) return num(w, "thick", 0.67) / 2;
    }
    return 0;
  };
  for (const it of items) if (!isDraftKind(it.kind) && it.kind !== "door" && it.kind !== "window" && it.kind !== "framing" && it.kind !== "truss" && it.kind !== "clone") buildSolid(it, base, a, endJoin);

  /* 4. openings: carve the host walls, then place the door and window leaves */
  const openings = items.filter((i) => (i.kind === "door" || i.kind === "window") && str(i, "host", ""));
  const byHost = new Map<string, DrawnItem[]>();
  for (const o of openings) {
    const h = str(o, "host", "");
    byHost.set(h, [...(byHost.get(h) ?? []), o]);
  }
  for (const [hostId, ops] of byHost) {
    const pieces = a.prisms.filter((p) => p.id === hostId);
    const f = wallFrameOf(pieces);
    if (!f) continue;
    let cur = pieces;
    for (const o of ops) cur = carve(cur, f, { at: num(o, "at", 0), w: num(o, "w", 3), sill: num(o, "sill", o.kind === "window" ? 3 : 0), head: num(o, "head", o.kind === "window" ? 7 : 6.67) }, () => key(a, hostId));
    a.prisms = a.prisms.filter((p) => p.id !== hostId).concat(cur);
    for (const o of ops) {
      const meta = META[o.kind];
      const w = num(o, "w", 3);
      const sill = num(o, "sill", o.kind === "window" ? 3 : 0);
      const head = num(o, "head", o.kind === "window" ? 7 : 6.67);
      const u0 = f.u0 + num(o, "at", 0);
      const th = o.kind === "window" ? 0.12 : 0.2;
      const c = add2(mul2(f.dir, u0 + w / 2), mul2(f.nrm, f.vc));
      const level = pieces[0]?.level ?? o.level;
      const oo: DrawnItem = { ...o, level };
      addZ(a, oo, meta, boxPoly(c, w - 0.1, th, angleDeg(f.dir)), f.z0 + sill + 0.05, f.z0 + head - 0.05, { glass: o.kind === "window" });
      if (o.kind === "window") addZ(a, oo, { ...meta, color: "walls" }, boxPoly(c, w + 0.2, f.thick + 0.2, angleDeg(f.dir)), f.z0 + sill - 0.22, f.z0 + sill, {});
      if (o.kind === "door") {
        const endHinge = str(o, "hinge", "start") === "end";
        const hinge = add2(mul2(f.dir, u0 + (endHinge ? w : 0)), mul2(f.nrm, f.vc));
        const closed = angleDeg(f.dir) + (endHinge ? 180 : 0);
        const open = closed + 90 * num(o, "swing", 1);
        a.swings.push({ id: `${o.id}-sw`, hinge, radius: w, a0: Math.min(closed, open), a1: Math.max(closed, open), level });
      }
    }
  }

  /* 5. members laid out on a host (joists, studs, trusses) */
  for (const it of items) {
    if (it.kind === "framing") buildFraming(it, a);
    else if (it.kind === "truss") buildTrusses(it, a);
  }

  /* 5b. wires and pipes between the fixtures they connect (they follow the fixtures when those move) */
  for (const it of items) if (it.kind === "wire" || it.kind === "pipelink") buildLink(it, a);
  lightUp(items, a);

  /* 6. rooms and hatches found from a click re-find their boundary, so they follow moved walls */
  const byId: Record<string, DrawnItem> = {};
  for (const it of items) byId[it.id] = it;
  const autos = items.filter((i) => (i.kind === "room" || i.kind === "hatch") && typeof i.p.sx === "number" && typeof i.p.sy === "number");
  if (autos.length) {
    const probe = { ...base, prisms: a.prisms, items: byId } as Scene;
    for (const it of autos) {
      const poly = enclosureAt(probe, it.level, [it.p.sx as number, it.p.sy as number], null, true);
      if (poly && poly.length >= 3) byId[it.id] = { ...it, pts: poly };
    }
  }

  /* 7. elements, the flat 2D marks and the lookup of drawn items */
  const elements = buildElements(a.prisms);
  const drafts = items.filter((i) => isDraftKind(i.kind)).map((i) => byId[i.id]);
  const extra = [...a.els, ...drafts.map(draftElement)];
  const elementById: Record<string, SceneElement> = {};
  for (const el of elements) elementById[el.id] = el;
  for (const el of extra) elementById[el.id] = el;
  // a drawn element keeps the name and material the user gave it
  for (const el of elements) {
    const it = byId[el.id];
    if (it && it.kind !== "clone") el.name = it.name;
  }
  return {
    ...base,
    prisms: a.prisms,
    elements: [...elements, ...extra],
    elementById,
    runs: [...base.runs, ...a.runs],
    devices: [...base.devices, ...a.devices],
    swings: [...base.swings, ...a.swings],
    trees: a.trees.length ? [...base.trees, ...a.trees] : base.trees,
    drafts,
    items: byId,
  };
}

/** A point of an item halfway between its first two points (used to place labels). */
export const midOf = (it: DrawnItem): V2 => (it.pts.length > 1 ? lerp2(it.pts[0], it.pts[1], 0.5) : (it.pts[0] ?? [0, 0]));
