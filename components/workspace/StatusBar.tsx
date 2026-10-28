/**
 * components/workspace/StatusBar.tsx
 *
 * WHAT   The 26 px bottom bar: drafting toggles (MODEL, GRID, SNAP, ORTHO, POLAR, OSNAP, OTRACK, 3DOSNAP, DYN, LWT;
 *        the small arrows next to OSNAP and POLAR open AutoCAD's menus: which object snaps are on, and the polar
 *        angle),
 *        live cursor coordinates in the chosen units, active level, unit system, drawing scale, the Plan Health
 *        Score chip, and the save state (a button that opens the Versions palette) with the active tool.
 * FOR    At-a-glance state and the AutoCAD-style toggles. Each toggle runs the command of the same name, so the
 *        keyboard (F-keys, typing) and the mouse stay in step.
 * DEBUG  - A toggle does nothing: its command must exist in lib/commands.ts (MODEL toggles the store directly).
 *        - "Saved N min ago" differs between server and browser: useRelative shows "Saved" on the first render
 *          and the live time only after mount, which avoids a hydration mismatch. "No changes yet" means
 *          nothing was ever saved and nothing changed.
 *        - Coordinates in the wrong format: fmtCoord uses Settings → Units.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { anchorOf, Menu, MenuItem, MenuLabel, MenuSep, type Anchor } from "@/components/ui/Menu";
import { tip } from "@/components/ui/Tooltip";
import type { OsnapMode } from "@/lib/settings";
import { levelLabel } from "@/lib/scene";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import type { ToggleKey } from "@/lib/store/workspace-store";
import { cn, fmtCoord } from "@/lib/utils";
import { useRunner } from "./hooks";

/* Status bar (26px): drafting toggles on the left, readouts on the right. */

const TOGGLES: { key: ToggleKey; label: string; desc: string }[] = [
  { key: "model", label: "MODEL", desc: "Model space" },
  { key: "grid", label: "GRID", desc: "Display the dot grid" },
  { key: "snap", label: "SNAP", desc: "Snap the cursor to the grid" },
  { key: "ortho", label: "ORTHO", desc: "Constrain to horizontal and vertical" },
  { key: "polar", label: "POLAR", desc: "Track at polar angles" },
  { key: "osnap", label: "OSNAP", desc: "Snap to end points, midpoints, centres, intersections … (the arrow picks which)" },
  { key: "otrack", label: "OTRACK", desc: "Object snap tracking: rest on a snap point, then move along the guide through it" },
  { key: "osnap3d", label: "3DOSNAP", desc: "Snap to 3D object geometry" },
  { key: "dyn", label: "DYN", desc: "Dynamic input at the cursor" },
  { key: "lwt", label: "LWT", desc: "Show lineweights" },
];

const OSNAP_MODES: { id: OsnapMode; label: string }[] = [
  { id: "endpoint", label: "Endpoint" },
  { id: "midpoint", label: "Midpoint" },
  { id: "center", label: "Center" },
  { id: "intersection", label: "Intersection" },
  { id: "perpendicular", label: "Perpendicular" },
  { id: "nearest", label: "Nearest" },
];
const POLAR_ANGLES = [15, 30, 45, 90] as const;

/** "Saved 2 min ago" for the last save; "No changes yet" before anything was saved. Time exists only on the client. */
function useRelative(base: number | null): string {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  if (base === null) return "No changes yet";
  if (now === null) return "Saved";
  const m = Math.max(0, Math.floor((now - base) / 60_000));
  return m < 1 ? "Saved just now" : `Saved ${m} min ago`;
}

/** The bottom status bar. */
export function StatusBar() {
  const ws = useWsApi();
  const { run } = useRunner();
  const toggles = useWs((s) => s.toggles);
  const cursor = useWs((s) => s.cursor);
  const level = useWs((s) => s.plan.level);
  const score = useWs((s) => s.project.health.score);
  const dirty = useWs((s) => s.dirty);
  const savedAt = useWs((s) => s.savedAt);
  const mode = useWs((s) => s.mode);
  const activeTool = useWs((s) => s.activeTool);
  const units = useApp((s) => s.settings.units);
  const gridSnap = useApp((s) => s.settings.gridSnap);
  const app = useAppApi();
  const router = useRouter();
  const [menu, setMenu] = useState<{ which: "osnap" | "polar"; anchor: Anchor } | null>(null);
  const saved = useRelative(savedAt);
  const closeMenu = () => setMenu(null);
  // the menu arrow of OSNAP and POLAR: its own small button after the label, split from it by a thin line, never
  // overlapping the word; the active underline runs under both
  const arrow = (which: "osnap" | "polar", label: string, on: boolean) => (
    <button
      key={`${which}-menu`}
      className={cn(
        "flex w-4 items-center justify-center border-l border-soft/70 text-t3 transition-colors hover:bg-t1/10 hover:text-t1",
        on && "shadow-[inset_0_-2px_0_var(--accent)]",
        menu?.which === which && "bg-t1/10 text-t1",
      )}
      aria-haspopup="menu"
      aria-expanded={menu?.which === which}
      aria-label={label}
      data-testid={`${which}-menu`}
      onClick={(e) => setMenu({ which, anchor: anchorOf(e.currentTarget, { up: true })! })}
      {...tip(label, which === "osnap" ? "Choose the object snaps: endpoint, midpoint, intersection …" : "Choose the polar tracking angle")}
    >
      <Icon name="chevUp" size={10} strokeWidth={2.2} />
    </button>
  );

  const sys = units.system === "imperial" ? "ft-in" : units.system === "metric-m" ? "m" : "mm";
  const fmt = (n: number | undefined) => (n === undefined ? "—" : fmtCoord(n, units.system, units.precision));
  const scoreTone = score >= 80 ? "text-ok" : score >= 60 ? "text-warn" : score > 0 ? "text-bad" : "text-t3";

  return (
    <footer className="mono flex h-[var(--h-status)] shrink-0 items-stretch border-t border-line bg-chrome text-[0.6875rem]" data-testid="statusbar">
      <div className="flex items-stretch" role="toolbar" aria-label="Drafting Toggles">
        {TOGGLES.map((t) => {
          const split = t.key === "osnap" || t.key === "polar";
          return (
            <span key={t.key} className="flex items-stretch">
              <button
                aria-pressed={toggles[t.key]}
                data-toggle={t.key}
                onClick={() => (t.key === "model" ? ws.getState().toggle("model") : run(t.label))}
                className={cn("px-2 transition-colors hover:bg-t1/10", split && "pr-1.5", toggles[t.key] ? "font-medium text-t1 shadow-[inset_0_-2px_0_var(--accent)]" : "text-t3")}
                {...tip(t.label, t.desc, t.label)}
              >
                {t.label}
              </button>
              {split && arrow(t.key as "osnap" | "polar", t.key === "osnap" ? "Object Snap Modes" : "Polar Angle", toggles[t.key])}
            </span>
          );
        })}
      </div>
      <Menu anchor={menu?.which === "osnap" ? menu.anchor : null} onClose={closeMenu} label="Object Snap Modes" width="13rem">
        <MenuLabel>Object Snaps</MenuLabel>
        {OSNAP_MODES.map((m) => (
          <MenuItem
            key={m.id}
            label={m.label}
            checked={gridSnap.osnap[m.id]}
            keepOpen
            onClick={() => app.getState().patchSettings((d) => (d.gridSnap.osnap[m.id] = !d.gridSnap.osnap[m.id]))}
          />
        ))}
        <MenuSep />
        <MenuItem label="Object Snap Tracking" checked={toggles.otrack} keepOpen onClick={() => run("OTRACK")} />
        <MenuItem label="Object Snap Settings…" icon="settings" onClick={() => router.push("/settings/grid-snap")} onClose={closeMenu} />
      </Menu>
      <Menu anchor={menu?.which === "polar" ? menu.anchor : null} onClose={closeMenu} label="Polar Angle" width="11rem">
        <MenuLabel>Polar Angle</MenuLabel>
        {POLAR_ANGLES.map((a) => (
          <MenuItem
            key={a}
            label={`${a}°`}
            checked={gridSnap.polarAngle === a}
            onClick={() => {
              app.getState().patchSettings((d) => {
                d.gridSnap.polarAngle = a;
                d.gridSnap.polar = true;
              });
            }}
            onClose={closeMenu}
          />
        ))}
        <MenuSep />
        <MenuItem label="Ortho (straight lines)" checked={toggles.ortho} keepOpen onClick={() => run("ORTHO")} hint="F8" />
      </Menu>
      <div className="flex-1" />
      <div className="flex items-center gap-3 pr-2 text-t2">
        <span className="w-[13.5rem] text-right tabular-nums" data-testid="coords" {...tip("Cursor", "Model coordinates x, y, z", undefined)}>
          {cursor ? `${fmt(cursor.x)}, ${fmt(cursor.y)}, ${fmt(cursor.z)}` : "—, —, —"}
        </span>
        <span className="text-t3">|</span>
        <button className="hover:text-t1" onClick={() => ws.getState().setExplorer("levels")} {...tip("Active Level", "Open the Levels tab in the Model Explorer")}>
          {levelLabel(level)}
        </button>
        <span>{sys}</span>
        <span className="hidden lg:inline">1/4&quot; = 1&apos;-0&quot;</span>
        <button
          className="flex items-center gap-1 hover:text-t1"
          onClick={() => ws.getState().setPanel("health")}
          data-testid="health-chip"
          {...tip("Plan Health Score", "0–100 across compliance, structural, cost and schedule. Click to open", "HEALTH")}
        >
          <span className={cn("size-1.5 rounded-full bg-current", scoreTone)} />
          <span className={scoreTone}>{score || "—"}</span>
        </button>
        <button
          className={cn("flex items-center gap-1 hover:text-t1", dirty ? "text-warn" : "text-t2")}
          data-testid="save-state"
          onClick={() => {
            ws.getState().patch({ versionsTab: "versions" });
            ws.getState().setPanel("versions");
          }}
          {...tip("Save State", mode === "demo" ? "Work is saved in this browser. Click for the version history" : "Click for the version history", "VERSIONS")}
        >
          <span className={cn("size-1.5 rounded-full bg-current", dirty ? "text-warn" : "text-ok")} />
          {dirty ? "Unsaved changes" : saved}
        </button>
        <span className="hidden text-t3 md:inline">{activeTool ? `Tool: ${activeTool}` : "Tool: Select"}</span>
      </div>
    </footer>
  );
}
