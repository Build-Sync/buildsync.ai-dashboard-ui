/**
 * components/workspace/ModelExplorer/LevelsList.tsx
 *
 * WHAT   The Levels tab: the floors with their elevation (Roof, Level 2, Level 1, Foundation, Site). Clicking
 *        one moves the camera to that floor's elements; in 2D, Level 1 and Level 2 switch the plan.
 * FOR    Level navigation. Elevations follow Settings → Units (ft-in labels in imperial, fmtLength otherwise).
 * DEBUG  - Clicking Roof or Foundation does not switch the plan: only level1 and level2 have a plan view.
 *        - The camera does not move: focusElements receives at most 60 element ids of that level (topography
 *          and landscape are skipped).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Icon } from "@/components/icons";
import type { LevelKey } from "@/lib/scene";
import { useApp } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn, fmtLength } from "@/lib/utils";
import { useScene } from "../hooks";

/* Levels: Roof +19.5 · Level 2 · Level 1 ±0.0 · Foundation −2.5 · Site −4.0.
 * Clicking a level moves the camera to that floor. */
export function LevelsList() {
  const ws = useWsApi();
  const project = useWs((s) => s.project);
  const view = useWs((s) => s.view);
  const planLevel = useWs((s) => s.plan.level);
  const units = useApp((s) => s.settings.units);
  const scene = useScene();

  const go = (id: string) => {
    const s = ws.getState();
    const key = id as LevelKey;
    if (key === "level1" || key === "level2") s.setPlan({ level: key });
    const ids = scene.elements.filter((e) => e.level === key && e.layer !== "topography" && e.layer !== "landscape").map((e) => e.id);
    if (view === "3d" || !(key === "level1" || key === "level2")) {
      if (key === "level1" || key === "level2") s.setPlan({ level: key });
      if (ids.length) s.focusElements(ids.slice(0, 60));
    }
  };

  return (
    <div className="p-1.5" data-testid="levels-list">
      <ul className="space-y-1">
        {project.levels.map((l) => {
          const active = (l.id === "level1" || l.id === "level2") && planLevel === l.id;
          return (
            <li key={l.id}>
              <button
                onClick={() => go(l.id)}
                aria-current={active}
                className={cn("flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors", active ? "border-accent bg-accent/15" : "border-line bg-panel-alt hover:border-t3")}
              >
                <Icon name="layers" size={14} className={active ? "text-accent" : "text-t3"} />
                <span className="flex-1 text-[0.75rem] font-medium text-t1">{l.name}</span>
                <span className="mono text-[0.6875rem] text-t2">{units.system === "imperial" ? l.label : `${fmtLength(l.elevation, units.system, 1)}`}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 px-1 text-[0.6875rem] leading-snug text-t3">Click a level to move the camera to that floor. In 2D, Level 1 and Level 2 switch the plan.</p>
    </div>
  );
}
