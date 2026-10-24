/**
 * components/workspace/ModelExplorer/LayersTable.tsx
 *
 * WHAT   The Layers tab: for each layer an eye (visible in the viewport), the name, a colour swatch and a lock.
 * FOR    Toggles `project.layers[].visible` and `.locked` in the workspace store (toggleLayer,
 *        toggleLayerLock); the ribbon's ELEC and PLUMB buttons toggle the same layers.
 * DEBUG  - A layer is toggled but nothing changes in the viewport: element layer ids in lib/scene must match
 *          the layer ids made by makeLayers() in lib/mock-data.ts.
 *        - A locked layer's elements cannot be selected or edited; ModelViewport shows an "is locked" toast.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Icon } from "@/components/icons";
import { tip } from "@/components/ui/Tooltip";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";

/* Layers: 👁 · Layer · colour swatch · 🔒. The eye toggles the layer in the viewport. */
export function LayersTable() {
  const ws = useWsApi();
  const layers = useWs((s) => s.project.layers);
  return (
    <div data-testid="layers-table">
      <div className="label-xs grid grid-cols-[1.75rem_1fr_2.25rem_1.75rem] items-center border-b border-soft px-1 py-1.5">
        <span className="text-center" aria-label="Visibility">
          <Icon name="showall" size={12} className="mx-auto" />
        </span>
        <span>Layer</span>
        <span className="text-center">Color</span>
        <span className="text-center" aria-label="Lock">
          <Icon name="lock" size={11} className="mx-auto" />
        </span>
      </div>
      {layers.map((l) => (
        <div key={l.id} className="grid h-7 grid-cols-[1.75rem_1fr_2.25rem_1.75rem] items-center border-b border-soft/60 px-1 text-[0.75rem] hover:bg-t1/5" data-layer={l.id}>
          <button
            aria-label={`${l.visible ? "Hide" : "Show"} ${l.name}`}
            aria-pressed={l.visible}
            onClick={() => ws.getState().toggleLayer(l.id)}
            className={cn("mx-auto grid size-5 place-items-center rounded transition-colors hover:bg-t1/10", l.visible ? "text-t1" : "text-t3")}
            {...tip(`${l.visible ? "Hide" : "Show"} ${l.name}`, "Toggle this layer in the viewport", l.id === "electrical" ? "ELEC" : l.id === "plumbing" ? "PLUMB" : "LAYER")}
          >
            <Icon name={l.visible ? "showall" : "hide"} size={14} />
          </button>
          <span className={cn("truncate", !l.visible && "text-t3")}>{l.name}</span>
          <span className="mx-auto size-3.5 rounded-sm border border-line" style={{ background: l.color }} aria-label={`${l.name} colour ${l.color}`} />
          <button
            aria-label={`${l.locked ? "Unlock" : "Lock"} ${l.name}`}
            aria-pressed={l.locked}
            onClick={() => ws.getState().toggleLayerLock(l.id)}
            className={cn("mx-auto grid size-5 place-items-center rounded transition-colors hover:bg-t1/10", l.locked ? "text-warn" : "text-t3")}
          >
            <Icon name={l.locked ? "lock" : "unlock"} size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
