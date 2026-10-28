/**
 * components/workspace/Palettes/index.tsx
 *
 * WHAT   The palette dock (right edge by default, either edge by the grip): a wrapping row of tab chips (Properties,
 *        Health, Compliance, Cost, Comments, Issues, Simulation, Stress Test, Clash, AI Analysis, Council, Versions,
 *        Site, Links) with count badges, a title bar with the grip (move to the other edge), the eye (normal, large,
 *        header-only strip) and × (hide), and the body of the active palette. Chips can be dragged into another
 *        order and closed with their ×; the "+" chip brings closed ones back. The inner edge drags to any width.
 *        Results palettes end with the advisory footer.
 * FOR    Choosing which palette is shown (workspace `panel`). META defines each palette's label, icon, tooltip
 *        and command; BODY maps it to its component. The footer follows Settings → General → Advisory banner.
 * DEBUG  - A palette tab is missing: it must be in PALETTE_IDS (lib/types.ts), META and BODY.
 *        - A badge count looks wrong: useBadge counts failed checks, unresolved issues, clashes and unresolved
 *          comments of the open project.
 *        - The body keeps stale local state after a tab switch: the body is keyed by the panel id, so it
 *          remounts.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useCallback, useState } from "react";
import { Icon, type IconKey } from "@/components/icons";
import { AdvisoryNote } from "@/components/ui/controls";
import { DockToggle } from "@/components/ui/DockToggle";
import { anchorOf, Menu, MenuItem, MenuLabel, type Anchor } from "@/components/ui/Menu";
import { tip } from "@/components/ui/Tooltip";
import type { Side } from "@/lib/layout";
import { useApp } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { PALETTE_IDS, type PaletteId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DockClose, DockGrip, ResizeEdge } from "../DockChrome";
import { reorder } from "../ModelExplorer";
import { AiAnalysis } from "./AiAnalysis";
import { Clash } from "./Clash";
import { Compliance } from "./Compliance";
import { Comments } from "./Comments";
import { Cost } from "./Cost";
import { Council } from "./Council";
import { Health } from "./Health";
import { Issues } from "./Issues";
import { LinksPalette } from "./Links";
import { Properties } from "./Properties";
import { Simulation } from "./Simulation";
import { StressTest } from "./StressTest";
import { SitePalette } from "./Site";
import { Versions } from "./Versions";

const META: Record<PaletteId, { label: string; title: string; icon: IconKey; desc: string; cmd: string; advisory: boolean }> = {
  properties: { label: "Properties", title: "Properties", icon: "pencil", desc: "Selected element: general, geometry, appearance, material, structural, cost", cmd: "PROPERTIES", advisory: false },
  health: { label: "Health", title: "Plan Health", icon: "activity", desc: "0–100 score across compliance, structural, cost and schedule", cmd: "HEALTH", advisory: true },
  compliance: { label: "Compliance", title: "Compliance", icon: "codecheck", desc: "Code checks with the section cited", cmd: "CODECHECK", advisory: true },
  cost: { label: "Cost", title: "Cost", icon: "cost", desc: "Total, breakdown, materials and workforce", cmd: "COST", advisory: true },
  comments: { label: "Comments", title: "Comments", icon: "comment", desc: "Threads pinned to the model", cmd: "COMMENT", advisory: false },
  issues: { label: "Issues", title: "Issues", icon: "issue", desc: "Severity, assignee, status and due date", cmd: "ISSUE", advisory: true },
  simulation: { label: "Simulation", title: "Disaster Simulation", icon: "simulate", desc: "Scenario builder: hurricane, seismic, flood and more", cmd: "SIMULATE", advisory: true },
  "stress-test": { label: "Stress Test", title: "Stress Test", icon: "stress", desc: "Element, load case, conditions and mesh", cmd: "STRESS", advisory: true },
  clash: { label: "Clash Det.", title: "Clash Detection", icon: "clash", desc: "Hard and soft clashes with recommended fixes", cmd: "CLASH", advisory: true },
  "ai-analysis": { label: "AI Analysis", title: "AI Analysis", icon: "aireview", desc: "Recommendations from your connected agent", cmd: "AIREVIEW", advisory: true },
  council: { label: "Council", title: "Agent Council", icon: "council", desc: "Several agents debate a decision and vote", cmd: "COUNCIL", advisory: true },
  versions: { label: "Versions", title: "Version History", icon: "versions", desc: "Save, compare and restore versions of this project", cmd: "VERSIONS", advisory: false },
  site: { label: "Site", title: "Site & Map", icon: "mapIcon", desc: "Coordinates, property line, Google Maps and the land around the site", cmd: "GEOLOCATE", advisory: false },
  links: { label: "Links", title: "Linked Projects", icon: "xref", desc: "Other projects on this parcel: linked (live) or merged copies", cmd: "LINKS", advisory: false },
};

const BODY: Record<PaletteId, () => React.ReactNode> = {
  properties: () => <Properties />,
  health: () => <Health />,
  compliance: () => <Compliance />,
  cost: () => <Cost />,
  comments: () => <Comments />,
  issues: () => <Issues />,
  simulation: () => <Simulation />,
  "stress-test": () => <StressTest />,
  clash: () => <Clash />,
  "ai-analysis": () => <AiAnalysis />,
  council: () => <Council />,
  versions: () => <Versions />,
  site: () => <SitePalette />,
  links: () => <LinksPalette />,
};

function useBadge(id: PaletteId): { n: number; tone: string } | null {
  const checks = useWs((s) => s.project.checks);
  const issues = useWs((s) => s.project.issues);
  const clashes = useWs((s) => s.project.clashes);
  const comments = useWs((s) => s.project.comments);
  const counts: Partial<Record<PaletteId, { n: number; tone: string }>> = {
    compliance: { n: checks.filter((c) => c.status === "fail").length, tone: "bg-bad" },
    issues: { n: issues.filter((i) => i.status !== "resolved").length, tone: "bg-warn" },
    clash: { n: clashes.length, tone: "bg-bad" },
    comments: { n: comments.filter((c) => !c.resolved).length, tone: "bg-accent" },
  };
  const b = counts[id];
  return b && b.n > 0 ? b : null;
}

function Chip({ id, dragging, setDragging }: { id: PaletteId; dragging: PaletteId | null; setDragging: (v: PaletteId | null) => void }) {
  const ws = useWsApi();
  const active = useWs((s) => s.panel === id);
  const tabs = useWs((s) => s.paletteTabs);
  const m = META[id];
  const badge = useBadge(id);
  return (
    <div
      className="group relative"
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
        if (dragging && dragging !== id) ws.getState().setPaletteTabs(reorder(tabs, dragging, id));
        setDragging(null);
      }}
    >
      <button
        role="tab"
        aria-selected={active}
        data-palette-tab={id}
        onClick={() => ws.getState().setPanel(id)}
        className={cn(
          "relative flex h-6 items-center gap-1 rounded-md border px-1.5 text-[0.6875rem] transition-colors",
          active ? "border-accent bg-accent/15 font-semibold text-t1" : "border-transparent text-t2 hover:border-line hover:bg-t1/8 hover:text-t1",
          dragging === id && "opacity-50",
        )}
        {...tip(m.title, `${m.desc}. Drag to reorder; × closes the tab.`, m.cmd)}
      >
        <Icon name={m.icon} size={12} className={active ? "text-accent" : undefined} />
        {m.label}
        {badge && <span className={cn("mono ml-0.5 grid min-w-[1.0625rem] place-items-center rounded-full px-1 text-[0.5625rem] font-bold leading-[1.0625rem] text-white", badge.tone)}>{badge.n}</span>}
      </button>
      <button
        type="button"
        aria-label={`Close the ${m.label} tab`}
        data-testid={`palette-tab-close-${id}`}
        onClick={() => ws.getState().setPaletteTabs(tabs.filter((t) => t !== id))}
        className="absolute -right-1 -top-1 hidden size-3.5 place-items-center rounded-full border border-line bg-chrome text-t3 shadow-sm hover:text-t1 group-hover:grid"
      >
        <Icon name="close" size={8} />
      </button>
    </div>
  );
}

/** The "+" chip: the closed palette tabs, to bring one back. */
function AddChip() {
  const ws = useWsApi();
  const tabs = useWs((s) => s.paletteTabs);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const closed = PALETTE_IDS.filter((id) => !tabs.includes(id));
  if (!closed.length) return null;
  return (
    <>
      <button
        type="button"
        data-testid="palette-tab-add"
        aria-label="Show a closed palette"
        onClick={(e) => setAnchor(anchor ? null : anchorOf(e.currentTarget))}
        className="grid h-6 w-6 place-items-center rounded-md border border-dashed border-line text-t3 hover:border-t3 hover:text-t1"
        {...tip("Closed palettes", `${closed.length} closed: ${closed.map((c) => META[c].label).join(", ")}`)}
      >
        <Icon name="plus" size={12} />
      </button>
      <Menu anchor={anchor} onClose={close} label="Closed Palettes" width="13rem">
        <MenuLabel>Show a palette again</MenuLabel>
        {closed.map((id) => (
          <MenuItem key={id} icon={META[id].icon} label={META[id].title} onClick={() => ws.getState().setPanel(id)} onClose={close} />
        ))}
        <MenuItem label="Show all" icon="plus" onClick={() => ws.getState().setPaletteTabs([...tabs, ...closed])} onClose={close} />
      </Menu>
    </>
  );
}

/* Right palette (330px, tabbed). Tabs wrap; results palettes carry the advisory footer. */
export function PaletteDock({ edge = "right" }: { edge?: Side }) {
  const ws = useWsApi();
  const panel = useWs((s) => s.panel);
  const tabs = useWs((s) => s.paletteTabs);
  const size = useWs((s) => s.dockSize.palettes);
  const px = useWs((s) => s.dockPx.palettes);
  const advisory = useApp((s) => s.settings.general.advisoryBanner);
  const [dragging, setDragging] = useState<PaletteId | null>(null);
  const m = META[panel];
  const min = size === "min";
  return (
    <aside
      aria-label="Palettes"
      data-size={size}
      data-dock="palettes"
      data-edge={edge}
      className={cn(
        "relative flex shrink-0 flex-col bg-panel transition-[width] duration-150",
        edge === "right" ? "border-l border-line" : "border-r border-line",
        min ? "w-[var(--w-dock-min)]" : size === "large" ? "w-[var(--w-palette-large)]" : !px && "w-[var(--w-palette)]",
      )}
      style={size === "mid" && px ? { width: px } : undefined}
      data-testid="palettes"
    >
      {!min && <ResizeEdge dock="palettes" edge={edge === "right" ? "left" : "right"} />}
      {/* header-only strip: the active palette's title runs down the side; a press on it restores the window */}
      {min && (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 py-1" data-testid="palettes-strip">
          <DockToggle dock="palettes" side={edge} className="!px-0.5" />
          <Icon name={m.icon} size={13} className="text-accent" />
          <button className="label-xs min-h-0 flex-1 [writing-mode:vertical-rl] hover:text-t1" onClick={() => ws.getState().setDockSize("palettes", "mid")} aria-label={`Restore ${m.title}`}>
            {m.title}
          </button>
        </div>
      )}
      <div className={cn("flex min-h-0 flex-1 flex-col", min && "hidden")}>
        <div role="tablist" aria-label="Palette Tabs" className="flex shrink-0 flex-wrap gap-0.5 border-b border-soft p-1.5" onDragOver={(e) => dragging && e.preventDefault()} onDrop={() => dragging && ws.getState().setPaletteTabs(reorder(tabs, dragging, null))}>
          {tabs.map((id) => (
            <Chip key={id} id={id} dragging={dragging} setDragging={setDragging} />
          ))}
          <AddChip />
        </div>
        <div className="flex h-7 shrink-0 items-center gap-1 border-b border-soft pl-1 pr-1">
          <DockGrip dock="palettes" />
          <Icon name={m.icon} size={13} className="text-accent" />
          <span className="label-xs flex-1 truncate !text-t1">{m.title}</span>
          <DockToggle dock="palettes" side={edge} />
          <DockClose dock="palettes" />
        </div>
        <div role="tabpanel" className="gutter-stable min-h-0 flex-1 overflow-y-auto" data-testid="palette-body" key={panel}>
          {BODY[panel]()}
        </div>
        {m.advisory && advisory && (
          <div className="shrink-0 border-t border-soft bg-panel-alt px-2.5 py-2">
            <AdvisoryNote />
          </div>
        )}
      </div>
    </aside>
  );
}

/** Label, title, icon, description and command of every palette (the Interfaces dialog and the Button Guide list them). */
export { META as PALETTE_META };
