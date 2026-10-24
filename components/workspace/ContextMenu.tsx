/**
 * components/workspace/ContextMenu.tsx
 *
 * WHAT   The right-click menu over the viewport (it replaces the Edit menu): Cut, Copy, Paste, Duplicate,
 *        Delete, Select / Deselect All, Find, Group / Ungroup, Lock / Unlock, Isolate, Hide / Show All and
 *        Properties. Rows that do not apply are disabled (nothing selected, empty clipboard).
 * FOR    Opened by the viewport at the pointer position through the workspace `contextMenu` state; every row
 *        runs a command through useRunner. Shortcuts shown follow the user's OS (⌘ on a Mac).
 * DEBUG  - The menu never shows: ModelViewport's onContextMenu handler (the browser's contextmenu event:
 *          right-click, or Control-click on a Mac) calls setContextMenu({x, y}); check that handler.
 *        - A row is disabled: see hasSel / multi / clip, derived from the selection and clipboard in the
 *          workspace store.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Menu, MenuItem, MenuSep } from "@/components/ui/Menu";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { useRunner } from "./hooks";

/* Right-click menu (replaces Edit): spec §10.3. */
export function ContextMenu() {
  const ws = useWsApi();
  const { run } = useRunner();
  const pos = useWs((s) => s.contextMenu);
  const hasSel = useWs((s) => s.selection.length > 0);
  const multi = useWs((s) => s.selection.length > 1);
  const clip = useWs((s) => s.clipboard.length > 0);
  const close = () => ws.getState().setContextMenu(null);
  const item = (label: string, cmd: string, shortcut?: string, disabled?: boolean) => (
    <MenuItem label={label} shortcut={shortcut} disabled={disabled} onClick={() => run(cmd)} onClose={close} />
  );
  return (
    <Menu anchor={pos ? { x: pos.x, y: pos.y, h: 0 } : null} onClose={close} label="Context menu" width="13rem">
      {item("Cut", "CUTCLIP", "Ctrl+X", !hasSel)}
      {item("Copy", "COPYCLIP", "Ctrl+C", !hasSel)}
      {item("Paste", "PASTECLIP", "Ctrl+V", !clip)}
      {item("Duplicate", "DUPLICATE", "Ctrl+D", !hasSel)}
      {item("Delete", "DELETE", "Delete", !hasSel)}
      <MenuSep />
      {item("Select All", "SELECTALL", "Ctrl+A")}
      {item("Deselect All", "DESELECT", "Esc", !hasSel)}
      {item("Find / Replace", "FIND", "Ctrl+K")}
      <MenuSep />
      {item("Group", "GROUP", "Ctrl+G", !multi)}
      {item("Ungroup", "UNGROUP", undefined, !hasSel)}
      {item("Lock", "LOCK", undefined, !hasSel)}
      {item("Unlock", "UNLOCK")}
      <MenuSep />
      {item("Isolate", "ISOLATE", undefined, !hasSel)}
      {item("Hide Selection", "HIDE", undefined, !hasSel)}
      {item("Show All", "UNHIDE")}
      <MenuSep />
      {item("Properties", "PROPERTIES", "Ctrl+1")}
    </Menu>
  );
}
