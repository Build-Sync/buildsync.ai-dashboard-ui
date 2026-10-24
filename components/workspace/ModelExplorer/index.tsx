"use client";

import { tip } from "@/components/ui/Tooltip";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { EXPLORER_IDS, type ExplorerId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LayersTable } from "./LayersTable";
import { LevelsList } from "./LevelsList";
import { Library } from "./Library";
import { ModelTree } from "./ModelTree";

const LABEL: Record<ExplorerId, string> = { model: "Model", layers: "Layers", levels: "Levels", library: "Library" };
const DESC: Record<ExplorerId, string> = {
  model: "Project tree: levels, categories and elements",
  layers: "Layer visibility, colour and lock",
  levels: "Floor elevations. Click to move the camera",
  library: "Components and materials",
};

/* Left palette — Model Explorer (268px). All four tabs stay mounted so tree state survives tab switches. */
export function ModelExplorer() {
  const ws = useWsApi();
  const tab = useWs((s) => s.explorer);
  return (
    <aside aria-label="Model Explorer" className="flex w-[var(--w-explorer)] shrink-0 flex-col border-r border-line bg-panel" data-testid="explorer">
      <div className="flex h-7 shrink-0 items-center border-b border-soft px-2.5">
        <span className="label-xs">Model Explorer</span>
      </div>
      <div role="tablist" aria-label="Explorer tabs" className="flex shrink-0 border-b border-soft">
        {EXPLORER_IDS.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => ws.getState().setExplorer(id)}
            className={cn("h-7 flex-1 text-[0.6875rem] font-medium transition-colors", tab === id ? "text-t1 shadow-[inset_0_-2px_0_var(--accent)]" : "text-t2 hover:bg-t1/8 hover:text-t1")}
            {...tip(LABEL[id], DESC[id], id === "layers" ? "LAYER" : id === "library" ? "MATERIAL" : undefined)}
          >
            {LABEL[id]}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div hidden={tab !== "model"}>
          <ModelTree />
        </div>
        <div hidden={tab !== "layers"}>
          <LayersTable />
        </div>
        <div hidden={tab !== "levels"}>
          <LevelsList />
        </div>
        <div hidden={tab !== "library"}>
          <Library />
        </div>
      </div>
    </aside>
  );
}
