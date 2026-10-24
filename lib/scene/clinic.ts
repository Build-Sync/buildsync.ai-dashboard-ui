/**
 * lib/scene/clinic.ts
 *
 * WHAT   Builds the sample clinic (single storey, 48' × 28', flat roof with parapet, accessible entry) and the
 *        empty scene used by blank projects.
 * FOR    getScene("clinic") and getScene("blank").
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { SceneBuilder, type BaseOpts, type Opening } from "./builder";
import type { LevelKey, Scene, V2, V3 } from "./types";

/* Clinic_Phase1_Antigua — single storey, 48' × 28', flat roof with parapet, accessible entry. */

const W = 48;
const D = 28;
const T = 0.67;
const GRADE = -1.0;
const H = 11;
const ROOF_T = 0.8;

const opts = (o: Partial<BaseOpts> & Pick<BaseOpts, "id" | "name" | "category">): BaseOpts => ({
  layer: "walls",
  level: "level1",
  system: "Architectural",
  color: "walls",
  material: 'CMU 8" grouted, #5 vert. @ 32"',
  phase: "structure1",
  ...o,
});

const COLS: [string, number, number][] = [
  ["C-A1", T / 2, T / 2],
  ["C-F1", W - T / 2, T / 2],
  ["C-A3", T / 2, D - T / 2],
  ["C-F3", W - T / 2, D - T / 2],
  ["C-C1", 16, T / 2],
  ["C-D1", 32, T / 2],
  ["C-C3", 16, D - T / 2],
  ["C-D3", 32, D - T / 2],
];

/** Pseudo-openings (no infill) carving column zones out of a wall/beam/stem run. */
function colZones(side: "S" | "N" | "W" | "E"): Opening[] {
  const out: Opening[] = [];
  for (const [id, x, y] of COLS) {
    const hit =
      (side === "S" && y === T / 2) || (side === "N" && y === D - T / 2) || (side === "W" && x === T / 2) || (side === "E" && x === W - T / 2);
    if (!hit) continue;
    const c = side === "S" || side === "N" ? x : y;
    out.push({ id: `${id}-z`, at: c - 0.5, w: 1, sill: 0, head: 99, kind: "open" });
  }
  return out;
}

/** Build the clinic scene. */
export function buildClinic(): Scene {
  const b = new SceneBuilder();

  b.box(
    opts({ id: "TOPO-01", name: "Site Terrain", category: "Topography", layer: "topography", level: "site", system: "Site", color: "topography", material: "Coralline limestone fill", phase: "site", terrain: true }),
    -34, -40, 82, 66, -4, GRADE,
  );
  for (let i = 0; i < 4; i++) {
    const R = 36 + i * 7;
    const pts: V2[] = [];
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      const r = R * (1 + 0.06 * Math.sin(2 * a + i) + 0.04 * Math.cos(4 * a));
      pts.push([24 + r * 1.45 * Math.cos(a), 14 + r * Math.sin(a)]);
    }
    b.contours.push({ id: `CT-${i}`, z: GRADE, pts, label: `${(-1 - i * 0.5).toFixed(1)}'` });
  }

  const found = (id: string, name: string, extra: Partial<BaseOpts> = {}) =>
    opts({ id, name, category: "Foundation", layer: "foundation", level: "foundation", system: "Structural", color: "structural", material: 'Reinforced concrete 4000 psi', phase: "foundation", loadBearing: true, ...extra });
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
  b.box(found("F-FT-S", "Continuous Footing – South", { category: "Footing", underground: true, capOnly: true }), -0.7, -0.67, W + 0.7, 1.33, -3.5, -2.5);
  b.box(found("F-FT-N", "Continuous Footing – North", { category: "Footing", underground: true, capOnly: true }), -0.7, D - 1.33, W + 0.7, D + 0.67, -3.5, -2.5);
  b.box(found("F-FT-W", "Continuous Footing – West", { category: "Footing", underground: true, capOnly: true }), -0.7, 1.33, 1.33, D - 1.33, -3.5, -2.5);
  b.box(found("F-FT-E", "Continuous Footing – East", { category: "Footing", underground: true, capOnly: true }), W - 1.33, 1.33, W + 0.7, D - 1.33, -3.5, -2.5);
  b.box(
    opts({ id: "SL-L1", name: "Slab on Grade", category: "Slab", layer: "foundation", level: "foundation", system: "Structural", color: "structural", material: '6" slab, fibre-reinforced', phase: "foundation", loadBearing: true }),
    T, T, W - T, D - T, -0.5, 0,
  );

  const win = (id: string, at: number, w: number, sill = 3.5, head = 7.5): Opening => ({ id, at, w, sill, head, kind: "window" });
  const ext = (side: "S" | "N" | "W" | "E", label: string, o: Opening[]) => {
    const base = opts({ id: `W-L1-${side}`, name: `Exterior Wall – ${label}`, category: "Wall", loadBearing: true });
    const ops = [...o, ...colZones(side)];
    if (side === "S") b.wall({ ...base, axis: "x", c0: 0, c1: T, s: 0, e: W, z0: 0, z1: H - 1, openings: ops });
    if (side === "N") b.wall({ ...base, axis: "x", c0: D - T, c1: D, s: 0, e: W, z0: 0, z1: H - 1, openings: ops });
    if (side === "W") b.wall({ ...base, axis: "y", c0: 0, c1: T, s: T, e: D - T, z0: 0, z1: H - 1, openings: ops });
    if (side === "E") b.wall({ ...base, axis: "y", c0: W - T, c1: W, s: T, e: D - T, z0: 0, z1: H - 1, openings: ops });
  };
  ext("S", "South", [
    win("WN-101", 3.5, 4.5),
    win("WN-102", 10, 4.5),
    { id: "D-101", at: 21, w: 6, sill: 0, head: 7.5, kind: "door", name: "Main Entrance (double)", swing: { hinge: "start", dir: -1 } },
    win("WN-103", 33, 4.5),
    win("WN-104", 40, 4.5),
  ]);
  ext("N", "North", [win("WN-105", 4, 4), win("WN-106", 18, 4), win("WN-107", 25, 4), { id: "D-102", at: 40, w: 3.5, sill: 0, head: 7, kind: "door", name: "Staff Exit", swing: { hinge: "start", dir: 1 } }]);
  ext("W", "West", [win("WN-108", 6, 4), win("WN-109", 20, 4)]);
  ext("E", "East", [win("WN-110", 8, 4), win("WN-111", 21, 4)]);

  // flat roof + parapet
  b.box(
    opts({ id: "R-01", name: "Roof Slab", category: "Roof", layer: "roof", level: "roof", system: "Structural", color: "roof", material: "Reinforced concrete slab, torch-applied membrane", phase: "roof", loadBearing: true }),
    -1, -1, W + 1, D + 1, H, H + ROOF_T,
  );
  const par = opts({ id: "R-PAR", name: "Parapet", category: "Roof", layer: "roof", level: "roof", color: "roof", material: "CMU parapet w/ coping", phase: "roof" });
  b.box(par, -1, -1, W + 1, -0.2, H + ROOF_T, H + ROOF_T + 1.4);
  b.box(par, -1, D + 0.2, W + 1, D + 1, H + ROOF_T, H + ROOF_T + 1.4);
  b.box(par, -1, -0.2, -0.2, D + 0.2, H + ROOF_T, H + ROOF_T + 1.4);
  b.box(par, W + 0.2, -0.2, W + 1, D + 0.2, H + ROOF_T, H + ROOF_T + 1.4);

  // columns / bond beams
  const colOpts = (id: string) => opts({ id, name: `Concrete Column ${id.slice(2)}`, category: "Column", system: "Structural", color: "structural", material: "Reinforced concrete 4000 psi", loadBearing: true });
  const cols: [string, number, number][] = [
    ["C-A1", T / 2, T / 2], ["C-F1", W - T / 2, T / 2], ["C-A3", T / 2, D - T / 2], ["C-F3", W - T / 2, D - T / 2],
    ["C-C1", 16, T / 2], ["C-D1", 32, T / 2], ["C-C3", 16, D - T / 2], ["C-D3", 32, D - T / 2],
  ];
  for (const [id, x, y] of cols) {
    b.box(colOpts(id), x - 0.5, y - 0.5, x + 0.5, y + 0.5, GRADE, H);
    b.box({ ...colOpts(id), underground: true, capOnly: true, level: "foundation" }, x - 0.5, y - 0.5, x + 0.5, y + 0.5, -2.5, GRADE);
  }
  const bm = (id: string, name: string) => opts({ id, name, category: "Beam", system: "Structural", color: "structural", material: "Reinforced concrete bond beam", loadBearing: true });
  const beamRun = (side: "S" | "N" | "W" | "E", label: string, axis: "x" | "y", c0: number, c1: number, s0: number, e0: number) =>
    b.wall({ ...bm(`B-L1-${side}`, `Bond Beam – ${label}`), axis, c0, c1, s: s0, e: e0, z0: H - 1, z1: H, openings: colZones(side) });
  beamRun("S", "South", "x", -0.17, T + 0.17, -0.17, W + 0.17);
  beamRun("N", "North", "x", D - T - 0.17, D + 0.17, -0.17, W + 0.17);
  beamRun("W", "West", "y", -0.17, T + 0.17, T + 0.17, D - T - 0.17);
  beamRun("E", "East", "y", W - T - 0.17, W + 0.17, T + 0.17, D - T - 0.17);
  b.box(bm("B-L1-MID", "Roof Beam (Y=14)"), T, 13.6, W - T, 14.4, H - 1.4, H);

  // interior partitions
  const part = (id: string, name: string) => opts({ id, name, category: "Partition", layer: "interior", system: "Interior", color: "interior", material: '3-5/8" metal stud, 5/8" gypsum', phase: "envelope" });
  const door = (id: string, at: number, w: number, hinge: "start" | "end", dir: 1 | -1, name = "Door"): Opening => ({ id, at, w, sill: 0, head: 6.8, kind: "door", name, swing: { hinge, dir } });
  b.wall({ ...part("P-1", "Corridor Wall – South (Y=11.7)"), axis: "x", c0: 11.67, c1: 12, s: T, e: W - T, z0: 0, z1: H, openings: [{ id: "OP-1", at: 20, w: 8, sill: 0, head: 7.5, kind: "open" }, door("D-103", 5, 3.2, "start", -1, "Triage"), door("D-104", 37, 3.2, "end", -1, "Admin")] });
  b.wall({ ...part("P-2", "Corridor Wall – North (Y=17)"), axis: "x", c0: 17, c1: 17.33, s: T, e: W - T, z0: 0, z1: H, openings: [door("D-105", 4.5, 3.2, "start", 1, "Exam 1"), door("D-106", 16.5, 3.2, "start", 1, "Exam 2"), door("D-107", 28.5, 3.2, "start", 1, "Exam 3"), door("D-108", 40, 3.2, "start", 1, "Lab")] });
  b.wall({ ...part("P-3", "Partition (X=14)"), axis: "y", c0: 13.835, c1: 14.165, s: T, e: 11.67, z0: 0, z1: H });
  b.wall({ ...part("P-4", "Partition (X=34)"), axis: "y", c0: 33.835, c1: 34.165, s: T, e: 11.67, z0: 0, z1: H });
  for (const [i, x] of [[5, 12], [6, 24], [7, 36]] as const) {
    b.wall({ ...part(`P-${i}`, `Partition (X=${x})`), axis: "y", c0: x - 0.165, c1: x + 0.165, s: 17.33, e: D - T, z0: 0, z1: H });
  }

  // entry canopy, landing and ramp
  const site = (id: string, name: string, cat: "Paving" | "Column" | "Roof") =>
    opts({ id, name, category: cat, layer: cat === "Paving" ? "landscape" : "walls", level: "site", system: cat === "Paving" ? "Site" : "Architectural", color: cat === "Paving" ? "paving" : "structural", material: cat === "Paving" ? "Concrete" : "Steel", phase: "finishes" });
  b.box(site("PV-LAND", "Entry Landing", "Paving"), 19, -5, 29, 0, GRADE, 0);
  for (let i = 0; i < 3; i++) {
    b.box(site("PV-RAMP", "Accessible Ramp (1:12)", "Paving"), 29 + i * 4, -5, 33 + i * 4, 0, GRADE, -0.33 * (i + 1));
  }
  b.box(site("PV-WALK", "Front Walk", "Paving"), 21, -22, 27, -5, GRADE, GRADE + 0.12);
  b.box(site("CAN-01", "Entry Canopy", "Roof"), 18.5, -5.6, 29.5, 0.4, 9.6, 10.1);
  b.box(site("CAN-P1", "Canopy Post", "Column"), 18.8, -5.3, 19.3, -4.8, 0, 9.6);
  b.box(site("CAN-P2", "Canopy Post", "Column"), 28.7, -5.3, 29.2, -4.8, 0, 9.6);
  b.box(site("PV-PARK", "Parking Apron", "Paving"), 2, -30, 44, -22, GRADE, GRADE + 0.12);

  b.trees.push(
    { id: "TR-P1", at: [-8, 8, GRADE], kind: "palm", height: 26, radius: 6 },
    { id: "TR-P2", at: [56, 12, GRADE], kind: "palm", height: 28, radius: 6.5 },
    { id: "TR-S1", at: [-10, 40, GRADE], kind: "shade", height: 22, radius: 8 },
    { id: "TR-S2", at: [60, 40, GRADE], kind: "shade", height: 24, radius: 8 },
    { id: "TR-P3", at: [44, -12, GRADE], kind: "palm", height: 24, radius: 5.5 },
  );

  // furniture / fixtures
  const fx = (id: string, name: string, x0: number, y0: number, x1: number, y1: number, z1: number, cat: "Furniture" | "Fixture" = "Furniture") =>
    b.box(opts({ id, name, category: cat, layer: cat === "Fixture" ? "interior" : "furniture", system: "Interior", color: cat === "Fixture" ? "fixture" : "furniture", material: cat === "Fixture" ? "Stainless / ceramic" : "Laminate", phase: "finishes" }), x0, y0, x1, y1, 0, z1);
  fx("FU-RCPT", "Reception Desk", 20, 5, 28, 7, 3.6);
  fx("FU-WAIT", "Waiting Seating", 2, 3, 12, 4.5, 1.6);
  fx("FU-EX1", "Exam Table 1", 5, 21, 8.5, 25, 2.6);
  fx("FU-EX2", "Exam Table 2", 17, 21, 20.5, 25, 2.6);
  fx("FU-EX3", "Exam Table 3", 29, 21, 32.5, 25, 2.6);
  fx("FX-LAB", "Lab Bench", 38, 19, 46, 21, 3, "Fixture");
  fx("FX-SINK", "Hand Wash Sink", 38, 26, 40, 27.2, 3, "Fixture");

  // MEP (compact)
  const run = (id: string, layer: "electrical" | "plumbing" | "hvac" | "fire", pts: V3[], label?: string, underground = false, level: LevelKey = "level1") =>
    b.run({ id, layer, kind: layer, pts, phase: "mep", level, label, underground, width: layer === "hvac" ? 3 : undefined });
  run("E-1", "electrical", [[44, 0.95, 5], [44, 0.95, 10.2], [3, 0.95, 10.2], [3, 26, 10.2], [44, 26, 10.2]], "Lighting trunk");
  run("E-2", "electrical", [[44, 0.95, 5], [44, 0.95, 1.5], [1.1, 0.95, 1.5], [1.1, 26.5, 1.5]], "Receptacle circuit");
  b.device({ id: "EP-MDP", layer: "electrical", kind: "electrical", at: [44, 0.95, 5], shape: "panel", label: "400A MDP", phase: "mep", level: "level1" });
  for (let i = 0; i < 9; i++) b.device({ id: `EL-${i}`, layer: "electrical", kind: "electrical", at: [5 + i * 4.8, 14.5, 10.2], shape: "light", phase: "mep", level: "level1" });
  run("P-SUP", "plumbing", [[39, -30, -2.2], [39, 26.6, -2.2], [39, 26.6, 3]], '1-1/2" water service', true, "foundation");
  run("P-WST", "plumbing", [[39.5, 26, -1.8], [39.5, 50, -2.6]], '4" waste', true, "foundation");
  b.device({ id: "PF-SINK", layer: "plumbing", kind: "plumbing", at: [39, 26.6, 3], shape: "fixture", label: "Sink", phase: "mep", level: "level1" });
  run("H-1", "hvac", [[3, 14.5, 9.8], [45, 14.5, 9.8]], "Supply trunk");
  for (const x of [6, 18, 30, 42]) run(`H-${x}`, "hvac", [[x, 14.5, 9.8], [x, 22, 9.8]]);
  b.device({ id: "HU-AHU", layer: "hvac", kind: "hvac", at: [24, 14.5, 9.8], shape: "unit", label: "AHU-1", phase: "mep", level: "level1" });
  run("FP-1", "fire", [[2, 14.5, 10.6], [46, 14.5, 10.6]], "Sprinkler main");
  for (let i = 0; i < 8; i++) b.device({ id: `FH-${i}`, layer: "fire", kind: "fire", at: [4 + i * 5.8, 14.5, 10.6], shape: "head", phase: "mep", level: "level1" });

  b.callouts.push(
    { id: "CO-1", at: [0.3, 14, -3], dx: -120, dy: 54, text: "Footing 24\" × 12\"", sub: "#5 @ 12\" o.c." },
    { id: "CO-2", at: [24, 14.5, 9.8], dx: 70, dy: -70, text: "AHU-1 · 5-ton", sub: "supply 2,000 CFM" },
    { id: "CO-3", at: [44, 0.95, 5], dx: 70, dy: 70, text: "400A main panel", sub: "emergency generator tie" },
  );
  b.stress.push(
    { id: "SP-1", at: [0.3, 0.3, 0.2], ksi: 2.6, elementId: "C-A1", label: "Column base" },
    { id: "SP-2", at: [24, 14, H - 0.4], ksi: 4.4, elementId: "B-L1-MID", label: "Roof beam midspan" },
    { id: "SP-3", at: [19, -5, 9.8], ksi: 3.4, elementId: "CAN-01", label: "Canopy cantilever" },
    { id: "SP-4", at: [W, 0, H], ksi: 3.0, elementId: "R-01", label: "Roof corner uplift" },
  );
  b.rooms.push(
    { id: "RM-1", name: "WAITING", at: [7, 6], area: 80, level: "level1" },
    { id: "RM-2", name: "RECEPTION", at: [24, 6], area: 110, level: "level1" },
    { id: "RM-3", name: "TRIAGE", at: [42, 6], area: 80, level: "level1" },
    { id: "RM-4", name: "EXAM 1", at: [6, 23], area: 120, level: "level1" },
    { id: "RM-5", name: "EXAM 2", at: [18, 23], area: 120, level: "level1" },
    { id: "RM-6", name: "EXAM 3", at: [30, 23], area: 120, level: "level1" },
    { id: "RM-7", name: "LAB", at: [42, 23], area: 120, level: "level1" },
    { id: "RM-8", name: "CORRIDOR", at: [24, 14.7], area: 230, level: "level1" },
  );
  b.dims.push(
    { id: "DM-W", from: [0, 0], to: [W, 0], offset: -3.4, text: "48'-0\"", level: "level1" },
    { id: "DM-D", from: [0, 0], to: [0, D], offset: -3.4, text: "28'-0\"", level: "level1" },
  );
  b.grid.push(
    { id: "GA", at: [0, -6], label: "A" }, { id: "GC", at: [16, -6], label: "C" }, { id: "GD", at: [32, -6], label: "D" }, { id: "GF", at: [48, -6], label: "F" },
    { id: "G1", at: [-6, 0.335], label: "1" }, { id: "G3", at: [-6, 27.665], label: "3" },
  );

  return b.finish({
    kind: "clinic",
    grade: GRADE,
    sectionY: 14,
    levelZ: { site: -4, foundation: -2.5, level1: 0, level2: 12, roof: H },
    footprint: { x0: 0, y0: 0, x1: W, y1: D },
  });
}

/** An empty scene: terrain and grid only. */
export function buildBlank(): Scene {
  const b = new SceneBuilder();
  b.box(
    opts({ id: "TOPO-01", name: "Site Terrain", category: "Topography", layer: "topography", level: "site", system: "Site", color: "topography", material: "Existing grade", phase: "site", terrain: true }),
    -30, -30, 60, 60, -4, GRADE,
  );
  return b.finish({
    kind: "blank",
    grade: GRADE,
    sectionY: 15,
    levelZ: { site: -4, foundation: -2.5, level1: 0, level2: 10, roof: 20 },
    footprint: { x0: 0, y0: 0, x1: 30, y1: 30 },
  });
}
