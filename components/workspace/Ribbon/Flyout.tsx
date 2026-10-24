"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Anchor } from "@/components/ui/Menu";

/** Floating panel for a collapsed ribbon panel. position:fixed in a portal so the ribbon's overflow can't clip it. */
export function Flyout({ anchor, label, onClose, children }: { anchor: Anchor; label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(6, Math.min(anchor.x, window.innerWidth - r.width - 6)), top: anchor.y + 2 });
  }, [anchor]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Element | null;
      // pressing the trigger again is handled by its own click (toggle), so don't close twice
      if (!ref.current?.contains(t) && !t?.closest?.("[data-ribbon-collapsed]")) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="group"
      aria-label={label}
      data-testid="ribbon-flyout"
      className="anim-pop fixed z-[90] flex max-w-[calc(100vw-0.75rem)] flex-col overflow-x-auto rounded-lg border border-line bg-ribbon px-1 shadow-pop"
      style={{ left: pos?.left ?? anchor.x, top: pos?.top ?? anchor.y, visibility: pos ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}
