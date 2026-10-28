/**
 * components/workspace/Viewport/ToolBar.tsx
 *
 * WHAT   The strip at the top of the viewport while a drawing or editing tool runs: the tool's name and current
 *        prompt, its options (wall type and height, door type, slab thickness, duct height, the text of a note,
 *        fillet radius, array rows and columns …), an Apply button for tools that change a selection with these
 *        values (CHTYPE, CHMAT, CHDIM, ARRAY), a Finish button and a Cancel button.
 * FOR    ModelViewport renders it whenever the store has a tool `session`. The options come from
 *        lib/draw/options.ts (or the tool's own `options`); values live in the store (`toolOpts`).
 * DEBUG  - A field is empty: numbers left empty mean "automatic" (for example the height of the level).
 *        - Typing in a field does not move focus to the command line: this strip is a normal form; click the
 *          viewport to carry on drawing. Keystrokes in these fields never reach the drawing shortcuts.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { fromShown, toShown, type OptDef } from "@/lib/draw/options";
import { setToolOpt, TOOLS, toolApply, toolCancel, toolEnter, toolOptions } from "@/lib/draw/session";
import { useWs } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";
import { useCommandCtx } from "../hooks";

/** One number field: shows the stored value in its unit and writes back when you leave it or press Enter (the caller re-keys it when the stored value changes). */
function NumberField({ o, value, onCommit }: { o: OptDef; value: number | undefined; onCommit: (v: number) => void }) {
  const shown = value && value > 0 ? String(Math.round(toShown(value, o.unit) * 1000) / 1000) : "";
  const [text, setText] = useState(shown);
  const commit = () => {
    const raw = text.trim();
    if (!raw) return onCommit(o.auto ? 0 : (o.def as number) ?? 0);
    const n = Number(raw);
    if (!Number.isFinite(n)) return setText(shown);
    const v = fromShown(n, o.unit);
    onCommit(o.min !== undefined ? Math.max(o.min, o.max !== undefined ? Math.min(o.max, v) : v) : v);
  };
  return (
    <input
      aria-label={o.label}
      inputMode="decimal"
      className="input mono !h-5 !w-14 !px-1 !text-[0.6875rem]"
      placeholder={o.auto ? "auto" : undefined}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}

/** The options strip of the running tool. */
export function ToolBar() {
  const ctx = useCommandCtx();
  const session = useWs((s) => s.session);
  const toolOpts = useWs((s) => s.toolOpts);
  const prompt = useWs((s) => s.toolPrompt);
  if (!session) return null;
  const def = TOOLS[session.tool];
  const opts = toolOptions(ctx);
  const values = toolOpts[session.tool] ?? {};
  const busy = session.pts.length > 0 || session.picks.length > 0;
  return (
    <div role="toolbar" aria-label="Tool Options" data-testid="tool-bar" data-tool={session.tool} data-step={session.step} className="absolute left-1/2 top-8 z-20 flex max-w-[calc(100%-14rem)] -translate-x-1/2 flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-line bg-chrome/95 px-2.5 py-1 text-[0.6875rem] shadow-pop backdrop-blur">
      <span className="mono font-semibold text-accent">{session.tool}</span>
      <span className="max-w-[26rem] truncate text-t2" data-testid="tool-prompt" title={prompt ?? ""}>
        {prompt}
      </span>
      {opts.map((o) => {
        const v = values[o.key];
        return (
          <label key={o.key} className="flex items-center gap-1 text-t2">
            {o.type !== "toggle" && <span>{o.label}</span>}
            {o.type === "number" && <NumberField key={String(v)} o={o} value={typeof v === "number" ? v : typeof o.def === "number" ? o.def : undefined} onCommit={(n) => setToolOpt(ctx, session.tool, o.key, n)} />}
            {o.type === "number" && o.unit && <span className="text-t3">{o.unit}</span>}
            {o.type === "text" && (
              <input
                aria-label={o.label}
                className="input !h-5 !w-32 !px-1.5 !text-[0.6875rem]"
                value={typeof v === "string" ? v : typeof o.def === "string" ? o.def : ""}
                onChange={(e) => setToolOpt(ctx, session.tool, o.key, e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
            )}
            {o.type === "select" && (
              <select aria-label={o.label} className="input !h-5 !px-1 !text-[0.6875rem]" value={typeof v === "string" ? v : typeof o.def === "string" ? o.def : ""} onChange={(e) => setToolOpt(ctx, session.tool, o.key, e.target.value)} onKeyDown={(e) => e.stopPropagation()}>
                {o.options?.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            )}
            {o.type === "toggle" && (
              <>
                <input type="checkbox" aria-label={o.label} checked={typeof v === "boolean" ? v : o.def === true} onChange={(e) => setToolOpt(ctx, session.tool, o.key, e.target.checked)} />
                <span>{o.label}</span>
              </>
            )}
          </label>
        );
      })}
      {def?.apply && session.step !== "select" && (
        <button className="btn !h-5 px-2 text-[0.6875rem]" data-testid="tool-apply" onClick={() => toolApply(ctx)}>
          {def.applyLabel ?? "Apply"}
        </button>
      )}
      {busy && (
        <button className="text-t2 hover:text-t1" data-testid="tool-finish" onClick={() => toolEnter(ctx)}>
          Finish <span className="text-t3">(Enter)</span>
        </button>
      )}
      <button aria-label="Cancel Tool" className={cn("grid size-5 place-items-center rounded text-t3 hover:bg-t1/10 hover:text-t1")} data-testid="tool-cancel" onClick={() => toolCancel(ctx)}>
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}
