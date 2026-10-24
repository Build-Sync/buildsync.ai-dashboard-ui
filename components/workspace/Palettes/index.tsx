/**
 * components/workspace/Palettes/index.tsx
 *
 * WHAT   The right-hand palette dock: a wrapping row of tab chips (Properties, Health, Compliance, Cost,
 *        Comments, Issues, Simulation, Stress Test, Clash, AI Analysis, Council) with count badges, a title bar
 *        and the body of the active palette. Results palettes end with the advisory footer.
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

import { Icon, type IconKey } from "@/components/icons";
import { AdvisoryNote } from "@/components/ui/controls";
import { tip } from "@/components/ui/Tooltip";
import { useApp } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { PALETTE_IDS, type PaletteId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AiAnalysis } from "./AiAnalysis";
import { Clash } from "./Clash";
import { Compliance } from "./Compliance";
import { Comments } from "./Comments";
import { Cost } from "./Cost";
import { Council } from "./Council";
import { Health } from "./Health";
import { Issues } from "./Issues";
import { Properties } from "./Properties";
import { Simulation } from "./Simulation";
import { StressTest } from "./StressTest";

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

function Chip({ id }: { id: PaletteId }) {
  const ws = useWsApi();
  const active = useWs((s) => s.panel === id);
  const m = META[id];
  const badge = useBadge(id);
  return (
    <button
      role="tab"
      aria-selected={active}
      data-palette-tab={id}
      onClick={() => ws.getState().setPanel(id)}
      className={cn(
        "relative flex h-6 items-center gap-1 rounded-md border px-1.5 text-[0.6875rem] transition-colors",
        active ? "border-accent bg-accent/15 font-semibold text-t1" : "border-transparent text-t2 hover:border-line hover:bg-t1/8 hover:text-t1",
      )}
      {...tip(m.title, m.desc, m.cmd)}
    >
      <Icon name={m.icon} size={12} className={active ? "text-accent" : undefined} />
      {m.label}
      {badge && <span className={cn("mono ml-0.5 grid min-w-[1.0625rem] place-items-center rounded-full px-1 text-[0.5625rem] font-bold leading-[1.0625rem] text-white", badge.tone)}>{badge.n}</span>}
    </button>
  );
}

/* Right palette (330px, tabbed). Tabs wrap; results palettes carry the advisory footer. */
export function PaletteDock() {
  const panel = useWs((s) => s.panel);
  const advisory = useApp((s) => s.settings.general.advisoryBanner);
  const m = META[panel];
  return (
    <aside aria-label="Palettes" className="flex w-[var(--w-palette)] shrink-0 flex-col border-l border-line bg-panel" data-testid="palettes">
      <div role="tablist" aria-label="Palette tabs" className="flex shrink-0 flex-wrap gap-0.5 border-b border-soft p-1.5">
        {PALETTE_IDS.map((id) => (
          <Chip key={id} id={id} />
        ))}
      </div>
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-soft px-2.5">
        <Icon name={m.icon} size={13} className="text-accent" />
        <span className="label-xs !text-t1">{m.title}</span>
      </div>
      <div role="tabpanel" className="gutter-stable min-h-0 flex-1 overflow-y-auto" data-testid="palette-body" key={panel}>
        {BODY[panel]()}
      </div>
      {m.advisory && advisory && (
        <div className="shrink-0 border-t border-soft bg-panel-alt px-2.5 py-2">
          <AdvisoryNote />
        </div>
      )}
    </aside>
  );
}
