"use client";

import { useEffect } from "react";
import { COMMANDS, runCommand } from "@/lib/commands";
import { useAppApi } from "@/lib/store/app-provider";
import { useWsApi } from "@/lib/store/workspace-provider";
import { useCommandCtx } from "./hooks";

/** Normalise a keydown into the same "Ctrl+Shift+S" form used by the shortcut table. */
export function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey && !(e.key.length === 1 && !/[a-z0-9]/i.test(e.key))) parts.push("Shift");
  let k = e.key;
  if (k === " ") k = "Space";
  else if (k === "Escape") k = "Esc";
  else if (k.length === 1) k = k.toUpperCase();
  if (["Control", "Shift", "Alt", "Meta"].includes(k)) return "";
  parts.push(k);
  return parts.join("+");
}

export function normaliseCombo(s: string): string {
  return s
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (/^ctrl|cmd|meta$/i.test(p) ? "Ctrl" : /^shift$/i.test(p) ? "Shift" : /^alt$/i.test(p) ? "Alt" : /^esc/i.test(p) ? "Esc" : p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)))
    .join("+");
}

/* Keyboard shortcuts from the command registry (+ user remaps from Settings → Shortcuts).
 * Disabled while a settings modal covers the workspace. */
export function useHotkeys(active: boolean) {
  const ctx = useCommandCtx();
  const ws = useWsApi();
  const app = useAppApi();

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const combo = comboOf(e);
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
      let hit: string | undefined;
      for (const d of COMMANDS) {
        const key = user[d.name] ?? d.key;
        if (key && normaliseCombo(key) === combo) {
          hit = d.name;
          break;
        }
      }
      if (!hit) return;
      // keep normal text editing (copy/paste/select-all) inside inputs
      if (typing && !/^F\d+$/.test(combo) && !["Ctrl+K", "Ctrl+S", "Ctrl+,", "Ctrl+1", "Ctrl+9"].includes(combo)) return;
      if (hit === "DELETE" && typing) return;
      e.preventDefault();
      void runCommand(ctx, hit);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, ctx, ws, app]);
}
