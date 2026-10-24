/**
 * components/settings/rows.tsx
 *
 * WHAT   Building blocks used by every settings pane: useDraft() (read the live draft, write through
 *        updateDraft), <Row> (label and help text on the left, control on the right), <Group> (a titled block)
 *        and <Hint> (a muted note).
 * FOR    Keeping the panes consistent and making "preview now, save on Apply, discard on Close" work: panes
 *        never write saved settings directly, only the draft.
 * DEBUG  - A control seems to do nothing: the pane must write through `set(...)` from useDraft, not to
 *          app.getState().settings.
 *        - A change survives Close: something wrote to the saved settings instead of the draft (selectEffective
 *          returns the draft when one exists).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import type { ReactNode } from "react";
import { useAppApi, useApp } from "@/lib/store/app-provider";
import { selectEffective } from "@/lib/store/app-store";
import type { Settings } from "@/lib/settings";
import { cn } from "@/lib/utils";

/** Editable settings: reads the live draft and writes through updateDraft (committed by Apply). */
export function useDraft() {
  const app = useAppApi();
  const s = useApp(selectEffective);
  const set = (fn: (d: Settings) => void) => app.getState().updateDraft(fn);
  return { s, set };
}

/** One settings row: label + helper text on the left, control on the right. */
export function Row({ label, help, children, htmlFor, stack }: { label: string; help?: ReactNode; children: ReactNode; htmlFor?: string; stack?: boolean }) {
  return (
    <div className={cn("gap-x-8 gap-y-2 border-b border-soft py-3.5", stack ? "block" : "grid grid-cols-[minmax(0,1fr)_auto] items-center")}>
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-[0.8125rem] font-medium text-t1">
          {label}
        </label>
        {help && <p className="mt-0.5 max-w-[34rem] text-[0.75rem] leading-snug text-t3">{help}</p>}
      </div>
      <div className={cn("flex items-center", stack ? "mt-2.5" : "justify-end")}>{children}</div>
    </div>
  );
}

/** A titled block of rows; `aside` is shown at the right of the title (a count or a button). */
export function Group({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mb-7">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="label-xs">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A muted explanatory note, usually at the bottom of a pane. */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-2 rounded-md bg-t1/5 px-3 py-2 text-[0.75rem] leading-snug text-t2">{children}</p>;
}
