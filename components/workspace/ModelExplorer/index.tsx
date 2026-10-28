/**
 * components/workspace/ModelExplorer/index.tsx
 *
 * WHAT   The Model Explorer palette: tabs Model (the project tree), Views (the drawings: plans, site, topography,
 *        elevations, sections, sheets), Layers, Levels and Library. Every tab stays mounted and is only hidden, so
 *        the tree's expanded and rename state survives a tab switch. Tabs can be dragged into another order and
 *        closed with their × (View → Interfaces brings them back).
 *        The header has the eye (normal, large, header-only strip with the title running down it), the grip to
 *        move the window to the other edge of the screen, and × to hide it. Its inner edge can be dragged to any
 *        width.
 * FOR    Navigating and organising the model. The active tab is the workspace `explorer` state; the order and choice
 *        of tabs is `explorerTabs`; the width comes from a dragged `dockPx.explorer` or the --w-explorer CSS variable
 *        (app/globals.css).
 * DEBUG  - A tab is blank: check the workspace `explorer` value and that the tab component renders data for
 *          this project.
 *        - A tab is missing: it was closed (×) or the interface leaves it out; View → Interfaces lists them all.
 *        - The scroll area jumps when a scrollbar appears: it uses `gutter-stable` to reserve the scrollbar
 *          space (classic scrollbars on Windows and Linux).
 *        - A list opens at the top after a tab switch: the tabs share one scroll area, so each tab's offset is kept
 *          in `scrolled` and put back when the tab (or the folded window) shows again.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { DockToggle } from "@/components/ui/DockToggle";
import { tip } from "@/components/ui/Tooltip";
import type { Side } from "@/lib/layout";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { EXPLORER_IDS, type ExplorerId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DockClose, DockGrip, ResizeEdge } from "../DockChrome";
import { LayersTable } from "./LayersTable";
import { LevelsList } from "./LevelsList";
import { Library } from "./Library";
import { ModelTree } from "./ModelTree";
import { ViewsList } from "./ViewsList";

/** The name of each explorer tab. */
export const EXPLORER_LABEL: Record<ExplorerId, string> = { model: "Model", views: "Views", layers: "Layers", levels: "Levels", library: "Library" };
/** What each explorer tab is for. */
export const EXPLORER_DESC: Record<ExplorerId, string> = {
  model: "Project tree: levels, categories and elements",
  views: "Floor plans, site plan, topography, elevations, sections and sheets",
  layers: "Layer visibility, colour and lock",
  levels: "Floor elevations. Click to move the camera",
  library: "Components and materials",
};

/** Move `id` in front of `before` (or to the end) in a list. */
export function reorder<T>(list: T[], id: T, before: T | null): T[] {
  const out = list.filter((x) => x !== id);
  const i = before === null ? out.length : out.indexOf(before);
  out.splice(i < 0 ? out.length : i, 0, id);
  return out;
}

/* Model Explorer (268px normal, wider when large or dragged, a 32px header strip when minimised).
 * All tabs stay mounted so tree state survives tab switches and minimising. */
export function ModelExplorer({ edge = "left" }: { edge?: Side }) {
  const ws = useWsApi();
  const tab = useWs((s) => s.explorer);
  const tabs = useWs((s) => s.explorerTabs);
  const size = useWs((s) => s.dockSize.explorer);
  const px = useWs((s) => s.dockPx.explorer);
  const [dragging, setDragging] = useState<ExplorerId | null>(null);
  const min = size === "min";
  const strip = edge === "left" ? "left" : "right";
  // each tab keeps where it was scrolled: the tabs share one scroll area, which a shorter tab would pull back up
  const scroller = useRef<HTMLDivElement>(null);
  const scrolled = useRef<Partial<Record<ExplorerId, number>>>({});
  useLayoutEffect(() => {
    if (scroller.current && !min) scroller.current.scrollTop = scrolled.current[tab] ?? 0;
  }, [tab, min]);
  return (
    <aside
      aria-label="Model Explorer"
      data-size={size}
      data-dock="explorer"
      data-edge={edge}
      className={cn(
        "relative flex shrink-0 flex-col bg-panel transition-[width] duration-150",
        edge === "left" ? "border-r border-line" : "border-l border-line",
        min ? "w-[var(--w-dock-min)]" : size === "large" ? "w-[var(--w-explorer-large)]" : !px && "w-[var(--w-explorer)]",
      )}
      style={size === "mid" && px ? { width: px } : undefined}
      data-testid="explorer"
    >
      {!min && <ResizeEdge dock="explorer" edge={edge === "left" ? "right" : "left"} />}
      {/* header-only strip: the title runs down the side and a press anywhere on it restores the window */}
      {min && (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 py-1" data-testid="explorer-strip">
          <DockToggle dock="explorer" side={strip} className="!px-0.5" />
          <button className="label-xs min-h-0 flex-1 [writing-mode:vertical-rl] hover:text-t1" onClick={() => ws.getState().setDockSize("explorer", "mid")} aria-label="Restore Model Explorer">
            Model Explorer
          </button>
        </div>
      )}
      <div className={cn("flex min-h-0 flex-1 flex-col", min && "hidden")}>
        <div className="flex h-7 shrink-0 items-center gap-1 border-b border-soft pl-1 pr-1">
          <DockGrip dock="explorer" />
          <span className="label-xs flex-1 truncate">Model Explorer</span>
          <DockToggle dock="explorer" side={strip} />
          <DockClose dock="explorer" />
        </div>
        <div role="tablist" aria-label="Explorer Tabs" className="flex shrink-0 border-b border-soft" onDragOver={(e) => dragging && e.preventDefault()} onDrop={() => dragging && ws.getState().setExplorerTabs(reorder(tabs, dragging, null))}>
          {tabs.map((id) => (
            <div
              key={id}
              className="group relative flex min-w-0 flex-1"
              draggable
              onDragStart={(e) => {
                setDragging(id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", id);
              }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => dragging && dragging !== id && e.preventDefault()}
              onDrop={(e) => {
                e.stopPropagation();
                if (dragging && dragging !== id) ws.getState().setExplorerTabs(reorder(tabs, dragging, id));
                setDragging(null);
              }}
            >
              <button
                role="tab"
                aria-selected={tab === id}
                data-explorer-tab={id}
                onClick={() => ws.getState().setExplorer(id)}
                className={cn("h-7 min-w-0 flex-1 truncate px-1 text-[0.6875rem] font-medium transition-colors", tab === id ? "text-t1 shadow-[inset_0_-2px_0_var(--accent)]" : "text-t2 hover:bg-t1/8 hover:text-t1", dragging === id && "opacity-50")}
                {...tip(EXPLORER_LABEL[id], `${EXPLORER_DESC[id]}. Drag to reorder.`, id === "layers" ? "LAYER" : id === "library" ? "MATERIAL" : id === "views" ? "VIEWS" : undefined)}
              >
                {EXPLORER_LABEL[id]}
              </button>
              {tabs.length > 1 && (
                <button
                  type="button"
                  aria-label={`Close the ${EXPLORER_LABEL[id]} tab`}
                  data-testid={`explorer-tab-close-${id}`}
                  onClick={() => ws.getState().setExplorerTabs(tabs.filter((t) => t !== id))}
                  className="absolute right-0 top-0.5 hidden size-3.5 place-items-center rounded text-t3 hover:bg-t1/15 hover:text-t1 group-hover:grid"
                >
                  <Icon name="close" size={9} />
                </button>
              )}
            </div>
          ))}
          {tabs.length < EXPLORER_IDS.length && (
            <button
              type="button"
              className="grid h-7 w-6 shrink-0 place-items-center text-t3 hover:bg-t1/8 hover:text-t1"
              aria-label="Show a closed tab"
              data-testid="explorer-tab-add"
              onClick={() => ws.getState().setExplorerTabs([...tabs, ...EXPLORER_IDS.filter((t) => !tabs.includes(t))])}
              {...tip("Show closed tabs", EXPLORER_IDS.filter((t) => !tabs.includes(t)).map((t) => EXPLORER_LABEL[t]).join(", "))}
            >
              <Icon name="plus" size={12} />
            </button>
          )}
        </div>
        <div
          ref={scroller}
          className="gutter-stable min-h-0 flex-1 overflow-y-auto"
          onScroll={(e) => {
            if (!min) scrolled.current[tab] = e.currentTarget.scrollTop;
          }}
        >
          <div hidden={tab !== "model"}>
            <ModelTree />
          </div>
          <div hidden={tab !== "views"}>
            <ViewsList />
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
      </div>
    </aside>
  );
}
