/**
 * components/workspace/ModelExplorer/Library.tsx
 *
 * WHAT   The Library tab: a Components grid (Wall, Door, Window, Column, Beam, Truss, Stair, Fixture,
 *        Furniture, Structural, MEP), the Furniture catalogue (every piece of lib/draw/furniture.ts by room, each
 *        with its plan symbol) and a Materials list with swatches and how many elements use each. Clicking a
 *        material highlights every element that uses it.
 * FOR    Starting a placement tool: a click starts it, a drag onto the viewport (2D or 3D) starts it and places
 *        one at the drop point (ModelViewport's drop handler reads application/x-bs-component and, for a piece of
 *        furniture, application/x-bs-furniture). Highlighting materials (workspace `materialHighlight`).
 * DEBUG  - A dropped piece comes in as the wrong one: the drop sets the FURN tool's "type" option before
 *          placing; check toolOpts.FURN in the workspace store.
 *        - A material is disabled: no element in the open scene uses it.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useMemo } from "react";
import { Icon, type IconKey } from "@/components/icons";
import { tip } from "@/components/ui/Tooltip";
import { FURNITURE, FURNITURE_GROUPS, planShapes, type Piece } from "@/lib/draw/furniture";
import { materialUsage } from "@/lib/scene";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";
import { useRunner, useScene } from "../hooks";

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

/** The command each library component starts (a click, or a drop on the viewport). */
export const COMPONENT_COMMAND: Record<string, string> = {
  Wall: "WALL", Door: "DOOR", Window: "WINDOW", Column: "COLUMN", Beam: "BEAM", Truss: "TRUSS", Stair: "STAIR",
  Fixture: "FIXT", Furniture: "FURN", Structural: "STRLIB", MEP: "MEPLIB",
};

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
  const { run } = useRunner();
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
            onClick={() => run(COMPONENT_COMMAND[c.label] ?? c.label.toUpperCase())}
            className="flex flex-col items-center gap-1 rounded-md border border-line bg-panel-alt px-0.5 py-1.5 text-[0.625rem] text-t1 transition-colors hover:border-accent hover:text-accent"
            {...tip(c.label, "Drag into the viewport, or click then place", `${c.label.toUpperCase()}`)}
          >
            <Icon name={c.icon} size={18} />
            {c.label}
          </button>
        ))}
      </div>
      <p className="label-xs px-2.5 pb-1 pt-3">Furniture</p>
      <div className="space-y-2 px-2" data-testid="furniture-library">
        {FURNITURE_GROUPS.map((g) => (
          <div key={g}>
            <p className="px-0.5 pb-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-t3">{g}</p>
            <div className="grid grid-cols-3 gap-1">
              {Object.values(FURNITURE)
                .filter((pc) => pc.group === g)
                .map((pc) => (
                  <button
                    key={pc.id}
                    draggable
                    data-testid={`furn-${pc.id}`}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/x-bs-component", "Furniture");
                      e.dataTransfer.setData("application/x-bs-furniture", pc.id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => {
                      chooseFurniture(ws, pc.id);
                      run("FURN");
                    }}
                    className="flex flex-col items-center gap-0.5 rounded-md border border-line bg-panel-alt px-0.5 py-1 text-[0.5625rem] leading-tight text-t1 transition-colors hover:border-accent hover:text-accent"
                    {...tip(pc.label, `${pc.w.toFixed(1)} × ${pc.d.toFixed(1)} ft, ${pc.h.toFixed(1)} ft high. Click, then click in the 2D plan or the 3D view (R turns it); or drag it there`, "FURN")}
                  >
                    <PieceThumb pc={pc} />
                    <span className="line-clamp-2 text-center">{pc.label.split(" (")[0]}</span>
                  </button>
                ))}
            </div>
          </div>
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

/** Make `id` the piece the FURN tool places next (the Library's click and drop, and the furniture menu). */
export function chooseFurniture(ws: ReturnType<typeof useWsApi>, id: string): void {
  const s = ws.getState();
  s.patch({ toolOpts: { ...s.toolOpts, FURN: { ...(s.toolOpts.FURN ?? {}), type: id } } });
}

/** A piece's plan symbol, fitted into a small square. */
function PieceThumb({ pc }: { pc: Piece }) {
  const shapes = planShapes(pc, [0, 0], 0);
  const xs = shapes.flatMap((p) => p.map((q) => q[0]));
  const ys = shapes.flatMap((p) => p.map((q) => q[1]));
  const x0 = Math.min(...xs);
  const y1 = Math.max(...ys);
  const k = 28 / Math.max(Math.max(...xs) - x0, y1 - Math.min(...ys), 0.1);
  const ox = (32 - (Math.max(...xs) - x0) * k) / 2;
  const oy = (32 - (y1 - Math.min(...ys)) * k) / 2;
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      {shapes.map((p, i) => (
        <polygon key={i} points={p.map(([x, y]) => `${(ox + (x - x0) * k).toFixed(1)},${(oy + (y1 - y) * k).toFixed(1)}`).join(" ")} fill={i === 0 ? "currentColor" : "none"} fillOpacity={0.12} stroke="currentColor" strokeWidth={0.8} strokeLinejoin="round" />
      ))}
    </svg>
  );
}

