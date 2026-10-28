/**
 * lib/exporters.ts
 *
 * WHAT   Real file writers for Export (the app menu):
 *        - writeDxf: the plan of a level as an AutoCAD DXF (R12 ASCII, feet): every element cut by the plan as closed
 *          polylines on a layer per model layer, and the drafting the user drew (lines, polylines, circles, arcs,
 *          text). AutoCAD, BricsCAD, LibreCAD and QGIS open it; it is the open twin of a DWG.
 *        - writeIfc: the model as IFC4 (STEP): project, site, building and one storey per level, each element as
 *          the matching IFC class (wall, slab, roof, column, beam, door, window, stair, footing … or a proxy) with
 *          its extruded solids, in metres, so Revit, ArchiCAD and BIM viewers open it.
 *        - reportHtml: a printable report: project information, plan health, code checks, issues, clashes, cost,
 *          schedule, site and soil, marked AI-generated and unstamped.
 * FOR    components/workspace/Modals/ExportModal.tsx (with the PNG render and the PDF print it makes itself).
 * DEBUG  - A DXF opens empty: the level shows nothing (try Level 1), or the layers are off in the CAD program.
 *        - An IFC element is missing: only prisms become solids; runs and devices (MEP lines) are left out.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { DrawnItem } from "./draw/types";
import { arcFrom3, arcPts, dist2 } from "./draw/geom";
import type { Category, LevelKey, Prism, Scene, V2 } from "./scene/types";
import type { Project } from "./types";

/* ══ DXF ══════════════════════════════════════════════════════════════════ */

/** The plan of `levels` as a DXF (R12 ASCII, units feet). */
export function writeDxf(scene: Scene, levels: LevelKey[], drafts: DrawnItem[]): string {
  const out: string[] = [];
  const g = (code: number, v: string | number) => out.push(String(code), typeof v === "number" ? fmtNum(v) : v);
  const layerName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9_-]/g, "_");
  const used = new Set<string>();
  const ents: (() => void)[] = [];
  const poly = (layer: string, pts: V2[], closed: boolean) => {
    used.add(layer);
    ents.push(() => {
      g(0, "POLYLINE");
      g(8, layer);
      g(66, 1);
      g(70, closed ? 1 : 0);
      for (const [x, y] of pts) {
        g(0, "VERTEX");
        g(8, layer);
        g(10, x);
        g(20, y);
        g(30, 0);
      }
      g(0, "SEQEND");
      g(8, layer);
    });
  };
  const levelSet = new Set(levels);
  for (const p of scene.prisms) {
    if (p.axis !== "z" || p.terrain || p.sectionOnly || !levelSet.has(p.level)) continue;
    poly(layerName(p.layer), p.poly, true);
  }
  for (const it of drafts) {
    const layer = layerName(it.kind === "text" || it.kind === "note" || it.kind === "label" || it.kind === "dim" ? "annotation" : "drafting");
    if ((it.kind === "line" || it.kind === "polyline" || it.kind === "rect" || it.kind === "room" || it.kind === "markup") && it.pts.length >= 2) poly(layer, it.pts, !!it.closed || it.kind === "rect" || it.kind === "room");
    else if (it.kind === "circle" && it.pts.length >= 2) {
      used.add(layer);
      const [c, r] = [it.pts[0], dist2(it.pts[0], it.pts[1])];
      ents.push(() => {
        g(0, "CIRCLE");
        g(8, layer);
        g(10, c[0]);
        g(20, c[1]);
        g(30, 0);
        g(40, r);
      });
    } else if (it.kind === "arc" && it.pts.length === 3) {
      const a = arcFrom3(it.pts[0], it.pts[1], it.pts[2]);
      if (a) poly(layer, arcPts(a, 24), false);
    } else if ((it.kind === "text" || it.kind === "note" || it.kind === "label") && it.pts.length) {
      used.add(layer);
      const t = String(it.p.text ?? it.name).replace(/[\r\n]+/g, " ");
      ents.push(() => {
        g(0, "TEXT");
        g(8, layer);
        g(10, it.pts[0][0]);
        g(20, it.pts[0][1]);
        g(30, 0);
        g(40, 1);
        g(1, t);
      });
    }
  }
  g(0, "SECTION");
  g(2, "HEADER");
  g(9, "$ACADVER");
  g(1, "AC1009");
  g(9, "$INSUNITS");
  g(70, 2);
  g(0, "ENDSEC");
  g(0, "SECTION");
  g(2, "TABLES");
  g(0, "TABLE");
  g(2, "LAYER");
  g(70, used.size);
  [...used].forEach((name, i) => {
    g(0, "LAYER");
    g(2, name);
    g(70, 0);
    g(62, (i % 6) + 1);
    g(6, "CONTINUOUS");
  });
  g(0, "ENDTAB");
  g(0, "ENDSEC");
  g(0, "SECTION");
  g(2, "ENTITIES");
  ents.forEach((e) => e());
  g(0, "ENDSEC");
  g(0, "EOF");
  return out.join("\n") + "\n";
}

const fmtNum = (v: number) => (Math.round(v * 1e6) / 1e6).toString();

/* ══ IFC ══════════════════════════════════════════════════════════════════ */

const IFC_CLASS: Partial<Record<Category, string>> = {
  Wall: "IFCWALL", Partition: "IFCWALL", Slab: "IFCSLAB", Roof: "IFCROOF", Column: "IFCCOLUMN", Beam: "IFCBEAM", Door: "IFCDOOR",
  Window: "IFCWINDOW", Stair: "IFCSTAIR", Foundation: "IFCFOOTING", Footing: "IFCFOOTING", Ramp: "IFCRAMP", Truss: "IFCMEMBER",
  Framing: "IFCMEMBER", Brace: "IFCMEMBER", Furniture: "IFCFURNITURE", Paving: "IFCSLAB",
};

const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
/** A random 22-character IFC GlobalId. */
const guid = () => Array.from({ length: 22 }, (_, i) => B64[Math.floor(Math.random() * (i === 0 ? 4 : 64))]).join("");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/[^\x20-\x7e]/g, "?");

/** The model as an IFC4 file (metres). */
export function writeIfc(scene: Scene, project: Project): string {
  const M = 0.3048;
  const lines: string[] = [];
  let n = 0;
  const e = (s: string) => {
    n++;
    lines.push(`#${n}=${s};`);
    return `#${n}`;
  };
  const pt3 = (x: number, y: number, z: number) => e(`IFCCARTESIANPOINT((${f(x)},${f(y)},${f(z)}))`);
  const pt2 = (x: number, y: number) => e(`IFCCARTESIANPOINT((${f(x)},${f(y)}))`);
  const dir = (x: number, y: number, z: number) => e(`IFCDIRECTION((${f(x)},${f(y)},${f(z)}))`);
  const origin = pt3(0, 0, 0);
  const zAxis = dir(0, 0, 1);
  const xAxis = dir(1, 0, 0);
  const world = e(`IFCAXIS2PLACEMENT3D(${origin},${zAxis},${xAxis})`);
  const ctx = e(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${world},$)`);
  const body = e(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
  const unitLen = e(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`);
  const unitArea = e(`IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`);
  const unitVol = e(`IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)`);
  const unitAng = e(`IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)`);
  const units = e(`IFCUNITASSIGNMENT((${unitLen},${unitArea},${unitVol},${unitAng}))`);
  const proj = e(`IFCPROJECT('${guid()}',$,'${esc(project.name)}','${esc(project.address || "")}',$,$,$,(${ctx}),${units})`);
  const place = (rel: string | null, x = 0, y = 0, z = 0) => e(`IFCLOCALPLACEMENT(${rel ?? "$"},${e(`IFCAXIS2PLACEMENT3D(${pt3(x, y, z)},$,$)`)})`);
  const sitePl = place(null);
  const site = e(`IFCSITE('${guid()}',$,'Site',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bldPl = place(sitePl);
  const building = e(`IFCBUILDING('${guid()}',$,'${esc(project.name)}',$,$,${bldPl},$,$,.ELEMENT.,$,$,$)`);
  e(`IFCRELAGGREGATES('${guid()}',$,$,$,${proj},(${site}))`);
  e(`IFCRELAGGREGATES('${guid()}',$,$,$,${site},(${building}))`);
  const order: LevelKey[] = ["site", "foundation", "level1", "level2", "roof"];
  const storeys = new Map<LevelKey, { id: string; pl: string; members: string[] }>();
  for (const lv of order) {
    if (!scene.prisms.some((p) => p.level === lv && !p.terrain)) continue;
    const pl = place(bldPl, 0, 0, scene.levelZ[lv] * M);
    const name = project.levels.find((l) => l.id === lv)?.name ?? lv;
    const id = e(`IFCBUILDINGSTOREY('${guid()}',$,'${esc(name)}',$,$,${pl},$,$,.ELEMENT.,${f(scene.levelZ[lv] * M)})`);
    storeys.set(lv, { id, pl, members: [] });
  }
  e(`IFCRELAGGREGATES('${guid()}',$,$,$,${building},(${[...storeys.values()].map((s) => s.id).join(",")}))`);
  const byId = new Map<string, Prism[]>();
  for (const p of scene.prisms) {
    if (p.terrain || p.sectionOnly || !storeys.has(p.level)) continue;
    byId.set(p.id, [...(byId.get(p.id) ?? []), p]);
  }
  for (const [id, ps] of byId) {
    const el = scene.elementById[id];
    const st = storeys.get(ps[0].level)!;
    const zBase = scene.levelZ[ps[0].level];
    const solids: string[] = [];
    for (const p of ps) {
      if (p.poly.length < 3) continue;
      if (p.axis === "z") {
        const prof = e(`IFCPOLYLINE((${[...p.poly, p.poly[0]].map(([x, y]) => pt2(x * M, y * M)).join(",")}))`);
        const area = e(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${prof})`);
        const pos = e(`IFCAXIS2PLACEMENT3D(${pt3(0, 0, (p.a0 - zBase) * M)},$,$)`);
        solids.push(e(`IFCEXTRUDEDAREASOLID(${area},${pos},${zAxis},${f((p.a1 - p.a0) * M)})`));
      } else {
        // an XZ outline extruded along Y: local x = world x, local z (the extrusion) = world y, local y = world −z
        const prof = e(`IFCPOLYLINE((${[...p.poly, p.poly[0]].map(([x, z]) => pt2(x * M, -(z - zBase) * M)).join(",")}))`);
        const area = e(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${prof})`);
        const pos = e(`IFCAXIS2PLACEMENT3D(${pt3(0, p.a0 * M, 0)},${dir(0, 1, 0)},${xAxis})`);
        solids.push(e(`IFCEXTRUDEDAREASOLID(${area},${pos},${zAxis},${f((p.a1 - p.a0) * M)})`));
      }
    }
    if (!solids.length) continue;
    const rep = e(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${solids.join(",")}))`);
    const shape = e(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`);
    const pl = place(st.pl);
    const cls = (el && IFC_CLASS[el.category]) ?? "IFCBUILDINGELEMENTPROXY";
    const name = esc(el?.name ?? id);
    const desc = esc(el?.material ?? "");
    // IFC4 element signatures: GlobalId, OwnerHistory, Name, Description, ObjectType, ObjectPlacement, Representation, Tag, then class-specific
    const tail = cls === "IFCDOOR" || cls === "IFCWINDOW" ? ",$,$,$,$,$" : ",$";
    st.members.push(e(`${cls}('${guid()}',$,'${name}','${desc}',$,${pl},${shape},'${esc(id)}'${tail})`));
  }
  for (const st of storeys.values()) if (st.members.length) e(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid()}',$,$,$,(${st.members.join(",")}),${st.id})`);
  const now = new Date().toISOString().slice(0, 19);
  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');",
    `FILE_NAME('${esc(project.fileName.replace(/\.bsd$/, ".ifc"))}','${now}',('BuildSync AI'),('AI-generated, unstamped'),'BuildSync AI','BuildSync AI','');`,
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
    ...lines,
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  ].join("\n");
}

const f = (v: number) => {
  const r = Math.round(v * 1e6) / 1e6;
  return Number.isInteger(r) ? `${r}.` : String(r);
};

/* ══ report ═══════════════════════════════════════════════════════════════ */

const h = (s: string | number) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A printable HTML report of the project. */
export function reportHtml(project: Project, scene: Scene, money: (n: number) => string, when: string): string {
  const p = project;
  const rows = (cells: (string | number)[][]) => cells.map((r) => `<tr>${r.map((c) => `<td>${h(c)}</td>`).join("")}</tr>`).join("");
  const count = (cat: string) => scene.elements.filter((e) => e.category === cat).length;
  const failed = p.checks.filter((c) => c.status !== "pass");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${h(p.name)} · Project Report</title>
<style>
body{font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1b2330;max-width:58rem;margin:2rem auto;padding:0 1.25rem}
h1{font-size:1.6rem;margin:0}h2{font-size:1.1rem;margin:1.6rem 0 .4rem;border-bottom:1px solid #d7dbe2;padding-bottom:.2rem}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #e6e8ec;padding:.3rem .4rem;text-align:left;vertical-align:top}
th{background:#f3f5f8}.note{background:#fff7e6;border:1px solid #f0c06a;border-radius:6px;padding:.5rem .7rem;font-size:12.5px}
.k{color:#5a6578}.score{font-size:2rem;font-weight:700}
@media print{body{margin:0}}
</style></head><body>
<p class="note"><b>AI-generated, unstamped.</b> Advisory only: life-safety and load-bearing items need review and a seal by a licensed PE.</p>
<h1>${h(p.name)}</h1>
<p class="k">${h(p.address || "No address")} · ${h(p.jurisdiction.name)} · ${h(p.jurisdiction.codeSet)} · Report made ${h(when)}</p>
<h2>Project</h2>
<table>${rows([["Client", p.client || "—"], ["Architect", p.architect || "—"], ["Engineer", p.engineer || "—"], ["Construction starts", p.startDate], ["Levels", p.levels.map((l) => `${l.name} (${l.label})`).join(", ")]])}</table>
<h2>Plan health</h2>
<p><span class="score">${p.health.score}</span> / 100 · compliance ${p.health.compliance} · structural ${p.health.structural} · cost ${p.health.cost} · schedule ${p.health.schedule}</p>
<p>${h(p.health.summary)}</p>
<h2>Model</h2>
<table>${rows([["Walls", count("Wall") + count("Partition")], ["Doors", count("Door")], ["Windows", count("Window")], ["Slabs", count("Slab")], ["Columns and beams", count("Column") + count("Beam")], ["Foundations and footings", count("Foundation") + count("Footing")], ["Site objects (sheds, trees, plantings, septic)", count("Outbuilding") + count("Tree") + count("Planting") + count("Septic")], ["Footprint", `${(scene.footprint.x1 - scene.footprint.x0).toFixed(1)} × ${(scene.footprint.y1 - scene.footprint.y0).toFixed(1)} ft`]])}</table>
<h2>Code checks (${p.checks.length}, ${failed.length} need attention)</h2>
<table><tr><th>Status</th><th>Rule</th><th>Section</th><th>Fix</th></tr>${rows(p.checks.map((c) => [c.status.toUpperCase(), c.rule, c.section, c.fix ?? ""]))}</table>
<h2>Issues</h2>
<table><tr><th>Severity</th><th>Issue</th><th>Location</th><th>Assignee</th><th>Status</th></tr>${rows(p.issues.map((i) => [i.severity, i.title, i.location, i.assignee, i.status]))}</table>
<h2>Clashes</h2>
${p.clashes.length ? `<table><tr><th>Kind</th><th>Between</th><th>Fix</th></tr>${rows(p.clashes.map((c) => [c.kind, `${c.a} ↔ ${c.b}`, c.fix]))}</table>` : "<p>None recorded.</p>"}
<h2>Cost</h2>
<p>Total ${h(money(p.cost.total))} ± ${h(money(p.cost.range))} · hard ${h(money(p.cost.hard))} · soft ${h(money(p.cost.soft))} · land ${h(money(p.cost.land))}. ${h(p.cost.basis)}</p>
<table><tr><th>Material</th><th>Cost</th></tr>${rows(p.cost.materials.map((m) => [m.name, money(m.cost)]))}</table>
<h2>Schedule</h2>
<table><tr><th>Phase</th><th>Start</th><th>End</th></tr>${rows(p.schedule.map((s) => [s.name, s.start, s.end]))}</table>
<h2>Site</h2>
<table>${rows([
    ["Location", p.site?.source ? `${p.site.lat.toFixed(6)}, ${p.site.lon.toFixed(6)}` : "Not placed on the map"],
    ["Property line", p.site?.boundary ? `${p.site.boundary.length} corners` : "Not drawn"],
    ["Ground survey", p.terrain ? `${p.terrain.source}: ${p.terrain.points} points, contours every ${p.terrain.interval} ft` : "Sample topography"],
    ["Soil", p.soil ? `${p.soil.file}: ${p.soil.bearing} psf, Site Class ${p.soil.siteClass}, groundwater ${p.soil.waterTable} ft, percolation ${p.soil.perc} min/in` : "No soil report attached"],
    ["Linked projects", p.links?.length ? p.links.map((l) => l.name).join(", ") : "None"],
  ])}</table>
</body></html>
`;
}
