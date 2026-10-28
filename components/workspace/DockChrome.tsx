/**
 * components/workspace/DockChrome.tsx
 *
 * WHAT   The parts every dockable window shares besides its eye button (components/ui/DockToggle.tsx):
 *        - ResizeEdge: the edge between the window and the canvas. Drag it to any width (side windows) or height
 *          (timeline, command line); double-click it to go back to the default; arrow keys move it 16 px.
 *        - DockGrip: the six-dot handle in the header. Drag it onto the other edge of the screen (side windows)
 *          or above / below the other bottom window to move the window there; click it for the same moves, the
 *          three sizes and Hide, as a menu.
 *        - DockClose: the × that hides the window (View → Panels or View → Interfaces brings it back).
 *        - DockDropZones: the targets shown while a window is being dragged.
 * FOR    ModelExplorer, PaletteDock, Timeline and CommandLine. The arrangement lives in the workspace store
 *        (dockPx, dockSide, bottomOrder, docks) and is saved by Workspace.tsx (lib/layout.ts). The ribbon and the
 *        status bar have none of these: they never move.
 * DEBUG  - A drag does nothing: the drag state is module-level (dragState); the zones render inside the dock row
 *          (data-testid="dock-row"), so the Start tab (no dock row) shows none.
 *        - Width jumps when the drag starts: the start size is read from the window element (closest [data-dock]).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";
import { anchorOf, Menu, MenuItem, MenuLabel, MenuSep, type Anchor } from "@/components/ui/Menu";
import { tip } from "@/components/ui/Tooltip";
import { DOCK_LABEL, SIZE_NAME, clampDockPx, type BottomDock, type DockSize, type SideDock } from "@/lib/layout";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import type { DockKey } from "@/lib/store/workspace-store";
import { cn } from "@/lib/utils";

const isSide = (k: DockKey): k is SideDock => k === "explorer" || k === "palettes";

/* ── drag state shared by the grip and the drop zones ─────────────────── */
type Drag = { k: DockKey; x: number; y: number } | null;
let dragState: Drag = null;
const listeners = new Set<() => void>();
const setDrag = (d: Drag) => {
  dragState = d;
  listeners.forEach((l) => l());
};
const useDrag = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => dragState,
    () => null,
  );

/** Where a dragged window would land for a pointer position inside the dock row. */
function zoneAt(k: DockKey, x: number, y: number): "left" | "right" | "first" | "last" | null {
  const row = document.querySelector('[data-testid="dock-row"]')?.getBoundingClientRect();
  if (!row) return null;
  if (isSide(k)) {
    if (y < row.top || y > row.bottom) return null;
    if (x < row.left + row.width * 0.3) return "left";
    if (x > row.right - row.width * 0.3) return "right";
    return null;
  }
  // bottom windows: the lower part of the canvas, split in two bands
  const top = row.bottom - 150;
  if (y < top || x < row.left || x > row.right) return y > row.bottom ? "last" : null;
  return y < top + 75 ? "first" : "last";
}

/** The edge between a window and the canvas: drag to resize, double-click to reset. */
export function ResizeEdge({ dock, edge }: { dock: DockKey; edge: "left" | "right" | "top" }) {
  const ws = useWsApi();
  const px = useWs((s) => s.dockPx[dock]);
  const start = useRef<{ p: number; size: number } | null>(null);
  const vertical = edge !== "top";
  const screen = () => ({ w: window.innerWidth, h: window.innerHeight });
  const sizeOf = (el: HTMLElement) => {
    const box = (el.closest("[data-dock]") as HTMLElement | null)?.getBoundingClientRect();
    return box ? (vertical ? box.width : box.height) : 0;
  };
  return (
    <div
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-label={`Resize ${DOCK_LABEL[dock]}`}
      aria-valuenow={px ?? undefined}
      tabIndex={0}
      data-testid={`dock-edge-${dock}`}
      className={cn(
        "group absolute z-30 touch-none outline-none",
        vertical ? "top-0 h-full w-[7px] cursor-col-resize" : "left-0 h-[7px] w-full cursor-row-resize",
        edge === "right" && "-right-[4px]",
        edge === "left" && "-left-[4px]",
        edge === "top" && "-top-[4px]",
      )}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { p: vertical ? e.clientX : e.clientY, size: sizeOf(e.currentTarget) };
      }}
      onPointerMove={(e) => {
        const s0 = start.current;
        if (!s0) return;
        const d = (vertical ? e.clientX : e.clientY) - s0.p;
        // the window grows away from its own edge: right edge → wider to the right, left / top edge → the other way
        const size = edge === "right" ? s0.size + d : s0.size - d;
        ws.getState().setDockPx(dock, clampDockPx(dock, size, screen()));
      }}
      onPointerUp={(e) => {
        start.current = null;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }}
      onDoubleClick={() => ws.getState().setDockPx(dock, null)}
      onKeyDown={(e) => {
        const grow = edge === "right" ? "ArrowRight" : edge === "left" ? "ArrowLeft" : "ArrowUp";
        const shrink = edge === "right" ? "ArrowLeft" : edge === "left" ? "ArrowRight" : "ArrowDown";
        if (e.key !== grow && e.key !== shrink) return;
        e.preventDefault();
        const cur = sizeOf(e.currentTarget);
        ws.getState().setDockPx(dock, clampDockPx(dock, cur + (e.key === grow ? 16 : -16), screen()));
      }}
      {...tip(`Resize ${DOCK_LABEL[dock]}`, "Drag to any size. Double-click to go back to the normal size.")}
    >
      <span className={cn("pointer-events-none absolute bg-accent opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-100", vertical ? "left-[3px] top-0 h-full w-px" : "left-0 top-[3px] h-px w-full")} />
    </div>
  );
}

/** The six-dot handle: drag the window to another edge, or click for a menu of moves, sizes and Hide. */
export function DockGrip({ dock, className }: { dock: DockKey; className?: string }) {
  const ws = useWsApi();
  const side = useWs((s) => (isSide(dock) ? s.dockSide[dock] : null));
  const order = useWs((s) => s.bottomOrder);
  const size = useWs((s) => s.dockSize[dock]);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const moved = useRef(false);
  const down = useRef<{ x: number; y: number } | null>(null);
  const other = order.find((b) => b !== dock) as BottomDock | undefined;
  const first = order[0] === dock;

  const drop = (zone: ReturnType<typeof zoneAt>) => {
    const s = ws.getState();
    if (!zone) return;
    if (isSide(dock) && (zone === "left" || zone === "right")) s.setDockSide(dock, zone);
    if (!isSide(dock) && other && (zone === "first" || zone === "last")) s.setBottomOrder(zone === "first" ? [dock as BottomDock, other] : [other, dock as BottomDock]);
  };

  return (
    <>
      <button
        type="button"
        data-testid={`dock-grip-${dock}`}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        aria-label={`Move or hide ${DOCK_LABEL[dock]}`}
        className={cn("grid h-5 w-3.5 shrink-0 cursor-grab touch-none place-items-center rounded text-t3 hover:bg-t1/10 hover:text-t1 active:cursor-grabbing", anchor && "bg-t1/10 text-t1", className)}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          down.current = { x: e.clientX, y: e.clientY };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          const d0 = down.current;
          if (!d0) return;
          if (!moved.current && Math.hypot(e.clientX - d0.x, e.clientY - d0.y) < 6) return;
          moved.current = true;
          setDrag({ k: dock, x: e.clientX, y: e.clientY });
        }}
        onPointerUp={(e) => {
          const d0 = down.current;
          down.current = null;
          e.currentTarget.releasePointerCapture?.(e.pointerId);
          if (moved.current && d0) drop(zoneAt(dock, e.clientX, e.clientY));
          setDrag(null);
        }}
        onPointerCancel={() => {
          down.current = null;
          setDrag(null);
        }}
        onClick={(e) => {
          if (moved.current) return;
          setAnchor(anchor ? null : anchorOf(e.currentTarget));
        }}
        {...tip(`Move ${DOCK_LABEL[dock]}`, isSide(dock) ? "Drag onto the other side of the screen, or click for a menu" : "Drag above or below the other bottom window, or click for a menu")}
      >
        <Icon name="grip" size={13} />
      </button>
      <Menu anchor={anchor} onClose={close} label={`${DOCK_LABEL[dock]} Window`} width="14rem">
        <MenuLabel>{DOCK_LABEL[dock]}</MenuLabel>
        {isSide(dock) ? (
          <MenuItem icon={side === "left" ? "arrowRight" : "chevLeft"} label={side === "left" ? "Move to the right edge" : "Move to the left edge"} onClick={() => ws.getState().setDockSide(dock, side === "left" ? "right" : "left")} onClose={close} />
        ) : (
          other && <MenuItem icon={first ? "arrowDown" : "arrowUp"} label={first ? `Move below the ${DOCK_LABEL[other]}` : `Move above the ${DOCK_LABEL[other]}`} onClick={() => ws.getState().setBottomOrder(first ? [other, dock as BottomDock] : [dock as BottomDock, other])} onClose={close} />
        )}
        <MenuSep />
        {(["large", "mid", "min"] as DockSize[]).map((z) => (
          <MenuItem key={z} label={`Size: ${SIZE_NAME[z]}`} icon={z === "large" ? "eyeWide" : z === "mid" ? "eyeHalf" : "eyeShut"} checked={size === z} onClick={() => ws.getState().setDockSize(dock, z)} onClose={close} />
        ))}
        <MenuItem label="Reset dragged size" icon="refresh" onClick={() => ws.getState().setDockPx(dock, null)} onClose={close} />
        <MenuSep />
        <MenuItem label="Hide window" icon="close" onClick={() => ws.getState().toggleDock(dock, false)} onClose={close} />
        <MenuItem label="Interfaces…" icon="interfaces" onClick={() => ws.getState().openModal("interfaces")} onClose={close} />
      </Menu>
    </>
  );
}

/** The × that hides a window. */
export function DockClose({ dock, className }: { dock: DockKey; className?: string }) {
  const ws = useWsApi();
  return (
    <button
      type="button"
      data-testid={`dock-close-${dock}`}
      aria-label={`Hide ${DOCK_LABEL[dock]}`}
      onClick={() => ws.getState().toggleDock(dock, false)}
      className={cn("grid size-5 shrink-0 place-items-center rounded text-t3 hover:bg-t1/10 hover:text-t1", className)}
      {...tip(`Hide ${DOCK_LABEL[dock]}`, "View → Panels, or View → Interfaces, brings it back")}
    >
      <Icon name="close" size={12} />
    </button>
  );
}

/** The drop targets shown while a window is dragged by its grip. */
export function DockDropZones() {
  const d = useDrag();
  if (!d) return null;
  const zone = zoneAt(d.k, d.x, d.y);
  const box = (on: boolean) => cn("pointer-events-none absolute grid place-items-center rounded-lg border-2 border-dashed text-[0.75rem] font-semibold transition-colors", on ? "border-accent bg-accent/25 text-t1" : "border-accent/50 bg-accent/8 text-t2");
  return (
    <div className="pointer-events-none absolute inset-0 z-40" data-testid="dock-drop-zones">
      {isSide(d.k) ? (
        <>
          <div className={cn(box(zone === "left"), "bottom-3 left-3 top-3 w-[28%]")}>Dock {DOCK_LABEL[d.k]} on the left</div>
          <div className={cn(box(zone === "right"), "bottom-3 right-3 top-3 w-[28%]")}>Dock {DOCK_LABEL[d.k]} on the right</div>
        </>
      ) : (
        <>
          <div className={cn(box(zone === "first"), "bottom-[78px] left-3 right-3 h-[68px]")}>Put the {DOCK_LABEL[d.k]} on top</div>
          <div className={cn(box(zone === "last"), "bottom-3 left-3 right-3 h-[62px]")}>Put the {DOCK_LABEL[d.k]} at the bottom</div>
        </>
      )}
    </div>
  );
}
