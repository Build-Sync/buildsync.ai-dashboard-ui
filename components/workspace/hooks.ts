/**
 * components/workspace/hooks.ts
 *
 * WHAT   Small hooks shared by the workspace components: useCommandCtx (the context every command receives:
 *        workspace store, app store, router), useRunner (run(command) for buttons and menus, submit(text) for
 *        the command line), useScene (the geometry of the open project: the built-in model plus everything the
 *        user drew and moved) and useEffectiveStyle (the visual
 *        style: the project's override, else the setting).
 * FOR    Ribbon buttons, menus, the command line, the viewport and the status bar all go through useRunner, so
 *        every action resolves through the same command registry (lib/commands.ts).
 * DEBUG  - A button does nothing: confirm it calls run("COMMAND") with a name that exists in lib/commands.ts
 *          (unknown names log "Unknown command" in the command line).
 *        - Wrong scene: useScene composes getScene(project.sceneKind) with the store's `drawn` and `xf`
 *          (lib/draw/compose.ts); an edit must replace those arrays for the scene to update.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { runCommand, runInput, type CommandCtx } from "@/lib/commands";
import { sceneOf } from "@/lib/draw/scene-of";
import { linkRevision } from "@/lib/links";
import type { Scene } from "@/lib/scene";
import { useAppApi, useApp } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import type { VisualStyle } from "@/lib/types";

/** Everything a command handler needs, memoised. */
export function useCommandCtx(): CommandCtx {
  const ws = useWsApi();
  const app = useAppApi();
  const router = useRouter();
  return useMemo(() => ({ ws, app, router }), [ws, app, router]);
}

/** run(command) executes a ribbon/menu command; submit(text) is the command line. */
export function useRunner() {
  const ctx = useCommandCtx();
  return useMemo(
    () => ({
      run: (command: string) => void runCommand(ctx, command),
      submit: (text: string) => void runInput(ctx, text),
      ctx,
    }),
    [ctx],
  );
}

/** The scene for the open project: the built-in model plus everything the user drew and moved (lib/draw/compose.ts), merged copies and linked projects (lib/links.ts). */
export function useScene(): Scene {
  const kind = useWs((s) => s.project.sceneKind);
  const drawn = useWs((s) => s.drawn);
  const xf = useWs((s) => s.xf);
  const links = useWs((s) => s.project.links);
  const merged = useWs((s) => s.project.merged);
  const terrain = useWs((s) => s.project.terrain);
  const mode = useWs((s) => s.mode);
  // a linked project saved in this tab or another one redraws here
  const rev = useSyncExternalStore(linkRevision.subscribe, linkRevision.get, () => 0);
  return useMemo(() => sceneOf({ project: { sceneKind: kind, links, merged, terrain }, drawn, xf, mode, rev }), [kind, drawn, xf, links, merged, terrain, mode, rev]);
}

/** The visual style in force: the per-project override if set, else Settings → Rendering. */
export function useEffectiveStyle(): VisualStyle {
  const override = useWs((s) => s.styleOverride);
  const def = useApp((s) => s.settings.rendering.visualStyle);
  return override ?? def;
}
