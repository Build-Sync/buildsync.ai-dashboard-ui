/**
 * components/workspace/Viewport/ModelViewport.tsx
 *
 * WHAT   The workspace canvas: the 3D isometric model or the 2D floor plan, drawn by one SVG renderer
 *        (lib/scene/render.ts), with every pointer, touch, wheel and keyboard interaction on it: click to
 *        select, Shift / ⌘ / Ctrl-click to add, a dragged window to box-select, orbit, pan, zoom, walkthrough,
 *        the crosshair with dynamic input, the right-click menu, and two-finger pinch on touch screens.
 *        Overlays (selection, stress, simulation, solar path, callouts, UCS icon, ViewCube, navigation bar,
 *        section banner, viewport label) are layered on top.
 * FOR    The centre of the workspace (Viewport/index.tsx). Camera and plan state live in the workspace store;
 *        this component turns input into store updates. The SVG renderer can later be swapped for Three.js
 *        behind this same boundary.
 * OS     Left drag follows the navigation tool (default: orbit in 3D, pan in 2D); the middle button pans (Shift
 *        + middle orbits in 3D); Space + drag pans, which is the only pan a trackpad-only Mac has in 3D; Shift
 *        or ⌘ (Mac) / Ctrl (Windows, Linux) + drag draws a selection window. Control-click on a Mac is a right
 *        click (context menu). A mouse wheel zooms, a trackpad scroll pans, a pinch zooms about the fingers
 *        (Chromium ctrl+wheel, Safari gesture events, touch pointers); Settings → Display → Scroll gesture can
 *        force zoom or pan (lib/input.ts).
 * OS     Pointer capture is wrapped in capture() because it throws for pointers that are already gone (quick
 *        taps, synthetic events).
 * DEBUG  - A drag never ends: pointerup is missed when the OS cancels the pointer; cancelDrag() clears the
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
import { makeProjector, normBearing, orbit, type Camera } from "@/lib/scene/camera";
import { elementOutline, planCutFor, planLevelsFor, renderScene, type Tint } from "@/lib/scene/render";
import { sunVector, PROJECT_SUN_HOUR } from "@/lib/scene/sun";
import type { LayerId } from "@/lib/types";
import { useApp } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { buildSchedule, phaseStateAt } from "@/lib/timeline";
import { clamp, fmtCoord } from "@/lib/utils";
import { useEffectiveStyle, useRunner, useScene } from "../hooks";
import { NavBar } from "./NavBar";
import { Callouts, NorthArrow, PlanAnnotations, SelectionOverlay, SimVectors, SolarPath, StressLegend, StressSpots, UcsIcon, ViewportDefs } from "./Overlays";
import { ViewCube } from "./ViewCube";
import { ViewportLabel } from "./ViewportLabel";
import { SectionBanner } from "./SectionBanner";

/* The workspace canvas: 3D isometric house or 2D plan, one SVG renderer.
 * Swap in Three.js / react-three-fiber later behind this same <Viewport/> boundary. */

type DragMode = "orbit" | "pan" | "zoom" | "walk" | "box";

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

  const planCfg = useMemo(() => (is2d ? { cutZ: planCutFor(scene, plan.level), levels: planLevelsFor(plan.level) } : null), [is2d, scene, plan.level]);
  const cutY = section && !is2d ? sectionY : null;

  const rendered = useMemo(() => {
    if (!size.w || !size.h) return "";
    return renderScene({
      scene,
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
    }).svg;
  }, [size, scene, proj, style, planCfg, cutY, colors, layerVis, hiddenSet, isoSet, phaseState, rendering.shadows, rendering.edges, rendering.quality, dragging, tint, dimOthers, sun]);

  /* ── frame requested elements ─────────────────────────────────────── */
  const lastFocus = useRef(0);
  useEffect(() => {
    if (!focus || focus.n === lastFocus.current || !size.w) return;
    lastFocus.current = focus.n;
    const els = focus.ids.map((id) => scene.elementById[id]).filter(Boolean);
    if (!els.length) return;
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
  const drag = useRef<{ mode: DragMode; x: number; y: number; moved: boolean; el: string | null; button: number; startCam: Camera; startPlan: typeof plan; shift: boolean } | null>(null);
  const raf = useRef(0);

  const pickEl = (t: EventTarget | null): string | null => (t as Element | null)?.closest?.("[data-el]")?.getAttribute("data-el") ?? null;

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
        const z = is2d ? 0 : 0;
        const w = proj.unproject(x, y, z);
        if (!over || !w) {
          ws.getState().setCursor(null);
          if (dynRef.current) dynRef.current.style.visibility = "hidden";
          return;
        }
        ws.getState().setCursor({ x: w[0], y: w[1], z });
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
    [display.crosshairSize, size.w, size.h, navTool, is2d, proj, ws, dynOn, units.system, units.precision, toolPrompt],
  );

  /** zoom by factor `f`, keeping the point under (mx, my) fixed */
  const zoomAbout = useCallback(
    (f: number, mx: number, my: number) => {
      const s = ws.getState();
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

  /** abandon any drag in progress (right click, pointer cancelled by the OS, pinch started) */
  const cancelDrag = () => {
    drag.current = null;
    setDragging(false);
    if (boxRef.current) boxRef.current.style.visibility = "hidden";
  };

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
    if (e.button === 1) mode = e.shiftKey && !is2d ? "orbit" : "pan";
    else if (spaceRef.current) mode = "pan";
    else if (additive) mode = "box";
    else if (navTool === "pan") mode = "pan";
    else if (navTool === "zoom") mode = "zoom";
    else if (navTool === "walk" && !is2d) mode = "walk";
    else if (navTool === "orbit" && !is2d) mode = "orbit";
    else mode = is2d ? "pan" : "orbit";
    drag.current = { mode, x: e.clientX, y: e.clientY, moved: false, el: pickEl(e.target), button: e.button, startCam: ws.getState().camera, startPlan: ws.getState().plan, shift: additive };
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
    }
    updateCursor(e.clientX, e.clientY, true);
    const s = ws.getState();
    switch (d.mode) {
      case "orbit":
        s.setCamera(orbit(d.startCam, dx, dy));
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
    if (d.mode === "box" && d.moved) {
      const r = svgRef.current!.getBoundingClientRect();
      const x0 = Math.min(d.x, e.clientX) - r.left;
      const x1 = Math.max(d.x, e.clientX) - r.left;
      const y0 = Math.min(d.y, e.clientY) - r.top;
      const y1 = Math.max(d.y, e.clientY) - r.top;
      const inside: string[] = [];
      for (const el of scene.elements) {
        if (layerVis[el.layer] === false || hiddenSet.has(el.id) || el.layer === "topography") continue;
        const o = elementOutline(el, proj);
        const cx = o.box.x + o.box.w / 2;
        const cy = o.box.y + o.box.h / 2;
        if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) inside.push(el.id);
      }
      s.select(inside, d.shift);
      ctx.app.getState().log("ok", `✓ ${inside.length} element(s) selected by window`);
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
      if (s.docks.palettes && s.panel !== "properties" && !["stress-test", "simulation", "council"].includes(s.panel)) s.setPanel("properties");
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
    const id = pickEl(e.target);
    const s = ws.getState();
    if (id && !s.selection.includes(id)) s.select([id]);
    s.setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const walk = () => {
    ws.getState().setNavTool("walk");
    ws.getState().setCamera({ pitch: 12, perspective: true, zoom: 1.6 });
  };

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
        {guides && <Guides proj={proj} scene={scene} />}
        <g data-testid="scene" dangerouslySetInnerHTML={{ __html: rendered }} />
        {is2d && <PlanAnnotations scene={scene} proj={proj} level={plan.level} showGrid />}
        {!is2d && section && calloutsOn && <Callouts callouts={scene.callouts} proj={proj} sectionY={cutY} />}
        {stressOverlay && stressResult && <StressSpots scene={scene} proj={proj} result={stressResult} sectionY={cutY} />}
        {simVectors && simResult && <SimVectors scene={scene} proj={proj} result={simResult} />}
        {solar && <SolarPath scene={scene} proj={proj} hour={rendering.sunPosition === "custom" ? rendering.sunHour : PROJECT_SUN_HOUR} />}
        {sectionBox && <SectionBoxOverlay proj={proj} scene={scene} />}
        {clashEls.map((id) => {
          const el = scene.elementById[id];
          if (!el) return null;
          const o = elementOutline(el, proj);
          return <circle key={id} cx={o.box.x + o.box.w / 2} cy={o.box.y + o.box.h / 2} r={Math.max(o.box.w, o.box.h) / 2 + 14} fill="none" stroke="var(--bad)" strokeWidth={2} className="anim-pulse" pointerEvents="none" />;
        })}
        <SelectionOverlay scene={scene} proj={proj} selection={selection} hover={hover} />
        {is2d && <NorthArrow proj={proj} x={size.w - 118} y={size.h - 34} />}
        {rulers && <Rulers proj={proj} w={size.w} h={size.h} system={units.system} />}
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
        <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full border border-warn/60 bg-chrome/90 px-3 py-0.5 text-[0.6875rem] font-semibold text-warn">REVIEW MODE · read-only</div>
      )}
      {activeTool && (
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
