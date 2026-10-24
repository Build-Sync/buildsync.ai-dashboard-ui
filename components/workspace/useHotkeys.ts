/**
 * components/workspace/useHotkeys.ts
 *
 * WHAT   One window-level keydown listener that turns key presses into commands. It reads the shortcut
 *        table from the command registry (lib/commands.ts) plus the user's remaps (Settings → Shortcuts)
 *        and runs the matching command through `runCommand`. Esc is handled here too: it closes the
 *        app menu / context menu, cancels the active tool, then clears the selection, in that order.
 * FOR    The workspace shell (Workspace.tsx) calls `useHotkeys(active)`; `active` is false while a
 *        settings modal covers the workspace so keys don't act on the hidden model.
 *
 * CROSS-PLATFORM
 *   - Shortcut matching lives in lib/shortcuts.ts: ⌘ is the primary modifier on macOS, Ctrl elsewhere;
 *     Option+letter and non-Latin layouts match by physical key; the Mac "delete" key (Backspace) = Delete.
 *   - Key presses during IME composition are ignored.
 *
 * DEBUG  - A shortcut does nothing: is the focus in a text field? Text fields only pass F-keys and the
 *          few combos listed in TYPING_ALLOWED (everything else must stay native text editing).
 *        - Browser steals the key (Ctrl/⌘+N, +T, +W): browsers do not let pages override those; use the
 *          alternate (Ctrl+Alt+N) or the ribbon.
 *        - Compare `comboOf(event)` with `bindingsOf(command, userKeys, platform)` in lib/shortcuts.ts.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useEffect } from "react";
import { COMMANDS, runCommand } from "@/lib/commands";
import { getPlatform } from "@/lib/platform";
import { bindingsOf, comboOf } from "@/lib/shortcuts";
import { useAppApi } from "@/lib/store/app-provider";
import { useWsApi } from "@/lib/store/workspace-provider";
import { useCommandCtx } from "./hooks";

/** Combos that still fire while a text field has focus; every other combo is left to native editing. */
const TYPING_ALLOWED = new Set(["Ctrl+K", "Ctrl+S", "Ctrl+,", "Ctrl+1", "Ctrl+9", "Ctrl+Alt+N"]);

/* Keyboard shortcuts from the command registry (+ user remaps from Settings → Shortcuts).
 * Disabled while a settings modal covers the workspace. */
export function useHotkeys(active: boolean) {
  const ctx = useCommandCtx();
  const ws = useWsApi();
  const app = useAppApi();

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return; // IME candidate selection / already handled by a widget
      const platform = getPlatform();
      const combo = comboOf(e, platform);
      if (!combo) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      const s = ws.getState();

      if (combo === "Esc") {
        if (s.appMenu) return s.setAppMenu(false);
        if (s.contextMenu) return s.setContextMenu(null);
        if (s.modal) return; // the dialog handles its own Esc
        if (typing) return;
        if (s.activeTool) {
          s.setTool(null);
          return app.getState().log("info", "*Cancel*");
        }
        if (s.selection.length) s.clearSelection();
        return;
      }
      if (s.modal) return;

      const user = app.getState().settings.shortcuts.keys;
      const hit = COMMANDS.find((d) => bindingsOf(d, user, platform).includes(combo))?.name;
      if (!hit) return;
      // keep normal text editing (copy/paste/select-all/undo) inside inputs
      if (typing && !/^F\d+$/.test(combo) && !TYPING_ALLOWED.has(combo)) return;
      if (hit === "DELETE" && typing) return;
      e.preventDefault();
      void runCommand(ctx, hit);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, ctx, ws, app]);
}
