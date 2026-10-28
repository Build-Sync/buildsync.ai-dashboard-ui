/**
 * components/ui/DockToggle.tsx
 *
 * WHAT   The eye button in the header of every dockable window. One press steps the window through its three
 *        sizes (normal → large → header only → normal). The eye shows the size the window has now: wide open =
 *        fully open (large), half closed = normal, closed = header only. Only the eye: no arrow beside it.
 * FOR    Model Explorer, palettes, timeline and command line headers. `side` is the screen edge the window sits
 *        on (kept for callers; the eye looks the same on every edge).
 * DEBUG  - Nothing changes on click: the size lives in the workspace store (`dockSize`, cycleDock); check the
 *          window reads it.
 *        - Tests can find it by data-testid="dock-toggle-<dock>" and read data-size on it or on the window.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Icon, type IconKey } from "@/components/icons";
import { tip } from "@/components/ui/Tooltip";
import { DOCK_ACTION, DOCK_LABEL, SIZE_NAME, nextDockSize, type DockSize } from "@/lib/layout";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import type { DockKey } from "@/lib/store/workspace-store";
import { cn } from "@/lib/utils";

/** The eye for each size: wide open = fully open, half closed = normal, closed = header only. */
export const EYE: Record<DockSize, IconKey> = { large: "eyeWide", mid: "eyeHalf", min: "eyeShut" };

/** The three-state eye of a dockable window. */
export function DockToggle({ dock, className }: { dock: DockKey; side: "left" | "right" | "bottom"; className?: string }) {
  const ws = useWsApi();
  const size = useWs((s) => s.dockSize[dock]);
  const next = nextDockSize(size);
  return (
    <button
      type="button"
      data-testid={`dock-toggle-${dock}`}
      data-size={size}
      aria-label={`${DOCK_LABEL[dock]}: ${SIZE_NAME[size]}. ${DOCK_ACTION[size]} (${SIZE_NAME[next]})`}
      onClick={() => ws.getState().cycleDock(dock)}
      className={cn("flex h-5 shrink-0 items-center rounded px-0.5 text-t2 transition-colors hover:bg-t1/10 hover:text-t1", className)}
      {...tip(
        `${DOCK_LABEL[dock]}: ${SIZE_NAME[size]}`,
        `${DOCK_ACTION[size]}: switch to ${SIZE_NAME[next]}. Eye wide open = fully open, half closed = normal, closed = header only. Drag the window's edge for any size in between.`,
      )}
    >
      <Icon name={EYE[size]} size={15} className={size === "min" ? "text-t3" : "text-accent"} />
    </button>
  );
}
