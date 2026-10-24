/**
 * components/ui/Toaster.tsx
 *
 * WHAT   Bottom-centre toast notifications ("Kimi connected", "Settings applied"). Reads the toast list from
 *        the app store and shows each for 3 seconds (4.2 s for warnings), or until dismissed.
 * FOR    Quick confirmations from anywhere in the app: call app.getState().toast(text, tone). Mounted once in
 *        app/layout.tsx.
 * DEBUG  - A toast never appears: nothing called toast(), or the store kept more than the last four (older ones
 *          are dropped).
 *        - A toast stays forever: the auto-dismiss timer lives in ToastItem's effect and is reset when the
 *          toast id or tone changes.
 *        - Hidden behind something: the container uses z-index 120, above modals (60-90) and tooltips (100).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useEffect } from "react";
import { Icon, type IconKey } from "@/components/icons";
import { useApp } from "@/lib/store/app-provider";
import type { Toast } from "@/lib/types";
import { cn } from "@/lib/utils";

/* Bottom-centre confirmations, e.g. "Kimi connected" (spec §10.12). */

const TONE: Record<Toast["tone"], { icon: IconKey; cls: string }> = {
  ok: { icon: "ok", cls: "text-ok" },
  info: { icon: "info", cls: "text-accent" },
  warn: { icon: "warn", cls: "text-warn" },
  bad: { icon: "fail", cls: "text-bad" },
};

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useApp((s) => s.dismissToast);
  useEffect(() => {
    const id = setTimeout(() => dismiss(t.id), t.tone === "warn" ? 4200 : 3000);
    return () => clearTimeout(id);
  }, [t.id, t.tone, dismiss]);
  const tone = TONE[t.tone];
  return (
    <div className="anim-pop pointer-events-auto flex items-center gap-2 rounded-lg border border-line bg-chrome px-3 py-2 text-[0.75rem] text-t1 shadow-pop">
      <span className={cn("shrink-0", tone.cls)}>
        <Icon name={tone.icon} size={15} />
      </span>
      <span>{t.text}</span>
      <button className="ml-1 text-t3 hover:text-t1" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

/** The live region that stacks the current toasts above the status bar. */
export function Toaster() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed bottom-14 left-1/2 z-[120] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}
