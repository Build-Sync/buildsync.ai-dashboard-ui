/**
 * components/workspace/AppBar.tsx
 *
 * WHAT   The 34 px application bar at the top: the "B" application-menu button, quick access (New, Open, Save,
 *        Undo, Redo), the project title with an asterisk when unsaved, the search box, the jurisdiction chip,
 *        the AI agents chip, the settings gear and the seat chip.
 * FOR    Global actions that do not belong to a ribbon tab. Every button goes through useRunner().run(command)
 *        (lib/commands.ts); the chips and gear run "/settings/…" routes, which open the Settings modal over the
 *        workspace.
 * DEBUG  - Undo / Redo greyed out: they are disabled while the workspace undo / redo stacks are empty
 *          (lib/store/workspace-store.ts).
 *        - Agents chip count wrong: it counts agents with `connected` set in the app store.
 *        - Title shows * : the workspace `dirty` flag is set.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useRef } from "react";
import { Icon, type IconKey } from "@/components/icons";
import { tip } from "@/components/ui/Tooltip";
import { useApp } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";
import { AppMenu } from "./AppMenu";
import { useRunner } from "./hooks";
import { SearchBox } from "./SearchBox";

/* App bar (34px): app button · quick access · title · search · jurisdiction · agents · gear · seat. */

const QUICK: { icon: IconKey; label: string; desc: string; cmd: string }[] = [
  { icon: "newfile", label: "New", desc: "Create a new project", cmd: "NEW" },
  { icon: "open", label: "Open", desc: "Open the Start tab", cmd: "OPEN" },
  { icon: "save", label: "Save", desc: "Save the project", cmd: "QSAVE" },
  { icon: "undo", label: "Undo", desc: "Undo the last change", cmd: "U" },
  { icon: "redo", label: "Redo", desc: "Redo the last undone change", cmd: "REDO" },
];

const SEAT_LABEL = { student: "Student", engineer: "Engineer", government: "Government" } as const;

/** The top application bar (app menu, quick access, title, search, chips). */
export function AppBar() {
  const ws = useWsApi();
  const { run } = useRunner();
  const appBtn = useRef<HTMLButtonElement>(null);
  const project = useWs((s) => s.project);
  const dirty = useWs((s) => s.dirty);
  const menuOpen = useWs((s) => s.appMenu);
  const canUndo = useWs((s) => s.undoStack.length > 0);
  const canRedo = useWs((s) => s.redoStack.length > 0);
  const agentCount = useApp((s) => s.agents.filter((a) => a.connected).length);
  const seat = useApp((s) => s.seat);

  const code = project.jurisdiction.codeSet.split(/[ ·]/)[0];

  return (
    <header className="flex h-[var(--h-appbar)] shrink-0 items-center gap-1 border-b border-line bg-chrome px-1.5" data-testid="appbar">
      <button
        ref={appBtn}
        aria-label="Application menu"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-app-button
        onClick={() => ws.getState().setAppMenu(!menuOpen)}
        className={cn("grid size-6 place-items-center rounded-md bg-accent text-[0.8125rem] font-bold text-on-accent transition-transform hover:brightness-110", menuOpen && "ring-2 ring-accent/50")}
        {...tip("Application menu", "New, open, save, import, export and recent projects", "APPMENU")}
      >
        B
      </button>
      <AppMenu anchorRef={appBtn} />

      <div className="ml-1 flex items-center" role="toolbar" aria-label="Quick access">
        {QUICK.map((q) => (
          <button
            key={q.cmd}
            aria-label={q.label}
            disabled={(q.cmd === "U" && !canUndo) || (q.cmd === "REDO" && !canRedo)}
            onClick={() => run(q.cmd)}
            className="grid size-6 place-items-center rounded text-t2 transition-colors hover:bg-t1/10 hover:text-t1 disabled:opacity-35 disabled:hover:bg-transparent"
            {...tip(q.label, q.desc, q.cmd)}
          >
            <Icon name={q.icon} size={15} />
          </button>
        ))}
      </div>

      <div className="min-w-0 flex-1 truncate text-center text-[0.75rem] text-t2" data-testid="title">
        BuildSync AI <span className="text-t3">·</span> <span className="mono text-t1">{project.fileName}</span>
        {dirty && <span className="mono text-warn" title="Unsaved changes">*</span>}
      </div>

      <SearchBox />

      <button
        onClick={() => ws.getState().openModal("jurisdiction")}
        className="flex h-6 max-w-[13rem] items-center gap-1.5 rounded-md border border-line px-2 text-[0.6875rem] text-t1 transition-colors hover:border-accent"
        {...tip("Jurisdiction", `Active code set: ${project.jurisdiction.codeSet}. Click to change`, "JURISDICTION")}
      >
        <Icon name="map" size={12} className="shrink-0 text-accent" />
        <span className="truncate">
          {project.jurisdiction.name} <span className="text-t3">·</span> {code}
        </span>
      </button>

      <button
        onClick={() => run("/settings/integrations")}
        className="flex h-6 items-center gap-1.5 rounded-md border border-line px-2 text-[0.6875rem] text-t1 transition-colors hover:border-accent"
        data-testid="agents-chip"
        {...tip("AI agents", agentCount ? `${agentCount} connected. Click to manage connectors` : "No agent connected. Click to connect one", "CONNECTORS")}
      >
        <span className={cn("size-1.5 rounded-full", agentCount ? "bg-ok" : "bg-t3")} />
        {agentCount === 0 ? "No agents" : `${agentCount} agent${agentCount === 1 ? "" : "s"}`}
      </button>

      <button aria-label="Settings" onClick={() => run("/settings/general")} className="grid size-6 place-items-center rounded text-t2 transition-colors hover:bg-t1/10 hover:text-t1" data-testid="gear" {...tip("Settings", "Opens /settings/general", "SETTINGS")}>
        <Icon name="settings" size={15} />
      </button>

      <button
        onClick={() => run("/settings/account")}
        className="flex h-6 items-center gap-1.5 rounded-md bg-t1/10 px-2 text-[0.6875rem] font-medium text-t1 transition-colors hover:bg-t1/15"
        {...tip("Seat", `${SEAT_LABEL[seat]} seat. Click to manage your account`, "ACCOUNT")}
      >
        <Icon name="account" size={12} />
        {SEAT_LABEL[seat]}
      </button>
    </header>
  );
}
