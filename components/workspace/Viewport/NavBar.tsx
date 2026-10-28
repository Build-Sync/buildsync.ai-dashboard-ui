/**
 * components/workspace/Viewport/NavBar.tsx
 *
 * WHAT   The navigation bar on the right edge of the canvas: Select, Pan, Zoom, Orbit, Walkthrough and Zoom
 *        Extents buttons. Orbit and Walkthrough are disabled in the 2D plan.
 * FOR    Choosing the navigation tool (workspace `navTool`) that a plain left-drag uses in ModelViewport;
 *        hidden by Settings → Display → Show navigation bar.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Icon, type IconKey } from "@/components/icons";
import { tip } from "@/components/ui/Tooltip";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import type { NavTool } from "@/lib/store/workspace-store";
import { cn } from "@/lib/utils";

/* Navigation bar (right edge): Select · Pan · Zoom · Orbit · Walkthrough · Zoom Extents. */

const TOOLS: { id: NavTool; icon: IconKey; label: string; desc: string; cmd: string }[] = [
  { id: "select", icon: "pointer", label: "Select", desc: "Click to select. Drag on empty space for a window (left to right: inside; right to left: touching). Drag an element to move it; drag a grip to reshape. Alt+drag orbits", cmd: "SELECT" },
  { id: "pan", icon: "hand", label: "Pan", desc: "Drag to pan. Middle mouse, or Space + drag, also pans", cmd: "PAN" },
  { id: "zoom", icon: "zoomIn", label: "Zoom", desc: "Drag up or down to zoom. A mouse wheel or trackpad pinch also zooms", cmd: "ZOOM" },
  { id: "orbit", icon: "orbit", label: "Orbit", desc: "Drag to orbit the 3D model", cmd: "3DORBIT" },
  { id: "walk", icon: "walk", label: "Walkthrough", desc: "Drag to look around at eye level", cmd: "3DWALK" },
];

/** The navigation toolbar; `onWalk` starts the walkthrough camera. */
export function NavBar({ onWalk }: { onWalk: () => void }) {
  const ws = useWsApi();
  const tool = useWs((s) => s.navTool);
  const view = useWs((s) => s.view);
  return (
    <div className="absolute right-2 top-2 z-10 flex flex-col gap-px overflow-hidden rounded-lg border border-line bg-chrome/90 backdrop-blur" role="toolbar" aria-label="Navigation Bar" aria-orientation="vertical">
      {TOOLS.map((t) => {
        const disabled = view === "2d" && (t.id === "orbit" || t.id === "walk");
        return (
          <button
            key={t.id}
            disabled={disabled}
            aria-pressed={tool === t.id}
            aria-label={t.label}
            onClick={() => {
              if (t.id === "walk") onWalk();
              else ws.getState().setNavTool(t.id);
            }}
            className={cn("grid size-7 place-items-center transition-colors disabled:opacity-30", tool === t.id ? "bg-accent text-on-accent" : "text-t2 hover:bg-t1/10 hover:text-t1")}
            {...tip(t.label, t.desc, t.cmd)}
          >
            <Icon name={t.icon} size={15} />
          </button>
        );
      })}
      <button
        aria-label="Zoom Extents"
        onClick={() => ws.getState().zoomExtents()}
        className="grid size-7 place-items-center border-t border-soft text-t2 hover:bg-t1/10 hover:text-t1"
        {...tip("Zoom Extents", "Fit the model to the window", "ZOOM E")}
      >
        <Icon name="zoomext" size={15} />
      </button>
    </div>
  );
}
