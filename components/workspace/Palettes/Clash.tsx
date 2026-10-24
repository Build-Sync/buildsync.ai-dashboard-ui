"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { EmptyState, Pill, Spinner } from "@/components/ui/controls";
import { sleep } from "@/lib/utils";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";
import { useRunner } from "../hooks";

/* Clash Det.: HARD / SOFT, element A ↔ element B, level, recommended fix. Click to zoom. */
export function Clash() {
  const ws = useWsApi();
  const { ctx } = useRunner();
  const clashes = useWs((s) => s.project.clashes);
  const active = useWs((s) => s.showClashId);
  const [running, setRunning] = useState(false);
  const hard = clashes.filter((c) => c.kind === "HARD").length;

  const rerun = async () => {
    setRunning(true);
    await sleep(900);
    setRunning(false);
    ctx.app.getState().log("ok", `✓ Clash detection: ${hard} hard · ${clashes.length - hard} soft`);
    ctx.app.getState().toast(`Found ${clashes.length} clashes (${hard} hard)`, clashes.length ? "warn" : "ok");
  };

  return (
    <div data-testid="palette-clash">
      <div className="flex items-center gap-2 border-b border-soft px-2.5 py-2">
        <div className="flex-1 text-[0.75rem] text-t2">
          <b className="mono text-bad">{hard}</b> hard · <b className="mono text-warn">{clashes.length - hard}</b> soft
        </div>
        <button className="btn h-6 text-[0.6875rem]" disabled={running} onClick={rerun}>
          {running ? <Spinner size={12} /> : <Icon name="refresh" size={12} />} Run detection
        </button>
      </div>
      {clashes.length === 0 ? (
        <EmptyState icon="clash" title="No clashes" hint="Run clash detection after you add MEP and structure to the model." />
      ) : (
        <ul>
          {clashes.map((c) => (
            <li key={c.id} className="border-b border-soft/70">
              <button
                aria-pressed={active === c.id}
                onClick={() => {
                  ws.getState().patch({ showClashId: active === c.id ? null : c.id });
                  if (active !== c.id) ws.getState().focusElements(c.elementIds);
                }}
                className={cn("block w-full px-2.5 py-2.5 text-left transition-colors", active === c.id ? "bg-bad/10" : "hover:bg-t1/5")}
              >
                <div className="flex items-center gap-1.5">
                  <Pill tone={c.kind === "HARD" ? "bad" : "warn"}>{c.kind}</Pill>
                  <span className="mono text-[0.625rem] text-t3">{c.id}</span>
                  <span className="ml-auto text-[0.6875rem] text-t3">{c.level}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[0.75rem] text-t1">
                  <span className="min-w-0 flex-1 truncate">{c.a}</span>
                  <Icon name="clash" size={12} className="shrink-0 text-bad" />
                  <span className="min-w-0 flex-1 truncate text-right">{c.b}</span>
                </div>
                <p className="mt-1.5 text-[0.6875rem] leading-snug text-t2">
                  <b className="text-t1">Fix: </b>
                  {c.fix}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
