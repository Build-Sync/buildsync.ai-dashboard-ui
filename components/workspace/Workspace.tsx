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
 *        status-bar toggles, and auto-save (app mode only; the demo never saves).
 * OS     min-width 64rem and h-dvh give a stable desktop layout; keyboard shortcuts are handled for the active
 *        workspace only (pathname === basePath), so a Settings modal opened over it does not trigger drawing
 *        shortcuts.
 * DEBUG  - Shortcuts dead: useHotkeys(active) only listens while this workspace's route is the current one.
 *        - Status-bar toggle snaps back: the Grid & Snap effect re-applies settings.gridSnap whenever it
 *          changes.
 *        - Layout shifted in /demo: the 1.5rem demo banner sets --h-banner on the root element.
 *        - Auto-save: runs only when `dirty`, in app mode, after autosaveMinutes (Settings → General).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import { WorkspaceProvider, useWs, useWsApi } from "@/lib/store/workspace-provider";
import type { Project } from "@/lib/types";
import type { WorkspaceQuery } from "@/lib/workspace-query";
import { AppBar } from "./AppBar";
import { CommandLine } from "./CommandLine";
import { ContextMenu } from "./ContextMenu";
import { DemoBanner } from "./DemoBanner";
import { DocumentTabs } from "./DocumentTabs";
import { Modals } from "./Modals";
import { ModelExplorer } from "./ModelExplorer";
import { PaletteDock } from "./Palettes";
import { RibbonPanels } from "./Ribbon/RibbonPanels";
import { RibbonTabs } from "./Ribbon/RibbonTabs";
import { StartPage } from "./StartPage";
import { StatusBar } from "./StatusBar";
import { Timeline } from "./Timeline";
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

function Shell({ basePath }: { basePath: string }) {
  const ws = useWsApi();
  const app = useAppApi();
  const pathname = usePathname();
  const active = pathname === basePath;
  const mode = useWs((s) => s.mode);
  const doc = useWs((s) => s.doc);
  const projectId = useWs((s) => s.project.id);
  const docks = useWs((s) => s.docks);
  const dirty = useWs((s) => s.dirty);
  const fullscreen = useWs((s) => s.fullscreen);
  const settings = useApp((s) => s.settings);

  useHotkeys(active);

  /* this project is an open document tab; remember it for /app */
  useEffect(() => {
    app.getState().openTab(projectId);
    if (mode === "app") document.cookie = `bs_last_project=${encodeURIComponent(projectId)}; path=/; max-age=31536000; samesite=lax`;
  }, [app, projectId, mode]);

  /* browser full screen ↔ FULL command */
  useEffect(() => {
    const on = () => ws.getState().patch({ fullscreen: !!document.fullscreenElement });
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, [ws]);

  /* Grid & Snap settings feed the status-bar toggles */
  const seeded = useRef(false);
  useEffect(() => {
    const g = settings.gridSnap;
    if (!seeded.current) {
      seeded.current = true;
      ws.getState().toggle("ortho", g.ortho);
      ws.getState().toggle("polar", g.polar);
      ws.getState().toggle("dyn", g.dynInput);
      ws.getState().toggle("osnap", Object.values(g.osnap).some(Boolean));
      return;
    }
    ws.getState().toggle("ortho", g.ortho);
    ws.getState().toggle("polar", g.polar);
    ws.getState().toggle("dyn", g.dynInput);
    ws.getState().toggle("osnap", Object.values(g.osnap).some(Boolean));
  }, [settings.gridSnap, ws]);

  /* auto-save (app mode only; the demo never saves) */
  useEffect(() => {
    if (mode === "demo" || !dirty || !settings.general.autosave) return;
    const id = setTimeout(() => {
      ws.getState().patch({ dirty: false, savedAt: Date.now() });
      app.getState().setDirty(projectId, false);
      app.getState().log("info", `Autosaved ${projectId}`);
    }, settings.general.autosaveMinutes * 60_000);
    return () => clearTimeout(id);
  }, [mode, dirty, settings.general.autosave, settings.general.autosaveMinutes, ws, app, projectId]);

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
        <div className="flex min-h-0 flex-1">
          {docks.explorer && <ModelExplorer />}
          <ViewportArea />
          {docks.palettes && <PaletteDock />}
        </div>
      )}

      {docks.timeline && doc !== "start" && <Timeline />}
      {docks.cmdline && <CommandLine />}
      <StatusBar />
      <ContextMenu />
      <Modals />
    </div>
  );
}
