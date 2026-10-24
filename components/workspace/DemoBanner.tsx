"use client";

import { Icon } from "@/components/icons";
import { useWsApi } from "@/lib/store/workspace-provider";

/** /demo banner: "You're in the demo — Start free to save" (spec §10.12). */
export function DemoBanner() {
  const ws = useWsApi();
  return (
    <div className="flex h-[var(--h-banner)] shrink-0 items-center justify-center gap-3 bg-accent px-3 text-[0.75rem] font-medium text-on-accent" role="note" data-testid="demo-banner">
      <Icon name="info" size={13} />
      <span>
        You&apos;re in the demo <span className="opacity-70">—</span> <b className="font-semibold">Start free to save</b>. Edits aren&apos;t saved.
      </span>
      <button onClick={() => ws.getState().openModal("start-free")} className="rounded-full bg-white/20 px-3 py-px text-[0.6875rem] font-semibold hover:bg-white/30">
        Start free
      </button>
    </div>
  );
}
