/**
 * components/workspace/LayoutTabs.tsx
 *
 * WHAT   Tabs under the canvas: Model plus each paper-space sheet layout (A-101 Floor Plan, A-201 Section,
 *        S-301 Structural, and the elevations, sections and site plans the user made, which close with ×) and +
 *        to add a layout. The strip scrolls sideways when the tabs do not fit, and keeps the open one in view.
 * FOR    Switching between the 3D / 2D model and the sheet views (Viewport/SheetView.tsx). State lives in the
 *        workspace store: `layoutTab` and `sheets`.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/icons";
import { tip } from "@/components/ui/Tooltip";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";

/* Layout tabs below the canvas: Model · A-101 Floor Plan · A-201 Section · S-301 Structural · + */
export function LayoutTabs() {
  const ws = useWsApi();
  const active = useWs((s) => s.layoutTab);
  const sheets = useWs((s) => s.sheets);
  const tabs = [{ id: "model", name: "Model", user: false }, ...sheets.map((s) => ({ id: s.id, name: s.name, user: !!s.user }))];
  const strip = useRef<HTMLDivElement>(null);
  // the open tab is always scrolled into view (a new elevation or section opens at the end of the strip)
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, sheets.length]);
  return (
    <div ref={strip} role="tablist" aria-label="Layouts" className="thin-scroll flex h-6 shrink-0 items-end gap-px overflow-x-auto overflow-y-hidden border-t border-line bg-chrome px-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => ws.getState().setLayoutTab(t.id)}
          className={cn(
            "h-5 shrink-0 whitespace-nowrap rounded-t px-2.5 text-[0.6875rem] transition-colors",
            active === t.id ? "bg-viewport font-semibold text-t1 shadow-[inset_0_2px_0_var(--accent)]" : "text-t2 hover:bg-t1/10 hover:text-t1",
          )}
          {...tip(t.id === "model" ? "Model Space" : t.name, t.id === "model" ? "Work on the 3D model" : "Paper-space sheet layout", t.id === "model" ? "MODEL" : "LAYOUT")}
        >
          {t.name}
          {t.user && (
            <span
              role="button"
              tabIndex={-1}
              aria-label={`Close ${t.name}`}
              data-testid="close-sheet"
              onClick={(e) => {
                e.stopPropagation();
                ws.getState().removeSheet(t.id);
              }}
              className="ml-1.5 inline-grid size-3.5 place-items-center rounded align-middle text-t3 hover:bg-t1/15 hover:text-t1"
            >
              <Icon name="close" size={9} />
            </span>
          )}
        </button>
      ))}
      <button
        onClick={() => ws.getState().addSheet()}
        className="mb-px grid size-5 shrink-0 place-items-center rounded text-t2 hover:bg-t1/10 hover:text-t1"
        aria-label="Add Layout"
        {...tip("New Layout", "Add a sheet layout", "LAYOUT")}
      >
        <Icon name="plus" size={12} />
      </button>
    </div>
  );
}
