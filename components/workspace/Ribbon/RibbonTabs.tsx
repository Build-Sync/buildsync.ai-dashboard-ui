/**
 * components/workspace/Ribbon/RibbonTabs.tsx
 *
 * WHAT   The ribbon tab strip (28 px) and the always-visible "Advisory Only · PE Sign-Off Required" pill on the
 *        right, which opens the PE sign-off dialog.
 * FOR    Choosing which ribbon tab is shown (workspace `tab`). The advisory pill must stay visible on every
 *        screen; its tooltip wording depends on Settings → General → Advisory banner.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Icon } from "@/components/icons";
import { tip } from "@/components/ui/Tooltip";
import { useApp } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";
import { RIBBON } from "./ribbon.config";

/* Ribbon tabs (28px) with the always-visible advisory pill on the right (spec §10.12). */
export function RibbonTabs() {
  const ws = useWsApi();
  const tab = useWs((s) => s.tab);
  const advisory = useApp((s) => s.settings.general.advisoryBanner);
  return (
    <div className="flex h-[var(--h-tabs)] shrink-0 items-end border-b border-line bg-chrome pl-1.5 pr-2" data-testid="ribbon-tabs">
      <div role="tablist" aria-label="Ribbon Tabs" className="flex items-end">
        {RIBBON.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="ribbon-panel"
            onClick={() => ws.getState().setTab(t.id)}
            className={cn(
              "relative h-[1.5625rem] rounded-t-md px-3 text-[0.75rem] transition-colors",
              tab === t.id ? "bg-ribbon font-semibold text-t1 shadow-[inset_0_2px_0_var(--accent)]" : "text-t2 hover:bg-t1/10 hover:text-t1",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <button
        onClick={() => ws.getState().openModal("pe-signoff")}
        className={cn("mb-0.5 flex h-5 items-center gap-1.5 rounded-full border px-2.5 text-[0.625rem] font-semibold uppercase tracking-wide transition-colors", "border-warn/50 bg-warn/10 text-warn hover:bg-warn/20")}
        data-testid="advisory-pill"
        {...tip("Advisory Only · PE Sign-Off Required", advisory ? "Every AI output is labelled “AI-generated, unstamped”. Life-safety and load-bearing items need a licensed PE." : "Advisory banner is hidden in settings, but the PE sign-off rule still applies.", "PESIGN")}
      >
        <Icon name="shieldAlert" size={11} />
        Advisory Only · PE Sign-Off Required
      </button>
    </div>
  );
}
