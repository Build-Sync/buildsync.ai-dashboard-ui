"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { runCommand, runInput, type CommandCtx } from "@/lib/commands";
import { getScene } from "@/lib/scene";
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

export function useScene(): Scene {
  const kind = useWs((s) => s.project.sceneKind);
  return useMemo(() => getScene(kind), [kind]);
}

export function useEffectiveStyle(): VisualStyle {
  const override = useWs((s) => s.styleOverride);
  const def = useApp((s) => s.settings.rendering.visualStyle);
  return override ?? def;
}
