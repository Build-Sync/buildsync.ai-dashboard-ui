"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconKey } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface Anchor {
  x: number;
  y: number;
  /** bottom edge of the trigger; the menu opens below it unless there is no room */
  h?: number;
  /** align the menu's right edge to `x` */
  right?: boolean;
  /** open upwards from `y` */
  up?: boolean;
}

export function anchorOf(el: Element | null, opts: Partial<Pick<Anchor, "right" | "up">> = {}): Anchor | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: opts.right ? r.right : r.left, y: opts.up ? r.top : r.bottom, h: r.height, ...opts };
}

/** Floating menu, position:fixed so no panel can clip it. Closes on outside press or Esc. */
export function Menu({
  anchor,
  onClose,
  children,
  width,
  className,
  label,
}: {
  anchor: Anchor | null;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  className?: string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    let left = anchor.right ? anchor.x - r.width : anchor.x;
    let top = anchor.up ? anchor.y - r.height - 4 : anchor.y + 3;
    left = Math.max(6, Math.min(left, window.innerWidth - r.width - 6));
    if (top + r.height > window.innerHeight - 6) top = Math.max(6, (anchor.up ? anchor.y : anchor.y - (anchor.h ?? 0)) - r.height - 4);
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", onClose);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={cn("anim-pop fixed z-[90] min-w-[11rem] overflow-hidden rounded-lg border border-line bg-chrome py-1 shadow-pop", className)}
      style={{ left: pos?.left ?? anchor.x, top: pos?.top ?? anchor.y, width, visibility: pos ? "visible" : "hidden" }}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  label,
  hint,
  icon,
  onClick,
  checked,
  disabled,
  danger,
  trailing,
  keepOpen,
  onClose,
}: {
  label: ReactNode;
  hint?: string;
  icon?: IconKey;
  onClick?: () => void;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  trailing?: ReactNode;
  keepOpen?: boolean;
  onClose?: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        onClick?.();
        if (!keepOpen) onClose?.();
      }}
      className={cn(
        "flex w-full items-center gap-2 px-2.5 py-1 text-left text-[0.75rem] transition-colors hover:bg-accent/15 disabled:opacity-40 disabled:hover:bg-transparent",
        danger ? "text-bad" : "text-t1",
      )}
    >
      <span className="grid size-4 shrink-0 place-items-center text-t2">{checked ? <Icon name="check" size={13} className="text-accent" /> : icon ? <Icon name={icon} size={14} /> : null}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
      {hint && <span className="mono shrink-0 text-[0.625rem] text-t3">{hint}</span>}
    </button>
  );
}

export function MenuSep() {
  return <div role="separator" className="my-1 h-px bg-soft" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="label-xs px-2.5 pb-0.5 pt-1.5">{children}</div>;
}
