/**
 * lib/scene/site.ts
 *
 * WHAT   Site pieces shared by the sample buildings: addSeptic builds a septic system (a buried two-compartment
 *        tank with two access lids at grade, the building sewer from the house to the tank, a distribution box,
 *        and a drain field of gravel trenches with perforated pipe) on the Site Utilities layer.
 * FOR    lib/scene/residence.ts and cottage.ts. The tank and the trenches are below grade: they show dashed on the
 *        floor plans and the site plan, in X-ray, a section, and the Below Grade view; the lids show at grade.
 * DEBUG  - The septic system is invisible: the Site Utilities layer is off, or the view is a normal 3D view (only
 *          the lids are above ground; View → Below Grade shows the rest).
 *        - Sizes are typical placeholders (1,000 gal tank for 2 bedrooms), not a design: a licensed designer
 *          sizes the system from the percolation test and local code.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { BaseOpts, SceneBuilder } from "./builder";
import type { V2, V3 } from "./types";

/** Where and how big a septic system is. */
export interface SepticSpec {
  /** id prefix, e.g. "SEP" */
  id: string;
  grade: number;
  /** tank centre and size (length along X, width along Y), feet */
  tank: { at: V2; len: number; wid: number; depth: number; gallons: number };
  /** where the building sewer leaves the house (plan point on the outside wall) */
  outlet: V2;
  /** drain field: trenches along X starting at x0, one every `spacing` feet north (+Y) from y0 */
  field: { x0: number; y0: number; rows: number; len: number; spacing: number };
}

/** Add a septic tank, its lids, the sewer, a distribution box and the drain field. */
export function addSeptic(b: SceneBuilder, s: SepticSpec): void {
  const g = s.grade;
  const base = (id: string, name: string, material: string, extra: Partial<BaseOpts> = {}): BaseOpts => ({
    id,
    name,
    category: "Septic",
    layer: "utilities",
    level: "site",
    system: "Site",
    color: "septic",
    material,
    phase: "mep",
    ...extra,
  });
  const { at, len, wid, depth, gallons } = s.tank;
  const x0 = at[0] - len / 2;
  const y0 = at[1] - wid / 2;
  const tankTop = g - 1.2; // about 14" of cover
  const tank = base(`${s.id}-TANK`, `Septic Tank ${gallons.toLocaleString("en-US")} gal`, `Precast concrete septic tank, ${gallons.toLocaleString("en-US")} gal, two compartments`);
  b.box({ ...tank, underground: true }, x0, y0, x0 + len, y0 + wid, tankTop - depth, tankTop);
  // the two access risers with green lids, flush with the lawn: the only part seen above ground
  for (const fx of [0.22, 0.78]) {
    const cx = x0 + len * fx;
    b.box(tank, cx - 0.85, at[1] - 0.85, cx + 0.85, at[1] + 0.85, g - 0.05, g + 0.22);
  }
  // building sewer: from the house to the tank inlet, falling 1/4" per foot
  const inlet: V2 = [x0, at[1]];
  const run = Math.hypot(inlet[0] - s.outlet[0], inlet[1] - s.outlet[1]);
  const zOut = g - 1.5;
  const sewer: V3[] = [
    [s.outlet[0], s.outlet[1], zOut],
    [s.outlet[0], inlet[1], zOut - Math.abs(inlet[1] - s.outlet[1]) / 48],
    [inlet[0], inlet[1], zOut - run / 48],
  ];
  b.run({ id: `${s.id}-SEWER`, layer: "utilities", kind: "plumbing", pts: sewer, phase: "mep", level: "site", label: '4" PVC Building Sewer', underground: true });
  // tank outlet → distribution box → field
  const f = s.field;
  const dbox: V2 = [f.x0 - 3, f.y0 + ((f.rows - 1) * f.spacing) / 2];
  const zEff = tankTop - 0.6;
  b.run({ id: `${s.id}-EFFL`, layer: "utilities", kind: "plumbing", pts: [[x0 + len, at[1], zEff], [dbox[0], at[1], zEff - 0.1], [dbox[0], dbox[1], zEff - 0.2]], phase: "mep", level: "site", label: "Effluent Line", underground: true });
  b.box({ ...base(`${s.id}-DBOX`, "Distribution Box", "Precast concrete D-box, 4 outlets"), underground: true }, dbox[0] - 1, dbox[1] - 1, dbox[0] + 1, dbox[1] + 1, zEff - 1.6, zEff + 0.3);
  // drain field: gravel trenches 2' wide, 3' deep, with a perforated pipe along each
  const field = base(`${s.id}-FIELD`, `Drain Field (${f.rows} trenches × ${f.len}')`, "Washed gravel ¾\"–2½\" with 4\" perforated PVC, filter fabric", { color: "paving" });
  for (let i = 0; i < f.rows; i++) {
    const y = f.y0 + i * f.spacing;
    b.box({ ...field, underground: true }, f.x0, y - 1, f.x0 + f.len, y + 1, g - 3, g - 1);
    b.run({ id: `${s.id}-LAT-${i + 1}`, layer: "utilities", kind: "plumbing", pts: [[dbox[0], y, g - 1.6], [f.x0 + f.len, y, g - 1.7]], phase: "mep", level: "site", label: i === 0 ? '4" Perforated Laterals' : undefined, underground: true });
  }
  b.callouts.push(
    { id: `${s.id}-CO-T`, at: [at[0], at[1], g], dx: 70, dy: -46, text: `Septic Tank · ${gallons.toLocaleString("en-US")} gal`, sub: "2 compartments · lids at grade" },
    { id: `${s.id}-CO-F`, at: [f.x0 + f.len / 2, f.y0 + ((f.rows - 1) * f.spacing) / 2, g], dx: 80, dy: -30, text: `Drain Field · ${f.rows} × ${f.len}'`, sub: "gravel trenches, perforated pipe" },
  );
}
