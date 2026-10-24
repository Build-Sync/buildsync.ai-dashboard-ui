/**
 * components/workspace/ModelExplorer/Library.tsx
 *
 * WHAT   The Library tab: a Components grid (Wall, Door, Window, Column, Beam, Truss, Stair, Fixture,
 *        Furniture, Structural, MEP) and a Materials list with swatches and how many elements use each.
 *        Clicking a material highlights every element that uses it.
 * FOR    Starting a placement tool (setTool with a prompt) and highlighting materials (workspace
 *        `materialHighlight`). Usage counts come from materialUsage in lib/scene.
 * DEBUG  - Dragging a component onto the viewport does nothing yet: the drag source sets the type
 *          application/x-bs-component, but the viewport has no drop handler in this UI-only build. Clicking
 *          sets the active tool and shows the prompt.
 *        - A material is disabled: no element in the open scene uses it.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useMemo } from "react";
import { Icon, type IconKey } from "@/components/icons";
import { tip } from "@/components/ui/Tooltip";
import { materialUsage } from "@/lib/scene";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";
import { useScene } from "../hooks";

/* Library: Components grid (drag into the viewport) + Materials list with swatches.
 * Clicking a material highlights everywhere it's used. */

/** The placeable components shown in the Library grid. */
export const COMPONENTS: { id: string; label: string; icon: IconKey }[] = [
  { id: "wall", label: "Wall", icon: "wall" },
  { id: "door", label: "Door", icon: "door" },
  { id: "window", label: "Window", icon: "window" },
  { id: "column", label: "Column", icon: "column" },
  { id: "beam", label: "Beam", icon: "beam" },
  { id: "truss", label: "Truss", icon: "truss" },
  { id: "stair", label: "Stair", icon: "stair" },
  { id: "fixture", label: "Fixture", icon: "fixture" },
  { id: "furniture", label: "Furniture", icon: "furniture" },
  { id: "structural", label: "Structural", icon: "strparts" },
  { id: "mep", label: "MEP", icon: "mepparts" },
];

const MATERIALS: { id: string; swatch: string }[] = [
  { id: "Concrete", swatch: "#9aa0a8" },
  { id: "Steel", swatch: "#6f86a6" },
  { id: "Wood", swatch: "#a97c50" },
  { id: "Glass", swatch: "#7fc4e8" },
  { id: "Brick", swatch: "#b0553d" },
  { id: "Aluminum", swatch: "#c7ccd4" },
  { id: "Insulation", swatch: "#f0d46a" },
  { id: "Gypsum", swatch: "#e6e1d6" },
  { id: "Tile", swatch: "#d98c6a" },
  { id: "Custom", swatch: "conic-gradient(#ef5b5b,#f0a940,#3ecf8e,#4c8dff,#8b6cf0,#ef5b5b)" },
];

/** The Library tab (components and materials). */
export function Library() {
  const ws = useWsApi();
  const scene = useScene();
  const highlight = useWs((s) => s.materialHighlight);
  const usage = useMemo(() => materialUsage(scene), [scene]);
  return (
    <div data-testid="library">
      <p className="label-xs px-2.5 pb-1 pt-2">Components</p>
      <div className="grid grid-cols-4 gap-1 px-2">
        {COMPONENTS.map((c) => (
          <button
            key={c.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-bs-component", c.label);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => ws.getState().setTool(c.label.toUpperCase(), `Click in the viewport to place a ${c.label.toLowerCase()}:`)}
            className="flex flex-col items-center gap-1 rounded-md border border-line bg-panel-alt px-0.5 py-1.5 text-[0.625rem] text-t1 transition-colors hover:border-accent hover:text-accent"
            {...tip(c.label, "Drag into the viewport, or click then place", `${c.label.toUpperCase()}`)}
          >
            <Icon name={c.icon} size={18} />
            {c.label}
          </button>
        ))}
      </div>
      <p className="label-xs px-2.5 pb-1 pt-3">Materials</p>
      <ul className="px-2 pb-3">
        {MATERIALS.map((m) => {
          const n = usage[m.id]?.length ?? 0;
          const on = highlight === m.id;
          return (
            <li key={m.id}>
              <button
                aria-pressed={on}
                disabled={n === 0}
                onClick={() => ws.getState().setMaterialHighlight(on ? null : m.id)}
                className={cn("flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[0.75rem] transition-colors disabled:opacity-40", on ? "bg-accent/20 text-t1" : "text-t1 hover:bg-t1/8")}
              >
                <span className="size-4 shrink-0 rounded border border-line" style={{ background: m.swatch }} />
                <span className="flex-1">{m.id}</span>
                <span className="mono text-[0.6875rem] text-t3">{n ? `${n} used` : "—"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
