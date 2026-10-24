/**
 * components/workspace/AppMenu.tsx
 *
 * WHAT   The application menu opened by the "B" button (it replaces the File menu): New / Open / Save / Save
 *        As, Import and Export (they open the import / export dialogs), project information, versions, archive,
 *        close and settings; on the right the five most recent projects.
 * FOR    Project-level actions. Shortcuts are drawn with ShortcutLabel in the user's OS style (⌘N on a Mac,
 *        Ctrl+N elsewhere); the real key handling lives in useHotkeys.ts and lib/commands.ts.
 * OS     Listens to pointerdown and Escape in the capture phase, so it closes reliably with a mouse, a trackpad
 *        or a pen on every platform.
 * DEBUG  - The menu does not close on an outside click: presses inside [data-app-menu] and on the [data-app-
 *          button] trigger (AppBar) are ignored on purpose.
 *        - A recent project only shows a toast: ids unknown to lib/services/projects.ts are not part of the
 *          demo workspace.
 *        - A row shows a different shortcut than the real key: the labels in ROWS are separate from COMMANDS in
 *          lib/commands.ts; keep them in step.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useEffect, useState, type RefObject } from "react";
import { Icon, type IconKey } from "@/components/icons";
import { ShortcutLabel } from "@/components/ui/Kbd";
import { RECENT_PROJECTS } from "@/lib/mock-data";
import { isKnownProject } from "@/lib/services/projects";
import { useApp } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";
import { useRunner } from "./hooks";

/* Application menu (replaces File). Left: actions with shortcuts. Right: last 5 projects. */

interface Row {
  label: string;
  icon: IconKey;
  /** canonical shortcut ("Ctrl+Shift+S"); rendered per OS by ShortcutLabel */
  shortcut?: string;
  run?: string;
  sub?: { label: string; modal: "import" | "export"; data: Record<string, string> }[];
}

const ROWS: Row[] = [
  { label: "New Project", icon: "newfile", shortcut: "Ctrl+N", run: "NEW" },
  { label: "Open Project", icon: "open", shortcut: "Ctrl+O", run: "OPEN" },
  { label: "Save", icon: "save", shortcut: "Ctrl+S", run: "QSAVE" },
  { label: "Save As", icon: "save", shortcut: "Ctrl+Shift+S", run: "SAVEAS" },
  {
    label: "Import",
    icon: "upload",
    sub: ["DWG", "DXF", "IFC", "PDF", "Image", "LandXML", "Terrain"].map((l) => ({ label: l, modal: "import" as const, data: { kind: l.toLowerCase() } })),
  },
  {
    label: "Export",
    icon: "download",
    sub: ["PDF", "IFC", "DWG", "Report", "Render"].map((l) => ({ label: l, modal: "export" as const, data: { format: l.toLowerCase() } })),
  },
  { label: "Project Information", icon: "info", run: "PROJINFO" },
  { label: "Project Versions", icon: "versions", run: "VERSIONS" },
  { label: "Archive Project", icon: "archive", run: "ARCHIVE" },
  { label: "Close Project", icon: "close", run: "CLOSE" },
  { label: "Settings & Connectors", icon: "settings", shortcut: "Ctrl+,", run: "SETTINGS" },
];

/** Mounts the menu panel only while it is open, so its expanded state resets each time. */
export function AppMenu({ anchorRef }: { anchorRef: RefObject<HTMLButtonElement | null> }) {
  const open = useWs((s) => s.appMenu);
  // the panel is mounted only while open, so its expanded state resets on every open
  return open ? <AppMenuPanel anchorRef={anchorRef} /> : null;
}

function AppMenuPanel({ anchorRef }: { anchorRef: RefObject<HTMLButtonElement | null> }) {
  const ws = useWsApi();
  const { run, ctx } = useRunner();
  const mode = useWs((s) => s.mode);
  const tabs = useApp((s) => s.tabs);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!t.closest("[data-app-menu]") && !t.closest("[data-app-button]")) ws.getState().setAppMenu(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && ws.getState().setAppMenu(false);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [ws, anchorRef]);

  const close = () => ws.getState().setAppMenu(false);

  const openRecent = (id: string, name: string) => {
    close();
    if (!isKnownProject(id)) {
      ctx.app.getState().toast(`${name} isn't part of this demo workspace`, "info");
      return;
    }
    ctx.app.getState().openTab(id);
    ctx.router.push(mode === "demo" ? `/demo?project=${id}` : `/app/projects/${id}`);
  };

  return (
    <div data-app-menu role="menu" aria-label="Application menu" className="anim-pop fixed left-1.5 top-[calc(var(--h-banner,0rem)+var(--h-appbar)+0.1rem)] z-[85] flex w-[30rem] overflow-hidden rounded-xl border border-line bg-chrome shadow-pop">
      <div className="w-[15.5rem] shrink-0 border-r border-soft py-1.5">
        {ROWS.map((r) => (
          <div key={r.label}>
            <button
              role="menuitem"
              onClick={() => {
                if (r.sub) setExpanded(expanded === r.label ? null : r.label);
                else {
                  close();
                  if (r.run) run(r.run);
                }
              }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[0.75rem] text-t1 hover:bg-accent/15"
              aria-expanded={r.sub ? expanded === r.label : undefined}
            >
              <Icon name={r.icon} size={15} className="shrink-0 text-t2" />
              <span className="flex-1">{r.label}</span>
              {r.shortcut && <ShortcutLabel combo={r.shortcut} />}
              {r.sub && <Icon name="chevRight" size={12} className={cn("text-t3 transition-transform", expanded === r.label && "rotate-90")} />}
            </button>
            {r.sub && expanded === r.label && (
              <div className="grid grid-cols-3 gap-1 bg-panel-alt px-3 py-2">
                {r.sub.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => {
                      close();
                      ws.getState().openModal(s.modal, s.data);
                    }}
                    className="rounded border border-line px-1.5 py-1 text-[0.6875rem] text-t1 hover:border-accent hover:text-accent"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col bg-panel-alt py-2">
        <p className="label-xs px-3 pb-1.5">Recent</p>
        {RECENT_PROJECTS.slice(0, 5).map((p) => (
          <button key={p.id} onClick={() => openRecent(p.id, p.name)} className="flex flex-col items-start gap-px px-3 py-1.5 text-left hover:bg-accent/15">
            <span className="flex w-full items-center gap-1.5 text-[0.75rem] text-t1">
              <Icon name="building" size={13} className="shrink-0 text-t2" />
              <span className="truncate">{p.name}</span>
              {tabs.includes(p.id) && <span className="size-1.5 shrink-0 rounded-full bg-ok" title="Open" />}
            </span>
            <span className="mono truncate pl-5 text-[0.625rem] text-t3">
              {p.jurisdiction} · {p.openedAt}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
