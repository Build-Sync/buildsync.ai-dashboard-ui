/**
 * components/workspace/Viewport/SheetView.tsx
 *
 * WHAT   A paper-space layout sheet: the model drawn by the same renderer with a fixed camera, inside a title
 *        block. Plans (A-101, S-301) are cut 4 ft above the floor. Elevations look at one side (N, S, E or W);
 *        sections cut the model along a plane and show the cut in poché (hatched) with what lies beyond; a site
 *        plan looks straight down at the site and its topography contours, with the property line (bearings,
 *        lengths, area, and each corner's latitude / longitude when the site is on the map). A topography sheet
 *        shades the ground between contours by height, with a legend, the contour heights, the building footprint
 *        and the property line. A floor plan sheet can show any storey, or every storey side by side (one framed
 *        plan each, with its name). Elevations and sections get level
 *        lines with names and heights, grid lines with bubbles, finished grade, the ground profile read from the
 *        topography contours, and an overall height dimension; every view is framed to fit the sheet.
 * FOR    The layout tabs under the canvas. Views made with the Elevation, Section and Site Plan tools carry a
 *        SheetViewDef (side, optional cut, title) on their Sheet; the sample A-201 section follows the section
 *        slider (store sectionY). An elevation drawn with two points at any angle, or around a circle, carries the
 *        id of its mark (`mark`): the sheet follows the mark (lib/elevation.ts) and its bar above the sheet types
 *        the angle, length, radius or sweep, flips the side it looks from, or shows the mark on the plan. A circular
 *        elevation is drawn as one straight facet per 30° laid side by side (developed / unrolled).
 * DEBUG  - A view is empty: the cut may keep the side with nothing on it (Section: the third click picks the
 *          side to look at), or the layers are off (sheets follow the layer table; trees and furniture are left
 *          out of elevations and sections on purpose).
 *        - No ground profile: the project has no topography contours crossing the line of the view.
 *        - Text sizes are in sheet units (1100 × 710); the drawing area is DRAW.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { arcFacets, compassName, elevOfMark, lineAngleLength, lineFrom, lineView, type ElevArc, type ElevLine } from "@/lib/elevation";
import { GROUNDS, type GroundSpec } from "@/lib/ground";
import { applyChange } from "@/lib/draw/change";
import { makeProjector, type Camera, type Projector } from "@/lib/scene/camera";
import { elementOutline, planCutFor, planLevelsFor, renderScene, type Cut, type Plane } from "@/lib/scene/render";
import { PROJECT_SUN_HOUR, sunVector } from "@/lib/scene/sun";
import type { LevelKey, Scene, SceneElement, V2, V3 } from "@/lib/scene/types";
import { useApp } from "@/lib/store/app-provider";
import type { Sheet } from "@/lib/store/workspace-store";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import type { LayerId } from "@/lib/types";
import { clamp, fmtLength } from "@/lib/utils";
import { useScene } from "../hooks";
import { NorthArrow, PlanAnnotations, UtilityMarks, ViewportDefs } from "./Overlays";
import { LotLines, PropertyLine } from "./PropertyLine";

/* Paper-space layout sheets: the same renderer, fixed cameras, inside a title block. */

const SHEET_W = 1100;
const SHEET_H = 710;
const DRAW = { x: 28, y: 28, w: 1044, h: 540 };

const PAPER: CSSProperties = {
  ["--vp-ink" as string]: "#1b2330",
  ["--vp-ink-dim" as string]: "#5a6578",
  ["--bg-viewport" as string]: "#ffffff",
};

const SUBTITLE: Record<Sheet["kind"], string> = {
  plan: "FLOOR PLAN · LEVEL 1",
  section: "BUILDING SECTION · A–A",
  structural: "STRUCTURAL FRAMING PLAN",
  elevation: "SOUTH ELEVATION",
  site: "SITE PLAN · TOPOGRAPHY",
  topo: "TOPOGRAPHY · EXISTING GRADE",
};

/** Camera bearing for each side the camera stands on. */
const BEARING = { N: 0, S: 180, E: 90, W: 270 } as const;
const LEVELS: LevelKey[] = ["foundation", "level1", "level2", "roof"];
const f1 = (n: number) => Math.round(n * 10) / 10;

type ViewKind = "plan" | "plans" | "vertical" | "arc" | "site" | "topo";
/** the levels of a plan sheet that does not say (the sample A-101): one constant, so memos keep it */
const LEVEL1_PLAN: LevelKey[] = ["level1"];
const NO_LEVELS: LevelKey[] = [];

/** What a sheet shows: the camera side, the cut, the levels of a plan, and whether it is a plan, a vertical view or the site. */
function viewOf(sheet: Sheet, sectionY: number, scene: Scene): { kind: ViewKind; dir: keyof typeof BEARING; cut: Cut | null; title: string; levels: LevelKey[]; line?: ElevLine; arc?: ElevArc; missing?: boolean } {
  const levels = sheet.view?.levels ?? LEVEL1_PLAN;
  if (sheet.view?.mark) {
    const it = scene.items?.[sheet.view.mark];
    const e = it ? elevOfMark(it.kind, it.pts, it.p) : null;
    return { kind: e?.arc ? "arc" : "vertical", dir: sheet.view.dir, cut: null, title: sheet.view.title, levels: NO_LEVELS, line: e?.line, arc: e?.arc, missing: !e };
  }
  if (sheet.kind === "plan" && levels.length > 1) return { kind: "plans", dir: "S", cut: null, title: sheet.view?.title ?? "FLOOR PLANS", levels };
  if (sheet.kind === "plan" || sheet.kind === "structural") return { kind: "plan", dir: "S", cut: null, title: sheet.view?.title ?? SUBTITLE[sheet.kind], levels };
  if (sheet.kind === "site") return { kind: "site", dir: "S", cut: null, title: sheet.view?.title ?? SUBTITLE.site, levels: NO_LEVELS };
  if (sheet.kind === "topo") return { kind: "topo", dir: "S", cut: null, title: sheet.view?.title ?? SUBTITLE.topo, levels: NO_LEVELS };
  if (sheet.view) return { kind: "vertical", dir: sheet.view.dir, cut: sheet.view.cut ?? null, title: sheet.view.title, levels: NO_LEVELS };
  if (sheet.kind === "section") return { kind: "vertical", dir: "S", cut: { axis: 1, at: sectionY, keep: 1 }, title: SUBTITLE.section, levels: NO_LEVELS };
  return { kind: "vertical", dir: "S", cut: null, title: SUBTITLE.elevation, levels: NO_LEVELS };
}

/** A camera that frames these model points in an area of the sheet. */
function fitPoints(cam: Camera, pts: V3[], scene: Scene, area: { w: number; h: number }, room: number): Camera {
  if (!pts.length) return cam;
  const base = makeProjector({ ...cam, zoom: 1, panX: 0, panY: 0 }, area, scene.center, scene.radius);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const q of pts) {
    const t = base.project(q);
    x0 = Math.min(x0, t.x);
    y0 = Math.min(y0, t.y);
    x1 = Math.max(x1, t.x);
    y1 = Math.max(y1, t.y);
  }
  const zoom = clamp(Math.min((area.w * room) / Math.max(x1 - x0, 20), (area.h * room) / Math.max(y1 - y0, 20)), 0.1, 12);
  return { ...cam, zoom, panX: -((x0 + x1) / 2 - area.w / 2) * zoom, panY: -((y0 + y1) / 2 - area.h / 2) * zoom };
}

/** The corners of the elements a plan of `level` frames (the building on that storey). */
function planPoints(scene: Scene, level: LevelKey, hidden: Set<string>): V3[] {
  const out: V3[] = [];
  for (const e of scene.elements) {
    if (hidden.has(e.id) || e.system === "Drafting" || e.layer === "topography" || e.layer === "landscape" || e.category === "Paving") continue;
    if (e.level !== level && !(level === "roof" && e.level === "level2")) continue;
    out.push([e.min[0], e.min[1], 0], [e.max[0], e.max[1], 0]);
  }
  return out;
}

/** The height a contour stands for: its label ("-1.5'") when it has one, otherwise its z. */
const contourHeight = (c: Scene["contours"][number]) => {
  const v = parseFloat(c.label ?? "");
  return Number.isFinite(v) ? v : c.z;
};

/** Is the element (partly) on the kept side of a cut, and of a plane at any angle? */
const keeps = (el: SceneElement, cut: Cut | null, plane: Plane | null = null) =>
  (!cut || (cut.keep > 0 ? el.max[cut.axis] > cut.at : el.min[cut.axis] < cut.at)) &&
  (!plane || ([[el.min[0], el.min[1]], [el.max[0], el.min[1]], [el.max[0], el.max[1]], [el.min[0], el.max[1]]] as V2[]).some((q) => plane.n[0] * q[0] + plane.n[1] * q[1] >= plane.d));

/** The line a vertical view is measured along: a point on it and the unit direction (screen left to right or reverse). */
interface Frame {
  o: V2;
  u: V2;
}

/** A camera that frames these elements in the drawing area. */
function fitCamera(cam: Camera, els: SceneElement[], scene: Scene, room: number): Camera {
  if (!els.length) return cam;
  const base = makeProjector({ ...cam, zoom: 1, panX: 0, panY: 0 }, { w: DRAW.w, h: DRAW.h }, scene.center, scene.radius);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const el of els)
    for (const [x, y] of elementOutline(el, base).hull) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  const zoom = clamp(Math.min((DRAW.w * room) / Math.max(x1 - x0, 20), (DRAW.h * 0.72) / Math.max(y1 - y0, 20)), 0.15, 12);
  const cx = (x0 + x1) / 2 - DRAW.w / 2;
  const cy = (y0 + y1) / 2 - DRAW.h / 2;
  // leave room on the right for the level names
  return { ...cam, zoom, panX: -cx * zoom - (room < 0.8 ? 40 : 0), panY: -cy * zoom + 6 };
}

/** The ground along a line, read from the topography contours: [distance along the view, height] points. */
function groundProfile(scene: Scene, f: Frame): V2[] {
  const out: V2[] = [];
  const nrm: V2 = [-f.u[1], f.u[0]];
  const off = (q: V2) => (q[0] - f.o[0]) * nrm[0] + (q[1] - f.o[1]) * nrm[1];
  for (const c of scene.contours) {
    for (let i = 0; i < c.pts.length; i++) {
      const a = c.pts[i];
      const b = c.pts[(i + 1) % c.pts.length];
      const ka = off(a);
      const kb = off(b);
      if (ka * kb > 0 || ka === kb) continue;
      const t = ka / (ka - kb);
      const q: V2 = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      out.push([(q[0] - f.o[0]) * f.u[0] + (q[1] - f.o[1]) * f.u[1], c.z]);
    }
  }
  return out.sort((p, q) => p[0] - q[0]);
}

/** The frame of a view on a side (N, S, E, W), through the middle of the footprint or along its cut. */
function sideFrame(scene: Scene, dir: keyof typeof BEARING, cut: Cut | null): Frame {
  const f = scene.footprint;
  const alongX = dir === "N" || dir === "S";
  const line = cut ? cut.at : alongX ? (f.y0 + f.y1) / 2 : (f.x0 + f.x1) / 2;
  return alongX ? { o: [0, line], u: [1, 0] } : { o: [line, 0], u: [0, 1] };
}

/** Draws one paper-space sheet. */
export function SheetView({ sheet }: { sheet: Sheet }) {
  const scene = useScene();
  const project = useWs((s) => s.project);
  const colors = useWs((s) => s.colors);
  const roomsOn = useWs((s) => s.roomLabels);
  const mepLook = useWs((s) => s.mepLook);
  const ground = GROUNDS[useWs((s) => s.project.ground) ?? "lawn"];
  const hidden = useWs((s) => s.hidden);
  const layersState = useWs((s) => s.project.layers);
  const sectionY = useWs((s) => s.sectionY);
  const elColors = useWs((s) => s.elColors);
  const units = useApp((s) => s.settings.units);

  const v = viewOf(sheet, sectionY, scene);
  const lineKey = v.line ? `${v.line.a.join(",")}|${v.line.b.join(",")}|${v.line.look}` : "";
  const arcKey = v.arc ? `${v.arc.c.join(",")}|${v.arc.r}|${v.arc.start}|${v.arc.sweep}` : "";

  const site = project.site;
  const { svg, proj, panels, facets, frame } = useMemo(() => {
    const layers = Object.fromEntries(layersState.map((l) => [l.id, l.visible])) as Partial<Record<LayerId, boolean>>;
    const hiddenSet = new Set(hidden);
    const common = { sectionY: null, colors, hidden: hiddenSet, phaseState: null, shadows: false, edges: true, tint: {}, dimOthers: false, sun: sunVector(PROJECT_SUN_HOUR), ghostMep: false, elColors, ground: { side: ground.side, pattern: ground.pattern }, mepLook } as const;
    const planLayers = { ...layers, topography: false, landscape: false, site: false };
    const vertLayers = { ...layers, landscape: layers.landscape !== false, site: false, furniture: false };
    if (v.kind === "arc" && v.arc) {
      // a circular elevation: one straight facet per step, all at one scale, laid side by side left to right
      const fs = arcFacets(v.arc);
      const chord = Math.hypot(fs[0].b[0] - fs[0].a[0], fs[0].b[1] - fs[0].a[1]);
      const top = scene.elements.reduce((m, e) => (e.layer === "topography" || e.system === "Drafting" ? m : Math.max(m, e.max[2])), scene.grade + 10);
      const fit = (Math.min(DRAW.w, DRAW.h) * 0.46) / Math.max(scene.radius, 1);
      const zoom = clamp(Math.min((DRAW.w * 0.92) / (fs.length * chord * fit), (DRAW.h * 0.62) / ((top - scene.grade + 2) * fit)), 0.05, 12);
      const scale = fit * zoom;
      const x0 = (DRAW.w - fs.length * chord * scale) / 2;
      const zMid = (top + scene.grade) / 2;
      const out = fs.map((e, i) => {
        const lv = lineView(e);
        const base: Camera = { bearing: lv.bearing, pitch: 0, zoom, panX: 0, panY: 0, perspective: false };
        const p0 = makeProjector(base, { w: DRAW.w, h: DRAW.h }, scene.center, scene.radius);
        const qa = p0.project([e.a[0], e.a[1], zMid]);
        const cam: Camera = { ...base, panX: x0 + i * chord * scale - qa.x, panY: DRAW.h / 2 - qa.y - 10 };
        const proj = makeProjector(cam, { w: DRAW.w, h: DRAW.h }, scene.center, scene.radius);
        const r = renderScene({ ...common, scene, proj, style: "shaded", plan: null, cut: null, plane: lv.plane, layers: vertLayers, isolated: null });
        return { i, x: x0 + i * chord * scale, w: chord * scale, svg: r.svg, proj, bearing: lv.bearing };
      });
      return { svg: "", proj: out[0].proj, cam: { bearing: 0, pitch: 0, zoom, panX: 0, panY: 0, perspective: false } as Camera, panels: null, facets: out, frame: null };
    }
    if (v.kind === "vertical" && v.line) {
      // an elevation along a line at any angle: the camera looks across it; what is behind the viewer is left out
      const lv = lineView(v.line);
      const building = scene.elements.filter((e) => !hiddenSet.has(e.id) && e.system !== "Drafting" && e.layer !== "topography" && e.layer !== "landscape" && e.category !== "Paving" && layers[e.layer] !== false && keeps(e, null, lv.plane));
      const cam = fitCamera({ bearing: lv.bearing, pitch: 0, zoom: 1.55, panX: 0, panY: 30, perspective: false }, building, scene, 0.74);
      const proj = makeProjector(cam, { w: DRAW.w, h: DRAW.h }, scene.center, scene.radius);
      const out = renderScene({ ...common, scene, proj, style: "shaded", plan: null, cut: null, plane: lv.plane, layers: { ...layers, topography: layers.topography !== false, landscape: layers.landscape !== false, site: false, furniture: false }, isolated: null });
      const len = Math.hypot(v.line.b[0] - v.line.a[0], v.line.b[1] - v.line.a[1]) || 1;
      return { svg: out.svg, proj, cam, panels: null, facets: null, frame: { o: v.line.a, u: [(v.line.b[0] - v.line.a[0]) / len, (v.line.b[1] - v.line.a[1]) / len] as V2, plane: lv.plane } };
    }
    if (v.kind === "plans") {
      // every storey side by side, each framed on its own and drawn at the same scale
      const cellW = DRAW.w / v.levels.length;
      // the bottom strip keeps the level names clear of the view title
      const area = { w: cellW, h: DRAW.h - 72 };
      const base: Camera = { bearing: 0, pitch: 90, zoom: 1, panX: 0, panY: 0, perspective: false };
      const fits = v.levels.map((level) => fitPoints(base, planPoints(scene, level, hiddenSet), scene, area, 0.82));
      const zoom = Math.min(...fits.map((c) => c.zoom));
      const panels = v.levels.map((level, i) => {
        const cam = fits[i];
        const k = zoom / cam.zoom;
        const proj = makeProjector({ ...cam, zoom, panX: cam.panX * k, panY: cam.panY * k }, area, scene.center, scene.radius);
        const out = renderScene({ ...common, scene, proj, style: "shaded", plan: { cutZ: planCutFor(scene, level), levels: planLevelsFor(level) }, cut: null, layers: { ...planLayers, furniture: true }, isolated: null });
        return { level, x: i * cellW, w: cellW, h: area.h, svg: out.svg, proj };
      });
      return { svg: "", proj: panels[0]?.proj ?? makeProjector(base, area, scene.center, scene.radius), cam: base, panels, facets: null, frame: null };
    }
    const structural = new Set(scene.elements.filter((e) => e.system === "Structural" && e.category !== "Truss").map((e) => e.id));
    let cam: Camera = { bearing: BEARING[v.dir], pitch: v.kind === "vertical" ? 0 : 90, zoom: v.kind === "plan" ? 1.9 : 1.55, panX: 0, panY: v.kind === "plan" ? 0 : 30, perspective: false };
    if (v.kind === "plan" && v.levels[0] !== "level1") {
      cam = fitPoints(cam, planPoints(scene, v.levels[0], hiddenSet), scene, { w: DRAW.w, h: DRAW.h }, 0.7);
    } else if (v.kind === "topo") {
      // the contours, the building and the property line, with room for the legend
      const pts: V3[] = scene.contours.flatMap((c) => c.pts.map(([x, y]) => [x, y, 0] as V3));
      for (const q of site?.boundary ?? []) pts.push([q[0], q[1], 0]);
      const f = scene.footprint;
      pts.push([f.x0, f.y0, 0], [f.x1, f.y1, 0]);
      cam = fitPoints(cam, pts, scene, { w: DRAW.w - 160, h: DRAW.h - 40 }, 0.9);
      cam = { ...cam, panX: cam.panX - 80 };
    } else if (v.kind !== "plan") {
      const building = scene.elements.filter((e) => !hiddenSet.has(e.id) && e.system !== "Drafting" && e.layer !== "topography" && (v.kind === "site" || (e.layer !== "landscape" && e.category !== "Paving")) && keeps(e, v.cut) && layers[e.layer] !== false);
      cam = fitCamera(cam, building, scene, v.kind === "site" ? 0.86 : 0.74);
    }
    const proj = makeProjector(cam, { w: DRAW.w, h: DRAW.h }, scene.center, scene.radius);
    const out = renderScene({
      scene,
      proj,
      style: v.kind === "site" ? "realistic" : "shaded",
      plan: sheet.kind === "plan" ? { cutZ: planCutFor(scene, v.levels[0]), levels: planLevelsFor(v.levels[0]), below: v.levels[0] === "foundation" } : sheet.kind === "structural" ? { cutZ: 9.4, levels: ["site", "foundation", "level1"] } : null,
      sectionY: null,
      cut: v.cut,
      colors,
      // elevations and sections keep the ground (the cut shows the soil) but leave trees and furniture out
      layers:
        v.kind === "site"
          ? layers
          : v.kind === "topo"
            ? // the ground is drawn by TopoAnnotations; the model shows only as a faint roof plan
              Object.fromEntries(Object.keys(layers).map((k) => [k, k === "roof" || k === "walls"])) as Partial<Record<LayerId, boolean>>
            : { ...layers, topography: v.kind === "vertical" ? layers.topography !== false : false, landscape: v.kind === "vertical" && layers.landscape !== false, site: false, furniture: sheet.kind === "plan" },
      hidden: hiddenSet,
      isolated: sheet.kind === "structural" ? structural : null,
      phaseState: null,
      shadows: false,
      edges: true,
      tint: {},
      dimOthers: false,
      sun: sunVector(PROJECT_SUN_HOUR),
      ghostMep: false,
      elColors,
    });
    return { svg: out.svg, proj, cam, panels: null, facets: null, frame: v.kind === "vertical" ? { ...sideFrame(scene, v.dir, v.cut), plane: null } : null };
    // lineKey / arcKey stand for v.line / v.arc, which are rebuilt on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, sheet.kind, layersState, colors, hidden, v.kind, v.dir, v.cut, v.levels, elColors, site?.boundary, lineKey, arcKey, ground, mepLook]);

  const fmt = (ft: number) => fmtLength(ft, units.system, units.precision);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#2a2f39]" data-testid="sheet-view" data-view={v.kind} data-dir={v.dir}>
      {sheet.view?.mark && <ElevationBar sheet={sheet} line={v.line} arc={v.arc} missing={!!v.missing} />}
      <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-4">
      <svg viewBox={`0 0 ${SHEET_W} ${SHEET_H}`} className="bs-keep-colors max-h-full max-w-full bg-white shadow-pop" style={{ ...PAPER, aspectRatio: `${SHEET_W} / ${SHEET_H}`, width: "min(100%, 1100px)" }} role="img" aria-label={`Sheet ${sheet.name}`}>
        <ViewportDefs />
        <rect x={10} y={10} width={SHEET_W - 20} height={SHEET_H - 20} fill="none" stroke="#1b2330" strokeWidth={1.5} />
        <clipPath id="sheet-clip">
          <rect x={DRAW.x} y={DRAW.y} width={DRAW.w} height={DRAW.h} />
        </clipPath>
        <g clipPath="url(#sheet-clip)">
          <rect x={DRAW.x} y={DRAW.y} width={DRAW.w} height={DRAW.h} fill="#fff" />
          <g transform={`translate(${DRAW.x} ${DRAW.y})`}>
            {v.kind === "topo" && <TopoAnnotations scene={scene} proj={proj} fmt={fmt} />}
            <g dangerouslySetInnerHTML={{ __html: svg }} opacity={v.kind === "topo" ? 0.35 : 1} />
            {panels?.map((pl) => (
              <g key={pl.level} transform={`translate(${pl.x} 0)`} data-testid="sheet-plan" data-level={pl.level}>
                <g dangerouslySetInnerHTML={{ __html: pl.svg }} />
                <PlanAnnotations scene={scene} proj={pl.proj} level={pl.level} showGrid={false} rooms={roomsOn} />
                <line x1={pl.w} x2={pl.w} y1={8} y2={pl.h + 22} stroke="#c9ced8" strokeWidth={0.8} />
                <text x={pl.w / 2} y={pl.h + 16} fontSize={12} fontWeight={700} textAnchor="middle" fill="#1b2330" fontFamily="var(--font-ui)">
                  {(project.levels.find((l) => l.id === pl.level)?.name ?? pl.level).toUpperCase()}
                </text>
              </g>
            ))}
            {v.kind === "plan" && <PlanAnnotations scene={scene} proj={proj} level={v.levels[0]} showGrid rooms={roomsOn} />}
            {(v.kind === "site" || v.kind === "topo") && scene.lots && <LotLines lots={scene.lots} proj={proj} z={0} paper />}
            {(v.kind === "site" || v.kind === "topo") && site?.boundary && <PropertyLine site={site} proj={proj} z={0} plan fmt={fmt} metric={units.system !== "imperial"} paper />}
            {v.kind !== "vertical" && <NorthArrow proj={panels?.[0]?.proj ?? proj} x={DRAW.w - 40} y={42} />}
            {v.kind === "vertical" && frame && <VerticalAnnotations scene={scene} proj={proj} frame={frame} keep={(e) => keeps(e, v.cut, frame.plane)} levels={project.levels} fmt={fmt} ground={ground} />}
            {facets?.map((f) => (
              <g key={f.i} data-testid="elev-facet">
                <clipPath id={`facet-${sheet.id}-${f.i}`}>
                  <rect x={f.x} y={0} width={f.w + 0.6} height={DRAW.h} />
                </clipPath>
                <g clipPath={`url(#facet-${sheet.id}-${f.i})`} dangerouslySetInnerHTML={{ __html: f.svg }} />
                <line x1={f.x} x2={f.x} y1={30} y2={DRAW.h - 40} stroke="#c9ced8" strokeWidth={0.6} strokeDasharray="3 3" />
                {/* where each facet is seen from; narrow facets name every second or third one so the names never overlap */}
                {f.i % Math.max(1, Math.ceil(64 / f.w)) === 0 && (
                  <text x={f.x + f.w / 2} y={24} fontSize={9} textAnchor="middle" fill="#5a6578" fontFamily="var(--font-data)">
                    FROM {compassName(f.bearing).toUpperCase()}
                  </text>
                )}
              </g>
            ))}
            {facets && v.arc && <ArcAnnotations scene={scene} facets={facets} levels={project.levels} fmt={fmt} ground={ground} />}
            {v.missing && (
              <text x={DRAW.w / 2} y={DRAW.h / 2} fontSize={13} textAnchor="middle" fill="#5a6578" fontFamily="var(--font-ui)" data-testid="elev-missing">
                The mark of this elevation was deleted. Undo brings it back, or draw a new one with View → Elevation.
              </text>
            )}
            {v.kind === "site" && <SiteAnnotations scene={scene} proj={proj} />}
            {(v.kind === "site" || v.kind === "topo" || (v.kind === "plan" && v.levels[0] === "foundation")) && <UtilityMarks scene={scene} proj={proj} paper outlines={!(v.kind === "plan")} />}
            <text x={16} y={DRAW.h - 14} fontSize={13} fontWeight={700} fill="#1b2330" fontFamily="var(--font-ui)" data-testid="view-title">
              {v.title}
            </text>
            <text x={16} y={DRAW.h - 1} fontSize={9.5} fill="#5a6578" fontFamily="var(--font-data)">
              SCALE AS SHOWN · {v.kind === "arc" ? "DEVELOPED (UNROLLED) · LOOKING IN" : v.kind === "vertical" ? (v.line ? `LOOKING ${compassName((lineView(v.line).bearing + 180) % 360).toUpperCase()}` : `LOOKING ${({ N: "SOUTH", S: "NORTH", E: "WEST", W: "EAST" } as const)[v.dir]}`) : "NORTH UP"}
            </text>
          </g>
        </g>
        <rect x={DRAW.x} y={DRAW.y} width={DRAW.w} height={DRAW.h} fill="none" stroke="#1b2330" strokeWidth={0.8} />

        {/* title block */}
        <g fontFamily="var(--font-data)" fill="#1b2330">
          <rect x={DRAW.x} y={DRAW.y + DRAW.h + 8} width={DRAW.w} height={SHEET_H - DRAW.y - DRAW.h - 26} fill="none" stroke="#1b2330" strokeWidth={0.8} />
          <line x1={760} x2={760} y1={DRAW.y + DRAW.h + 8} y2={SHEET_H - 18} stroke="#1b2330" strokeWidth={0.8} />
          <line x1={900} x2={900} y1={DRAW.y + DRAW.h + 8} y2={SHEET_H - 18} stroke="#1b2330" strokeWidth={0.8} />
          <text x={42} y={DRAW.y + DRAW.h + 34} fontSize={11} fill="#5a6578">PROJECT</text>
          <text x={42} y={DRAW.y + DRAW.h + 56} fontSize={18} fontWeight={600} fontFamily="var(--font-ui)">{project.name}</text>
          <text x={42} y={DRAW.y + DRAW.h + 78} fontSize={11} fill="#5a6578">{project.address || "No address"}</text>
          <text x={42} y={DRAW.y + DRAW.h + 100} fontSize={11}>{project.jurisdiction.name} · {project.jurisdiction.codeSet}</text>
          <text x={430} y={DRAW.y + DRAW.h + 34} fontSize={11} fill="#5a6578">SHEET</text>
          <text x={430} y={DRAW.y + DRAW.h + 58} fontSize={20} fontWeight={600} fontFamily="var(--font-ui)">{sheet.name}</text>
          <text x={430} y={DRAW.y + DRAW.h + 78} fontSize={11}>{v.title}</text>
          <text x={430} y={DRAW.y + DRAW.h + 100} fontSize={10} fill="#5a6578">SCALE 1/4&quot; = 1&apos;-0&quot; · DRAWN BY BUILDSYNC AI</text>
          <text x={774} y={DRAW.y + DRAW.h + 34} fontSize={11} fill="#5a6578">STATUS</text>
          <text x={774} y={DRAW.y + DRAW.h + 56} fontSize={12} fontWeight={700} fill="#b45309">AI-GENERATED</text>
          <text x={774} y={DRAW.y + DRAW.h + 72} fontSize={12} fontWeight={700} fill="#b45309">UNSTAMPED</text>
          <text x={774} y={DRAW.y + DRAW.h + 92} fontSize={9.5} fill="#5a6578">Requires PE Review</text>
          <rect x={912} y={DRAW.y + DRAW.h + 18} width={142} height={88} fill="none" stroke="#5a6578" strokeDasharray="4 3" />
          <text x={983} y={DRAW.y + DRAW.h + 58} fontSize={10} textAnchor="middle" fill="#5a6578">PE SEAL</text>
          <text x={983} y={DRAW.y + DRAW.h + 74} fontSize={9} textAnchor="middle" fill="#5a6578">pending signature</text>
        </g>
      </svg>
      </div>
    </div>
  );
}

/** The bar above an elevation drawn at any angle or around a circle: type its angle, length, radius or sweep, flip it, or show its mark on the plan. */
function ElevationBar({ sheet, line, arc, missing }: { sheet: Sheet; line?: ElevLine; arc?: ElevArc; missing: boolean }) {
  const ws = useWsApi();
  const markId = sheet.view?.mark ?? "";
  const item = useWs((s) => s.drawn.find((d) => d.id === markId));
  const units = useApp((s) => s.settings.units);
  // the boxes are edited as text and applied on Enter or when they lose focus, so a half-typed value is never drawn
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (missing || !item) return null;
  const commit = (label: string, pts: V2[], p = item.p) => ws.getState().edit(label, (st) => applyChange(st, { replace: [{ ...item, pts, p }] }), { coalesce: true });
  const num = (k: string, v: number) => draft[k] ?? String(Math.round(v * 100) / 100);
  const box = (k: string, label: string, v: number, unit: string, apply: (n: number) => void) => (
    <label className="flex items-center gap-1.5 text-[0.75rem] text-[#c9ced8]">
      {label}
      <input
        className="input mono !h-6 !w-20 !px-1.5 text-right !text-[0.75rem]"
        value={num(k, v)}
        aria-label={`Elevation ${label}`}
        data-testid={`elev-${k}`}
        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
        onBlur={() => {
          const n = parseFloat(draft[k] ?? "");
          if (Number.isFinite(n)) apply(n);
          setDraft((d) => {
            const next = { ...d };
            delete next[k];
            return next;
          });
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <span className="text-[#8a93a3]">{unit}</span>
    </label>
  );
  const feet = units.system === "imperial" ? "ft" : "ft (model)";
  const showOnPlan = () => {
    const s = ws.getState();
    s.setLayoutTab("model");
    s.setView("2d");
    s.select([markId]);
    s.frameElements([markId]);
  };
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-black/30 bg-[#232833] px-4 py-1.5" data-testid="elev-bar">
      <span className="text-[0.75rem] font-semibold text-white">{line ? "Elevation line" : "Circular elevation"}</span>
      {line && (() => {
        const { angle, length } = lineAngleLength(line.a, line.b);
        return (
          <>
            {box("angle", "Angle", angle, "°", (n) => commit("Elevation angle", [line.a, lineFrom(line.a, n, length)]))}
            {box("length", "Length", length, feet, (n) => n >= 1 && commit("Elevation length", [line.a, lineFrom(line.a, angle, n)]))}
            <button className="btn !h-6 px-2 text-[0.75rem]" data-testid="elev-flip" onClick={() => commit("Flip elevation", [line.a, line.b], { ...item.p, look: line.look === 1 ? -1 : 1 })}>
              Look from the other side
            </button>
          </>
        );
      })()}
      {arc && (
        <>
          {box("radius", "Radius", arc.r, feet, (n) => n >= 2 && commit("Elevation radius", [arc.c, lineFrom(arc.c, arc.start, n)]))}
          {box("sweep", "Sweep", arc.sweep, "°", (n) => commit("Elevation sweep", item.pts, { ...item.p, sweep: Math.max(10, Math.min(360, n)) }))}
          {box("start", "Start", arc.start, "°", (n) => commit("Elevation start", [arc.c, lineFrom(arc.c, n, arc.r)]))}
        </>
      )}
      <span className="flex-1" />
      <button className="btn !h-6 px-2 text-[0.75rem]" onClick={showOnPlan} data-testid="elev-show-plan">
        Show on the plan (drag its points)
      </button>
    </div>
  );
}

/** The ground under the finished grade line on an elevation or section: its colour and texture, and its name. */
function EarthBand({ x0, x1, y0, y1, ground }: { x0: number; x1: number; y0: number; y1: number; ground: GroundSpec }) {
  const top = Math.min(y0, y1);
  const h = Math.abs(y1 - y0);
  return (
    <g pointerEvents="none" data-testid="sheet-ground" data-ground={ground.id}>
      <rect x={f1(x0)} y={f1(top)} width={f1(x1 - x0)} height={f1(h)} fill={ground.side} fillOpacity={0.22} />
      <rect x={f1(x0)} y={f1(top)} width={f1(x1 - x0)} height={f1(h)} fill={`url(#bs-ground-${ground.pattern})`} />
      <text x={f1(x1 - 4)} y={f1(top + h - 4)} fontSize={8.5} textAnchor="end" fill="#6b5742" fontFamily="var(--font-data)">
        {ground.label.toUpperCase()} ({ground.uscs.split(" (")[0].split(":")[0]})
      </text>
    </g>
  );
}

/** Level lines, finished grade and the overall width of a circular (unrolled) elevation. */
function ArcAnnotations({ scene, facets, levels, fmt, ground }: { scene: Scene; facets: { x: number; w: number; proj: Projector }[]; levels: { id: string; name: string }[]; fmt: (ft: number) => string; ground: GroundSpec }) {
  const p = facets[0].proj;
  const left = facets[0].x;
  const right = facets[facets.length - 1].x + facets[facets.length - 1].w;
  const y = (z: number) => p.project([scene.center[0], scene.center[1], z]).y;
  const top = scene.elements.reduce((m, e) => (e.layer === "topography" || e.system === "Drafting" || e.layer === "landscape" ? m : Math.max(m, e.max[2])), scene.grade + 1);
  return (
    <g pointerEvents="none" fontFamily="var(--font-ui)">
      {LEVELS.filter((k) => scene.levelZ[k] <= top + 0.5).map((k) => (
        <g key={k} data-testid="sheet-level">
          <line x1={f1(left - 6)} x2={f1(right + 6)} y1={f1(y(scene.levelZ[k]))} y2={f1(y(scene.levelZ[k]))} stroke="#1b2330" strokeWidth={0.6} strokeDasharray="10 3 2 3" />
          <text x={f1(right + 10)} y={f1(y(scene.levelZ[k]) - 2)} fontSize={10} fontWeight={600} fill="#1b2330">
            {levels.find((l) => l.id === k)?.name ?? k}
          </text>
        </g>
      ))}
      <EarthBand x0={left} x1={right} y0={y(scene.grade)} y1={y(scene.grade - 2.5)} ground={ground} />
      <line x1={f1(left)} x2={f1(right)} y1={f1(y(scene.grade))} y2={f1(y(scene.grade))} stroke="#6b5742" strokeWidth={1.6} />
      <text x={f1(left + 4)} y={f1(y(scene.grade) + 11)} fontSize={8.5} fill="#6b5742" fontFamily="var(--font-data)">
        FINISHED GRADE {scene.grade >= 0 ? "+" : "−"}{fmt(Math.abs(scene.grade))}
      </text>
    </g>
  );
}

/** Level lines, grade, the ground profile, grid lines and the height dimension of an elevation or section. */
function VerticalAnnotations({ scene, proj, frame, keep, levels, fmt, ground }: { scene: Scene; proj: Projector; frame: Frame; keep: (e: SceneElement) => boolean; levels: { id: string; name: string }[]; fmt: (ft: number) => string; ground: GroundSpec }) {
  const f = scene.footprint;
  const P = (u: number, z: number) => proj.project([frame.o[0] + frame.u[0] * u, frame.o[1] + frame.u[1] * u, z]);
  const along = (x: number, y: number) => (x - frame.o[0]) * frame.u[0] + (y - frame.o[1]) * frame.u[1];
  // grid lines are drawn when the view runs along X or along Y
  const alongX = Math.abs(frame.u[1]) < 1e-6;
  const alongY = Math.abs(frame.u[0]) < 1e-6;
  const out: ReactNode[] = [];
  const building = scene.elements.filter((e) => e.layer !== "topography" && e.layer !== "landscape" && e.category !== "Paving" && e.system !== "Drafting" && e.layer !== "utilities" && keep(e));
  const top = building.reduce((m, e) => Math.max(m, e.max[2]), scene.grade + 1);
  let u0 = Infinity;
  let u1 = -Infinity;
  for (const e of building)
    for (const [x, y] of [[e.min[0], e.min[1]], [e.max[0], e.min[1]], [e.max[0], e.max[1]], [e.min[0], e.max[1]]] as V2[]) {
      const u = along(x, y);
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
    }
  if (!Number.isFinite(u0)) return null;

  // levels: a dashed line across with the name and height at the right end
  for (const key of LEVELS) {
    const z = scene.levelZ[key];
    if (z > top + 0.5) continue;
    const a = P(u0 - 6, z);
    const b = P(u1 + 6, z);
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);
    const name = levels.find((l) => l.id === key)?.name ?? key;
    out.push(
      <g key={`lv-${key}`} data-testid="sheet-level">
        <line x1={f1(left)} x2={f1(right)} y1={f1(a.y)} y2={f1(a.y)} stroke="#1b2330" strokeWidth={0.7} strokeDasharray="10 3 2 3" />
        <path d={`M${f1(right)},${f1(a.y)}l-6,-6h12z`} fill="#1b2330" />
        <text x={f1(right + 10)} y={f1(a.y - 2)} fontSize={10} fontWeight={600} fill="#1b2330" fontFamily="var(--font-ui)">{name}</text>
        <text x={f1(right + 10)} y={f1(a.y + 10)} fontSize={9} fill="#5a6578" fontFamily="var(--font-data)">{z >= 0 ? "+" : "−"}{fmt(Math.abs(z))}</text>
      </g>,
    );
  }

  // finished grade, and the ground read from the contours
  const g0 = P(u0 - 30, scene.grade);
  const g1 = P(u1 + 30, scene.grade);
  // the ground under the grade line, in its texture, with its name
  const e0 = P(u0 - 30, scene.grade - 2.5);
  out.push(<EarthBand key="earth" x0={Math.min(g0.x, g1.x)} x1={Math.max(g0.x, g1.x)} y0={g0.y} y1={e0.y} ground={ground} />);
  out.push(<line key="grade" x1={f1(Math.min(g0.x, g1.x))} x2={f1(Math.max(g0.x, g1.x))} y1={f1(g0.y)} y2={f1(g0.y)} stroke="#6b5742" strokeWidth={1.6} />);
  out.push(
    <text key="grade-t" x={f1(Math.min(g0.x, g1.x) + 4)} y={f1(g0.y + 11)} fontSize={8.5} fill="#6b5742" fontFamily="var(--font-data)">
      FINISHED GRADE {scene.grade >= 0 ? "+" : "−"}{fmt(Math.abs(scene.grade))}
    </text>,
  );
  const profile = groundProfile(scene, frame);
  if (profile.length >= 2) {
    const d = profile.map(([u, z], i) => {
      const q = P(u, z);
      return `${i ? "L" : "M"}${f1(q.x)},${f1(q.y)}`;
    }).join("");
    out.push(<path key="topo" d={d} fill="none" stroke="#8a6a4c" strokeWidth={1.2} strokeDasharray="6 3" data-testid="ground-profile" />);
    const q = P(profile[0][0], profile[0][1]);
    out.push(<text key="topo-t" x={f1(q.x + 4)} y={f1(q.y - 5)} fontSize={8.5} fill="#8a6a4c" fontFamily="var(--font-data)">EXISTING GRADE (CONTOURS)</text>);
  }

  // grid lines that cross this view: sample bubbles outside the footprint, and grid lines the user drew
  const grids: { u: number; label: string }[] = [];
  for (const g of scene.grid) {
    const outsideY = g.at[1] < f.y0 - 1 || g.at[1] > f.y1 + 1;
    const outsideX = g.at[0] < f.x0 - 1 || g.at[0] > f.x1 + 1;
    if (alongX && outsideY) grids.push({ u: along(g.at[0], frame.o[1]), label: g.label });
    if (alongY && outsideX && !outsideY) grids.push({ u: along(frame.o[0], g.at[1]), label: g.label });
  }
  for (const it of scene.drafts ?? []) {
    if (it.kind !== "gridline" || it.pts.length < 2) continue;
    const horizontal = Math.abs(it.pts[1][0] - it.pts[0][0]) >= Math.abs(it.pts[1][1] - it.pts[0][1]);
    const label = typeof it.p.text === "string" ? it.p.text : "";
    if (alongX && !horizontal) grids.push({ u: along(it.pts[0][0], frame.o[1]), label });
    if (alongY && horizontal) grids.push({ u: along(frame.o[0], it.pts[0][1]), label });
  }
  for (const g of grids) {
    const lo = P(g.u, scene.grade - 1);
    const hi = P(g.u, top + 3);
    out.push(
      <g key={`grid-${g.label}-${g.u}`} data-testid="sheet-grid">
        <line x1={f1(lo.x)} x2={f1(hi.x)} y1={f1(lo.y)} y2={f1(hi.y)} stroke="#5a6578" strokeWidth={0.6} strokeDasharray="12 3 2 3" />
        <circle cx={f1(hi.x)} cy={f1(hi.y - 10)} r={9} fill="#fff" stroke="#1b2330" strokeWidth={0.9} />
        <text x={f1(hi.x)} y={f1(hi.y - 6.5)} fontSize={10} textAnchor="middle" fontWeight={600} fill="#1b2330" fontFamily="var(--font-ui)">{g.label}</text>
      </g>,
    );
  }

  // overall height, grade to the highest point
  const a = P(u0, scene.grade);
  const b = P(u0, top);
  const left = Math.min(P(u0, 0).x, P(u1, 0).x) - 26;
  out.push(
    <g key="height" stroke="#1b2330" strokeWidth={0.8} fill="none">
      <line x1={f1(left)} x2={f1(left)} y1={f1(a.y)} y2={f1(b.y)} />
      <line x1={f1(left - 4)} x2={f1(left + 4)} y1={f1(a.y)} y2={f1(a.y)} />
      <line x1={f1(left - 4)} x2={f1(left + 4)} y1={f1(b.y)} y2={f1(b.y)} />
      <text x={f1(left - 6)} y={f1((a.y + b.y) / 2)} fontSize={9.5} textAnchor="middle" fill="#1b2330" stroke="none" fontFamily="var(--font-data)" transform={`rotate(-90 ${f1(left - 6)} ${f1((a.y + b.y) / 2)})`}>
        {fmt(top - scene.grade)}
      </text>
    </g>,
  );
  return <g pointerEvents="none">{out}</g>;
}

/** The topography: the ground between contours shaded by height (lowest pale green to highest tan), the contour
 *  lines with their heights, the building footprint, finished grade, and a legend. */
function TopoAnnotations({ scene, proj, fmt }: { scene: Scene; proj: Projector; fmt: (ft: number) => string }) {
  if (scene.terrainGrid) return <SurveyAnnotations scene={scene} grid={scene.terrainGrid} proj={proj} fmt={fmt} />;
  const rings = scene.contours
    .map((c) => {
      let a2 = 0;
      c.pts.forEach((q, i) => {
        const r = c.pts[(i + 1) % c.pts.length];
        a2 += q[0] * r[1] - r[0] * q[1];
      });
      return { c, h: contourHeight(c), area: Math.abs(a2) / 2 };
    })
    .sort((a, b) => b.area - a.area);
  if (!rings.length) {
    return (
      <text x={DRAW.w / 2} y={DRAW.h / 2} fontSize={13} textAnchor="middle" fill="#5a6578" fontFamily="var(--font-ui)" data-testid="topo-empty">
        No topography in this project yet: import a survey or terrain (Insert → Terrain / Topography).
      </text>
    );
  }
  const hs = rings.map((r) => r.h);
  const lo = Math.min(...hs);
  const hi = Math.max(...hs);
  const ramp = (h: number) => {
    const t = hi > lo ? (h - lo) / (hi - lo) : 0.5;
    // pale green (low) → tan (high)
    const a = [207, 227, 196];
    const b = [214, 178, 128];
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
  };
  const d = (pts: V2[]) => pts.map(([x, y], i) => {
    const q = proj.project([x, y, 0]);
    return `${i ? "L" : "M"}${f1(q.x)},${f1(q.y)}`;
  }).join("") + "Z";
  const f = scene.footprint;
  const fp: V2[] = [[f.x0, f.y0], [f.x1, f.y0], [f.x1, f.y1], [f.x0, f.y1]];
  const mid = proj.project([(f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, 0]);
  const steps = [...new Set(hs)].sort((a, b) => b - a);
  return (
    <g pointerEvents="none" fontFamily="var(--font-data)" data-testid="topo">
      {rings.map(({ c, h }) => (
        <path key={c.id} d={d(c.pts)} fill={ramp(h)} stroke="#4d6a52" strokeWidth={0.9} data-testid="topo-band" />
      ))}
      {rings.map(({ c, h }) => {
        const q0 = c.pts[Math.floor(c.pts.length / 4)] ?? c.pts[0];
        const q = proj.project([q0[0], q0[1], 0]);
        return (
          <text key={`t-${c.id}`} x={f1(q.x)} y={f1(q.y)} fontSize={9} fill="#2f4a35" stroke="#fff" strokeWidth={2.5} paintOrder="stroke" data-testid="contour-label">
            {h >= 0 ? "+" : "−"}{fmt(Math.abs(h))}
          </text>
        );
      })}
      <path d={d(fp)} fill="#fff" fillOpacity={0.75} stroke="#1b2330" strokeWidth={1.2} />
      <text x={f1(mid.x)} y={f1(mid.y - 4)} fontSize={10} fontWeight={700} textAnchor="middle" fill="#1b2330" fontFamily="var(--font-ui)">
        BUILDING
      </text>
      <text x={f1(mid.x)} y={f1(mid.y + 9)} fontSize={8.5} textAnchor="middle" fill="#5a6578">
        FIN. GRADE {scene.grade >= 0 ? "+" : "−"}{fmt(Math.abs(scene.grade))}
      </text>
      <g transform={`translate(${DRAW.w - 150} 80)`} data-testid="topo-legend">
        <text x={0} y={0} fontSize={9} fontWeight={700} fill="#1b2330">EXISTING GRADE</text>
        {steps.map((h, i) => (
          <g key={h} transform={`translate(0 ${12 + i * 15})`}>
            <rect width={22} height={11} fill={ramp(h)} stroke="#4d6a52" strokeWidth={0.6} />
            <text x={28} y={9} fontSize={8.5} fill="#1b2330">{h >= 0 ? "+" : "−"}{fmt(Math.abs(h))}</text>
          </g>
        ))}
        <text x={0} y={22 + steps.length * 15} fontSize={8} fill="#5a6578">Contours from the survey.</text>
        <text x={0} y={32 + steps.length * 15} fontSize={8} fill="#5a6578">Higher ground is darker.</text>
      </g>
    </g>
  );
}

/** An imported survey: the ground shaded cell by cell by height, its contour lines and their heights, the building and a legend. */
function SurveyAnnotations({ scene, grid, proj, fmt }: { scene: Scene; grid: NonNullable<Scene["terrainGrid"]>; proj: Projector; fmt: (ft: number) => string }) {
  const lo = Math.min(...grid.z);
  const hi = Math.max(...grid.z);
  const ramp = (h: number) => {
    const t = hi > lo ? (h - lo) / (hi - lo) : 0.5;
    const a = [207, 227, 196];
    const b = [214, 178, 128];
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
  };
  const P = (x: number, y: number) => proj.project([x, y, 0]);
  const cells: ReactNode[] = [];
  for (let j = 0; j < grid.ny - 1; j++) {
    for (let i = 0; i < grid.nx - 1; i++) {
      const z = (grid.z[j * grid.nx + i] + grid.z[j * grid.nx + i + 1] + grid.z[(j + 1) * grid.nx + i] + grid.z[(j + 1) * grid.nx + i + 1]) / 4;
      const x0 = grid.x0 + i * grid.step;
      const y0 = grid.y0 + j * grid.step;
      const q = [P(x0, y0), P(x0 + grid.step, y0), P(x0 + grid.step, y0 + grid.step), P(x0, y0 + grid.step)];
      cells.push(<polygon key={`${i}-${j}`} points={q.map((p) => `${f1(p.x)},${f1(p.y)}`).join(" ")} fill={ramp(z)} stroke={ramp(z)} strokeWidth={0.4} />);
    }
  }
  const f = scene.footprint;
  const fp = [P(f.x0, f.y0), P(f.x1, f.y0), P(f.x1, f.y1), P(f.x0, f.y1)];
  const steps = 6;
  return (
    <g pointerEvents="none" fontFamily="var(--font-data)" data-testid="topo" data-survey>
      {cells}
      {scene.contours.map((c) => {
        const d = c.pts.map(([x, y], i) => {
          const q = P(x, y);
          return `${i ? "L" : "M"}${f1(q.x)},${f1(q.y)}`;
        }).join("") + (c.open ? "" : "Z");
        const mid = c.pts[Math.floor(c.pts.length / 2)];
        const m = P(mid[0], mid[1]);
        return (
          <g key={c.id}>
            <path d={d} fill="none" stroke="#4d6a52" strokeWidth={0.9} data-testid="topo-band" />
            <text x={f1(m.x)} y={f1(m.y)} fontSize={8.5} fill="#2f4a35" stroke="#fff" strokeWidth={2.5} paintOrder="stroke" data-testid="contour-label">
              {c.label}
            </text>
          </g>
        );
      })}
      <polygon points={fp.map((p) => `${f1(p.x)},${f1(p.y)}`).join(" ")} fill="#fff" fillOpacity={0.75} stroke="#1b2330" strokeWidth={1.2} />
      <g transform={`translate(${DRAW.w - 150} 80)`} data-testid="topo-legend">
        <text x={0} y={0} fontSize={9} fontWeight={700} fill="#1b2330">SURVEYED GROUND</text>
        {Array.from({ length: steps }, (_, i) => hi - ((hi - lo) * i) / (steps - 1)).map((h, i) => (
          <g key={i} transform={`translate(0 ${12 + i * 15})`}>
            <rect width={22} height={11} fill={ramp(h)} stroke="#4d6a52" strokeWidth={0.6} />
            <text x={28} y={9} fontSize={8.5} fill="#1b2330">{h >= 0 ? "+" : "−"}{fmt(Math.abs(h))}</text>
          </g>
        ))}
        <text x={0} y={22 + steps * 15} fontSize={8} fill="#5a6578">Heights relative to the</text>
        <text x={0} y={32 + steps * 15} fontSize={8} fill="#5a6578">finished floor (Level 1).</text>
        {typeof grid.seaLevel === "number" && (
          <>
            <text x={0} y={46 + steps * 15} fontSize={8} fill="#5a6578">Ground at the building ≈ {Math.round(grid.seaLevel)} ft</text>
            <text x={0} y={56 + steps * 15} fontSize={8} fill="#5a6578">above sea level (public data,</text>
            <text x={0} y={66 + steps * 15} fontSize={8} fill="#5a6578">approximate: not a survey).</text>
          </>
        )}
      </g>
    </g>
  );
}

/** Contour heights on the site plan. */
function SiteAnnotations({ scene, proj }: { scene: Scene; proj: Projector }) {
  return (
    <g pointerEvents="none" fontFamily="var(--font-data)">
      {scene.contours.map((c) => {
        const p = c.pts[Math.floor(c.pts.length / 4)] ?? c.pts[0];
        if (!p) return null;
        const q = proj.project([p[0], p[1], c.z]);
        return (
          <text key={c.id} x={f1(q.x)} y={f1(q.y)} fontSize={8.5} fill="#4d6a52" stroke="#fff" strokeWidth={2.5} paintOrder="stroke" data-testid="contour-label">
            {c.label ?? `${c.z >= 0 ? "+" : ""}${c.z.toFixed(1)}`}
          </text>
        );
      })}
    </g>
  );
}
