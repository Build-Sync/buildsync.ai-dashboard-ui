/**
 * components/workspace/Workspace.tsx
 *
 * WHAT   The main CAD screen. <Workspace> creates the per-project workspace store and renders the shell: demo
 *        banner, app bar, ribbon tabs and panels, document tabs, then either the Start page or the model
 *        explorer + viewport + palette dock, then the timeline, command line, status bar, context menu and
 *        modals.
 * FOR    app/app/projects/[projectId] and app/demo render it with the project, the mode ("app" or "demo") and
 *        the URL query. The shell also wires four app-wide behaviours: the keyboard shortcuts (useHotkeys), the
 *        bs_last_project cookie for /app, the browser full-screen state, the Grid & Snap settings onto the
 *        status-bar toggles, restoring the work saved in this browser, auto-save and a draft flush on close.
 * OS     min-width 64rem and h-dvh give a stable desktop layout; keyboard shortcuts are handled for the active
 *        workspace only (pathname === basePath), so a Settings modal opened over it does not trigger drawing
 *        shortcuts.
 * DEBUG  - Shortcuts dead: useHotkeys(active) only listens while this workspace's route is the current one.
 *        - Status-bar toggle snaps back: the Grid & Snap effect re-applies a setting of settings.gridSnap when
 *          that setting changes (only that one: ticking an object snap does not reset ORTHO or POLAR).
 *        - Layout shifted in /demo: the 1.5rem demo banner sets --h-banner on the root element.
 *        - Auto-save: runs only when `dirty`, after autosaveMinutes (Settings → General), in the app and the demo.
 *        - Saved work missing after a reload: loadSaved reads bs.work.<mode>.<projectId> (lib/persist.ts).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { readLayout, sideDocks, writeLayout, type Side, type SideDock } from "@/lib/layout";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import { WorkspaceProvider, useWs, useWsApi } from "@/lib/store/workspace-provider";
import { arrangementOf } from "@/lib/store/workspace-store";
import type { Project } from "@/lib/types";
import type { WorkspaceQuery } from "@/lib/workspace-query";
import { AppBar } from "./AppBar";
import { CommandLine } from "./CommandLine";
import { ContextMenu } from "./ContextMenu";
import { DemoBanner } from "./DemoBanner";
import { DockDropZones } from "./DockChrome";
import { DocumentTabs } from "./DocumentTabs";
import { Modals } from "./Modals";
import { ModelExplorer } from "./ModelExplorer";
import { PaletteDock } from "./Palettes";
import { RibbonPanels } from "./Ribbon/RibbonPanels";
import { RibbonTabs } from "./Ribbon/RibbonTabs";
import { StartPage } from "./StartPage";
import { StatusBar } from "./StatusBar";
import { Timeline } from "./Timeline";
import { TourLayer } from "./Tour";
import { ViewportArea } from "./Viewport";
import { useHotkeys } from "./useHotkeys";

/** Props of <Workspace>: the project, "app" or "demo" mode, the parsed URL query and the route's base path. */
export interface WorkspaceProps {
  project: Project;
  mode: "app" | "demo";
  query: WorkspaceQuery;
  basePath: string;
}

/* The main CAD screen (spec §9). Zone logic: top = tools · left = model · centre = canvas ·
 * right = intelligence · bottom = AI & workflow. */
export function Workspace({ project, mode, query, basePath }: WorkspaceProps) {
  return (
    <WorkspaceProvider init={{ mode, project, query }} basePath={basePath}>
      <Shell basePath={basePath} />
    </WorkspaceProvider>
  );
}

/** A side window (explorer or palettes) on the edge the arrangement puts it. */
function SideWindow({ k, edge }: { k: SideDock; edge: Side }) {
  return k === "explorer" ? <ModelExplorer edge={edge} /> : <PaletteDock edge={edge} />;
}

function Shell({ basePath }: { basePath: string }) {
  const ws = useWsApi();
  const app = useAppApi();
  const pathname = usePathname();
  const active = pathname === basePath;
  const mode = useWs((s) => s.mode);
  const doc = useWs((s) => s.doc);
  const projectId = useWs((s) => s.project.id);
  const docks = useWs((s) => s.docks);
  const dockSide = useWs((s) => s.dockSide);
  const bottomOrder = useWs((s) => s.bottomOrder);
  const dirty = useWs((s) => s.dirty);
  const fullscreen = useWs((s) => s.fullscreen);
  const settings = useApp((s) => s.settings);

  useHotkeys(active);

  /* this project is an open document tab; remember it for /app */
  useEffect(() => {
    app.getState().openTab(projectId);
    if (mode === "app") document.cookie = `bs_last_project=${encodeURIComponent(projectId)}; path=/; max-age=31536000; samesite=lax`;
  }, [app, projectId, mode]);

  /* the arrangement of the windows (size, dragged width, side, order, tabs): restore the saved one once mounted
   * (the server cannot read localStorage, so not during render), then save every change */
  useEffect(() => {
    const saved = readLayout();
    if (saved) ws.getState().applyArrangement(saved.a, saved.iface);
    const key = (st: ReturnType<typeof ws.getState>) => [st.docks, st.dockSize, st.dockPx, st.dockSide, st.bottomOrder, st.paletteTabs, st.explorerTabs, st.iface];
    let prev = key(ws.getState());
    return ws.subscribe((st) => {
      const next = key(st);
      if (next.every((v, i) => v === prev[i])) return;
      prev = next;
      writeLayout(arrangementOf(st), st.iface);
    });
  }, [ws]);

  /* browser full screen ↔ FULL command */
  useEffect(() => {
    const on = () => ws.getState().patch({ fullscreen: !!document.fullscreenElement });
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, [ws]);

  /* Grid & Snap settings feed the status-bar toggles: all of them once, then only the setting that changed, so
   * ticking an object snap does not undo an ORTHO the user switched on in the status bar */
  const seeded = useRef<typeof settings.gridSnap | null>(null);
  useEffect(() => {
    const g = settings.gridSnap;
    const prev = seeded.current;
    seeded.current = g;
    const s = ws.getState();
    const anyOsnap = Object.values(g.osnap).some(Boolean);
    if (!prev || prev.ortho !== g.ortho) s.toggle("ortho", g.ortho);
    if (!prev || prev.polar !== g.polar) s.toggle("polar", g.polar);
    if (!prev || prev.dynInput !== g.dynInput) s.toggle("dyn", g.dynInput);
    if (!prev || Object.values(prev.osnap).some(Boolean) !== anyOsnap || (anyOsnap && prev.osnap !== g.osnap)) s.toggle("osnap", anyOsnap);
  }, [settings.gridSnap, ws]);

  /* put back the work saved in this browser (after mount: the server cannot read localStorage) */
  useEffect(() => {
    ws.getState().loadSaved();
  }, [ws]);

  /* auto-save to this browser after the chosen number of minutes without saving (works in the demo too) */
  useEffect(() => {
    if (!dirty || !settings.general.autosave) return;
    const id = setTimeout(() => {
      ws.getState().save({ auto: true });
      app.getState().log("info", `Autosaved ${projectId}`);
    }, settings.general.autosaveMinutes * 60_000);
    return () => clearTimeout(id);
  }, [dirty, settings.general.autosave, settings.general.autosaveMinutes, ws, app, projectId]);

  /* closing or hiding the page with unsaved changes keeps a draft, so nothing drawn is lost */
  useEffect(() => {
    const flush = () => ws.getState().flushDraft();
    const hide = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [ws]);

  return (
    <div
      className="flex h-dvh min-w-[64rem] flex-col overflow-hidden bg-app"
      style={{ ["--h-banner" as string]: mode === "demo" ? "1.5rem" : "0rem" }}
      data-testid="workspace"
      data-mode={mode}
      data-fullscreen={fullscreen || undefined}
    >
      {mode === "demo" && <DemoBanner />}
      <AppBar />
      <RibbonTabs />
      <RibbonPanels />
      <DocumentTabs />

      {doc === "start" ? (
        <StartPage />
      ) : (
        <div className="relative flex min-h-0 flex-1" data-testid="dock-row">
          {sideDocks(dockSide, "left").map((k) => docks[k] && <SideWindow key={k} k={k} edge="left" />)}
          <ViewportArea />
          {sideDocks(dockSide, "right").map((k) => docks[k] && <SideWindow key={k} k={k} edge="right" />)}
          <DockDropZones />
        </div>
      )}

      {bottomOrder.map((k) => (k === "timeline" ? docks.timeline && doc !== "start" && <Timeline key={k} /> : docks.cmdline && <CommandLine key={k} />))}
      {/* the status bar never moves, resizes or hides */}
      <StatusBar />
      <ContextMenu />
      <Modals />
      <TourLayer />
    </div>
  );
}
