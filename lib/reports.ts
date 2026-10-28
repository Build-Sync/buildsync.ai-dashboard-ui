/**
 * lib/reports.ts
 *
 * WHAT   Site and model checks computed from the model itself (no canned text):
 *        - gradingReport: earthwork: the building pad (footprint + 5 ft), the existing ground under it (an imported
 *          survey or the contours), cut and fill to the finished grade, excavation for the footings, the septic tank
 *          and the drain field, base gravel under the slab, and whether the ground falls away from the foundation
 *          (6 in within the first 10 ft, FBC-R R401.3) on each side;
 *        - materialReport: the quantities of each material in the model (concrete, CMU, roofing, glazing, timber,
 *          steel) and what the site's climate and soil ask of them (coast, hurricanes, termites, the soil report,
 *          or the ground type's presumptive bearing and septic suitability when there is none: lib/ground.ts);
 *        - constructabilityReport: footprint, storeys and height, concrete by pour, block and truss counts, the
 *          reach a pump or crane needs from the driveway, staging room on the lot, and the order of the schedule;
 *        - detectClashes: MEP runs crossing structure (hard) or passing within 2 in of it (soft), with a fix each.
 * FOR    The GRADING, MATCHECK and CONSTRUCT commands (Analyze tab) and Clash Detect's Run Detection. Results are
 *        advisory, from the model as drawn; they are not a substitute for a survey, a geotechnical report or a PE.
 * DEBUG  - Cut and fill are zero: the ground at the building is already at the finished grade (the samples' ground
 *          is), or no survey was imported.
 *        - A clash looks wrong: runs are treated as tubes with a radius from their drawn width; elements as boxes.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { signedArea } from "./scene/builder";
import { materialUsage } from "./scene";
import type { Prism, Scene, SceneElement, V2, V3 } from "./scene/types";
import type { Clash, Project } from "./types";
import { groundNotes, groundOf } from "./ground";

const CY = 27;
const fmt1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");
const fmt0 = (n: number) => Math.round(n).toLocaleString("en-US");

/** Volume of a prism in cubic feet. */
const volume = (p: Prism) => Math.abs(signedArea(p.poly)) * (p.a1 - p.a0);

/** The ground height at a plan point: from an imported survey grid, else from the innermost contour around it. */
export function groundAt(scene: Scene, p: V2): number {
  const g = scene.terrainGrid;
  if (g) {
    const i = Math.max(0, Math.min(g.nx - 1, Math.round((p[0] - g.x0) / g.step)));
    const j = Math.max(0, Math.min(g.ny - 1, Math.round((p[1] - g.y0) / g.step)));
    return g.z[j * g.nx + i];
  }
  // the samples' contours are closed rings falling away from the building: the smallest ring holding the point
  let best: { area: number; z: number } | null = null;
  for (const c of scene.contours) {
    if (c.open || !inside(p, c.pts)) continue;
    const a = Math.abs(signedArea(c.pts));
    const z = Number.parseFloat(c.label ?? "") || c.z;
    if (!best || a < best.area) best = { area: a, z };
  }
  if (best) return best.z;
  // outside every ring: the lowest contour
  const all = scene.contours.map((c) => Number.parseFloat(c.label ?? "") || c.z);
  return all.length ? Math.min(...all) : scene.grade;
}

function inside(p: V2, poly: V2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Earthwork and drainage around the building. */
export function gradingReport(scene: Scene): string[] {
  const f = scene.footprint;
  const pad = { x0: f.x0 - 5, y0: f.y0 - 5, x1: f.x1 + 5, y1: f.y1 + 5 };
  const padArea = (pad.x1 - pad.x0) * (pad.y1 - pad.y0);
  // sample the existing ground on a 2 ft grid over the pad
  let cut = 0;
  let fill = 0;
  let lo = Infinity;
  let hi = -Infinity;
  const step = 2;
  for (let x = pad.x0 + 1; x < pad.x1; x += step)
    for (let y = pad.y0 + 1; y < pad.y1; y += step) {
      const g = groundAt(scene, [x, y]);
      lo = Math.min(lo, g);
      hi = Math.max(hi, g);
      const d = g - scene.grade;
      if (d > 0) cut += d * step * step;
      else fill -= d * step * step;
    }
  const buried = scene.prisms.filter((p) => p.underground && p.axis === "z");
  const footings = buried.filter((p) => p.category === "Footing" || p.category === "Foundation").reduce((a, p) => a + volume(p), 0);
  const septic = buried.filter((p) => p.category === "Septic").reduce((a, p) => a + volume(p), 0);
  const slabs = scene.prisms.filter((p) => p.category === "Slab" && p.layer === "foundation" && p.axis === "z" && p.a1 <= 0.01);
  const gravel = slabs.reduce((a, p) => a + Math.abs(signedArea(p.poly)) * (4 / 12), 0);
  const out = [
    `Building pad ${fmt0(pad.x1 - pad.x0)} × ${fmt0(pad.y1 - pad.y0)} ft (${fmt0(padArea)} sf, the footprint plus 5 ft), finished grade ${fmt1(scene.grade)} ft`,
    `Existing ground under the pad ${fmt1(lo)} to ${fmt1(hi)} ft (${scene.terrainGrid ? "imported survey" : "contours"})`,
    `Cut ${fmt0(cut / CY)} cy · fill ${fmt0(fill / CY)} cy · net ${cut >= fill ? "export" : "import"} ${fmt0(Math.abs(cut - fill) / CY)} cy`,
    `Excavation: footings and stem walls ${fmt1(footings / CY)} cy${septic ? ` · septic tank and drain field ${fmt1(septic / CY)} cy` : ""} · gravel under the slab (4") ${fmt1(gravel / CY)} cy`,
  ];
  // drainage: the ground 10 ft out from each side should be at least 6 in lower (5 %)
  const mid: Record<string, [V2, V2]> = {
    South: [[(f.x0 + f.x1) / 2, f.y0], [(f.x0 + f.x1) / 2, f.y0 - 10]],
    North: [[(f.x0 + f.x1) / 2, f.y1], [(f.x0 + f.x1) / 2, f.y1 + 10]],
    West: [[f.x0, (f.y0 + f.y1) / 2], [f.x0 - 10, (f.y0 + f.y1) / 2]],
    East: [[f.x1, (f.y0 + f.y1) / 2], [f.x1 + 10, (f.y0 + f.y1) / 2]],
  };
  const sides = Object.entries(mid).map(([side, [a, b]]) => {
    const fall = Math.max(scene.grade, groundAt(scene, a)) - groundAt(scene, b);
    return { side, fall, ok: fall >= 0.5 };
  });
  const bad = sides.filter((s) => !s.ok);
  out.push(
    bad.length
      ? `Drainage: the ground must fall 6" in the first 10 ft (FBC-R R401.3). It falls only ${bad.map((s) => `${fmt1(s.fall * 12)}" on the ${s.side.toLowerCase()}`).join(", ")}: add a swale or regrade there.`
      : `Drainage: the ground falls at least 6" in the first 10 ft on every side (${sides.map((s) => `${s.side[0]} ${fmt1(s.fall * 12)}"`).join(", ")}): pass`,
  );
  return out;
}

/** Quantities of each material and what the site asks of them. */
export function materialReport(scene: Scene, project: Project): string[] {
  const z = scene.prisms.filter((p) => p.axis === "z" && !p.terrain);
  const sum = (pick: (p: Prism) => boolean) => z.filter(pick).reduce((a, p) => a + volume(p), 0);
  const concrete = sum((p) => /concrete|slab|footing|stem/i.test(p.material) && !/cmu/i.test(p.material));
  const cmuWall = z.filter((p) => /cmu/i.test(p.material)).reduce((a, p) => {
    const xs = p.poly.map((q) => q[0]);
    const ys = p.poly.map((q) => q[1]);
    return a + Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * (p.a1 - p.a0);
  }, 0);
  const roofs = scene.elements.filter((e) => e.category === "Roof");
  const roofArea = roofs.reduce((a, e) => a + (e.max[0] - e.min[0]) * (e.max[1] - e.min[1]), 0);
  const glazing = scene.elements.filter((e) => e.category === "Window").length;
  const usage = materialUsage(scene);
  const groups = Object.entries(usage)
    .filter(([, ids]) => ids.length)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([k, ids]) => `${k} ${ids.length}`)
    .join(" · ");
  const where = `${project.jurisdiction.name} ${project.address}`;
  const coastal = /FL|Florida|Antigua|Bahamas|Nassau|Jamaica|Kingston|San Juan|PR\b|Miami/i.test(where);
  const hvhz = /HVHZ|Miami-Dade|Broward/i.test(`${project.jurisdiction.codeSet} ${project.jurisdiction.name}`);
  const out = [
    `Elements by material: ${groups}`,
    `Concrete ${fmt1(concrete / CY)} cy · CMU walls ${fmt0(cmuWall)} sf (about ${fmt0(cmuWall / 0.889)} blocks) · roof ${fmt0(roofArea)} sf · ${glazing} windows`,
  ];
  if (coastal) out.push("Coastal, salt air: epoxy-coated or galvanized rebar with 2\" cover at stem walls and footings; stainless or hot-dip galvanized fasteners and hurricane connectors");
  if (hvhz) out.push("High-velocity hurricane zone: every window and door needs an impact rating with a Miami-Dade NOA; roof covering to TAS 100");
  if (/FL|Florida|Antigua|Bahamas|Jamaica/i.test(where)) out.push("Termites: pressure-treated (borate) lumber at sill plates, a soil treatment under the slab");
  if (project.soil) {
    const s = project.soil;
    out.push(`Soil report ${s.file}: ${s.bearing.toLocaleString("en-US")} psf allowable bearing (${s.bearing >= 2000 ? "enough for 24\" continuous footings" : "below 2,000 psf: widen the footings or improve the soil"}), Site Class ${s.siteClass}, groundwater at ${s.waterTable} ft${s.waterTable < 3 ? " (high: use a vapour barrier and keep footings above it)" : ""}`);
  } else out.push(...groundNotes(groundOf(project)), "No soil report attached (Insert → Soil Data): the values above are presumptive");
  return out;
}

/** What building it takes: sizes, pours, counts, reach and staging. */
export function constructabilityReport(scene: Scene, project: Project): string[] {
  const f = scene.footprint;
  const w = f.x1 - f.x0;
  const d = f.y1 - f.y0;
  const storeys = project.levels.filter((l) => l.id === "level1" || l.id === "level2").length;
  const top = scene.elements.filter((e) => e.layer !== "topography" && e.system !== "Drafting").reduce((m, e) => Math.max(m, e.max[2]), 0);
  const z = scene.prisms.filter((p) => p.axis === "z" && !p.terrain);
  const pour = (cats: string[]) => z.filter((p) => cats.includes(p.category)).reduce((a, p) => a + volume(p), 0) / CY;
  const trusses = new Set(scene.prisms.filter((p) => p.category === "Truss").map((p) => p.id)).size;
  const paving = scene.elements.filter((e) => e.category === "Paving");
  // reach from the nearest paved edge to the farthest corner of the building
  const corners: V2[] = [[f.x0, f.y0], [f.x1, f.y0], [f.x1, f.y1], [f.x0, f.y1]];
  let reach = 0;
  let from = "the street";
  if (paving.length) {
    const drive = paving.reduce((best, e) => ((e.max[0] - e.min[0]) * (e.max[1] - e.min[1]) > (best.max[0] - best.min[0]) * (best.max[1] - best.min[1]) ? e : best));
    from = drive.name.toLowerCase();
    const near: V2 = [Math.max(drive.min[0], Math.min(drive.max[0], (f.x0 + f.x1) / 2)), Math.max(drive.min[1], Math.min(drive.max[1], (f.y0 + f.y1) / 2))];
    reach = Math.max(...corners.map((c) => Math.hypot(c[0] - near[0], c[1] - near[1])));
  }
  const lot = project.site?.boundary;
  const lotArea = lot && lot.length > 2 ? Math.abs(signedArea(lot)) : 0;
  const phases = [...project.schedule].sort((a, b) => a.start.localeCompare(b.start));
  const out = [
    `Footprint ${fmt1(w)} × ${fmt1(d)} ft · ${storeys} storey${storeys === 1 ? "" : "s"} · highest point ${fmt1(top)} ft above the floor`,
    `Concrete pours: footings and stems ${fmt1(pour(["Foundation", "Footing"]))} cy · slab on grade ${fmt1(pour(["Slab"]))} cy · columns and beams ${fmt1(pour(["Column", "Beam"]))} cy`,
    reach ? `A pump or crane at the ${from} needs ${fmt0(reach + 10)} ft of reach to the far corner (a 32 m / 105 ft boom pump covers it${reach + 10 > 100 ? " only from a second set-up" : ""})` : "No driveway is drawn: plan the truck access before the foundation pour",
    trusses ? `${trusses} roof trusses: one delivery; set them with a ${top > 22 ? "crane" : "telehandler"}` : "No trusses in the model",
    lotArea ? `Staging: ${fmt0(lotArea - w * d)} sf of the lot is free around the building (${fmt0(((lotArea - w * d) / lotArea) * 100)} %)` : "No property line: staging room unknown",
  ];
  if (phases.length > 1) out.push(`Sequence: ${phases.map((p) => p.name).join(" → ")}`);
  const sep = phases.find((p) => /septic/i.test(p.name) || p.tasks.some((t) => /septic/i.test(t.name)));
  const fnd = phases.find((p) => /foundation/i.test(p.name));
  if (sep && fnd) out.push(sep.start <= fnd.start ? "The septic system goes in before the foundation, while the yard is open: good" : "The septic system is scheduled after the foundation: dig it before the yard is closed in");
  return out;
}

/* ── clash detection ──────────────────────────────────────────────────── */

const STRUCTURE = new Set(["Beam", "Column", "Slab", "Wall", "Foundation", "Footing"]);

/** Distance between a segment and a box (0 when they touch or cross). */
function segBoxDist(a: V3, b: V3, min: V3, max: V3): number {
  let best = Infinity;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const p: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const dx = Math.max(min[0] - p[0], 0, p[0] - max[0]);
    const dy = Math.max(min[1] - p[1], 0, p[1] - max[1]);
    const dz = Math.max(min[2] - p[2], 0, p[2] - max[2]);
    best = Math.min(best, Math.hypot(dx, dy, dz));
  }
  return best;
}

/** MEP runs crossing structure (hard) or within 2 in of it (soft), each with a recommended fix. */
export function detectClashes(scene: Scene): Clash[] {
  const out: Clash[] = [];
  const els = scene.elements.filter((e) => STRUCTURE.has(e.category) && e.layer !== "topography");
  const seen = new Set<string>();
  for (const r of scene.runs) {
    // a run's radius from its drawn width (a 12" duct is about 3 units wide)
    const rad = Math.max(0.08, ((r.width ?? 1.6) / 3) * 0.5);
    for (let i = 0; i + 1 < r.pts.length; i++) {
      for (const e of els) {
        const key = `${r.id}|${e.id}`;
        if (seen.has(key)) continue;
        const dd = segBoxDist(r.pts[i], r.pts[i + 1], e.min, e.max) - rad;
        if (dd > 2 / 12) continue;
        // a run that enters a slab or wall straight through is a penetration: it needs a sleeve, not a re-route
        const vertical = Math.abs(r.pts[i + 1][2] - r.pts[i][2]) > Math.hypot(r.pts[i + 1][0] - r.pts[i][0], r.pts[i + 1][1] - r.pts[i][1]);
        const hard = dd <= 0;
        seen.add(key);
        out.push({
          id: `CL-${String(out.length + 1).padStart(2, "0")}`,
          kind: hard ? "HARD" : "SOFT",
          a: `${r.label ?? r.id} (${r.kind})`,
          b: e.name,
          level: e.level,
          fix: fix(r.kind, e, hard, vertical),
          elementIds: [e.id],
        });
      }
    }
  }
  return out;
}

function fix(kind: string, e: SceneElement, hard: boolean, vertical: boolean): string {
  if (vertical && (e.category === "Slab" || e.category === "Foundation" || e.category === "Footing")) return `Sleeve the penetration through ${e.name} (one size up, fire-stopped)`;
  if (e.category === "Beam") return hard ? `Drop the ${kind} below the beam soffit, or re-route around ${e.name}` : `Keep 2" clear of ${e.name}: lower the ${kind} 2"`;
  if (e.category === "Column") return `Offset the ${kind} 6" from the column face`;
  if (e.category === "Wall") return hard ? `Sleeve the ${kind} through ${e.name}, or route it in a chase` : `Clip the ${kind} to the wall with 2" clearance`;
  return hard ? `Re-route the ${kind} clear of ${e.name}` : `Keep 2" clear of ${e.name}`;
}
