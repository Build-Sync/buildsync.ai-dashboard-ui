/**
 * components/workspace/Modals/ImportModal.tsx
 *
 * WHAT   Insert → Import (DWG / DXF, Survey / LandXML, Terrain, Drone, PDF / Image, Soil Data; the app menu also has
 *        IFC): every file is read in the browser (lib/importers.ts) and the dialog shows what it really holds before
 *        anything is added:
 *        - DXF → lines, polylines, circles, arcs and text on the active plan, in the drawing's units (or the ones
 *          picked here), kept at their coordinates or centred on the building;
 *        - a survey (CSV / TXT points, LandXML) or a drone point cloud (LAS) → the ground surface and its contours at
 *          the chosen interval, centred on the building with the ground there at the finished grade; it replaces the
 *          sample topography and shows on the topography sheet;
 *        - IFC → its walls, slabs, roofs, columns, beams, doors, windows … as solids on their layers;
 *        - an image (a site plan, a drone orthomosaic) → an underlay placed with one click at its real width;
 *        - a soil report → its key numbers (bearing, site class, water table, percolation) kept with the project.
 *        Everything added is one undoable step. DWG (binary), LAZ (compressed), TIFF and PDF pages cannot be read in
 *        a browser: the dialog says which file to export instead.
 * FOR    Bringing real drawings, surveys and models into a project.
 * DEBUG  - "No entities": the DXF is binary, or only has blocks (INSERT) the reader does not explode.
 *        - The ground is flat: the points' elevations are all the same, or the units are wrong (try metres).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/controls";
import { applyChange } from "@/lib/draw/change";
import { loadImage, queueImage, type PickedImage } from "@/lib/draw/image";
import { sceneOf } from "@/lib/draw/scene-of";
import type { DrawnItem } from "@/lib/draw/types";
import { FEET_PER, dxfItems, ifcItems, parseDxf, parseIfc, parseLandXml, parseLas, parsePointsText, terrainFrom, type DxfDrawing, type IfcSolid, type ItemSpec, type LengthUnit } from "@/lib/importers";
import type { V2, V3 } from "@/lib/scene/types";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import { useWsApi } from "@/lib/store/workspace-provider";
import type { ProjectTerrain, SoilReport } from "@/lib/types";
import { cn, fmtLength, uid } from "@/lib/utils";
import { openView } from "@/lib/views";
import { useRunner } from "../hooks";

const META: Record<string, { title: string; accept: string; hint: string }> = {
  dwg: { title: "Attach DWG / DXF", accept: ".dxf,.dwg", hint: "An AutoCAD or Civil 3D plan or survey drawing" },
  dxf: { title: "Attach DXF", accept: ".dxf", hint: "An AutoCAD or Civil 3D plan or survey drawing" },
  ifc: { title: "Import IFC", accept: ".ifc", hint: "A building model from another BIM tool (Revit, ArchiCAD …)" },
  pdf: { title: "Attach PDF / Image Underlay", accept: "image/*,.pdf", hint: "A site plan or survey image to trace" },
  image: { title: "Attach Image Underlay", accept: "image/*", hint: "A site plan or survey image to trace" },
  landxml: { title: "Import Survey / LandXML", accept: ".xml,.landxml,.csv,.txt", hint: "Survey points or a TIN surface from Civil 3D (LandXML), or a points file (CSV)" },
  terrain: { title: "Import Terrain / Topography", accept: ".csv,.txt,.xml,.landxml,.las", hint: "Ground points: CSV (x,y,z or PNEZD), LandXML, or a LAS point cloud" },
  drone: { title: "Import Drone Data", accept: "image/*,.las,.laz,.tif,.tiff", hint: "An orthomosaic image (JPG / PNG) or a point cloud (LAS)" },
  soil: { title: "Attach Soil Test Report", accept: ".pdf,.csv,.txt", hint: "A geotechnical report: its bearing, site class, water table and percolation rate" },
};

type Result =
  | { type: "image"; img: PickedImage }
  | { type: "dxf"; drawing: DxfDrawing }
  | { type: "points"; points: V3[]; units: LengthUnit | null }
  | { type: "ifc"; solids: IfcSolid[]; units: LengthUnit; skipped: number }
  | { type: "soil" };

const UNIT_LABEL: Record<LengthUnit, string> = { ft: "feet", usft: "US survey feet", in: "inches", m: "metres", cm: "centimetres", mm: "millimetres" };

/** Why a file cannot be read in the browser, and what to export instead; null when it can. */
function unreadable(name: string): string | null {
  const n = name.toLowerCase();
  if (n.endsWith(".dwg")) return "DWG is AutoCAD's own binary format, which a browser can't read. In AutoCAD (or the free DWG TrueView) use Save As → DXF, then drop the DXF here.";
  if (n.endsWith(".laz")) return "LAZ is a compressed point cloud. Export it as LAS (uncompressed) from your drone software, then drop the LAS here.";
  if (n.endsWith(".tif") || n.endsWith(".tiff")) return "Browsers can't show TIFF images. Export the orthomosaic as JPG or PNG (or the surface as LAS / CSV points) and drop that here.";
  if (n.endsWith(".pdf")) return null;
  return null;
}

/** The Import dialog. */
export function ImportModal({ kind }: { kind?: string }) {
  const ws = useWsApi();
  const app = useAppApi();
  const units = useApp((s) => s.settings.units);
  const meta = META[kind ?? "dwg"] ?? META.dwg;
  const [file, setFile] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [width, setWidth] = useState(100);
  const [unit, setUnit] = useState<LengthUnit>("ft");
  const [centre, setCentre] = useState(true);
  const [contourStep, setContourStep] = useState(1);
  const [soil, setSoil] = useState<SoilReport>({ file: "", bearing: 2000, siteClass: "D", waterTable: 6, perc: 15, notes: "" });
  const input = useRef<HTMLInputElement>(null);
  const { run } = useRunner();
  const close = () => ws.getState().closeModal();
  const fmt = (ft: number) => fmtLength(ft, units.system, units.precision);

  const pick = async (f: File) => {
    setFile(f.name);
    setRes(null);
    setError(null);
    const why = unreadable(f.name);
    if (why) return setError(why);
    setBusy(true);
    try {
      const n = f.name.toLowerCase();
      if (kind === "soil") {
        const next = { ...soil, file: f.name };
        if (n.endsWith(".csv") || n.endsWith(".txt")) {
          // "bearing, 2500" style lines fill the form
          const text = await f.text();
          const val = (re: RegExp) => Number(new RegExp(`${re.source}[^0-9-]*(-?[0-9.]+)`, "i").exec(text)?.[1]);
          const b = val(/bearing/);
          const w = val(/water/);
          const p = val(/perc/);
          const sc = /site\s*class[^A-F]*([A-F])/i.exec(text)?.[1];
          if (Number.isFinite(b)) next.bearing = b;
          if (Number.isFinite(w)) next.waterTable = w;
          if (Number.isFinite(p)) next.perc = p;
          if (sc) next.siteClass = sc.toUpperCase();
        }
        setSoil(next);
        setRes({ type: "soil" });
      } else if (f.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/.test(n)) {
        const img = await loadImage(f, 1600);
        if (!img) return setError("That image could not be read.");
        setRes({ type: "image", img });
      } else if (n.endsWith(".pdf")) {
        setError("A PDF page can't be traced directly here. Export the page as PNG or JPG (any PDF viewer can), then drop the image here.");
      } else if (n.endsWith(".dxf")) {
        const d = parseDxf(await f.text());
        if (!d.entities.length) return setError("No drawing entities were found. Is it an ASCII DXF? (Binary DXF can't be read: save it as ASCII DXF.)");
        setUnit(d.units ?? "ft");
        setRes({ type: "dxf", drawing: d });
      } else if (n.endsWith(".ifc")) {
        const r = parseIfc(await f.text());
        if (!r.solids.length) return setError("No building elements with geometry were found in this IFC file.");
        setRes({ type: "ifc", ...r });
      } else if (n.endsWith(".las")) {
        const pts = parseLas(await f.arrayBuffer());
        if (pts.length < 3) return setError("This point cloud has fewer than three points.");
        setUnit("ft");
        setRes({ type: "points", points: pts, units: null });
      } else if (n.endsWith(".xml") || n.endsWith(".landxml")) {
        const r = parseLandXml(await f.text());
        if (r.points.length < 3) return setError("No survey points (CgPoint) or surface points were found in this LandXML file.");
        setUnit(r.units ?? "ft");
        setRes({ type: "points", points: r.points, units: r.units });
      } else {
        const pts = parsePointsText(await f.text());
        if (pts.length < 3) return setError("Fewer than three x, y, z points were found. Use one point per line: x,y,z (or point,northing,easting,elevation).");
        setRes({ type: "points", points: pts, units: null });
      }
    } catch (e) {
      setError(`Couldn't read ${f.name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  /** Where the building's middle is, to centre an import on it. */
  const middle = (): V2 => {
    const fp = sceneOf(ws.getState()).footprint;
    return [(fp.x0 + fp.x1) / 2, (fp.y0 + fp.y1) / 2];
  };

  const add = (label: string, specs: ItemSpec[], level = ws.getState().plan.level) => {
    const s = ws.getState();
    const z = sceneOf(s).levelZ[level];
    const items: DrawnItem[] = specs.map((sp) => ({ id: uid("U"), kind: sp.kind, name: sp.name, level, z, pts: sp.pts, closed: sp.closed, p: sp.p }));
    s.edit(label, (st) => applyChange(st, { add: items }));
    return items.length;
  };

  const insert = () => {
    if (!res) return;
    const s = ws.getState();
    if (res.type === "image") {
      queueImage(res.img);
      s.patch({ toolOpts: { ...s.toolOpts, IMAGE: { ...(s.toolOpts.IMAGE ?? {}), w: width } } });
      close();
      run("IMAGE");
      app.getState().log("info", `  ${res.img.name}: click where its lower-left corner goes. Then trace over it (Line, Wall, Property Line).`);
      return;
    }
    if (res.type === "soil") {
      s.edit("Soil report", (st) => ({ project: { ...st.project, soil } }));
      app.getState().log("ok", `✓ Soil report ${soil.file}: allowable bearing ${soil.bearing.toLocaleString("en-US")} psf, Site Class ${soil.siteClass}, groundwater at ${soil.waterTable} ft, percolation ${soil.perc} min/in`);
      if (soil.perc > 60) app.getState().toast("Percolation slower than 60 min/in: a standard drain field may not work here. Ask the septic designer about a mound system.", "warn");
      close();
      return;
    }
    const k = FEET_PER[unit];
    if (res.type === "dxf") {
      const e = res.drawing.extents!;
      const c = middle();
      const offset: V2 = centre ? [c[0] - ((e.x0 + e.x1) / 2) * k, c[1] - ((e.y0 + e.y1) / 2) * k] : [0, 0];
      const n = add(`Import ${file}`, dxfItems(res.drawing, k, offset));
      app.getState().log("ok", `✓ ${file}: ${n} entities on ${res.drawing.layers.length} layer(s), in ${UNIT_LABEL[unit]}${centre ? ", centred on the building" : ""}`);
      app.getState().toast(`${n} entities imported`);
      close();
      return;
    }
    if (res.type === "ifc") {
      const xs = res.solids.flatMap((x) => x.poly.map((q) => q[0]));
      const ys = res.solids.flatMap((x) => x.poly.map((q) => q[1]));
      const c = middle();
      const offset: V2 = centre ? [c[0] - (Math.min(...xs) + Math.max(...xs)) / 2, c[1] - (Math.min(...ys) + Math.max(...ys)) / 2] : [0, 0];
      const n = add(`Import ${file}`, ifcItems(res.solids, offset, 0), "level1");
      app.getState().log("ok", `✓ ${file}: ${n} elements (${summary(res.solids)}), in ${UNIT_LABEL[res.units]}`);
      app.getState().toast(`${n} IFC elements imported`);
      close();
      return;
    }
    // a ground survey: feet, centred on the building, the ground there set to the finished grade
    const scene = sceneOf(s);
    let pts = res.points.map(([x, y, zz]) => [x * k, y * k, zz * k] as V3);
    if (centre) {
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const c = middle();
      const dx = c[0] - (Math.min(...xs) + Math.max(...xs)) / 2;
      const dy = c[1] - (Math.min(...ys) + Math.max(...ys)) / 2;
      pts = pts.map(([x, y, zz]) => [x + dx, y + dy, zz]);
      const near = [...pts].sort((a, b) => Math.hypot(a[0] - c[0], a[1] - c[1]) - Math.hypot(b[0] - c[0], b[1] - c[1])).slice(0, 8);
      const zc = near.reduce((a, p) => a + p[2], 0) / near.length;
      pts = pts.map(([x, y, zz]) => [x, y, zz - zc + scene.grade]);
    }
    const t = terrainFrom(pts, contourStep);
    const terrain: ProjectTerrain = { source: file ?? "survey", points: pts.length, interval: contourStep, grid: t.grid, contours: t.contours };
    s.edit(`Import ${file}`, (st) => ({ project: { ...st.project, terrain } }));
    app.getState().log("ok", `✓ ${file}: ${pts.length.toLocaleString("en-US")} points → ${t.contours.length} contour lines every ${fmt(contourStep)}, ground from ${fmt(t.lo)} to ${fmt(t.hi)} (relative to Level 1)`);
    close();
    openView(ws.getState(), { kind: "topo" });
  };

  const counts = res?.type === "dxf" ? countBy(res.drawing.entities.map((e) => e.type)) : null;
  const pointStats =
    res?.type === "points"
      ? (() => {
          const zs = res.points.map((p) => p[2]);
          const xs = res.points.map((p) => p[0]);
          const ys = res.points.map((p) => p[1]);
          return { n: res.points.length, w: (Math.max(...xs) - Math.min(...xs)) * FEET_PER[unit], d: (Math.max(...ys) - Math.min(...ys)) * FEET_PER[unit], lo: Math.min(...zs) * FEET_PER[unit], hi: Math.max(...zs) * FEET_PER[unit] };
        })()
      : null;

  return (
    <Modal
      title={meta.title}
      subtitle={`${meta.hint}. Read in your browser: nothing is uploaded.`}
      onClose={close}
      width="32rem"
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!res || busy} onClick={insert} data-testid="import-insert">
            {res?.type === "image" ? "Place it" : res?.type === "points" ? "Make the ground" : res?.type === "soil" ? "Save the report" : "Insert"}
          </button>
        </>
      }
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void pick(f);
        }}
        className={cn("grid place-items-center rounded-xl border-2 border-dashed px-6 py-7 text-center transition-colors", over ? "border-accent bg-accent/10" : "border-line")}
        data-testid="import-drop"
      >
        <Icon name="upload" size={24} className="text-t3" />
        <p className="mt-2 text-[0.8125rem] text-t1">{file ?? "Drop a file here"}</p>
        <p className="mono mt-0.5 text-[0.6875rem] text-t3">{meta.accept.replaceAll(",", " · ")}</p>
        <button className="btn mt-3" onClick={() => input.current?.click()}>
          Choose File
        </button>
        <input ref={input} type="file" accept={meta.accept} className="sr-only" aria-label="Choose File" data-testid="import-file" onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])} />
      </div>
      {busy && (
        <p className="mt-3 flex items-center gap-2 text-[0.75rem] text-t2">
          <Spinner size={13} /> Reading {file}…
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg border border-warn/40 bg-warn/10 p-3 text-[0.75rem] text-t1" data-testid="import-error">
          {error}
        </p>
      )}
      {res && (
        <div className="anim-fade mt-3 space-y-2 rounded-lg border border-ok/30 bg-ok/5 p-3 text-[0.75rem] text-t1" data-testid="import-ready">
          {res.type === "image" && (
            <>
              <Line>
                {res.img.w} × {res.img.h} px, ready to place
              </Line>
              <label className="flex items-center gap-2">
                Real width it covers
                <input type="number" min={1} className="input mono !w-24 text-right" value={width} onChange={(e) => setWidth(Math.max(1, Number(e.target.value) || 1))} aria-label="Real Width (ft)" /> ft
              </label>
            </>
          )}
          {res.type === "dxf" && counts && (
            <>
              <Line>
                {res.drawing.entities.length} entities: {Object.entries(counts).map(([k, v]) => `${v} ${k}${v === 1 ? "" : "s"}`).join(", ")}
              </Line>
              <Line>
                {res.drawing.layers.length} layer(s){res.drawing.skipped ? ` · ${res.drawing.skipped} other entities (blocks, hatches) left out` : ""}
              </Line>
              <UnitPick unit={unit} setUnit={setUnit} from={res.drawing.units} />
              {res.drawing.extents && (
                <Line>
                  Size {fmt((res.drawing.extents.x1 - res.drawing.extents.x0) * FEET_PER[unit])} × {fmt((res.drawing.extents.y1 - res.drawing.extents.y0) * FEET_PER[unit])}
                </Line>
              )}
              <CentreBox centre={centre} setCentre={setCentre} />
            </>
          )}
          {res.type === "ifc" && (
            <>
              <Line>
                {res.solids.length} elements: {summary(res.solids)}
              </Line>
              <Line>Units: {UNIT_LABEL[res.units]}{res.skipped ? ` · ${res.skipped} without geometry left out` : ""}</Line>
              <CentreBox centre={centre} setCentre={setCentre} />
            </>
          )}
          {res.type === "points" && pointStats && (
            <>
              <Line>
                {pointStats.n.toLocaleString("en-US")} points over {fmt(pointStats.w)} × {fmt(pointStats.d)}, elevations {fmt(pointStats.lo)} to {fmt(pointStats.hi)}
              </Line>
              <UnitPick unit={unit} setUnit={setUnit} from={res.units} />
              <label className="flex items-center gap-2">
                Contour every
                <select className="input !h-7 !w-24" value={contourStep} onChange={(e) => setContourStep(Number(e.target.value))} aria-label="Contour Interval">
                  {[0.5, 1, 2, 5, 10].map((v) => (
                    <option key={v} value={v}>
                      {v} ft
                    </option>
                  ))}
                </select>
              </label>
              <CentreBox centre={centre} setCentre={setCentre} label="Centre it on the building, with the ground there at the finished grade" />
            </>
          )}
          {res.type === "soil" && (
            <div className="grid grid-cols-2 gap-2" data-testid="soil-form">
              <Field label="Allowable bearing (psf)" value={soil.bearing} onChange={(v) => setSoil({ ...soil, bearing: v })} />
              <label className="flex flex-col gap-1">
                Site class
                <select className="input !h-7" value={soil.siteClass} onChange={(e) => setSoil({ ...soil, siteClass: e.target.value })} aria-label="Site Class">
                  {["A", "B", "C", "D", "E", "F"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <Field label="Groundwater depth (ft)" value={soil.waterTable} onChange={(v) => setSoil({ ...soil, waterTable: v })} />
              <Field label="Percolation (min / in)" value={soil.perc} onChange={(v) => setSoil({ ...soil, perc: v })} />
              <label className="col-span-2 flex flex-col gap-1">
                Notes
                <input className="input !h-7" value={soil.notes} onChange={(e) => setSoil({ ...soil, notes: e.target.value })} aria-label="Soil Notes" placeholder="e.g. 3 borings, fill to 4 ft" />
              </label>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2">
      <Icon name="check" size={13} className="mt-px shrink-0 text-ok" /> <span>{children}</span>
    </p>
  );
}

function UnitPick({ unit, setUnit, from }: { unit: LengthUnit; setUnit: (u: LengthUnit) => void; from: LengthUnit | null }) {
  return (
    <label className="flex items-center gap-2">
      Units
      <select className="input !h-7 !w-44" value={unit} onChange={(e) => setUnit(e.target.value as LengthUnit)} aria-label="Units">
        {(Object.keys(UNIT_LABEL) as LengthUnit[]).map((u) => (
          <option key={u} value={u}>
            {UNIT_LABEL[u]}
          </option>
        ))}
      </select>
      <span className="text-t3">{from ? "from the file" : "the file does not say"}</span>
    </label>
  );
}

function CentreBox({ centre, setCentre, label = "Centre it on the building (otherwise keep its coordinates)" }: { centre: boolean; setCentre: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={centre} onChange={(e) => setCentre(e.target.checked)} aria-label="Centre on the Building" />
      {label}
    </label>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      {label}
      <input type="number" className="input mono !h-7 text-right" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} aria-label={label} />
    </label>
  );
}

const countBy = (list: string[]) => list.reduce<Record<string, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {});
const summary = (solids: IfcSolid[]) =>
  Object.entries(countBy(solids.map((s) => s.category)))
    .map(([k, v]) => `${v} ${k.toLowerCase()}${v === 1 ? "" : "s"}`)
    .join(", ");
