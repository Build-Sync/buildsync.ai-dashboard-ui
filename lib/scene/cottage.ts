/**
 * lib/scene/cottage.ts
 *
 * WHAT   Builds the second sample house: a one-storey, two-bedroom, one-bathroom cottage, 28' × 38' (about 1,060 sf),
 *        8" CMU walls on a full foundation (continuous footings and stem walls, a 4" slab on grade with thickened
 *        footings under the hall walls, and pier footings under the porch posts), a 5:12 gable roof, a front porch,
 *        and a septic system in the back yard (lib/scene/site.ts). Plus furniture, MEP, trees, contours, rooms,
 *        dimensions and the grid.
 * FOR    getScene("cottage"), the Cottage_2BR_1BA sample project (lib/mock-data.ts). Plan: a great room (living,
 *        dining and kitchen) across the front; a hall to the back door with the bath and Bedroom 1 on the west, the
 *        laundry and Bedroom 2 on the east.
 * DEBUG  - Walls and beams are split at the column positions (colZones) so no prisms overlap.
 *        - The footings and the septic tank are below grade: Foundation plan, Below Grade, section or X-ray.
 *        - Ids must stay unique and match the checks and issues in lib/mock-data.ts.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { SceneBuilder, type BaseOpts, type Opening } from "./builder";
import { addSeptic } from "./site";
import type { Category, LevelKey, Scene, V2, V3 } from "./types";

/** Building width in feet (east-west). */
export const W = 28;
/** Building depth in feet (north-south). */
export const D = 38;
const T = 0.67; // exterior wall
const t = 0.33; // partition
const GRADE = -1.0;
const TOP = 9; // top of the bond beam
const PITCH = 5 / 12;

const opts = (o: Partial<BaseOpts> & Pick<BaseOpts, "id" | "name" | "category">): BaseOpts => ({
  layer: "walls",
  level: "level1",
  system: "Architectural",
  color: "walls",
  material: 'CMU 8" grouted, #5 vert. @ 32"',
  phase: "structure1",
  ...o,
});

/** Column positions (id, x, y). Walls, beams and stems are broken at these. */
const COLS: [string, number, number][] = [
  ["C-A1", T / 2, T / 2],
  ["C-C1", W - T / 2, T / 2],
  ["C-A3", T / 2, D - T / 2],
  ["C-C3", W - T / 2, D - T / 2],
  ["C-A2", T / 2, 19],
  ["C-C2", W - T / 2, 19],
  ["C-B1", 10, T / 2],
  ["C-B2", 17.5, T / 2],
  ["C-B3", 10, D - T / 2],
  ["C-B4", 18, D - T / 2],
];

/** Pseudo-openings (no infill) that carve the column zones out of a wall, beam or stem run. */
function colZones(side: "S" | "N" | "W" | "E"): Opening[] {
  const out: Opening[] = [];
  for (const [id, x, y] of COLS) {
    const hit = (side === "S" && y === T / 2) || (side === "N" && y === D - T / 2) || (side === "W" && x === T / 2) || (side === "E" && x === W - T / 2);
    if (!hit) continue;
    const c = side === "S" || side === "N" ? x : y;
    out.push({ id: `${id}-z`, at: c - 0.5, w: 1, sill: 0, head: 99, kind: "open" });
  }
  return out;
}

/** Build the cottage scene. */
export function buildCottage(): Scene {
  const b = new SceneBuilder();

  /* ── site ───────────────────────────────────────────────────────────── */
  b.box(
    opts({ id: "TOPO-01", name: "Site Terrain", category: "Topography", layer: "topography", level: "site", system: "Site", color: "topography", material: "Sandy loam over limestone (perc rate 12 min/in)", phase: "site", terrain: true }),
    -26, -40, 54, 90, -4, GRADE,
  );
  for (let i = 0; i < 5; i++) {
    const R = 34 + i * 7;
    const pts: V2[] = [];
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      const r = R * (1 + 0.06 * Math.sin(2 * a + i) + 0.05 * Math.cos(3 * a));
      pts.push([14 + r * 1.05 * Math.cos(a), 24 + r * 1.35 * Math.sin(a)]);
    }
    b.contours.push({ id: `CT-${i}`, z: GRADE, pts, label: `${(-1 - i * 0.5).toFixed(1)}'` });
  }
  const paving = (id: string, name: string, x0: number, y0: number, x1: number, y1: number, material = "Broom-finished concrete") =>
    b.box(opts({ id, name, category: "Paving", layer: "landscape", level: "site", system: "Site", color: "paving", material, phase: "finishes" }), x0, y0, x1, y1, GRADE, GRADE + 0.12);
  paving("PV-PARK", "Parking Pad", 21, -30, 31, -9, "Crushed shell over geotextile");
  paving("PV-WALK", "Front Walk", 12.5, -30, 15.5, -6.2);
  paving("PV-PATIO", "Rear Patio", 10, 38.2, 18, 43);
  const shrub = (id: string, x0: number, y0: number, x1: number, y1: number, h: number) =>
    b.box(opts({ id, name: "Hedge", category: "Landscape", layer: "landscape", level: "site", system: "Site", color: "landscape", material: "Native hedge (firebush)", phase: "finishes" }), x0, y0, x1, y1, GRADE, GRADE + h);
  shrub("LS-H1", 0.8, -2.4, 8.6, -1.2, 2.2);
  shrub("LS-H2", 19.6, -2.4, 27.2, -1.2, 2.2);
  b.trees.push(
    { id: "TR-S1", at: [-10, 4, GRADE], kind: "shade", height: 24, radius: 8 },
    { id: "TR-P1", at: [36, -2, GRADE], kind: "palm", height: 24, radius: 5.5 },
    { id: "TR-S2", at: [38, 30, GRADE], kind: "shade", height: 22, radius: 7.5 },
    { id: "TR-N1", at: [-12, 40, GRADE], kind: "pine", height: 30, radius: 6 },
    { id: "TR-P2", at: [-8, -22, GRADE], kind: "palm", height: 22, radius: 5 },
  );

  /* ── foundation ─────────────────────────────────────────────────────── */
  const found = (id: string, name: string, extra: Partial<BaseOpts> = {}) =>
    opts({ id, name, category: "Foundation", layer: "foundation", level: "foundation", system: "Structural", color: "structural", material: 'Reinforced concrete 3000 psi, 2-#5 continuous', phase: "foundation", loadBearing: true, ...extra });
  const stems: [string, string, number, number, number, number][] = [
    ["F-ST-S", "South", 0, 0, W, T],
    ["F-ST-N", "North", 0, D - T, W, D],
    ["F-ST-W", "West", 0, T, T, D - T],
    ["F-ST-E", "East", W - T, T, W, D - T],
  ];
  for (const [id, side, x0, y0, x1, y1] of stems) {
    const axis = id.endsWith("S") || id.endsWith("N") ? "x" : "y";
    const zones = colZones(id.slice(-1) as "S" | "N" | "W" | "E");
    const c0 = axis === "x" ? y0 : x0;
    const c1 = axis === "x" ? y1 : x1;
    const s0 = axis === "x" ? x0 : y0;
    const e0 = axis === "x" ? x1 : y1;
    b.wall({ ...found(id, `Stem Wall – ${side}`), axis, c0, c1, s: s0, e: e0, z0: GRADE, z1: 0, openings: zones });
    b.wall({ ...found(id, `Stem Wall – ${side}`, { underground: true, capOnly: true }), axis, c0, c1, s: s0, e: e0, z0: -2.5, z1: GRADE, openings: zones });
  }
  const footings: [string, string, number, number, number, number][] = [
    ["F-FT-S", "South", -0.67, -0.67, W + 0.67, 1.33],
    ["F-FT-N", "North", -0.67, D - 1.33, W + 0.67, D + 0.67],
    ["F-FT-W", "West", -0.67, 1.33, 1.33, D - 1.33],
    ["F-FT-E", "East", W - 1.33, 1.33, W + 0.67, D - 1.33],
  ];
  for (const [id, side, x0, y0, x1, y1] of footings) {
    b.box(found(id, `Continuous Footing 24" × 12" – ${side}`, { category: "Footing", underground: true, capOnly: true }), x0, y0, x1, y1, -3.5, -2.5);
  }
  b.box(
    opts({ id: "SL-L1", name: "Slab on Grade", category: "Slab", layer: "foundation", level: "foundation", system: "Structural", color: "structural", material: '4" concrete slab, 6×6 W1.4 WWM, 10-mil vapor barrier', phase: "foundation", loadBearing: true }),
    T, T, W - T, D - T, -0.33, 0,
  );
  // thickened slab footings under the two hall walls (they carry the ceiling joists at mid-span)
  b.box(found("F-TS-1", 'Thickened Slab Footing 16" – Hall West (X=12)', { category: "Footing", underground: true }), 11.33, 16, 12.67, D - T, -1.33, -0.33);
  b.box(found("F-TS-2", 'Thickened Slab Footing 16" – Hall East (X=16)', { category: "Footing", underground: true }), 15.33, 16, 16.67, D - T, -1.33, -0.33);
  // porch: pier footings and piers under the two posts, and the porch slab
  for (const [id, x] of [["F-PIER-1", 9.5], ["F-PIER-2", 18.5]] as const) {
    b.box(found(id, `Pier Footing 24" × 24" (porch post)`, { category: "Footing", underground: true, capOnly: false }), x - 1, -6.5, x + 1, -4.5, -3.5, -2.5);
    b.box(found(id, `Pier Footing 24" × 24" (porch post)`, { category: "Footing", underground: true }), x - 0.5, -6, x + 0.5, -5, -2.5, GRADE);
  }
  b.box(opts({ id: "SL-PORCH", name: "Porch Slab", category: "Slab", layer: "foundation", level: "foundation", system: "Structural", color: "structural", material: '4" concrete, broom finish', phase: "foundation" }), 9, -6.2, 19, 0, GRADE, -0.33);

  /* ── exterior walls ─────────────────────────────────────────────────── */
  const win = (id: string, at: number, w: number, sill = 3, head = 7): Opening => ({ id, at, w, sill, head, kind: "window" });
  const zt = TOP - 1; // walls stop under the bond beam
  const ext = (side: "S" | "N" | "W" | "E", label: string, o: Opening[]) => {
    const base = opts({ id: `W-L1-${side}`, name: `Exterior Wall – ${label}`, category: "Wall", loadBearing: true });
    const ops = [...o, ...colZones(side)];
    if (side === "S") b.wall({ ...base, axis: "x", c0: 0, c1: T, s: 0, e: W, z0: 0, z1: zt, openings: ops });
    if (side === "N") b.wall({ ...base, axis: "x", c0: D - T, c1: D, s: 0, e: W, z0: 0, z1: zt, openings: ops });
    if (side === "W") b.wall({ ...base, axis: "y", c0: 0, c1: T, s: T, e: D - T, z0: 0, z1: zt, openings: ops });
    if (side === "E") b.wall({ ...base, axis: "y", c0: W - T, c1: W, s: T, e: D - T, z0: 0, z1: zt, openings: ops });
  };
  ext("S", "South", [win("WN-101", 3, 5), { id: "D-101", at: 12, w: 3, sill: 0, head: 6.9, kind: "door", name: "Entry Door", swing: { hinge: "start", dir: 1 } }, win("WN-102", 20, 5)]);
  ext("N", "North", [win("WN-103", 3, 4, 3.3), { id: "D-102", at: 12.5, w: 3, sill: 0, head: 6.9, kind: "door", name: "Rear Door", swing: { hinge: "start", dir: -1 } }, win("WN-104", 21, 4, 3.3)]);
  ext("W", "West", [win("WN-105", 5, 5), win("WN-106", 20, 2, 5, 7), win("WN-107", 28, 4, 3.3)]);
  ext("E", "East", [win("WN-108", 6, 4, 3.6), win("WN-109", 20, 2, 5, 7), win("WN-110", 28, 4, 3.3)]);

  // gable end walls (ridge runs north-south)
  const ex = 1.5;
  const rise = (W / 2 + ex) * PITCH;
  const gable = (id: string, name: string, y0: number, y1: number) =>
    b.extrudeY(opts({ id, name, category: "Wall", level: "roof", phase: "roof", loadBearing: true }), [[0, TOP], [W, TOP], [W, TOP + ex * PITCH - 0.02], [W / 2, TOP + rise - 0.02], [0, TOP + ex * PITCH - 0.02]], y0, y1);
  gable("W-GBL-S", "Gable End Wall – South", 0, T);
  gable("W-GBL-N", "Gable End Wall – North", D - T, D);

  /* ── columns and bond beam ──────────────────────────────────────────── */
  for (const [id, x, y] of COLS) {
    const c = opts({ id, name: `Concrete Tie Column ${id.slice(2)}`, category: "Column", system: "Structural", color: "structural", material: "Reinforced concrete 3000 psi, 4-#5", phase: "structure1", loadBearing: true });
    b.box(c, x - 0.5, y - 0.5, x + 0.5, y + 0.5, GRADE, TOP);
    b.box({ ...c, underground: true, capOnly: true, level: "foundation" }, x - 0.5, y - 0.5, x + 0.5, y + 0.5, -2.5, GRADE);
  }
  const beam = (id: string, name: string) => opts({ id, name, category: "Beam", system: "Structural", color: "structural", material: "Reinforced concrete bond beam, 2-#5 top/bot", phase: "structure1", loadBearing: true });
  const out = 0.17;
  const beamRun = (side: "S" | "N" | "W" | "E", label: string, axis: "x" | "y", c0: number, c1: number, s0: number, e0: number) =>
    b.wall({ ...beam(`B-L1-${side}`, `Bond Beam – ${label}`), axis, c0, c1, s: s0, e: e0, z0: TOP - 1, z1: TOP, openings: colZones(side) });
  beamRun("S", "South", "x", -out, T + out, -out, W + out);
  beamRun("N", "North", "x", D - T - out, D + out, -out, W + out);
  beamRun("W", "West", "y", -out, T + out, T + out, D - T - out);
  beamRun("E", "East", "y", W - T - out, W + out, T + out, D - T - out);

  /* ── interior partitions ────────────────────────────────────────────── */
  const part = (id: string, name: string) => opts({ id, name, category: "Partition", layer: "interior", system: "Interior", color: "interior", material: '2×4 wood studs @ 16", ½" gypsum both sides', phase: "envelope" });
  const door = (id: string, at: number, w: number, hinge: "start" | "end", dir: 1 | -1, name: string): Opening => ({ id, at, w, sill: 0, head: 6.7, kind: "door", name, swing: { hinge, dir } });
  b.wall({ ...part("P-1", "Partition – Great Room / Hall (Y=16)"), axis: "x", c0: 16, c1: 16 + t, s: T, e: W - T, z0: 0, z1: zt, openings: [{ id: "OP-HALL", at: 12.17, w: 3.66, sill: 0, head: 7.4, kind: "open" }] });
  b.wall({ ...part("P-2", "Partition – Hall West (X=12)"), axis: "y", c0: 12 - t / 2, c1: 12 + t / 2, s: 16 + t, e: D - T, z0: 0, z1: zt, openings: [door("D-103", 18, 2.67, "start", 1, "Bath Door"), door("D-104", 25, 3, "start", 1, "Bedroom 1 Door")] });
  b.wall({ ...part("P-3", "Partition – Hall East (X=16)"), axis: "y", c0: 16 - t / 2, c1: 16 + t / 2, s: 16 + t, e: D - T, z0: 0, z1: zt, openings: [door("D-105", 18, 2.67, "start", -1, "Laundry Door"), door("D-106", 25, 3, "start", -1, "Bedroom 2 Door")] });
  b.wall({ ...part("P-4", "Partition – Bath / Bedroom 1 (Y=24)"), axis: "x", c0: 24, c1: 24 + t, s: T, e: 12 - t / 2, z0: 0, z1: zt });
  b.wall({ ...part("P-5", "Partition – Laundry / Bedroom 2 (Y=24)"), axis: "x", c0: 24, c1: 24 + t, s: 16 + t / 2, e: W - T, z0: 0, z1: zt });

  /* ── roof ───────────────────────────────────────────────────────────── */
  const roofBase = (id: string, name: string) =>
    opts({ id, name, category: "Roof", layer: "roof", level: "roof", system: "Architectural", color: "roof", material: 'Architectural asphalt shingles on 15/32" ply, synthetic underlayment', phase: "roof", loadBearing: true });
  const ridgeZ = TOP + rise;
  b.extrudeY(roofBase("R-01", "Roof – West Slope"), [[-ex, TOP], [W / 2, ridgeZ], [W / 2, ridgeZ + 0.45], [-ex, TOP + 0.45]], -ex, D + ex);
  b.extrudeY(roofBase("R-02", "Roof – East Slope"), [[W / 2, ridgeZ], [W + ex, TOP], [W + ex, TOP + 0.45], [W / 2, ridgeZ + 0.45]], -ex, D + ex);
  for (let i = 0; i < 19; i++) {
    const y = 1 + i * 2;
    const tr = opts({ id: `TRS-${String(i + 1).padStart(2, "0")}`, name: `Roof Truss ${i + 1}`, category: "Truss", layer: "roof", level: "roof", system: "Structural", color: "structural", material: "2×4 SYP, 20 ga. gusset plates", phase: "roof", loadBearing: true, sectionOnly: true });
    b.extrudeY(tr, [[0, TOP], [W, TOP], [W, TOP + 0.35], [0, TOP + 0.35]], y, y + 0.15);
    b.extrudeY(tr, [[0, TOP + 0.4], [W / 2, ridgeZ - 0.4], [W / 2, ridgeZ - 0.05], [0, TOP + 0.75]], y, y + 0.15);
    b.extrudeY(tr, [[W / 2, ridgeZ - 0.4], [W, TOP + 0.4], [W, TOP + 0.75], [W / 2, ridgeZ - 0.05]], y, y + 0.15);
  }
  // front porch: two posts and a low flat roof under the gable
  const porch = (id: string, name: string, cat: Category) =>
    opts({ id, name, category: cat, layer: cat === "Roof" ? "roof" : "walls", level: cat === "Roof" ? "roof" : "level1", system: "Structural", color: cat === "Roof" ? "roof" : "structural", material: cat === "Roof" ? "Standing-seam metal on 2×6 rafters" : "6×6 pressure-treated post on a steel base", phase: "envelope" });
  b.box(porch("PO-P1", "Porch Post", "Column"), 9.25, -5.75, 9.75, -5.25, -0.33, 8);
  b.box(porch("PO-P2", "Porch Post", "Column"), 18.25, -5.75, 18.75, -5.25, -0.33, 8);
  b.box(porch("PO-ROOF", "Porch Roof", "Roof"), 8.5, -6.6, 19.5, 0, 8, 8.45);

  /* ── furniture and fixtures ─────────────────────────────────────────── */
  const furn = (id: string, name: string, x0: number, y0: number, x1: number, y1: number, z1: number, cat: Category = "Furniture") =>
    b.box(opts({ id, name, category: cat, layer: cat === "Fixture" ? "interior" : "furniture", level: "level1" as LevelKey, system: "Interior", color: cat === "Fixture" ? "fixture" : "furniture", material: cat === "Fixture" ? "Vitreous china / enamelled steel" : "Wood / upholstery", phase: "finishes" }), x0, y0, x1, y1, 0, z1);
  furn("FU-SOFA", "Sofa", 1.5, 5, 4, 12, 2.6);
  furn("FU-CTBL", "Coffee Table", 5, 7, 7.2, 10, 1.4);
  furn("FU-DINE", "Dining Table", 11, 9, 15, 12.5, 2.5);
  furn("FX-KCNT", "Kitchen Counter", 25.4, 2, 27.33, 14, 3, "Fixture");
  furn("FX-ISLD", "Kitchen Island", 19.5, 6.5, 22.5, 11.5, 3, "Fixture");
  furn("FU-FRDG", "Refrigerator", 25.4, 14, 27.33, 15.67, 6);
  furn("FX-TUB", "Bathtub", 0.67, 16.33, 5.67, 18.83, 1.8, "Fixture");
  furn("FX-WC", "Water Closet", 7.5, 22.3, 9, 23.97, 2.5, "Fixture");
  furn("FX-VAN", "Vanity", 0.67, 21.2, 2.6, 23.97, 2.8, "Fixture");
  furn("FX-WASH", "Washer", 24.6, 16.5, 27.33, 19, 3.2, "Fixture");
  furn("FX-DRY", "Dryer", 24.6, 19.2, 27.33, 21.7, 3.2, "Fixture");
  furn("FX-WH", "Water Heater", 16.5, 21.8, 18.3, 23.6, 4.6, "Fixture");
  furn("FU-BED1", "Bed – Bedroom 1", 2, 30, 8.5, 36.5, 2);
  furn("FU-BED2", "Bed – Bedroom 2", 19.5, 30, 26, 36.5, 2);
  furn("FU-DRS1", "Dresser", 0.67, 25, 2.2, 28.5, 3.2);
  furn("FU-DRS2", "Dresser", 25.8, 25, 27.33, 28.5, 3.2);

  /* ── MEP ────────────────────────────────────────────────────────────── */
  const E = (id: string, pts: V3[], label?: string) => b.run({ id, layer: "electrical", kind: "electrical", pts, phase: "mep", level: "level1", label });
  E("E-OUT", [[27, 22.5, 5], [27, 22.5, 1.5], [27, 2, 1.5], [1.1, 2, 1.5], [1.1, 36.5, 1.5], [27, 36.5, 1.5]], "20A Receptacle Circuit");
  E("E-LTG", [[27, 22.5, 5], [27, 22.5, 8.5], [14, 20, 8.5], [8, 8, 8.5], [21, 8, 8.5], [14, 20, 8.5], [6, 31, 8.5], [14, 20, 8.5], [22, 31, 8.5]], "15A Lighting Circuit");
  b.device({ id: "EP-MDP", layer: "electrical", kind: "electrical", at: [27, 22.5, 5], shape: "panel", label: "150A Panel", phase: "mep", level: "level1" });
  ([[8, 8, 8.5], [21, 8, 8.5], [14, 20, 8.5], [6, 31, 8.5], [22, 31, 8.5], [6, 20, 8.5]] as V3[]).forEach((at, i) =>
    b.device({ id: `EL-${i}`, layer: "electrical", kind: "electrical", at, shape: "light", phase: "mep", level: "level1" }),
  );
  const P = (id: string, pts: V3[], label?: string, underground = false, level: LevelKey = "level1") => b.run({ id, layer: "plumbing", kind: "plumbing", pts, phase: "mep", level, label, underground });
  P("P-SUP", [[24, -30, -2.2], [24, 17.5, -2.2], [24, 17.5, 1.2]], '¾" Water Service', true, "foundation");
  P("P-SUP-B", [[24, 17.5, -2.2], [4, 17.5, -2.2], [4, 17.5, 1.2]], undefined, true, "foundation");
  P("P-WST", [[8.2, 23, -1.6], [4, 20.5, -1.6], [6, 20.5, -1.7], [6, D + 0.5, -2.1]], '3" PVC Waste to the Septic Tank', true, "foundation");
  P("P-VENT", [[6, 23.6, -1.6], [6, 23.6, 13.5]], '2" Vent Stack');
  b.device({ id: "PF-WC", layer: "plumbing", kind: "plumbing", at: [8.2, 23, 1.2], shape: "fixture", label: "WC", phase: "mep", level: "level1" });
  b.device({ id: "PF-TUB", layer: "plumbing", kind: "plumbing", at: [3, 17.6, 1.2], shape: "fixture", label: "Tub", phase: "mep", level: "level1" });
  b.device({ id: "PF-SINK", layer: "plumbing", kind: "plumbing", at: [26.4, 8, 3], shape: "fixture", label: "Sink", phase: "mep", level: "level1" });
  const H = (id: string, pts: V3[], label?: string) => b.run({ id, layer: "hvac", kind: "hvac", pts, phase: "mep", level: "level1", label, width: 3 });
  H("H-TRUNK", [[14, 20, 8.2], [14, 4, 8.2]], '10" Supply Trunk');
  H("H-BR", [[14, 30, 8.2], [6, 30, 8.2], [14, 30, 8.2], [22, 30, 8.2], [14, 30, 8.2], [14, 20, 8.2]]);
  b.device({ id: "HU-AHU", layer: "hvac", kind: "hvac", at: [14, 20, 8.2], shape: "unit", label: "AHU-1 · 2-ton", phase: "mep", level: "level1" });

  /* ── septic system in the back yard ─────────────────────────────────── */
  addSeptic(b, {
    id: "SEP",
    grade: GRADE,
    tank: { at: [8, 49], len: 9, wid: 5.5, depth: 5, gallons: 1000 },
    outlet: [6, D + 0.5],
    field: { x0: -2, y0: 60, rows: 3, len: 36, spacing: 6 },
  });

  /* ── annotation data ────────────────────────────────────────────────── */
  b.callouts.push(
    { id: "CO-1", at: [0.3, 19, -3], dx: -120, dy: 54, text: 'Footing 24" × 12"', sub: '2-#5 continuous, 3000 psi' },
    { id: "CO-2", at: [12, 26, -0.8], dx: 70, dy: 60, text: 'Thickened slab 16"', sub: "under the hall walls" },
    { id: "CO-3", at: [27, 22.5, 5], dx: 70, dy: -50, text: "150A Panel", sub: "laundry" },
  );
  b.stress.push(
    { id: "SP-1", at: [0.3, 0.3, 0.2], ksi: 2.4, elementId: "C-A1", label: "Column Base" },
    { id: "SP-2", at: [14, 19, ridgeZ - 0.2], ksi: 3.1, elementId: "TRS-10", label: "Truss Peak" },
    { id: "SP-3", at: [12, 26, -0.6], ksi: 1.7, elementId: "F-TS-1", label: "Thickened Slab" },
    { id: "SP-4", at: [9.5, -5.5, 7.8], ksi: 2.9, elementId: "PO-P1", label: "Porch Post Top" },
  );
  b.rooms.push(
    { id: "RM-1", name: "LIVING / DINING", at: [8, 13.4], area: 260, level: "level1" },
    { id: "RM-2", name: "KITCHEN", at: [22, 13.4], area: 148, level: "level1" },
    { id: "RM-3", name: "BATH", at: [6, 19.6], area: 86, level: "level1" },
    { id: "RM-4", name: "LAUNDRY", at: [21, 19.6], area: 86, level: "level1" },
    { id: "RM-5", name: "BEDROOM 1", at: [6, 27.5], area: 149, level: "level1" },
    { id: "RM-6", name: "BEDROOM 2", at: [22, 27.5], area: 149, level: "level1" },
    { id: "RM-7", name: "HALL", at: [14, 33], area: 79, level: "level1" },
  );
  b.dims.push(
    { id: "DM-W", from: [0, 0], to: [W, 0], offset: -3.2, text: "28'-0\"", level: "level1" },
    { id: "DM-D", from: [0, 0], to: [0, D], offset: -3.2, text: "38'-0\"", level: "level1" },
    { id: "DM-DR", from: [12, 0], to: [15, 0], offset: -1.4, text: "3'-0\"", level: "level1" },
    { id: "DM-FW", from: [0, 0], to: [W, 0], offset: -3.2, text: "28'-0\"", level: "foundation" },
    { id: "DM-FD", from: [0, 0], to: [0, D], offset: -3.2, text: "38'-0\"", level: "foundation" },
  );
  b.grid.push(
    { id: "GA", at: [0, -8.5], label: "A" },
    { id: "GB", at: [14, -8.5], label: "B" },
    { id: "GC", at: [28, -8.5], label: "C" },
    { id: "G1", at: [-5.5, 0.335], label: "1" },
    { id: "G2", at: [-5.5, 19], label: "2" },
    { id: "G3", at: [-5.5, D - 0.335], label: "3" },
  );

  return b.finish({
    kind: "cottage",
    grade: GRADE,
    sectionY: 20,
    levelZ: { site: -4, foundation: -2.5, level1: 0, level2: TOP, roof: TOP },
    footprint: { x0: 0, y0: 0, x1: W, y1: D },
  });
}
