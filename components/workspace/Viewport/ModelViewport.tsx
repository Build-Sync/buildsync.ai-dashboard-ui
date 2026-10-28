/**
 * components/workspace/Viewport/ModelViewport.tsx
 *
 * WHAT   The workspace canvas: the 3D isometric model or the 2D floor plan, drawn by one SVG renderer
 *        (lib/scene/render.ts), with every pointer, touch, wheel and keyboard interaction on it: click to
 *        select, Shift / ⌘ / Ctrl-click to add, a dragged window to box-select, orbit, pan, zoom, walkthrough,
 *        the crosshair with dynamic input, the right-click menu, and two-finger pinch on touch screens.
 *        Overlays (selection, stress, simulation, solar path, callouts, UCS icon, ViewCube, navigation bar,
 *        section banner, viewport label) are layered on top. While a drawing or editing tool runs (store
 *        `session`), a click is a point or pick for the tool (snapped by OSNAP / ORTHO / POLAR / grid), the
 *        cursor shows the tool's rubber-band preview, right-click or double-click finishes the object, and a
 *        library component dropped on the canvas starts its tool. DraftLayer draws the flat marks. The 2D plan can
 *        show other storeys faded underneath (store `planShow`: the level below, or every level); room names
 *        and place labels follow the Labels switch (store `labels`) and stand up on stems in 3D; the site's
 *        property line (PropertyLine) lies on the ground in both views; furniture names follow `furnLabels`.
 * ROOM   The room view (the camera's `eye`): a double-click on a room's name, in 2D or 3D, stands you inside it
 *        (enterRoom). Inside, a drag looks around (it never moves walls), the wheel narrows or widens the field of
 *        view, a trackpad scroll looks around, the arrow keys walk and turn (Shift + ← → steps sideways), a click on
 *        another room's marker goes there and a double-click on the floor walks there (walkTo). The rooms of the
 *        storey get ceilings (withCeilings, which the picking skips), and the overlays that only make sense from
 *        outside (property line, selection outlines, draft marks, rulers …) step aside. RoomBar sits at the foot.
 * SNAP   As in AutoCAD: OSNAP markers name what the cursor locked onto; holding Shift while a tool runs flips
 *        ORTHO for that point; with OTRACK on, a snap point the cursor rests on for a moment is acquired (a
 *        small green cross) and the cursor then locks to the horizontal / vertical through it (dotted guide).
 * FOR    The centre of the workspace (Viewport/index.tsx). Camera and plan state live in the workspace store;
 *        this component turns input into store updates. The SVG renderer can later be swapped for Three.js
 *        behind this same boundary.
 * OS     With the Select tool a left drag selects or edits, as in Revit and AutoCAD: on empty space it draws a
 *        window (left to right: what is fully inside) or a crossing (right to left: whatever it touches); on an
 *        element it moves the selection (commitMove: joined walls stretch, doors and windows follow); on a grip
 *        of a selected drawn item it moves that point (commitGrip). Esc during such a drag puts it back. Alt +
 *        drag orbits (3D) or pans (2D); the other navigation tools drag as before (orbit, pan, zoom, walk); the
 *        middle button pans (Shift + middle orbits in 3D); Space + drag pans, which is the only pan a
 *        trackpad-only Mac has in 3D; Shift or ⌘ (Mac) / Ctrl (Windows, Linux) + drag adds a window to the
 *        selection. One finger on a touch screen still orbits / pans. Control-click on a Mac is a right
 *        click (context menu). A mouse wheel zooms, a trackpad scroll pans, a pinch zooms about the fingers
 *        (Chromium ctrl+wheel, Safari gesture events, touch pointers); Settings → Display → Scroll gesture can
 *        force zoom or pan (lib/input.ts).
 * OS     Pointer capture is wrapped in capture() because it throws for pointers that are already gone (quick
 *        taps, synthetic events).
 * DEBUG  - A tool click does nothing: the tool wants a click on something (a wall for DOOR); read the prompt in
 *          the tool bar. The point is on the active level's plane in 3D, so draw in the 2D plan for precision.
 *        - A double-click on a room's name does nothing: the viewport holds the pointer while it is pressed, so the
 *          double-click lands on the viewport; the name under the cursor is found with elementsFromPoint.
 *        - A drag never ends: pointerup is missed when the OS cancels the pointer; cancelDrag() clears the
 *          state on right-click, pointer cancel and pinch start.
 *        - Scrolling zooms when it should pan (or the reverse): the wheel classifier in lib/input.ts decides
 *          mouse vs trackpad; override it in Settings → Display.
 *        - The page scrolls or zooms instead of the canvas: the wheel and gesture listeners are added with {
 *          passive: false } in an effect so preventDefault works.
 *        - Clicks select nothing: elements need a data-el attribute (set by the renderer); locked layers or
 *          elements show an "is locked" toast instead.
 *        - Crosshair or dynamic input stuck: updateCursor writes straight to refs (no React render) and is
 *          throttled with requestAnimationFrame.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createWheelClassifier, interpretWheel } from "@/lib/input";
import { getPlatform, hasPrimaryModifier, isMacSecondaryClick } from "@/lib/platform";
import { materialUsage } from "@/lib/scene";
import { beginTool, commitGrip, commitMove, ghostShapes, snapConfig, toolClick, toolEnter, toolPreview } from "@/lib/draw";
import type { Preview } from "@/lib/draw/types";
import { POINT_SNAPS, snapPoint, type SnapResult } from "@/lib/draw/snap";
import { underlayLevels } from "@/lib/views";
import { GROUNDS } from "@/lib/ground";
import { FOV_MAX, FOV_MIN, ROOM_FOV, look, makeProjector, normBearing, orbit, stepEye, type Camera } from "@/lib/scene/camera";
import { enterRoom, runCommand, walkTo } from "@/lib/commands";
import { CEILING_ID, OWN_BUILDING, withCeilings } from "@/lib/draw/interior";
import { elementOutline, planCutFor, planLevelsFor, renderScene, type Tint } from "@/lib/scene/render";
import { sunVector, PROJECT_SUN_HOUR } from "@/lib/scene/sun";
import type { LayerId } from "@/lib/types";
import { useApp } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { buildSchedule, phaseStateAt } from "@/lib/timeline";
import { clamp, fmtCoord, fmtLength } from "@/lib/utils";
import { useEffectiveStyle, useRunner, useScene } from "../hooks";
import { chooseFurniture, COMPONENT_COMMAND } from "../ModelExplorer/Library";
import { DraftLayer } from "./DraftLayer";
import { NavBar } from "./NavBar";
import { ToolBar } from "./ToolBar";
import { Callouts, FurnitureLabels, NorthArrow, PlanAnnotations, RoomLabels3D, RoomMarkers, SelectionOverlay, SimVectors, SolarPath, StressLegend, StressSpots, UcsIcon, UtilityMarks, ViewportDefs } from "./Overlays";
import { RoomBar } from "./RoomBar";
import { LotLines, PropertyLine } from "./PropertyLine";
import { ViewCube } from "./ViewCube";
import { ViewportLabel } from "./ViewportLabel";
import { SectionBanner } from "./SectionBanner";

/* The workspace canvas: 3D isometric house or 2D plan, one SVG renderer.
 * Swap in Three.js / react-three-fiber later behind this same <Viewport/> boundary. */

type DragMode = "orbit" | "pan" | "zoom" | "walk" | "box" | "move" | "grip" | "look";


/** The 3D / 2D canvas with all of its input handling. */
export function ModelViewport() {
  const ws = useWsApi();
  const { ctx } = useRunner();
  const scene = useScene();
  const style = useEffectiveStyle();
  const rendering = useApp((s) => s.settings.rendering);
  const display = useApp((s) => s.settings.display);
  const units = useApp((s) => s.settings.units);

  const view = useWs((s) => s.view);
  const camera = useWs((s) => s.camera);
  const plan = useWs((s) => s.plan);
  const section = useWs((s) => s.section);
  const sectionY = useWs((s) => s.sectionY);
  const colors = useWs((s) => s.colors);
  const layersState = useWs((s) => s.project.layers);
  const hidden = useWs((s) => s.hidden);
  const isolated = useWs((s) => s.isolated);
  const selection = useWs((s) => s.selection);
  const hover = useWs((s) => s.hover);
  const proposals = useWs((s) => s.proposals);
  const materialHighlight = useWs((s) => s.materialHighlight);
  const timelineWindow = useWs((s) => s.timeline.window);
  const stressResult = useWs((s) => s.stressResult);
  const stressOverlay = useWs((s) => s.stressOverlay);
  const simResult = useWs((s) => s.simResult);
  const simVectors = useWs((s) => s.simVectors);
  const solar = useWs((s) => s.solar);
  const rulers = useWs((s) => s.rulers);
  const guides = useWs((s) => s.guides);
  const sectionBox = useWs((s) => s.sectionBox);
  const navTool = useWs((s) => s.navTool);
  const gridOn = useWs((s) => s.toggles.grid);
  const dynOn = useWs((s) => s.toggles.dyn);
  const showClashId = useWs((s) => s.showClashId);
  const clashes = useWs((s) => s.project.clashes);
  const schedule = useWs((s) => s.project.schedule);
  const projectCost = useWs((s) => s.project.cost.hard);
  const startDate = useWs((s) => s.project.startDate);
  const focus = useWs((s) => s.focus);
  const activeTool = useWs((s) => s.activeTool);
  const toolPrompt = useWs((s) => s.toolPrompt);
  const reviewMode = useWs((s) => s.reviewMode);
  const session = useWs((s) => s.session);
  const measure = useWs((s) => s.measure);
  const elColors = useWs((s) => s.elColors);
  const gridSnap = useApp((s) => s.settings.gridSnap);
  const planShow = useWs((s) => s.planShow);
  const labelsOn = useWs((s) => s.labels);
  const roomsOn = useWs((s) => s.roomLabels);
  const belowGrade = useWs((s) => s.belowGrade);
  const cutaway = useWs((s) => s.cutaway);
  const mepLook = useWs((s) => s.mepLook);
  const insideRoom = useWs((s) => s.insideRoom);
  const furnLabels = useWs((s) => s.furnLabels);
  const groundType = useWs((s) => s.project.ground ?? "lawn");
  const ground = useMemo(() => ({ side: GROUNDS[groundType].side, pattern: GROUNDS[groundType].pattern }), [groundType]);
  const site = useWs((s) => s.project.site);
  const projectLevels = useWs((s) => s.project.levels);
  /** what the running tool shows under the cursor, and where the cursor snapped */
  const [preview, setPreview] = useState<Preview | null>(null);
  const [snapMark, setSnapMark] = useState<{ pt: [number, number]; kind: string; guides?: SnapResult["guides"] } | null>(null);
  /** Shift held: ORTHO flips while a tool runs */
  const shiftRef = useRef(false);
  /** object snap tracking: the snap points acquired (rested on), newest last, and the one being rested on now */
  const trackRef = useRef<[number, number][]>([]);
  const [trackPts, setTrackPts] = useState<[number, number][]>([]);
  const acquire = useRef<{ key: string; timer: number } | null>(null);
  const hasPreview = useRef(false);

  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const crossH = useRef<SVGLineElement>(null);
  const crossV = useRef<SVGLineElement>(null);
  const crossBox = useRef<SVGRectElement>(null);
  const dynRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<SVGRectElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  /** Space held over the viewport: the next drag pans (the only pan a trackpad-only Mac has in 3D) */
  const [spacePan, setSpacePan] = useState(false);
  const spaceRef = useRef(false);
  const hovering = useRef(false);
  /** active touch points and the two-finger pinch built from them */
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Space + drag pans, as in most CAD and design tools. Only while the pointer is over the viewport and no text field has focus. */
  useEffect(() => {
    const typingIn = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !hovering.current || typingIn(e.target)) return;
      e.preventDefault(); // no page scroll, and no "click" on a focused button
      if (e.repeat) return;
      spaceRef.current = true;
      setSpacePan(true);
    };
    const release = () => {
      spaceRef.current = false;
      setSpacePan(false);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") release();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
    };
  }, []);

  /* effective camera + projector */
  const is2d = view === "2d";
  const cam: Camera = useMemo(
    () => (is2d ? { bearing: normBearing(180 + plan.rotation), pitch: 90, zoom: plan.zoom, panX: plan.panX, panY: plan.panY, perspective: false } : camera),
    [is2d, plan.rotation, plan.zoom, plan.panX, plan.panY, camera],
  );
  const proj = useMemo(() => makeProjector(cam, size, scene.center, scene.radius), [cam, size, scene]);
  /** standing inside a room: the camera has an eye; the rooms of its storey get ceilings while you are in there */
  const eyeOn = !is2d && !!camera.eye;
  const viewScene = useMemo(() => (eyeOn ? withCeilings(scene, plan.level) : scene), [eyeOn, scene, plan.level]);

  /* inputs to the renderer */
  const layerVis = useMemo(() => Object.fromEntries(layersState.map((l) => [l.id, l.visible])) as Partial<Record<LayerId, boolean>>, [layersState]);
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const isoSet = useMemo(() => (isolated ? new Set(isolated) : null), [isolated]);
  const sched = useMemo(() => buildSchedule({ schedule, startDate, cost: { hard: projectCost } } as Parameters<typeof buildSchedule>[0]), [schedule, startDate, projectCost]);
  const phaseState = useMemo(() => (timelineWindow ? phaseStateAt(sched, timelineWindow.to) : null), [timelineWindow, sched]);
  const sun = useMemo(() => sunVector(rendering.sunPosition === "custom" ? rendering.sunHour : PROJECT_SUN_HOUR), [rendering.sunPosition, rendering.sunHour]);

  const { tint, dimOthers } = useMemo(() => {
    const t: Record<string, Tint> = {};
    let dim = false;
    if (materialHighlight) {
      const ids = materialUsage(scene)[materialHighlight] ?? [];
      ids.forEach((id) => (t[id] = { color: "#4c8dff", amount: 0.55 }));
      dim = true;
    }
    proposals.forEach((p) => p.elementIds.forEach((id) => (t[id] = { color: "#f0a940", amount: 0.55 })));
    const clash = clashes.find((c) => c.id === showClashId);
    clash?.elementIds.forEach((id) => (t[id] = { color: "#ef5b5b", amount: 0.65 }));
    selection.forEach((id) => (t[id] = { color: "#4c8dff", amount: 0.4 }));
    return { tint: t, dimOthers: dim };
  }, [materialHighlight, proposals, showClashId, clashes, selection, scene]);

  // the foundation plan also shows what is below ground (footings, piers, the septic system), dashed
  const planCfg = useMemo(() => (is2d ? { cutZ: planCutFor(scene, plan.level), levels: planLevelsFor(plan.level), below: plan.level === "foundation" } : null), [is2d, scene, plan.level]);
  const underlay = useMemo(() => (is2d ? underlayLevels(plan.level, planShow, projectLevels.map((l) => l.id)) : []), [is2d, plan.level, planShow, projectLevels]);
  const cutY = section && !is2d ? sectionY : null;

  const rendered = useMemo(() => {
    if (!size.w || !size.h) return "";
    return renderScene({
      scene: viewScene,
      proj,
      style,
      plan: planCfg,
      sectionY: cutY,
      colors,
      layers: layerVis,
      hidden: hiddenSet,
      isolated: isoSet,
      phaseState,
      shadows: rendering.shadows && !dragging,
      edges: rendering.edges && !(dragging && rendering.quality === "draft"),
      tint,
      dimOthers,
      sun,
      ghostMep: true,
      elColors,
      // inside a room the Cutaway and Below Grade do not apply: you see the room as it is
      belowGrade: belowGrade && !eyeOn,
      ground,
      cutAt: !is2d && cutaway && !eyeOn ? planCutFor(scene, plan.level) : null,
      mepLook,
    }).svg;
  }, [size, scene, viewScene, proj, style, planCfg, cutY, colors, layerVis, hiddenSet, isoSet, phaseState, rendering.shadows, rendering.edges, rendering.quality, dragging, tint, dimOthers, sun, elColors, belowGrade, ground, is2d, cutaway, plan.level, mepLook, eyeOn]);

  /* the other storeys, drawn faded under the plan (Underlay) */
  const underlaySvg = useMemo(() => {
    if (!size.w || !size.h || !underlay.length) return "";
    return underlay
      .map(
        (level) =>
          renderScene({
            scene,
            proj,
            style,
            plan: { cutZ: planCutFor(scene, level), levels: [level] },
            sectionY: null,
            colors,
            layers: layerVis,
            hidden: hiddenSet,
            isolated: isoSet,
            phaseState,
            shadows: false,
            edges: true,
            tint: {},
            dimOthers: false,
            sun,
            ghostMep: true,
            elColors,
          }).svg,
      )
      .join("");
  }, [size, underlay, scene, proj, style, colors, layerVis, hiddenSet, isoSet, phaseState, sun, elColors]);

  const draftIds = useMemo(() => new Set((scene.drafts ?? []).map((d) => d.id)), [scene]);
  const planLevels = useMemo(() => (is2d ? planLevelsFor(plan.level) : null), [is2d, plan.level]);
  const units3 = useMemo(() => ({ system: units.system, precision: units.precision }), [units.system, units.precision]);

  /* ── frame requested elements ─────────────────────────────────────── */
  const lastFocus = useRef(0);
  useEffect(() => {
    if (!focus || focus.n === lastFocus.current || !size.w) return;
    lastFocus.current = focus.n;
    const els = focus.ids.map((id) => scene.elementById[id]).filter(Boolean);
    if (!els.length || (!is2d && cam.eye)) return;
    const base = makeProjector({ ...cam, zoom: 1, panX: 0, panY: 0 }, size, scene.center, scene.radius);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const el of els) {
      const o = elementOutline(el, base);
      for (const [x, y] of o.hull) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
    const zoom = clamp(Math.min((size.w * 0.42) / Math.max(x1 - x0, 20), (size.h * 0.42) / Math.max(y1 - y0, 20)), 1, is2d ? 6 : 4.5) * (is2d ? 0.55 : 1);
    const cx = (x0 + x1) / 2 - size.w / 2;
    const cy = (y0 + y1) / 2 - size.h / 2;
    const z = is2d ? zoom * plan.zoom : zoom;
    if (is2d) ws.getState().setPlan({ zoom: z, panX: -cx * (z / 1), panY: -cy * (z / 1) });
    else ws.getState().setCamera({ zoom: z, panX: -cx * z, panY: -cy * z });
  }, [focus, size, scene, cam, is2d, plan.zoom, ws]);

  /* ── pointer interaction ──────────────────────────────────────────── */
  const drag = useRef<{
    mode: DragMode;
    x: number;
    y: number;
    moved: boolean;
    el: string | null;
    button: number;
    startCam: Camera;
    startPlan: typeof plan;
    shift: boolean;
    /** move: what is being dragged and the snapped point where the drag began */
    ids?: string[];
    start?: [number, number];
    /** grip: the drawn item and which of its points is dragged */
    grip?: { id: string; index: number };
    /** move / grip: the snapped displacement or point while dragging */
    to?: [number, number];
    /** a room name or marker pressed (a click on one in a room view goes there) */
    room?: string | null;
  } | null>(null);
  const raf = useRef(0);

  // the ceilings of a room view are not elements: a click on one picks nothing
  const pickEl = (t: EventTarget | null): string | null => {
    const id = (t as Element | null)?.closest?.("[data-el]")?.getAttribute("data-el") ?? null;
    return id && !id.startsWith(CEILING_ID) ? id : null;
  };

  /** The point a click at these client coordinates lands on: on the active level's plane, snapped by the status-bar toggles. */
  const snapAt = useCallback(
    (clientX: number, clientY: number, from?: [number, number] | null) => {
      const r = svgRef.current?.getBoundingClientRect();
      if (!r) return null;
      const x = clientX - r.left;
      const y = clientY - r.top;
      const raw = proj.unproject(x, y, scene.levelZ[plan.level]);
      if (!raw) return null;
      const st = ws.getState();
      const last = from !== undefined ? from : st.session?.pts.length ? st.session.pts[st.session.pts.length - 1] : null;
      const cfg = snapConfig(st, { snapSpacing: gridSnap.snapSpacing, polarAngle: gridSnap.polarAngle, osnap: gridSnap.osnap }, units.system);
      // AutoCAD: holding Shift while drawing flips ORTHO for this point
      if (st.session && shiftRef.current) cfg.ortho = !cfg.ortho;
      const res = snapPoint(raw, last, scene, plan.level, cfg, 10 / Math.max(proj.scale, 0.01), trackRef.current);
      return { ...res, x, y };
    },
    [proj, scene, plan.level, ws, gridSnap.snapSpacing, gridSnap.polarAngle, gridSnap.osnap, units.system],
  );

  const updateCursor = useCallback(
    (clientX: number, clientY: number, over: boolean) => {
      const r = svgRef.current?.getBoundingClientRect();
      if (!r) return;
      const x = clientX - r.left;
      const y = clientY - r.top;
      const showCross = over && navTool === "select" && !spaceRef.current;
      const frac = display.crosshairSize / 100;
      if (crossH.current && crossV.current && crossBox.current) {
        const hw = (size.w * frac) / 2;
        const hh = (size.h * frac) / 2;
        crossH.current.setAttribute("x1", String(x - hw));
        crossH.current.setAttribute("x2", String(x + hw));
        crossH.current.setAttribute("y1", String(y));
        crossH.current.setAttribute("y2", String(y));
        crossV.current.setAttribute("y1", String(y - hh));
        crossV.current.setAttribute("y2", String(y + hh));
        crossV.current.setAttribute("x1", String(x));
        crossV.current.setAttribute("x2", String(x));
        crossBox.current.setAttribute("x", String(x - 4));
        crossBox.current.setAttribute("y", String(y - 4));
        const vis = showCross ? "visible" : "hidden";
        crossH.current.style.visibility = vis;
        crossV.current.style.visibility = vis;
        crossBox.current.style.visibility = vis;
      }
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        const z = scene.levelZ[ws.getState().plan.level];
        const hasTool = !!ws.getState().session;
        const sn = over && hasTool ? snapAt(clientX, clientY) : null;
        const w = sn ? sn.pt : proj.unproject(x, y, z);
        if (!over || !w) {
          ws.getState().setCursor(null);
          if (dynRef.current) dynRef.current.style.visibility = "hidden";
          if (hasPreview.current) {
            hasPreview.current = false;
            setPreview(null);
            setSnapMark(null);
          }
          return;
        }
        ws.getState().setCursor({ x: w[0], y: w[1], z });
        if (hasTool && sn) {
          const pv = toolPreview(ctx, sn.pt);
          hasPreview.current = true;
          setPreview(pv);
          setSnapMark({ pt: sn.pt, kind: sn.kind, guides: sn.guides });
          // object snap tracking: resting on a snap point for a moment acquires it
          if (POINT_SNAPS.has(sn.kind) && ws.getState().toggles.otrack) {
            const pt = sn.pt as [number, number];
            const key = `${pt[0].toFixed(4)},${pt[1].toFixed(4)}`;
            if (acquire.current?.key !== key) {
              if (acquire.current) clearTimeout(acquire.current.timer);
              acquire.current = {
                key,
                timer: window.setTimeout(() => {
                  const rest = trackRef.current.filter((q) => Math.hypot(q[0] - pt[0], q[1] - pt[1]) > 1e-6);
                  trackRef.current = [...rest, pt].slice(-3);
                  setTrackPts(trackRef.current);
                }, 450),
              };
            }
          } else if (acquire.current) {
            clearTimeout(acquire.current.timer);
            acquire.current = null;
          }
        } else if (hasPreview.current) {
          hasPreview.current = false;
          setPreview(null);
          setSnapMark(null);
        }
        const d = dynRef.current;
        if (d) {
          const tool = ws.getState().activeTool;
          d.style.visibility = dynOn && (tool || toolPrompt) ? "visible" : "hidden";
          d.style.left = `${x + 16}px`;
          d.style.top = `${y + 16}px`;
          d.textContent = `${fmtCoord(w[0], units.system, units.precision)}, ${fmtCoord(w[1], units.system, units.precision)}${toolPrompt ? `  ${toolPrompt}` : ""}`;
        }
      });
    },
    [display.crosshairSize, size.w, size.h, navTool, proj, ws, dynOn, units.system, units.precision, toolPrompt, scene, snapAt, ctx],
  );

  /* a tool that ended (Esc, Finish, another command) leaves no preview and no tracking points behind */
  const sessionOn = !!session;
  useEffect(() => {
    if (sessionOn) return;
    if (hasPreview.current) {
      hasPreview.current = false;
      setPreview(null);
      setSnapMark(null);
    }
    if (acquire.current) clearTimeout(acquire.current.timer);
    acquire.current = null;
    if (trackRef.current.length) {
      trackRef.current = [];
      setTrackPts([]);
    }
  }, [sessionOn]);

  /* Shift flips ORTHO while drawing: keep track of it even when the mouse does not move */
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftRef.current = e.type === "keydown";
    };
    const off = () => (shiftRef.current = false);
    window.addEventListener("keydown", on);
    window.addEventListener("keyup", on);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("keydown", on);
      window.removeEventListener("keyup", on);
      window.removeEventListener("blur", off);
    };
  }, []);

  /** zoom by factor `f`, keeping the point under (mx, my) fixed */
  const zoomAbout = useCallback(
    (f: number, mx: number, my: number) => {
      const s = ws.getState();
      if (s.view === "3d" && s.camera.eye) {
        s.setCamera({ fov: clamp((s.camera.fov ?? ROOM_FOV) / f, FOV_MIN, FOV_MAX) });
        return;
      }
      if (s.view === "2d") {
        const z = clamp(s.plan.zoom * f, 0.4, 12);
        const k = 1 - z / s.plan.zoom;
        s.setPlan({ zoom: z, panX: s.plan.panX + (mx - (size.w / 2 + s.plan.panX)) * k, panY: s.plan.panY + (my - (size.h / 2 + s.plan.panY)) * k });
      } else {
        const z = clamp(s.camera.zoom * f, 0.3, 14);
        const k = 1 - z / s.camera.zoom;
        s.setCamera({ zoom: z, panX: s.camera.panX + (mx - (size.w / 2 + s.camera.panX)) * k, panY: s.camera.panY + (my - (size.h / 2 + s.camera.panY)) * k });
      }
    },
    [ws, size.w, size.h],
  );
  const panBy = useCallback(
    (dx: number, dy: number) => {
      const s = ws.getState();
      if (s.view === "2d") s.setPlan({ panX: s.plan.panX + dx, panY: s.plan.panY + dy });
      else if (s.camera.eye) s.setCamera(look(s.camera, dx, dy));
      else s.setCamera({ panX: s.camera.panX + dx, panY: s.camera.panY + dy });
    },
    [ws],
  );

  /** keep receiving this pointer's events outside the viewport; throws if the pointer is already gone (a quick tap) */
  const capture = (e: React.PointerEvent<SVGSVGElement>) => {
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer no longer active: nothing to capture */
    }
  };

  /** abandon any drag in progress (right click, pointer cancelled by the OS, pinch started, Esc) */
  const cancelDrag = () => {
    const wasEditing = drag.current?.mode === "move" || drag.current?.mode === "grip";
    drag.current = null;
    setDragging(false);
    if (boxRef.current) boxRef.current.style.visibility = "hidden";
    if (wasEditing) {
      hasPreview.current = false;
      setPreview(null);
      setSnapMark(null);
    }
  };

  /** Can a drag starting on this element move it? (not the terrain or landscape, nothing locked) */
  const movable = (id: string): boolean => {
    const el = scene.elementById[id];
    if (!el || el.layer === "topography" || el.layer === "landscape" || el.category === "Paving") return false;
    const st = ws.getState();
    return !st.locked.includes(id) && !st.project.layers.find((l) => l.id === el.layer)?.locked;
  };

  /* Esc while dragging an element or a grip puts it back */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = drag.current?.mode;
      if (e.key === "Escape" && (m === "move" || m === "grip")) {
        e.stopPropagation();
        cancelDrag();
        ctx.app.getState().log("info", "*Cancel*");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 2) return;
    const platform = getPlatform();
    // macOS turns Control+click into a right click: the contextmenu event that follows opens our menu,
    // and no pointerup would ever end a drag started here
    if (isMacSecondaryClick(e, platform)) return;
    // two fingers on a touch screen: pinch to zoom, drag to pan
    if (e.pointerType === "touch") {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        cancelDrag();
        const [a, b] = [...touches.current.values()];
        pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        capture(e);
        return;
      }
    }
    capture(e);
    // ⌘ on a Mac, Ctrl elsewhere: with Shift it draws a selection window and adds to the selection
    const additive = e.shiftKey || hasPrimaryModifier(e, platform);
    let mode: DragMode;
    const el = pickEl(e.target);
    const gripAttr = (e.target as Element | null)?.closest?.("[data-grip]")?.getAttribute("data-grip") ?? null;
    // with the Select tool a mouse drag selects (on empty space) or moves (on an element), as in Revit and AutoCAD;
    // touch keeps one-finger orbit / pan, and Alt + drag, the middle button or Space + drag still navigate
    const selecting = navTool === "select" && !ws.getState().session && e.pointerType !== "touch";
    if (eyeOn && e.button !== 2 && !spaceRef.current && !gripAttr) mode = "look";
    else if (e.button === 1) mode = e.shiftKey && !is2d ? "orbit" : "pan";
    else if (spaceRef.current) mode = "pan";
    else if (selecting && e.altKey) mode = is2d ? "pan" : "orbit";
    else if (selecting && gripAttr) mode = "grip";
    else if (additive && !ws.getState().session) mode = "box";
    else if (selecting) mode = el && movable(el) ? "move" : "box";
    else if (navTool === "pan") mode = "pan";
    else if (navTool === "zoom") mode = "zoom";
    else if (navTool === "walk" && !is2d) mode = "walk";
    else if (navTool === "orbit" && !is2d) mode = "orbit";
    else mode = is2d ? "pan" : "orbit";
    const sn = mode === "move" || mode === "grip" ? snapAt(e.clientX, e.clientY, null) : null;
    const grip = gripAttr ? { id: gripAttr.slice(0, gripAttr.lastIndexOf(":")), index: Number(gripAttr.slice(gripAttr.lastIndexOf(":") + 1)) } : undefined;
    drag.current = { mode, x: e.clientX, y: e.clientY, moved: false, el, button: e.button, startCam: ws.getState().camera, startPlan: ws.getState().plan, shift: additive, start: sn ? (sn.pt as [number, number]) : undefined, grip, room: (e.target as Element | null)?.closest?.("[data-room]")?.getAttribute("data-room") ?? null };
    if (e.button === 1) e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "touch" && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.current && touches.current.size === 2) {
        const [a, b] = [...touches.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const r = svgRef.current!.getBoundingClientRect();
        zoomAbout(dist / pinch.current.dist, cx - r.left, cy - r.top);
        panBy(cx - pinch.current.cx, cy - pinch.current.cy);
        pinch.current = { dist, cx, cy };
        return;
      }
    }
    shiftRef.current = e.shiftKey;
    const d = drag.current;
    if (!d) {
      const id = pickEl(e.target);
      ws.getState().setHover(id);
      updateCursor(e.clientX, e.clientY, true);
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
      // dragging an element that is not selected selects it (and its group) first
      if (d.mode === "move" && d.el) {
        const st = ws.getState();
        if (!st.selection.includes(d.el)) st.select([d.el]);
        d.ids = ws.getState().selection.filter((id) => movable(id));
      }
    }
    const s = ws.getState();
    if (d.mode === "move" || d.mode === "grip") {
      const it = d.grip ? scene.items?.[d.grip.id] : undefined;
      // ORTHO / POLAR work from where the drag began (a grip: from the point's own starting position)
      const anchor = d.mode === "grip" && it ? (it.pts[d.grip!.index] ?? null) : (d.start ?? null);
      const sn = snapAt(e.clientX, e.clientY, anchor as [number, number] | null);
      if (!sn || !d.start) return;
      const pt = sn.pt as [number, number];
      hasPreview.current = true;
      setSnapMark({ pt, kind: sn.kind });
      if (d.mode === "move") {
        const dv: [number, number] = [pt[0] - d.start[0], pt[1] - d.start[1]];
        d.to = dv;
        const len = Math.hypot(dv[0], dv[1]);
        setPreview({ shapes: [...ghostShapes(scene, d.ids ?? [], [1, 0, 0, 1, dv[0], dv[1]]), { pts: [d.start, pt], tone: "ghost", dashed: true }], labels: [{ at: pt, text: `${fmtLength(len, units.system, units.precision)}` }] });
      } else if (it) {
        d.to = pt;
        const pts = it.pts.map((q, i) => (i === d.grip!.index ? pt : q));
        setPreview({ shapes: [{ pts, closed: !!it.closed || it.kind === "rect", tone: "ghost" }], labels: [{ at: pt, text: `${fmtCoord(pt[0], units.system, units.precision)}, ${fmtCoord(pt[1], units.system, units.precision)}` }] });
      }
      return;
    }
    updateCursor(e.clientX, e.clientY, true);
    switch (d.mode) {
      case "orbit":
        s.setCamera(orbit(d.startCam, dx, dy));
        break;
      case "look":
        s.setCamera(look(d.startCam, dx, dy));
        break;
      case "walk":
        s.setCamera({ bearing: normBearing(d.startCam.bearing - dx * 0.4), zoom: clamp(d.startCam.zoom * Math.exp(-dy * 0.006), 0.4, 14) });
        break;
      case "pan":
        if (is2d) s.setPlan({ panX: d.startPlan.panX + dx, panY: d.startPlan.panY + dy });
        else s.setCamera({ panX: d.startCam.panX + dx, panY: d.startCam.panY + dy });
        break;
      case "zoom": {
        const f = Math.exp(-dy * 0.01);
        if (is2d) s.setPlan({ zoom: clamp(d.startPlan.zoom * f, 0.4, 12) });
        else s.setCamera({ zoom: clamp(d.startCam.zoom * f, 0.3, 14) });
        break;
      }
      case "box": {
        const r = svgRef.current!.getBoundingClientRect();
        const b = boxRef.current;
        if (b) {
          const x0 = Math.min(d.x, e.clientX) - r.left;
          const y0 = Math.min(d.y, e.clientY) - r.top;
          b.setAttribute("x", String(x0));
          b.setAttribute("y", String(y0));
          b.setAttribute("width", String(Math.abs(dx)));
          b.setAttribute("height", String(Math.abs(dy)));
          // left to right: a window (only what is fully inside); right to left: crossing (whatever it touches)
          const crossing = e.clientX < d.x;
          b.style.stroke = crossing ? "#3ecf8e" : "var(--accent)";
          b.style.fill = crossing ? "#3ecf8e" : "var(--accent)";
          b.setAttribute("stroke-dasharray", crossing ? "6 4" : "0");
          b.setAttribute("data-crossing", crossing ? "1" : "0");
          b.style.visibility = "visible";
        }
        break;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "touch") {
      touches.current.delete(e.pointerId);
      if (pinch.current) {
        // the pinch ends when the first finger lifts; the remaining finger must not start a click or drag
        if (touches.current.size < 2) pinch.current = null;
        return;
      }
    }
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (boxRef.current) boxRef.current.style.visibility = "hidden";
    if (!d) return;
    const s = ws.getState();
    if (d.mode === "grip" && !d.moved) return; // a click on a grip keeps the selection
    if ((d.mode === "move" || d.mode === "grip") && d.moved) {
      hasPreview.current = false;
      setPreview(null);
      setSnapMark(null);
      if (d.mode === "move" && d.to && d.ids?.length && Math.hypot(d.to[0], d.to[1]) > 1e-6) commitMove(ctx, d.ids, d.to);
      if (d.mode === "grip" && d.grip && d.to) commitGrip(ctx, d.grip.id, d.grip.index, d.to);
      return;
    }
    if (d.mode === "box" && d.moved) {
      const r = svgRef.current!.getBoundingClientRect();
      const x0 = Math.min(d.x, e.clientX) - r.left;
      const x1 = Math.max(d.x, e.clientX) - r.left;
      const y0 = Math.min(d.y, e.clientY) - r.top;
      const y1 = Math.max(d.y, e.clientY) - r.top;
      const crossing = e.clientX < d.x;
      const picked: string[] = [];
      for (const el of scene.elements) {
        if (layerVis[el.layer] === false || hiddenSet.has(el.id) || el.layer === "topography") continue;
        if (isoSet && !isoSet.has(el.id)) continue;
        // in the plan, only what the plan of this level shows
        if (planLevels && !planLevels.includes(scene.items?.[el.id]?.level ?? el.level)) continue;
        const o = elementOutline(el, proj);
        const bx0 = o.box.x;
        const bx1 = o.box.x + o.box.w;
        const by0 = o.box.y;
        const by1 = o.box.y + o.box.h;
        const hit = crossing ? bx1 >= x0 && bx0 <= x1 && by1 >= y0 && by0 <= y1 : bx0 >= x0 && bx1 <= x1 && by0 >= y0 && by1 <= y1;
        if (hit) picked.push(el.id);
      }
      s.select(picked, d.shift);
      ctx.app.getState().log("ok", `✓ ${picked.length} element(s) selected by ${crossing ? "crossing" : "window"}`);
      return;
    }
    // in a room view, a click on another room's marker goes there
    if (!d.moved && d.button === 0 && eyeOn && d.room && !s.session) {
      enterRoom(ctx, d.room);
      return;
    }
    // a plain click while a drawing / editing tool runs is a point (or pick) for the tool
    if (!d.moved && d.button === 0 && s.session) {
      const sn = snapAt(e.clientX, e.clientY);
      if (sn) toolClick(ctx, { pt: sn.pt, at: (z) => proj.unproject(sn.x, sn.y, z), hit: d.el, shift: d.shift });
      return;
    }
    if (!d.moved && d.button === 0) {
      const id = d.el;
      if (!id) {
        if (!d.shift) s.clearSelection();
        return;
      }
      const el = scene.elementById[id];
      const layer = s.project.layers.find((l) => l.id === el?.layer);
      if (layer?.locked || s.locked.includes(id)) {
        ctx.app.getState().toast(`${el?.name ?? id} is locked`, "warn");
        return;
      }
      if (s.activeTool === "COMMENT") {
        s.setPanel("comments");
        s.select([id]);
        s.setTool(null);
        return;
      }
      s.select([id], d.shift);
      // selecting switches the palette to Properties, but never pops open a palette window the user minimised
      if (s.docks.palettes && s.dockSize.palettes !== "min" && s.panel !== "properties" && !["stress-test", "simulation", "council"].includes(s.panel)) s.setPanel("properties");
    }
  };

  /* Wheel, trackpad scroll and pinch (needs non-passive listeners so the page doesn't scroll or zoom).
   * What a scroll does follows Settings → Display → Scroll gesture; pinch always zooms about the fingers. */
  const scrollPref = display.scrollGesture;
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const classify = createWheelClassifier();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const out = interpretWheel(e as WheelEvent & { wheelDeltaY?: number }, scrollPref, classify(e as WheelEvent & { wheelDeltaY?: number }));
      if (out.zoom !== 1) zoomAbout(out.zoom, e.clientX - r.left, e.clientY - r.top);
      if (out.panX || out.panY) panBy(out.panX, out.panY);
    };
    // Safari reports trackpad pinch as non-standard gesture events instead of ctrl+wheel
    type SafariGesture = Event & { scale: number; clientX: number; clientY: number };
    let lastScale = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      lastScale = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as SafariGesture;
      const r = el.getBoundingClientRect();
      zoomAbout(g.scale / lastScale, g.clientX - r.left, g.clientY - r.top);
      lastScale = g.scale;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    el.addEventListener("gestureend", onGestureStart);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", onGestureStart);
    };
  }, [scrollPref, zoomAbout, panBy]);

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    cancelDrag(); // the menu swallows the matching pointerup on some platforms
    // with a tool running, right-click finishes the object being drawn (like Enter) instead of opening the menu
    const sess = ws.getState().session;
    if (sess && (sess.pts.length || sess.picks.length)) {
      toolEnter(ctx);
      return;
    }
    const id = pickEl(e.target);
    const s = ws.getState();
    if (id && !s.selection.includes(id)) s.select([id]);
    s.setContextMenu({ x: e.clientX, y: e.clientY });
  };

  /** A library component dropped on the viewport: start its tool and give it the drop point. */
  const onDrop = (e: React.DragEvent) => {
    const label = e.dataTransfer.getData("application/x-bs-component");
    const command = COMPONENT_COMMAND[label];
    if (!command) return;
    e.preventDefault();
    const sn = snapAt(e.clientX, e.clientY);
    if (!sn) return;
    const hit = (document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.hasAttribute("data-el")) as Element | undefined)?.getAttribute("data-el") ?? null;
    // a piece of furniture from the Library's catalogue: the FURN tool places that piece
    const piece = e.dataTransfer.getData("application/x-bs-furniture");
    if (piece) chooseFurniture(ws, piece);
    if (ws.getState().session?.tool !== command) beginTool(ctx, command);
    toolClick(ctx, { pt: sn.pt, at: (z) => proj.unproject(sn.x, sn.y, z), hit, shift: false });
  };

  const walk = () => void runCommand(ctx, "3DWALK");

  /* the room view: the arrow keys walk and turn (Shift + ← → steps sideways), while the pointer is over the view
     or nothing else has the keyboard */
  useEffect(() => {
    if (!eyeOn) return;
    const keys: Record<string, [number, number, number]> = { ArrowUp: [1.5, 0, 0], ArrowDown: [-1.5, 0, 0], ArrowLeft: [0, 0, 10], ArrowRight: [0, 0, -10] };
    const down = (e: KeyboardEvent) => {
      const k = keys[e.key];
      const t = e.target as HTMLElement | null;
      if (!k || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) && !hovering.current)) return;
      e.preventDefault();
      e.stopPropagation();
      const s = ws.getState();
      if (e.shiftKey && k[2]) s.setCamera(stepEye(s.camera, 0, k[2] > 0 ? -1.5 : 1.5));
      else if (k[2]) s.setCamera({ bearing: normBearing(s.camera.bearing + k[2]) });
      else s.setCamera(stepEye(s.camera, k[0], 0));
    };
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  }, [eyeOn, ws]);

  /* dot grid spacing follows zoom */
  const gridPx = clamp(proj.scale * 2, 14, 64);
  const gridOx = (size.w / 2 + cam.panX) % gridPx;
  const gridOy = (size.h / 2 + cam.panY) % gridPx;
  const bg = display.background ?? "var(--bg-viewport)";
  const crossColor = "var(--vp-ink)";
  const calloutsOn = layerVis.callouts !== false;

  const clashEls = showClashId ? (clashes.find((c) => c.id === showClashId)?.elementIds ?? []) : [];

  return (
    <div ref={wrap} className="relative min-h-0 flex-1 overflow-hidden" style={{ background: bg }} data-testid="viewport">
      <svg
        ref={svgRef}
        role="img"
        aria-label={is2d ? "2D floor plan" : "3D model viewport"}
        className={`bs-keep-colors absolute inset-0 h-full w-full touch-none select-none ${spacePan ? (dragging ? "cursor-grabbing" : "cursor-grab") : navTool === "select" ? "cursor-crosshair-none" : navTool === "pan" ? "cursor-grab" : navTool === "orbit" ? "cursor-move" : navTool === "zoom" ? "cursor-zoom-in" : "cursor-move"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          touches.current.delete(e.pointerId);
          pinch.current = null;
          cancelDrag();
        }}
        onPointerEnter={() => {
          hovering.current = true;
        }}
        onPointerLeave={() => {
          hovering.current = false;
          if (!drag.current) {
            ws.getState().setHover(null);
            updateCursor(0, 0, false);
          }
        }}
        onContextMenu={onContextMenu}
        onDoubleClick={(e) => {
          if (ws.getState().session) return toolEnter(ctx);
          // the viewport holds the pointer while it is pressed, so the double-click lands on it: look under the cursor
          const room = document.elementsFromPoint(e.clientX, e.clientY).map((n) => n.closest("[data-room]")).find(Boolean)?.getAttribute("data-room");
          if (room) return void enterRoom(ctx, room);
          if (!eyeOn) return;
          const r = svgRef.current!.getBoundingClientRect();
          const pt = proj.unproject(e.clientX - r.left, e.clientY - r.top, scene.levelZ[plan.level] ?? 0);
          if (pt) walkTo(ctx, pt);
        }}
        onDragOver={(e) => e.dataTransfer.types.includes("application/x-bs-component") && e.preventDefault()}
        onDrop={onDrop}
      >
        <ViewportDefs />
        {gridOn && (
          <>
            <pattern id="bs-dots" x={gridOx} y={gridOy} width={gridPx} height={gridPx} patternUnits="userSpaceOnUse">
              <circle cx={0} cy={0} r={0.9} style={{ fill: "var(--vp-grid)" }} />
            </pattern>
            <rect width="100%" height="100%" fill="url(#bs-dots)" pointerEvents="none" />
          </>
        )}
        {guides && !eyeOn && <Guides proj={proj} scene={scene} />}
        {underlaySvg && (
          <>
            {/* the other storeys in a blue halftone, as Revit draws an underlay */}
            <filter id="bs-underlay" colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values="0.064 0.215 0.022 0 0.05  0.117 0.393 0.040 0 0.12  0.213 0.715 0.072 0 0.25  0 0 0 1 0" />
            </filter>
            <g data-testid="plan-underlay" data-levels={underlay.join(" ")} opacity={0.55} filter="url(#bs-underlay)" pointerEvents="none" dangerouslySetInnerHTML={{ __html: underlaySvg }} />
          </>
        )}
        <g data-testid="scene" dangerouslySetInnerHTML={{ __html: rendered }} />
        {is2d && <PlanAnnotations scene={scene} proj={proj} level={plan.level} showGrid rooms={roomsOn} />}
        {is2d && (plan.level === "level1" || plan.level === "foundation") && layerVis.utilities !== false && <UtilityMarks scene={scene} proj={proj} outlines={plan.level !== "foundation"} />}
        {scene.lots && layerVis.site !== false && !eyeOn && <LotLines lots={scene.lots} proj={proj} z={is2d ? 0 : scene.grade} />}
        {site?.boundary && layerVis.site !== false && !eyeOn && <PropertyLine site={site} proj={proj} z={is2d ? 0 : scene.grade} plan={is2d} fmt={(ft) => fmtLength(ft, units.system, units.precision)} metric={units.system !== "imperial"} labels={labelsOn} />}
        {!is2d && roomsOn && !eyeOn && <RoomLabels3D scene={scene} proj={proj} cutY={cutY} />}
        {furnLabels && <FurnitureLabels scene={scene} proj={proj} level={is2d ? plan.level : null} />}
        {eyeOn && <RoomMarkers scene={scene} proj={proj} level={plan.level} here={insideRoom} building={scene.rooms.find((r) => r.id === insideRoom)?.building?.id ?? OWN_BUILDING} />}
        {!is2d && !eyeOn && section && calloutsOn && <Callouts callouts={scene.callouts} proj={proj} sectionY={cutY} />}
        {stressOverlay && stressResult && !eyeOn && <StressSpots scene={scene} proj={proj} result={stressResult} sectionY={cutY} />}
        {simVectors && simResult && !eyeOn && <SimVectors scene={scene} proj={proj} result={simResult} />}
        {solar && !eyeOn && <SolarPath scene={scene} proj={proj} hour={rendering.sunPosition === "custom" ? rendering.sunHour : PROJECT_SUN_HOUR} />}
        {sectionBox && !eyeOn && <SectionBoxOverlay proj={proj} scene={scene} />}
        {!eyeOn && clashEls.map((id) => {
          const el = scene.elementById[id];
          if (!el) return null;
          const o = elementOutline(el, proj);
          return <circle key={id} cx={o.box.x + o.box.w / 2} cy={o.box.y + o.box.h / 2} r={Math.max(o.box.w, o.box.h) / 2 + 14} fill="none" stroke="var(--bad)" strokeWidth={2} className="anim-pulse" pointerEvents="none" />;
        })}
        {!eyeOn && <DraftLayer scene={scene} proj={proj} levels={planLevels} layerVis={layerVis} hidden={hiddenSet} isolated={isoSet} selection={selection} hover={hover} preview={preview} snap={snapMark} measure={measure} units={units3} labels={labelsOn} rooms={roomsOn} />}
        {session &&
          trackPts.map((q, i) => {
            const t = proj.project([q[0], q[1], scene.levelZ[plan.level]]);
            return <path key={i} d={`M${(t.x - 4).toFixed(1)},${t.y.toFixed(1)}h8M${t.x.toFixed(1)},${(t.y - 4).toFixed(1)}v8`} stroke="#3ecf8e" strokeWidth={1.6} pointerEvents="none" data-testid="track-point" />;
          })}
        {!eyeOn && <SelectionOverlay scene={scene} proj={proj} selection={selection.filter((id) => !draftIds.has(id))} hover={hover && draftIds.has(hover) ? null : hover} noGrips={scene.items} />}
        {is2d && <NorthArrow proj={proj} x={size.w - 118} y={size.h - 34} />}
        {rulers && !eyeOn && <Rulers proj={proj} w={size.w} h={size.h} system={units.system} />}
        <rect ref={boxRef} fill="var(--accent)" fillOpacity={0.12} stroke="var(--accent)" strokeDasharray="4 3" style={{ visibility: "hidden" }} pointerEvents="none" />
        <g pointerEvents="none">
          <line ref={crossH} style={{ stroke: crossColor, visibility: "hidden" }} strokeWidth={1} strokeOpacity={0.75} />
          <line ref={crossV} style={{ stroke: crossColor, visibility: "hidden" }} strokeWidth={1} strokeOpacity={0.75} />
          <rect ref={crossBox} width={8} height={8} fill="none" style={{ stroke: crossColor, visibility: "hidden" }} strokeWidth={1} />
        </g>
      </svg>

      <div ref={dynRef} className="mono pointer-events-none absolute z-20 whitespace-nowrap rounded border border-accent/60 bg-chrome/95 px-1.5 py-0.5 text-[0.6875rem] text-t1" style={{ visibility: "hidden" }} />

      <ViewportLabel />
      {display.showViewCube && <ViewCube />}
      {display.showNavBar && <NavBar onWalk={walk} />}
      {display.showUcs && <UcsIcon proj={proj} />}
      {section && !is2d && <SectionBanner />}
      {stressOverlay && stressResult && <StressLegend />}
      {reviewMode && (
        <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full border border-warn/60 bg-chrome/90 px-3 py-0.5 text-[0.6875rem] font-semibold text-warn">REVIEW MODE · Read-Only</div>
      )}
      {session && <ToolBar />}
      {eyeOn && <RoomBar raised={!!activeTool && !session} />}
      {activeTool && !session && (
        <div className="mono absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded border border-line bg-chrome/90 px-2 py-0.5 text-[0.6875rem] text-t2">
          <span className="text-accent">{activeTool}</span> {toolPrompt} <span className="text-t3">· Esc to cancel</span>
        </div>
      )}
      {is2d && <div className="mono pointer-events-none absolute bottom-3 right-3 z-10 text-[0.625rem] text-t3">1/4&quot; = 1&apos;-0&quot;</div>}
    </div>
  );
}

/* ── small local overlays ─────────────────────────────────────────────── */
function Guides({ proj, scene }: { proj: ReturnType<typeof makeProjector>; scene: ReturnType<typeof useScene> }) {
  const f = scene.footprint;
  const cx = (f.x0 + f.x1) / 2;
  const cy = (f.y0 + f.y1) / 2;
  const line = (a: [number, number, number], b: [number, number, number], k: string) => {
    const p = proj.project(a);
    const q = proj.project(b);
    return <path key={k} d={`M${p.x.toFixed(1)},${p.y.toFixed(1)}L${q.x.toFixed(1)},${q.y.toFixed(1)}`} stroke="#3ecf8e" strokeOpacity={0.75} strokeDasharray="8 5" strokeWidth={1} />;
  };
  return (
    <g pointerEvents="none">
      {line([f.x0 - 30, cy, 0], [f.x1 + 30, cy, 0], "h")}
      {line([cx, f.y0 - 30, 0], [cx, f.y1 + 30, 0], "v")}
    </g>
  );
}

function SectionBoxOverlay({ proj, scene }: { proj: ReturnType<typeof makeProjector>; scene: ReturnType<typeof useScene> }) {
  const f = scene.footprint;
  const pad = 4;
  const pts = [[f.x0 - pad, f.y0 - pad], [f.x1 + pad, f.y0 - pad], [f.x1 + pad, f.y1 + pad], [f.x0 - pad, f.y1 + pad]].map(([x, y]) => proj.project([x, y, 0]));
  return (
    <g pointerEvents="none">
      <polygon points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth={1.2} strokeDasharray="6 4" />
      {pts.map((p, i) => (
        <rect key={i} x={p.x - 3.5} y={p.y - 3.5} width={7} height={7} fill="var(--accent)" stroke="#fff" strokeWidth={0.8} />
      ))}
    </g>
  );
}

function Rulers({ proj, w, h, system }: { proj: ReturnType<typeof makeProjector>; w: number; h: number; system: "imperial" | "metric-m" | "metric-mm" }) {
  const o = proj.project([0, 0, 0]);
  const ftPx = proj.scale;
  const steps = [1, 2, 5, 10, 20, 50, 100];
  const step = steps.find((s) => s * ftPx >= 56) ?? 100;
  const ticks: React.ReactNode[] = [];
  const unit = (v: number) => (system === "imperial" ? `${v}'` : `${(v * 0.3048).toFixed(1)}`);
  for (let k = Math.floor((0 - o.x) / (step * ftPx)); k <= Math.ceil((w - o.x) / (step * ftPx)); k++) {
    const x = o.x + k * step * ftPx;
    if (x < 18 || x > w) continue;
    ticks.push(
      <g key={`x${k}`}>
        <line x1={x} x2={x} y1={0} y2={9} style={{ stroke: "var(--vp-ink-dim)" }} />
        <text x={x + 3} y={17} fontSize={8.5} style={{ fill: "var(--vp-ink-dim)" }} fontFamily="var(--font-data)">
          {unit(k * step)}
        </text>
      </g>,
    );
  }
  for (let k = Math.floor((0 - o.y) / (step * ftPx)); k <= Math.ceil((h - o.y) / (step * ftPx)); k++) {
    const y = o.y + k * step * ftPx;
    if (y < 18 || y > h) continue;
    ticks.push(
      <g key={`y${k}`}>
        <line y1={y} y2={y} x1={0} x2={9} style={{ stroke: "var(--vp-ink-dim)" }} />
        <text x={11} y={y + 3} fontSize={8.5} style={{ fill: "var(--vp-ink-dim)" }} fontFamily="var(--font-data)">
          {unit(-k * step)}
        </text>
      </g>,
    );
  }
  return (
    <g pointerEvents="none">
      <rect x={0} y={0} width={w} height={14} style={{ fill: "var(--bg-chrome)" }} fillOpacity={0.85} />
      <rect x={0} y={0} width={14} height={h} style={{ fill: "var(--bg-chrome)" }} fillOpacity={0.85} />
      {ticks}
    </g>
  );
}
