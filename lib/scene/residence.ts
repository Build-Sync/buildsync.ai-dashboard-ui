/**
 * lib/scene/residence.ts
 *
 * WHAT   Builds the sample two-storey house: 24' × 32' footprint, CMU walls, gable roof (high-velocity
 *        hurricane zone), with foundation (continuous footings, stem walls, slab on grade, column bases), framing,
 *        MEP runs, devices, a septic system in the back yard (tank, sewer, drain field: lib/scene/site.ts), trees,
 *        contours, callouts, stress points, room labels, door swings, dimensions and grid.
 * FOR    getScene("residence"). The ridge runs along Y so the section plane (Y = const) cuts the roof as a
 *        profile.
 * DEBUG  - Walls and beams are split at column positions so nothing overlaps; pseudo-openings carve those
 *          zones.
 *        - To change the building, edit the calls here; ids must stay unique and match mock-data issues,
 *          clashes and checks that refer to them.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { SceneBuilder, type BaseOpts, type Opening } from "./builder";
import { addSeptic } from "./site";
import type { Category, LevelKey, PhaseKey, Scene, V2, V3 } from "./types";

/* Residence_2BR_Miami — two storeys, 24' × 32' footprint, CMU walls, gable roof (HVHZ).
 * Ridge runs along Y so the section plane (Y = const) cuts the roof as a profile. */

/** Building width in feet (east-west). */
export const W = 24;
/** Building depth in feet (north-south). */
export const D = 32;
const T = 0.67; // exterior wall
const t = 0.33; // partition
const GRADE = -1.0;
const L1_TOP = 9.0;
const L2_FLOOR = 9.75;
const L2_TOP = 19.5;
const PITCH = 1 / 3; // 4:12

const opts = (o: Partial<BaseOpts> & Pick<BaseOpts, "id" | "name" | "category">): BaseOpts => ({
  layer: "walls",
  level: "level1",
  system: "Architectural",
  color: "walls",
  material: 'CMU 8" grouted, #5 vert. @ 32"',
  phase: "structure1",
  ...o,
});

/** Column positions (id, x, y). Walls and beams are broken at these so nothing overlaps. */
const COLS: [string, number, number][] = [
  ["C-A1", T / 2, T / 2],
  ["C-C1", W - T / 2, T / 2],
  ["C-A3", T / 2, D - T / 2],
  ["C-C3", W - T / 2, D - T / 2],
  ["C-A2", T / 2, 16],
  ["C-C2", W - T / 2, 16],
  ["C-B1", 8.75, T / 2],
  ["C-B2", 15, T / 2],
  ["C-B3", 10.5, D - T / 2],
  ["C-B4", 22, D - T / 2],
];
const COL_HALF = 0.5;

/** Pseudo-openings (no infill) that carve column zones out of a wall/beam/stem run. */
function colZones(side: "S" | "N" | "W" | "E", height = 99): Opening[] {
  const out: Opening[] = [];
  for (const [id, x, y] of COLS) {
    const onS = y === T / 2;
    const onN = y === D - T / 2;
    const onW = x === T / 2;
    const onE = x === W - T / 2;
    const hit = (side === "S" && onS) || (side === "N" && onN) || (side === "W" && onW) || (side === "E" && onE);
    if (!hit) continue;
    const c = side === "S" || side === "N" ? x : y;
    out.push({ id: `${id}-z`, at: c - COL_HALF, w: 2 * COL_HALF, sill: 0, head: height, kind: "open" });
  }
  return out;
}

/** Build the residence scene. */
export function buildResidence(): Scene {
  const b = new SceneBuilder();

  /* ── site ───────────────────────────────────────────────────────────── */
  b.box(
    opts({ id: "TOPO-01", name: "Site Terrain", category: "Topography", layer: "topography", level: "site", system: "Site", color: "topography", material: "Compacted fill over sand (SPT N=14)", phase: "site", terrain: true }),
    -28, -34, 52, 66, -4, GRADE,
  );

  // contours (topography layer)
  const cx = 12;
  const cy = 16;
  for (let i = 0; i < 5; i++) {
    const R = 30 + i * 6.5;
    const pts: V2[] = [];
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      const r = R * (1 + 0.07 * Math.sin(3 * a + i) + 0.04 * Math.cos(5 * a));
      pts.push([cx + r * 1.15 * Math.cos(a), cy + r * 1.1 * Math.sin(a)]);
    }
    b.contours.push({ id: `CT-${i}`, z: GRADE, pts, label: `${(-1 - i * 0.5).toFixed(1)}'` });
  }

  const paving = (id: string, name: string, x0: number, y0: number, x1: number, y1: number) =>
    b.box(
      opts({ id, name, category: "Paving", layer: "landscape", level: "site", system: "Site", color: "paving", material: "Pavers on compacted base", phase: "finishes" }),
      x0, y0, x1, y1, GRADE, GRADE + 0.12,
    );
  paving("PV-DRIVE", "Driveway", 7.5, -34, 17.5, -4);
  paving("PV-WALK", "Entry Walk", 10.5, -4, 13.5, -1.6);
  paving("PV-PATIO", "Rear Patio", 12, 32.2, 22, 38);

  const shrub = (id: string, x0: number, y0: number, x1: number, y1: number, h: number) =>
    b.box(
      opts({ id, name: "Hedge", category: "Landscape", layer: "landscape", level: "site", system: "Site", color: "landscape", material: "Native hedge (cocoplum)", phase: "finishes" }),
      x0, y0, x1, y1, GRADE, GRADE + h,
    );
  shrub("LS-H1", 0.6, -2.2, 8.2, -1, 2.4);
  shrub("LS-H2", 15.8, -2.2, 23.4, -1, 2.4);
  shrub("LS-H3", -2.2, 3, -1, 11, 2);
  shrub("LS-H4", 25, 20, 26.2, 30, 2);

  b.trees.push(
    { id: "TR-P1", at: [-7, 6, GRADE], kind: "palm", height: 26, radius: 6 },
    { id: "TR-P2", at: [-6, 27, GRADE], kind: "palm", height: 22, radius: 5.5 },
    { id: "TR-P3", at: [32, 8, GRADE], kind: "palm", height: 28, radius: 6.5 },
    { id: "TR-S1", at: [33, 36, GRADE], kind: "shade", height: 24, radius: 8 },
    { id: "TR-S2", at: [-12, 46, GRADE], kind: "shade", height: 20, radius: 7 },
    { id: "TR-P4", at: [22, -20, GRADE], kind: "palm", height: 24, radius: 5.5 },
  );

  /* ── foundation ─────────────────────────────────────────────────────── */
  const found = (id: string, name: string, extra: Partial<BaseOpts> = {}) =>
    opts({ id, name, category: "Foundation", layer: "foundation", level: "foundation", system: "Structural", color: "structural", material: "Reinforced concrete 4000 psi, #5 @ 12\"", phase: "foundation", loadBearing: true, ...extra });
  const stems: [string, string, number, number, number, number][] = [
    ["F-ST-S", "South", 0, 0, W, T],
    ["F-ST-N", "North", 0, D - T, W, D],
    ["F-ST-W", "West", 0, T, T, D - T],
    ["F-ST-E", "East", W - T, T, W, D - T],
  ];
  for (const [id, side, x0, y0, x1, y1] of stems) {
    // stems stop at the columns so nothing overlaps (keeps painter ordering exact)
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
    ["F-FT-S", "South", -0.7, -0.67, W + 0.7, 1.33],
    ["F-FT-N", "North", -0.7, D - 1.33, W + 0.7, D + 0.67],
    ["F-FT-W", "West", -0.7, 1.33, 1.33, D - 1.33],
    ["F-FT-E", "East", W - 1.33, 1.33, W + 0.7, D - 1.33],
  ];
  for (const [id, side, x0, y0, x1, y1] of footings) {
    b.box(found(id, `Continuous Footing – ${side}`, { category: "Footing", underground: true, capOnly: true }), x0, y0, x1, y1, -3.5, -2.5);
  }
  b.box(
    opts({ id: "SL-L1", name: "Slab on Grade", category: "Slab", layer: "foundation", level: "foundation", system: "Structural", color: "structural", material: '5" concrete slab, WWM, 10-mil vapor barrier', phase: "foundation", loadBearing: true }),
    T, T, W - T, D - T, -0.5, 0,
  );
  // entry steps
  b.box(opts({ id: "ST-ENT", name: "Entry Step", category: "Stair", layer: "foundation", level: "foundation", system: "Architectural", color: "structural", material: "Concrete", phase: "foundation" }), 10, -1.6, 14, -0.8, GRADE, -0.5);
  b.box(opts({ id: "ST-ENT", name: "Entry Step", category: "Stair", layer: "foundation", level: "foundation", system: "Architectural", color: "structural", material: "Concrete", phase: "foundation" }), 10, -0.8, 14, 0, GRADE, 0);

  /* ── exterior walls, per level ──────────────────────────────────────── */
  const ext = (lvl: "L1" | "L2", z0: number, z1: number, level: LevelKey, phase: PhaseKey, o: Record<"S" | "N" | "W" | "E", Opening[]>) => {
    const base = (side: string, label: string) =>
      opts({ id: `W-${lvl}-${side}`, name: `Exterior Wall – ${label} (${lvl === "L1" ? "Level 1" : "Level 2"})`, category: "Wall", level, phase, loadBearing: true });
    // walls stop 1' under the bond beam so the two never overlap
    const zt = z1 - 1;
    b.wall({ ...base("S", "South"), axis: "x", c0: 0, c1: T, s: 0, e: W, z0, z1: zt, openings: [...o.S, ...colZones("S")] });
    b.wall({ ...base("N", "North"), axis: "x", c0: D - T, c1: D, s: 0, e: W, z0, z1: zt, openings: [...o.N, ...colZones("N")] });
    b.wall({ ...base("W", "West"), axis: "y", c0: 0, c1: T, s: T, e: D - T, z0, z1: zt, openings: [...o.W, ...colZones("W")] });
    b.wall({ ...base("E", "East"), axis: "y", c0: W - T, c1: W, s: T, e: D - T, z0, z1: zt, openings: [...o.E, ...colZones("E")] });
  };
  const win = (id: string, at: number, w: number, sill: number, head: number): Opening => ({ id, at, w, sill, head, kind: "window" });
  ext("L1", 0, L1_TOP, "level1", "structure1", {
    S: [
      win("WN-101", 3, 4, 3, 7),
      { id: "D-101", at: 10.5, w: 3, sill: 0, head: 6.9, kind: "door", name: "Entry Door", swing: { hinge: "start", dir: 1 } },
      win("WN-102", 16, 4, 3, 7),
    ],
    N: [win("WN-103", 4, 4, 3.5, 7), { id: "D-102", at: 13, w: 7, sill: 0, head: 6.9, kind: "slider", name: "Sliding Patio Door" }],
    W: [win("WN-104", 5, 4, 3, 7), win("WN-105", 20, 4, 3.5, 7)],
    E: [win("WN-106", 4, 4, 3, 7), win("WN-107", 17, 2.5, 5, 7)],
  });
  ext("L2", L2_FLOOR, L2_TOP, "level2", "structure2", {
    S: [win("WN-201", 3, 5, 2.8, 6.8), win("WN-202", 16, 5, 2.8, 6.8)],
    N: [win("WN-203", 11.5, 4, 2.8, 6.8), win("WN-208", 16.5, 4, 2.8, 6.8)],
    W: [win("WN-204", 6, 4, 2.8, 6.8), win("WN-205", 21, 4, 2.8, 6.8)],
    E: [win("WN-206", 5, 4, 2.8, 6.8), win("WN-207", 22, 4, 2.8, 6.8)],
  });

  // gable end walls
  const ex0 = 1.5; // roof overhang
  const rise = (W / 2 + ex0) * PITCH; // eave → ridge underside
    const gable = (id: string, name: string, y0: number, y1: number) =>
    b.extrudeY(
      opts({ id, name, category: "Wall", level: "roof", phase: "roof", loadBearing: true }),
      [[0, L2_TOP], [W, L2_TOP], [W, L2_TOP + ex0 * PITCH - 0.02], [W / 2, L2_TOP + rise - 0.02], [0, L2_TOP + ex0 * PITCH - 0.02]],
      y0, y1,
    );
  gable("W-GBL-S", "Gable End Wall – South", 0, T);
  gable("W-GBL-N", "Gable End Wall – North", D - T, D);

  /* ── columns & beams ────────────────────────────────────────────────── */
  for (const [id, x, y] of COLS) {
    const c = opts({ id, name: `Concrete Tie Column ${id.slice(2)}`, category: "Column", system: "Structural", color: "structural", material: "Reinforced concrete 4000 psi, 4-#6", phase: "structure1", loadBearing: true, level: "level1" });
    b.box(c, x - 0.5, y - 0.5, x + 0.5, y + 0.5, GRADE, L2_TOP);
    b.box({ ...c, underground: true, capOnly: true, level: "foundation" }, x - 0.5, y - 0.5, x + 0.5, y + 0.5, -2.5, GRADE);
  }
  const beam = (id: string, name: string, level: LevelKey, phase: PhaseKey) =>
    opts({ id, name, category: "Beam", system: "Structural", color: "structural", material: "Reinforced concrete bond beam, 2-#5 top/bot", phase, loadBearing: true, level });
  const bandOut = 0.17;
  for (const [lvl, z0, z1, level, phase] of [
    ["L1", L1_TOP - 1, L1_TOP, "level1", "structure1"],
    ["L2", L2_TOP - 1, L2_TOP, "level2", "structure2"],
  ] as const) {
    const nm = (s: string) => `Bond Beam – ${s} (${lvl === "L1" ? "Level 1" : "Level 2"})`;
    const run = (side: "S" | "N" | "W" | "E", label: string, axis: "x" | "y", c0: number, c1: number, s0: number, e0: number) =>
      b.wall({ ...beam(`B-${lvl}-${side}`, nm(label), level, phase), axis, c0, c1, s: s0, e: e0, z0, z1, openings: colZones(side) });
    run("S", "South", "x", -bandOut, T + bandOut, -bandOut, W + bandOut);
    run("N", "North", "x", D - T - bandOut, D + bandOut, -bandOut, W + bandOut);
    run("W", "West", "y", -bandOut, T + bandOut, T + bandOut, D - T - bandOut);
    run("E", "East", "y", W - T - bandOut, W + bandOut, T + bandOut, D - T - bandOut);
  }
  // floor beams under the Level 2 slab (clear of every partition)
  b.box(beam("B-L1-M1", "Floor Beam – Level 2 (Y=18, west)", "level1", "structure1"), T, 17.67, 13.5, 18.33, 8.1, L1_TOP);
  b.box(beam("B-L1-M2", "Floor Beam – Level 2 (Y=18, east)", "level1", "structure1"), 14.5, 17.67, W - T, 18.33, 8.1, L1_TOP);

  /* ── level 2 floor slab (with stair opening) ────────────────────────── */
  b.extrudeZ(
    opts({ id: "SL-L2", name: "Floor Slab – Level 2", category: "Slab", layer: "interior", level: "level2", system: "Structural", color: "structural", material: "6\" one-way slab, f'c 4000 psi", phase: "structure1", loadBearing: true }),
    [[T, T], [W - T, T], [W - T, 22.6], [16, 22.6], [16, D - T], [T, D - T]],
    L1_TOP, L2_FLOOR,
  );

  /* ── interior partitions ────────────────────────────────────────────── */
  const part = (id: string, name: string, level: LevelKey) =>
    opts({ id, name, category: "Partition", layer: "interior", level, system: "Interior", color: "interior", material: "3-5/8\" metal stud, 5/8\" gypsum both sides", phase: "envelope" });
  const door = (id: string, at: number, w: number, hinge: "start" | "end", dir: 1 | -1, name = "Interior Door"): Opening => ({
    id, at, w, sill: 0, head: 6.7, kind: "door", name, swing: { hinge, dir },
  });
  // Level 1
  b.wall({ ...part("P-L1-1", "Partition – Level 1 (X=14)", "level1"), axis: "y", c0: 13.835, c1: 14.165, s: T, e: D - T, z0: 0, z1: L1_TOP, openings: [door("D-103", 8, 3, "start", 1, "Bedroom 1 Door"), { id: "AR-101", at: 24.5, w: 5, sill: 0, head: 7.4, kind: "open" }] });
  b.wall({ ...part("P-L1-2", "Partition – Level 1 (Y=14)", "level1"), axis: "x", c0: 14, c1: 14 + t, s: 14.165, e: W - T, z0: 0, z1: L1_TOP });
  b.wall({ ...part("P-L1-3", "Partition – Level 1 (Y=22)", "level1"), axis: "x", c0: 22, c1: 22 + t, s: 14.165, e: W - T, z0: 0, z1: L1_TOP, openings: [door("D-104", 17.5, 2.7, "end", -1, "Bath Door")] });
  // Level 2
  b.wall({ ...part("P-L2-1", "Partition – Level 2 (X=12)", "level2"), axis: "y", c0: 11.835, c1: 12.165, s: T, e: 15, z0: L2_FLOOR, z1: L2_TOP, openings: [door("D-201", 5, 3, "start", 1, "Study Door")] });
  b.wall({ ...part("P-L2-2", "Partition – Level 2 (Y=15)", "level2"), axis: "x", c0: 15, c1: 15 + t, s: T, e: W - T, z0: L2_FLOOR, z1: L2_TOP, openings: [door("D-202", 6, 3, "end", -1, "Bedroom 2 Door"), door("D-203", 17, 3, "start", -1, "Study Entry")] });
  b.wall({ ...part("P-L2-3", "Partition – Level 2 (X=16)", "level2"), axis: "y", c0: 15.835, c1: 16.165, s: 15.33, e: 22.6, z0: L2_FLOOR, z1: L2_TOP });
  // stair guard
  const rail = opts({ id: "GR-201", name: "Stair Guardrail", category: "Stair", layer: "interior", level: "level2", system: "Interior", color: "structural", material: "Steel guardrail 42\"", phase: "finishes" });
  b.box(rail, 16, 22.6, 16.12, D - T, L2_FLOOR, L2_FLOOR + 3.5);
  b.box(rail, 16, 22.5, W - T, 22.62, L2_FLOOR, L2_FLOOR + 3.5);

  // U-stair (floating treads)
  const rise8 = 0.6094;
  const tread = opts({ id: "ST-01", name: "Main Stair (U-shape)", category: "Stair", layer: "interior", level: "level1", system: "Architectural", color: "furniture", material: "Hardwood treads on steel stringer", phase: "structure1" });
  for (let i = 0; i < 8; i++) {
    const y0 = 23 + i * 0.83;
    b.box(tread, 15.2, y0, 18.6, y0 + 0.83, rise8 * (i + 1) - 0.22, rise8 * (i + 1));
  }
  b.box(tread, 15.2, 29.64, 22.8, 31.1, 4.875 - 0.25, 4.875);
  for (let j = 0; j < 8; j++) {
    const y1 = 29.64 - j * 0.83;
    b.box(tread, 19.4, y1 - 0.83, 22.8, y1, 4.875 + rise8 * (j + 1) - 0.22, 4.875 + rise8 * (j + 1));
  }

  /* ── roof ───────────────────────────────────────────────────────────── */
  const roofBase = (id: string, name: string) =>
    opts({ id, name, category: "Roof", layer: "roof", level: "roof", system: "Architectural", color: "roof", material: "Concrete barrel tile on 5/8\" ply, peel & stick underlayment (HVHZ)", phase: "roof", loadBearing: true });
  const ex = 1.5;
  const eaveZ = L2_TOP;
  const ridgeZ = eaveZ + (W / 2 + ex) * PITCH;
  b.extrudeY(roofBase("R-01", "Roof – West Slope"), [[-ex, eaveZ], [W / 2, ridgeZ], [W / 2, ridgeZ + 0.5], [-ex, eaveZ + 0.5]], -ex, D + ex);
  b.extrudeY(roofBase("R-02", "Roof – East Slope"), [[W / 2, ridgeZ], [W + ex, eaveZ], [W + ex, eaveZ + 0.5], [W / 2, ridgeZ + 0.5]], -ex, D + ex);
  // trusses (shown in section view)
  for (let i = 0; i < 16; i++) {
    const y = 1.6 + i * 2;
    const tr = opts({ id: `TRS-${String(i + 1).padStart(2, "0")}`, name: `Roof Truss ${i + 1}`, category: "Truss", layer: "roof", level: "roof", system: "Structural", color: "structural", material: "2×6 SYP, 18 ga. gusset plates", phase: "roof", loadBearing: true, sectionOnly: true });
    const z = L2_TOP;
    b.extrudeY(tr, [[0, z], [W, z], [W, z + 0.4], [0, z + 0.4]], y, y + 0.2);
    b.extrudeY(tr, [[0, z + 0.45], [W / 2, ridgeZ - 0.45], [W / 2, ridgeZ - 0.05], [0, z + 0.85]], y, y + 0.2);
    b.extrudeY(tr, [[W / 2, ridgeZ - 0.45], [W, z + 0.45], [W, z + 0.85], [W / 2, ridgeZ - 0.05]], y, y + 0.2);
    b.extrudeY(tr, [[W / 2 - 0.12, z + 0.4], [W / 2 + 0.12, z + 0.4], [W / 2 + 0.12, ridgeZ - 0.45], [W / 2 - 0.12, ridgeZ - 0.45]], y, y + 0.2);
  }

  /* ── furniture & fixtures ───────────────────────────────────────────── */
  const furn = (id: string, name: string, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, level: LevelKey, cat: Category = "Furniture") => {
    const f = opts({
      id, name, category: cat,
      layer: cat === "Fixture" ? "interior" : "furniture",
      level, system: "Interior",
      color: cat === "Fixture" ? "fixture" : "furniture",
      material: cat === "Fixture" ? "Vitreous china" : "Wood / upholstery",
      phase: "finishes",
    });
    b.box(f, x0, y0, x1, y1, z0, z1);
  };
  furn("FU-SOFA", "Sofa", 2, 3, 8, 5.4, 0, 2.5, "level1");
  furn("FU-SOFA", "Sofa", 2, 3, 8, 3.8, 2.5, 3.3, "level1");
  furn("FU-CTBL", "Coffee Table", 3.5, 7, 6.5, 8.6, 0, 1.4, "level1");
  furn("FU-TV", "TV Console", 0.9, 6, 2.1, 12, 0, 2, "level1");
  furn("FU-DINE", "Dining Table", 3, 21, 8, 24.5, 0, 2.5, "level1");
  furn("FU-CNTR", "Kitchen Counter", 1, 29.7, 13, 31.3, 0, 3, "level1");
  furn("FU-ISLD", "Kitchen Island", 4, 26, 10, 27.6, 0, 3, "level1");
  furn("FU-FRDG", "Refrigerator", 11, 28, 13, 29.6, 0, 6, "level1");
  furn("FU-BED1", "Bed – Bedroom 1", 17, 1.5, 23, 8, 0, 1.8, "level1");
  furn("FU-BED1", "Bed – Bedroom 1", 22.4, 1.5, 23, 8, 1.8, 3.6, "level1");
  furn("FU-NST1", "Nightstand", 15.2, 6.6, 16.7, 8, 0, 1.8, "level1");
  furn("FX-TUB", "Bathtub", 17.5, 19.9, 22.9, 21.8, 0, 1.8, "level1", "Fixture");
  furn("FX-WC", "Water Closet", 15.3, 18.4, 16.8, 20, 0, 2.5, "level1", "Fixture");
  furn("FX-VAN", "Vanity", 19, 14.7, 21.5, 15.8, 0, 2.8, "level1", "Fixture");
  furn("FX-WH", "Water Heater", 1.2, 21.3, 2.7, 22.8, 0, 4.5, "level1", "Fixture");
  furn("FU-BED2", "Bed – Bedroom 2", 2, 2, 7.5, 8.5, L2_FLOOR, L2_FLOOR + 1.8, "level2");
  furn("FU-BED2", "Bed – Bedroom 2", 2, 2, 7.5, 2.6, L2_FLOOR + 1.8, L2_FLOOR + 3.4, "level2");
  furn("FU-WARD", "Wardrobe", 8, 0.9, 11.4, 2.9, L2_FLOOR, L2_FLOOR + 6.8, "level2");
  furn("FU-DESK", "Desk – Study", 15, 1, 21, 3, L2_FLOOR, L2_FLOOR + 2.5, "level2");
  furn("FU-LSOF", "Loft Sofa", 2, 21, 8, 23.6, L2_FLOOR, L2_FLOOR + 2.5, "level2");
  furn("FU-SHLF", "Bookshelf", 0.9, 25, 2.1, 31, L2_FLOOR, L2_FLOOR + 6.5, "level2");

  /* ── MEP ────────────────────────────────────────────────────────────── */
  const E = (id: string, pts: V3[], level: LevelKey, label?: string) =>
    b.run({ id, layer: "electrical", kind: "electrical", pts, phase: "mep", level, label });
  E("E-L1-OUT", [[8.5, 0.95, 5], [8.5, 0.95, 1.5], [1.1, 0.95, 1.5], [1.1, 31.2, 1.5], [12.9, 31.2, 1.5]], "level1", "20A Receptacle Circuit");
  E("E-L1-OUT2", [[8.5, 0.95, 1.5], [23, 0.95, 1.5], [23, 13.5, 1.5], [23, 21.4, 1.5]], "level1");
  E("E-L1-LTG", [[8.5, 0.95, 5], [8.5, 0.95, 8.4], [8, 9, 8.4], [8, 25, 8.4], [19, 25, 8.4], [19, 6, 8.4], [8, 9, 8.4]], "level1", "15A Lighting Circuit");
  E("E-RISER", [[1.1, 0.95, 1.5], [1.1, 0.95, 11.25]], "level2", "Riser");
  E("E-L2-OUT", [[1.1, 0.95, 11.25], [1.1, 14.2, 11.25], [23, 14.2, 11.25], [23, 0.95, 11.25]], "level2");
  E("E-L2-LTG", [[12, 8, 18.8], [12, 24, 18.8], [5, 24, 18.8], [5, 5, 18.8], [18, 5, 18.8]], "level2");
  b.device({ id: "EP-MDP", layer: "electrical", kind: "electrical", at: [8.5, 0.95, 5], shape: "panel", label: "200A MDP", phase: "mep", level: "level1" });
  const outlets: V3[] = [[3, 0.95, 1.5], [1.1, 8, 1.5], [1.1, 16, 1.5], [1.1, 24, 1.5], [5, 31.2, 1.5], [10, 31.2, 1.5], [12.9, 31.2, 1.5], [15, 0.95, 1.5], [23, 4, 1.5], [23, 10, 1.5], [23, 18, 1.5], [1.1, 4, 11.25], [1.1, 10, 11.25], [14, 14.2, 11.25], [23, 8, 11.25]];
  outlets.forEach((at, i) => b.device({ id: `EO-${i}`, layer: "electrical", kind: "electrical", at, shape: "outlet", phase: "mep", level: at[2] > 5 ? "level2" : "level1" }));
  const lights: V3[] = [[8, 9, 8.4], [8, 25, 8.4], [19, 25, 8.4], [19, 6, 8.4], [12, 8, 18.8], [12, 24, 18.8], [5, 24, 18.8], [5, 5, 18.8], [18, 5, 18.8]];
  lights.forEach((at, i) => b.device({ id: `EL-${i}`, layer: "electrical", kind: "electrical", at, shape: "light", phase: "mep", level: at[2] > 12 ? "level2" : "level1" }));

  const P = (id: string, pts: V3[], level: LevelKey, label?: string, underground = false) =>
    b.run({ id, layer: "plumbing", kind: "plumbing", pts, phase: "mep", level, label, underground });
  P("P-SUP-1", [[19, -30, -2.2], [19, 17, -2.2], [19, 17, 1.2]], "foundation", '1" Water Service', true);
  P("P-SUP-2", [[19, 17, -2.2], [3, 17, -2.2], [3, 30.3, -2.2], [3, 30.3, 2.8]], "foundation", undefined, true);
  P("P-WST", [[16.5, 19.2, -1.8], [12.5, 19.2, -1.8], [12.5, D + 0.5, -2.1]], "foundation", '4" PVC Waste to the Septic Tank', true);
  P("P-WST-K", [[3.5, 30.3, -1.8], [12.5, 30.3, -1.8]], "foundation", undefined, true);
  P("P-VENT", [[16.5, 19.2, -1.8], [16.5, 19.2, 23.4]], "level1", '3" Vent Stack');
  b.device({ id: "PF-WC", layer: "plumbing", kind: "plumbing", at: [16.0, 19.2, 1.2], shape: "fixture", label: "WC", phase: "mep", level: "level1" });
  b.device({ id: "PF-TUB", layer: "plumbing", kind: "plumbing", at: [20.2, 20.9, 1.2], shape: "fixture", label: "Tub", phase: "mep", level: "level1" });
  b.device({ id: "PF-SINK", layer: "plumbing", kind: "plumbing", at: [3, 30.5, 3], shape: "fixture", label: "Sink", phase: "mep", level: "level1" });
  b.device({ id: "PF-WH", layer: "plumbing", kind: "plumbing", at: [2, 22, 4.5], shape: "unit", label: "WH", phase: "mep", level: "level1" });

  const H = (id: string, pts: V3[], level: LevelKey, label?: string) =>
    b.run({ id, layer: "hvac", kind: "hvac", pts, phase: "mep", level, label, width: 3 });
  H("H-L1", [[20, 18.5, 10.9], [20, 18.5, 8.4], [8, 18.5, 8.4], [8, 3, 8.4]], "level1", '12" Supply Trunk');
  H("H-L1-B", [[20, 18.5, 8.4], [20, 5, 8.4]], "level1");
  H("H-L2", [[20, 18.5, 17.8], [6, 18.5, 17.8], [6, 4, 17.8]], "level2");
  H("H-L2-B", [[14, 18.5, 17.8], [14, 4, 17.8], [18, 4, 17.8]], "level2");
  b.device({ id: "HU-AHU", layer: "hvac", kind: "hvac", at: [20, 18.5, 10.9], shape: "unit", label: "AHU-1", phase: "mep", level: "level2" });
  ([[8, 3, 8.4], [20, 5, 8.4], [8, 18.5, 8.4], [6, 4, 17.8], [18, 4, 17.8]] as V3[]).forEach((at, i) =>
    b.device({ id: `HR-${i}`, layer: "hvac", kind: "hvac", at, shape: "outlet", phase: "mep", level: at[2] > 12 ? "level2" : "level1" }),
  );

  b.run({ id: "FP-RISER", layer: "fire", kind: "fire", pts: [[1.2, 1.2, -1.8], [1.2, 1.2, 19.1]], phase: "mep", level: "level1", label: "2\" Sprinkler Riser" });
  b.run({ id: "FP-L1", layer: "fire", kind: "fire", pts: [[1.2, 1.2, 8.7], [1.2, 30, 8.7], [22, 30, 8.7]], phase: "mep", level: "level1" });
  b.run({ id: "FP-L1-B", layer: "fire", kind: "fire", pts: [[1.2, 1.2, 8.7], [22, 1.2, 8.7]], phase: "mep", level: "level1" });
  b.run({ id: "FP-L2", layer: "fire", kind: "fire", pts: [[1.2, 1.2, 19.1], [1.2, 30, 19.1], [22, 30, 19.1]], phase: "mep", level: "level2" });
  ([[6, 1.2, 8.7], [18, 1.2, 8.7], [1.2, 16, 8.7], [12, 30, 8.7], [22, 30, 8.7], [6, 1.2, 19.1], [1.2, 16, 19.1], [12, 30, 19.1]] as V3[]).forEach((at, i) =>
    b.device({ id: `FH-${i}`, layer: "fire", kind: "fire", at, shape: "head", phase: "mep", level: at[2] > 12 ? "level2" : "level1" }),
  );

  /* ── septic system in the back yard, past the patio ─────────────────── */
  addSeptic(b, {
    id: "SEP",
    grade: GRADE,
    tank: { at: [6, 44], len: 9, wid: 5.5, depth: 5, gallons: 1000 },
    outlet: [12.5, D + 0.5],
    field: { x0: -6, y0: 51, rows: 3, len: 30, spacing: 5 },
  });

  /* ── annotation data (plan view, callouts, stress) ──────────────────── */
  b.callouts.push(
    { id: "CO-1", at: [0.3, 14, -3], dx: -120, dy: 54, text: "Footing 24\" × 12\"", sub: "#5 @ 12\" o.c. each way" },
    { id: "CO-2", at: [0.2, 6, 19.6], dx: -130, dy: -42, text: "Hurricane clips @ 24\" o.c.", sub: "FBC HVHZ · 175 mph" },
    { id: "CO-3", at: [0.3, 22, 5], dx: -128, dy: 6, text: "8\" CMU · #5 @ 32\"", sub: "grouted cells" },
    { id: "CO-4", at: [8.5, 0.95, 5], dx: 60, dy: 78, text: "200A Main Panel", sub: "Panel MDP · 40 circuits" },
    { id: "CO-5", at: [12.5, D + 0.5, -2.1], dx: 70, dy: 40, text: "4\" PVC Building Sewer", sub: "¼\":12 slope to the septic tank" },
    { id: "CO-6", at: [20, 18.5, 10.9], dx: 82, dy: -62, text: "AHU-1 · 3-ton", sub: "supply 1,200 CFM" },
  );
  b.stress.push(
    { id: "SP-1", at: [0.3, 0.3, 0.2], ksi: 3.1, elementId: "C-A1", label: "Column Base" },
    { id: "SP-2", at: [0.3, 16, 19.7], ksi: 4.2, elementId: "W-L2-W", label: "Roof-to-Wall Connection" },
    { id: "SP-3", at: [6.8, 18, 8.6], ksi: 4.8, elementId: "B-L1-M1", label: "Floor Beam Midspan" },
    { id: "SP-4", at: [23.7, 16, 19.9], ksi: 3.6, elementId: "TRS-08", label: "Truss Heel" },
    { id: "SP-5", at: [16, 22.6, 9.4], ksi: 2.7, elementId: "SL-L2", label: "Stair Opening Corner" },
    { id: "SP-6", at: [0, 0, -2.6], ksi: 1.9, elementId: "F-FT-S", label: "Footing Corner" },
    { id: "SP-7", at: [12, 16, ridgeZ + 0.1], ksi: 2.2, elementId: "R-01", label: "Ridge" },
  );
  b.rooms.push(
    { id: "RM-1", name: "LIVING", at: [7, 9], area: 252, level: "level1" },
    { id: "RM-2", name: "KITCHEN / DINING", at: [7, 25], area: 196, level: "level1" },
    { id: "RM-3", name: "BEDROOM 1", at: [19, 7], area: 130, level: "level1" },
    { id: "RM-4", name: "BATH", at: [19, 18], area: 75, level: "level1" },
    { id: "RM-5", name: "STAIR HALL", at: [19.5, 27], area: 90, level: "level1" },
    { id: "RM-6", name: "BEDROOM 2", at: [6, 8], area: 160, level: "level2" },
    { id: "RM-7", name: "STUDY", at: [18, 8], area: 130, level: "level2" },
    { id: "RM-8", name: "LOFT", at: [8, 23], area: 200, level: "level2" },
    { id: "RM-9", name: "AHU / STORAGE", at: [20, 18.7], area: 28, level: "level2" },
  );
  for (const lvl of ["foundation", "level1", "level2"] as const) {
    b.dims.push(
      { id: `DM-W-${lvl}`, from: [0, 0], to: [W, 0], offset: -3.2, text: "24'-0\"", level: lvl },
      { id: `DM-D-${lvl}`, from: [0, 0], to: [0, D], offset: -3.2, text: "32'-0\"", level: lvl },
    );
  }
  b.dims.push(
    { id: "DM-DR", from: [10.5, 0], to: [13.5, 0], offset: -1.4, text: "3'-0\"", level: "level1" },
    { id: "DM-WN1", from: [3, 0], to: [7, 0], offset: -1.4, text: "4'-0\"", level: "level1" },
  );
  b.grid.push(
    { id: "GA", at: [0, -5.5], label: "A" },
    { id: "GB", at: [12, -5.5], label: "B" },
    { id: "GC", at: [24, -5.5], label: "C" },
    { id: "G1", at: [-5.5, 0.335], label: "1" },
    { id: "G2", at: [-5.5, 16], label: "2" },
    { id: "G3", at: [-5.5, 31.665], label: "3" },
  );

  return b.finish({
    kind: "residence",
    grade: GRADE,
    sectionY: 12,
    levelZ: { site: -4, foundation: -2.5, level1: 0, level2: L2_FLOOR, roof: L2_TOP },
    footprint: { x0: 0, y0: 0, x1: W, y1: D },
  });
}
