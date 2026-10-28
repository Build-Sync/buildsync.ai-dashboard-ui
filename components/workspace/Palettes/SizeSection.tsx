/**
 * components/workspace/Palettes/SizeSection.tsx
 *
 * WHAT   The Size section of the Properties palette for something the user drew: each of its sizes as a number to
 *        type over (a pool's length and depth, a fence's height, a road's width, a piece of furniture's width …),
 *        its turn with ↺ ↻ quarter-turn buttons, and for a solar array its rows, panels per row, the size and
 *        output of each panel, with the array's total.
 * FOR    Changing a placed object without redrawing it. The fields are the CHDIM ones (sizeFields in
 *        lib/draw/modify.ts); a change is one undo step and redraws the object at once.
 * DEBUG  - A value springs back: it was not a number, or zero or less where a size must be more (withSize).
 *        - No Size section: built-in elements of the sample buildings have none (SCALE resizes them), nor do kinds
 *          without fields in DIM_FIELDS.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Icon } from "@/components/icons";
import { KV, Section } from "@/components/ui/controls";
import { tip } from "@/components/ui/Tooltip";
import { applyChange } from "@/lib/draw";
import { sizeFields, sizeOf, withSize } from "@/lib/draw/modify";
import type { DrawnItem } from "@/lib/draw/types";
import { useAppApi } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";

const shown = (v: number) => String(Math.round(v * 100) / 100);

/** The Size section for a drawn object (nothing for an object without typed sizes). */
export function SizeSection({ id }: { id: string }) {
  const ws = useWsApi();
  const app = useAppApi();
  const it = useWs((s) => s.drawn.find((i) => i.id === id));
  const review = useWs((s) => s.reviewMode);
  if (!it) return null;
  const fields = sizeFields(it.kind);
  if (!fields.length) return null;

  const set = (key: string, label: string, v: number) => {
    const cur = ws.getState().drawn.find((i) => i.id === id);
    if (!cur || Math.abs(sizeOf(cur, key) - v) < 1e-9) return;
    const next = withSize(cur, key, v);
    if (!next) return app.getState().toast(`${label}: type a number${key === "rot" || key === "tilt" ? "" : " more than 0"}.`, "warn");
    ws.getState().edit(`Change ${label.toLowerCase()}`, (st) => applyChange(st, { replace: [next] }));
  };

  return (
    <Section title="Size">
      {fields.map(([key, label, unit]) => {
        // a turn reads 0–359° however it was reached (a quarter turn back from 0 is 270°)
        const v = key === "rot" ? ((sizeOf(it, key) % 360) + 360) % 360 : sizeOf(it, key);
        return (
          <label key={key} className="flex items-center justify-between gap-2 py-[0.1875rem] text-[0.75rem]">
            <span className="shrink-0 text-t3">{label}</span>
            <span className="flex items-center gap-1">
              {key === "rot" && (
                <>
                  <button type="button" className="grid size-6 place-items-center rounded text-t2 hover:bg-t1/10 hover:text-t1 disabled:opacity-40" disabled={review} onClick={() => set(key, label, v + 90)} aria-label="Turn 90° counter-clockwise" {...tip("Turn 90° Counter-Clockwise", "A quarter turn to the left", "ROTATE90CCW")}>
                    <Icon name="rotateLeft" size={13} />
                  </button>
                  <button type="button" className="grid size-6 place-items-center rounded text-t2 hover:bg-t1/10 hover:text-t1 disabled:opacity-40" disabled={review} onClick={() => set(key, label, v - 90)} aria-label="Turn 90° clockwise" {...tip("Turn 90° Clockwise", "A quarter turn to the right", "ROTATE90")}>
                    <Icon name="rotate" size={13} />
                  </button>
                </>
              )}
              <input
                key={`${key}:${v}`}
                type="number"
                step={unit === "ft" ? 0.1 : unit === "°" ? 15 : 1}
                defaultValue={shown(v)}
                disabled={review}
                aria-label={label}
                data-testid={`size-${key}`}
                className="input mono !h-6 !w-20 text-right"
                onBlur={(e) => set(key, label, Number(e.currentTarget.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    e.currentTarget.value = shown(v);
                    e.currentTarget.blur();
                  }
                }}
              />
              <span className="w-3 text-[0.6875rem] text-t3">{unit === "ft" ? "ft" : unit}</span>
            </span>
          </label>
        );
      })}
      {it.kind === "solar" && <SolarTotal it={it} />}
    </Section>
  );
}

/** A solar array's panel count and output. */
function SolarTotal({ it }: { it: DrawnItem }) {
  const rows = Math.round(sizeOf(it, "rows") || 2);
  const cols = Math.round(sizeOf(it, "cols") || 6);
  const watts = sizeOf(it, "watts") || 400;
  return <KV k="Array" v={`${rows} × ${cols} = ${rows * cols} panels · ${((rows * cols * watts) / 1000).toFixed(1)} kW`} />;
}
