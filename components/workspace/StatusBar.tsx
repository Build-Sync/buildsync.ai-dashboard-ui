/**
 * components/workspace/StatusBar.tsx
 *
 * WHAT   The 26 px bottom bar: drafting toggles (MODEL, GRID, SNAP, ORTHO, POLAR, OSNAP, 3DOSNAP, DYN, LWT),
 *        live cursor coordinates in the chosen units, active level, unit system, drawing scale, the Plan Health
 *        Score chip, and the save state with the active tool.
 * FOR    At-a-glance state and the AutoCAD-style toggles. Each toggle runs the command of the same name, so the
 *        keyboard (F-keys, typing) and the mouse stay in step.
 * DEBUG  - A toggle does nothing: its command must exist in lib/commands.ts (MODEL toggles the store directly).
 *        - "Saved N min ago" differs between server and browser: useRelative shows fixed mock text on the first
 *          render and the live time only after mount, which avoids a hydration mismatch.
 *        - Coordinates in the wrong format: fmtCoord uses Settings → Units.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useEffect, useState } from "react";
import { tip } from "@/components/ui/Tooltip";
import { levelLabel } from "@/lib/scene";
import { useApp } from "@/lib/store/app-provider";
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
  { key: "osnap", label: "OSNAP", desc: "Snap to object geometry" },
  { key: "osnap3d", label: "3DOSNAP", desc: "Snap to 3D object geometry" },
  { key: "dyn", label: "DYN", desc: "Dynamic input at the cursor" },
  { key: "lwt", label: "LWT", desc: "Show lineweights" },
];

/** "Saved 2 min ago". Time only exists on the client, so the first render (and SSR) show the static mock text. */
function useRelative(base: number | null): string {
  const [clock, setClock] = useState<{ now: number; mount: number } | null>(null);
  useEffect(() => {
    const tick = () => setClock((c) => ({ now: Date.now(), mount: c?.mount ?? Date.now() }));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  if (!clock) return "Saved 2 min ago";
  const t = base ?? clock.mount - 2 * 60_000;
  const m = Math.max(0, Math.floor((clock.now - t) / 60_000));
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
  const saved = useRelative(savedAt);

  const sys = units.system === "imperial" ? "ft-in" : units.system === "metric-m" ? "m" : "mm";
  const fmt = (n: number | undefined) => (n === undefined ? "—" : fmtCoord(n, units.system, units.precision));
  const scoreTone = score >= 80 ? "text-ok" : score >= 60 ? "text-warn" : score > 0 ? "text-bad" : "text-t3";

  return (
    <footer className="mono flex h-[var(--h-status)] shrink-0 items-stretch border-t border-line bg-chrome text-[0.6875rem]" data-testid="statusbar">
      <div className="flex items-stretch" role="toolbar" aria-label="Drafting toggles">
        {TOGGLES.map((t) => (
          <button
            key={t.key}
            aria-pressed={toggles[t.key]}
            onClick={() => (t.key === "model" ? ws.getState().toggle("model") : run(t.label))}
            className={cn("px-2 transition-colors hover:bg-t1/10", toggles[t.key] ? "font-medium text-t1 shadow-[inset_0_-2px_0_var(--accent)]" : "text-t3")}
            {...tip(t.label, t.desc, t.label)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-3 pr-2 text-t2">
        <span className="w-[13.5rem] text-right tabular-nums" data-testid="coords" {...tip("Cursor", "Model coordinates x, y, z", undefined)}>
          {cursor ? `${fmt(cursor.x)}, ${fmt(cursor.y)}, ${fmt(cursor.z)}` : "—, —, —"}
        </span>
        <span className="text-t3">|</span>
        <button className="hover:text-t1" onClick={() => ws.getState().setExplorer("levels")} {...tip("Active level", "Open the Levels tab in the Model Explorer")}>
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
        <span className={cn("flex items-center gap-1", dirty ? "text-warn" : "text-t2")} data-testid="save-state">
          <span className={cn("size-1.5 rounded-full bg-current", dirty ? "text-warn" : "text-ok")} />
          {mode === "demo" ? "Demo · not saved" : dirty ? "Unsaved changes" : saved}
        </span>
        <span className="hidden text-t3 md:inline">{activeTool ? `Tool: ${activeTool}` : "Tool: Select"}</span>
      </div>
    </footer>
  );
}
