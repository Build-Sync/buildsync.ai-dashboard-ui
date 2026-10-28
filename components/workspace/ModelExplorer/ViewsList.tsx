/**
 * components/workspace/ModelExplorer/ViewsList.tsx
 *
 * WHAT   The Views tab, like Revit's Project Browser: every drawing of the project grouped as Floor Plans (one per
 *        storey, and all storeys side by side), Site (site plan, topography), Elevations (N, S, E, W), Sections,
 *        3D Views and Sheets. A click shows the drawing: a floor plan switches the model tab to 2D at that level,
 *        a 3D view turns the camera, everything else opens its sheet (made the first time). Under the floor plans,
 *        "Show in 2D" chooses what the plan draws faded underneath: nothing, the level below, or every level;
 *        and Labels switches room names and place labels on and off.
 * FOR    Seeing the storeys, the site plan, the topography and the elevations one at a time, from one list.
 *        lib/views.ts builds the list and opens the views.
 * DEBUG  - A row opens a new sheet each time: lib/views.ts findSheet must match the sheet already there.
 *        - A row with a dot has its sheet already; one without makes it on the first click (undoable).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useState } from "react";
import { Icon, type IconKey } from "@/components/icons";
import { useAppApi } from "@/lib/store/app-provider";
import type { PlanShow } from "@/lib/store/workspace-store";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";
import { openView, viewList, type ViewGroup, type ViewRef } from "@/lib/views";

const GROUP_ICON: Record<ViewGroup["id"], IconKey> = { plans: "plan", site: "terrain", elevations: "velev", sections: "section", "3d": "view3d", sheets: "file" };
const SHOW: { id: PlanShow; label: string; desc: string }[] = [
  { id: "level", label: "This level", desc: "Only the active level" },
  { id: "below", label: "+ Level below", desc: "The level below, faded (on the ground floor: the one above)" },
  { id: "all", label: "All levels", desc: "Every storey, faded under the active one" },
];

/** The Views tab of the Model Explorer. */
export function ViewsList() {
  const ws = useWsApi();
  const app = useAppApi();
  const project = useWs((s) => s.project);
  const sheets = useWs((s) => s.sheets);
  const layoutTab = useWs((s) => s.layoutTab);
  const view = useWs((s) => s.view);
  const plan = useWs((s) => s.plan);
  const planShow = useWs((s) => s.planShow);
  const labels = useWs((s) => s.labels);
  const roomLabels = useWs((s) => s.roomLabels);
  const [closed, setClosed] = useState<Record<string, boolean>>({ sheets: true });
  const groups = viewList({ project, sheets, layoutTab, view, plan });

  const open = (ref: ViewRef) => {
    const name = openView(ws.getState(), ref);
    if (name) app.getState().log("ok", `✓ ${name}`);
  };

  return (
    <div className="p-1.5" data-testid="views-list">
      {groups.map((g) =>
        g.rows.length ? (
          <section key={g.id} className="mb-1.5">
            <button
              className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-t1/8"
              aria-expanded={!closed[g.id]}
              onClick={() => setClosed((c) => ({ ...c, [g.id]: !c[g.id] }))}
            >
              <Icon name={closed[g.id] ? "chevRight" : "chevDown"} size={12} className="text-t3" />
              <Icon name={GROUP_ICON[g.id]} size={13} className="text-t2" />
              <span className="label-xs !text-t2">{g.label}</span>
              <span className="mono ml-auto text-[0.625rem] text-t3">{g.rows.length}</span>
            </button>
            {!closed[g.id] && (
              <ul className="ml-3 border-l border-soft pl-1.5">
                {g.rows.map((r) => (
                  <li key={r.testId}>
                    <button
                      onClick={() => open(r.ref)}
                      aria-current={r.active}
                      data-testid={r.testId}
                      className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[0.75rem] transition-colors", r.active ? "bg-accent/15 font-medium text-t1" : "text-t1 hover:bg-t1/8")}
                    >
                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                      {r.sheet && <span className="mono shrink-0 text-[0.625rem] text-t3">{r.sheet}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {g.id === "plans" && !closed.plans && (
              <div className="ml-3 mt-1.5 space-y-1.5 rounded-md border border-soft bg-panel-alt p-2">
                <p className="label-xs">Show in 2D</p>
                <div role="radiogroup" aria-label="Show in 2D" className="flex flex-wrap gap-1">
                  {SHOW.map((o) => (
                    <button
                      key={o.id}
                      role="radio"
                      aria-checked={planShow === o.id}
                      title={o.desc}
                      data-testid={`plan-show-${o.id}`}
                      onClick={() => {
                        const s = ws.getState();
                        s.patch({ planShow: o.id });
                        if (s.view !== "2d" || s.layoutTab !== "model") {
                          s.setLayoutTab("model");
                          s.setView("2d");
                        }
                      }}
                      className={cn("rounded-md border px-1.5 py-0.5 text-[0.6875rem]", planShow === o.id ? "border-accent bg-accent/15 text-t1" : "border-line text-t2 hover:border-t3 hover:text-t1")}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-[0.6875rem] text-t1">
                  <input type="checkbox" checked={roomLabels} onChange={() => ws.getState().patch({ roomLabels: !roomLabels })} className="accent-[var(--accent)]" data-testid="room-labels-toggle" />
                  Room names
                </label>
                <label className="flex items-center gap-2 text-[0.6875rem] text-t1">
                  <input type="checkbox" checked={labels} onChange={() => ws.getState().patch({ labels: !labels })} className="accent-[var(--accent)]" data-testid="labels-toggle" />
                  Place labels
                </label>
              </div>
            )}
          </section>
        ) : null,
      )}
      <p className="mt-2 px-1 text-[0.6875rem] leading-snug text-t3">
        Click a drawing to show it. Floor plans open in the model tab; the site plan, topography, elevations and sections open on their own sheet (the Model tab under the canvas brings you back).
      </p>
    </div>
  );
}
