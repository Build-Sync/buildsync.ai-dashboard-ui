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
