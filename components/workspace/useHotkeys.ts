/**
 * components/workspace/useHotkeys.ts
 *
 * WHAT   Window-level key listeners that turn key presses into commands. Shortcuts are chords of up to 4 keys
 *        pressed at once (lib/shortcuts.ts ChordTracker): the commands' own keys, every command's default chord
 *        (lib/keymap.ts) and the user's remaps (Settings → Shortcuts). A chord runs as soon as it matches; when a
 *        longer chord could still follow (Alt+L, then Alt+L+B) it runs when the keys are let go. Esc is handled
 *        here too: it closes the app menu / context menu, cancels the active tool, clears the selection, then steps
 *        out of a room view.
 * FOR    The workspace shell (Workspace.tsx) calls `useHotkeys(active)`; `active` is false while a
 *        settings modal covers the workspace so keys don't act on the hidden model.
 *
 * CROSS-PLATFORM
 *   - Shortcut matching lives in lib/shortcuts.ts: ⌘ is the primary modifier on macOS, Ctrl elsewhere;
 *     Option+letter and non-Latin layouts match by physical key; the Mac "delete" key (Backspace) = Delete.
 *   - Key presses during IME composition are ignored.
 *
 * DEBUG  - A shortcut does nothing: is the focus in a text field? Text fields only pass F-keys and the
 *          few combos listed in TYPING_ALLOWED (everything else must stay native text editing); the command line
 *          also passes Alt chords that are bound to something.
 *        - A chord runs the shorter command: a key was let go before the last one went down; hold them together.
 *        - Browser steals the key (Ctrl/⌘+N, +T, +W): browsers do not let pages override those; use the
 *          alternate (Ctrl+Alt+N) or the ribbon.
 *        - Compare `comboOf(event)` with `bindingsOf(command, userKeys, platform)` in lib/shortcuts.ts.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useEffect } from "react";
import { enterTool, runCommand } from "@/lib/commands";
import { allBindings } from "@/lib/keymap";
import { getPlatform } from "@/lib/platform";
import { ChordTracker, comboOf, comboParts, matchChord, type Binding } from "@/lib/shortcuts";
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
    const tracker = new ChordTracker();
    // the bindings are rebuilt only when the user's shortcuts change
    let cache: { user: Record<string, string>; list: Binding[] } | null = null;
    const bindings = () => {
      const user = app.getState().settings.shortcuts.keys;
      if (!cache || cache.user !== user) cache = { user, list: allBindings(user, getPlatform()) };
      return cache.list;
    };
    // a chord that may still grow runs when its keys are let go; one that already ran does not run again
    let pending: string | null = null;
    let fired = false;
    const run = (target: string) => {
      fired = true;
      pending = null;
      void runCommand(ctx, target);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return; // IME candidate selection / already handled by a widget
      const platform = getPlatform();
      const single = comboOf(e, platform);
      const chord = tracker.down(e, platform);
      if (!single) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      const inCmdLine = !!t?.closest?.('[data-testid="cmd-input"]');
      const combo = single;
      const s = ws.getState();

      if (combo === "Esc") {
        if (s.appMenu) return s.setAppMenu(false);
        if (s.contextMenu) return s.setContextMenu(null);
        if (s.modal) return; // the dialog handles its own Esc
        if (typing) return;
        if (s.activeTool) {
          s.setTool(null);
          s.patch({ measure: null });
          return app.getState().log("info", "*Cancel*");
        }
        if (s.measure) return s.patch({ measure: null });
        if (s.selection.length) return s.clearSelection();
        // with nothing else to close, Esc steps out of a room view
        if (s.insideRoom || s.camera.eye) void runCommand(ctx, "LEAVEROOM");
        return;
      }
      if (s.modal) return;
      // Enter (outside a text field) finishes the object a drawing tool is working on
      if (combo === "Enter" && !typing && s.session) {
        e.preventDefault();
        enterTool(ctx);
        return;
      }

      const { exact, longer } = matchChord(chord, bindings());
      if (!exact && !longer) return;
      // keep normal text editing (copy/paste/select-all/undo) inside inputs; the command line also passes Alt chords
      const altChord = comboParts(chord).mods.join("+") === "Alt" || comboParts(chord).mods.join("+") === "Alt+Shift";
      if (typing && !/^F\d+$/.test(combo) && !TYPING_ALLOWED.has(combo) && !(inCmdLine && altChord)) return;
      if (exact === "DELETE" && typing) return;
      e.preventDefault();
      if (e.repeat) {
        // holding a plain shortcut down repeats it (Undo, Redo); a chord does not
        if (exact && !longer && comboParts(chord).keys.length === 1) run(exact);
        return;
      }
      if (exact && !longer) run(exact);
      else pending = exact;
    };
    const onUp = (e: KeyboardEvent) => {
      if (pending && !fired) run(pending);
      tracker.up(e);
      if (!tracker.count) {
        fired = false;
        pending = null;
      }
    };
    const forget = () => {
      tracker.reset();
      fired = false;
      pending = null;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", forget);
    document.addEventListener("visibilitychange", forget);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", forget);
      document.removeEventListener("visibilitychange", forget);
    };
  }, [active, ctx, ws, app]);
}
