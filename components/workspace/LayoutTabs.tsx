"use client";

import { Icon } from "@/components/icons";
import { tip } from "@/components/ui/Tooltip";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";

/* Layout tabs below the canvas: Model · A-101 Floor Plan · A-201 Section · S-301 Structural · + */
export function LayoutTabs() {
  const ws = useWsApi();
  const active = useWs((s) => s.layoutTab);
  const sheets = useWs((s) => s.sheets);
  const tabs = [{ id: "model", name: "Model" }, ...sheets.map((s) => ({ id: s.id, name: s.name }))];
  return (
    <div role="tablist" aria-label="Layouts" className="flex h-6 shrink-0 items-end gap-px border-t border-line bg-chrome px-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => ws.getState().setLayoutTab(t.id)}
          className={cn(
            "h-5 rounded-t px-2.5 text-[0.6875rem] transition-colors",
            active === t.id ? "bg-viewport font-semibold text-t1 shadow-[inset_0_2px_0_var(--accent)]" : "text-t2 hover:bg-t1/10 hover:text-t1",
          )}
          {...tip(t.id === "model" ? "Model space" : t.name, t.id === "model" ? "Work on the 3D model" : "Paper-space sheet layout", t.id === "model" ? "MODEL" : "LAYOUT")}
        >
          {t.name}
        </button>
      ))}
      <button
        onClick={() => ws.getState().addSheet()}
        className="mb-px grid size-5 place-items-center rounded text-t2 hover:bg-t1/10 hover:text-t1"
        aria-label="Add layout"
        {...tip("New layout", "Add a sheet layout", "LAYOUT")}
      >
        <Icon name="plus" size={12} />
      </button>
    </div>
  );
}
