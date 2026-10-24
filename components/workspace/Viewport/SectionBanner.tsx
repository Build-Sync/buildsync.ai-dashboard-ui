/**
 * components/workspace/Viewport/SectionBanner.tsx
 *
 * WHAT   The pill at the top of the canvas while a section cut is on: "SECTION CUT ACTIVE · plane Y = 12.0 ft",
 *        a slider that moves the cutting plane and a close button.
 * FOR    Controlling the section plane (workspace `sectionY` and `section`). Mounted by ModelViewport only
 *        while the section is active.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Icon } from "@/components/icons";
import { tip } from "@/components/ui/Tooltip";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { useScene } from "../hooks";

/** "SECTION CUT ACTIVE · plane Y = 12.0 ft" with a slider to move the cutting plane. */
export function SectionBanner() {
  const ws = useWsApi();
  const scene = useScene();
  const y = useWs((s) => s.sectionY);
  const f = scene.footprint;
  return (
    <div className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-accent/70 bg-chrome/95 py-1 pl-3 pr-1.5 shadow-pop backdrop-blur" role="status">
      <span className="size-1.5 rounded-full bg-accent anim-pulse" />
      <span className="mono text-[0.6875rem] font-semibold tracking-wide text-t1">
        SECTION CUT ACTIVE <span className="text-t3">·</span> plane Y = <span className="text-accent">{y.toFixed(1)} ft</span>
      </span>
      <input
        type="range"
        aria-label="Section plane position (Y, feet)"
        min={f.y0 + 1}
        max={f.y1 - 1}
        step={0.5}
        value={y}
        onChange={(e) => ws.getState().setSectionY(Number(e.target.value))}
        className="h-1 w-24 cursor-pointer accent-[var(--accent)]"
        {...tip("Section plane", "Drag to move the cutting plane along Y", "SECTIONPLANE")}
      />
      <button
        onClick={() => ws.getState().setSection(false)}
        aria-label="Turn off section cut"
        className="grid size-5 place-items-center rounded-full text-t2 hover:bg-t1/10 hover:text-t1"
        {...tip("Turn off section", "Return to the full model", "SECTIONPLANE")}
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}
