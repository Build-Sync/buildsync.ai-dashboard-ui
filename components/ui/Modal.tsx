/**
 * components/ui/Modal.tsx
 *
 * WHAT   The accessible modal dialog used by every dialog in the app: dimmed backdrop, focus moves in on open
 *        and returns on close, Tab stays inside, Esc and a backdrop click close it. Esc is handled on the
 *        document so it still works when focus has left the dialog (for example the focused button disabled
 *        itself); only the top-most modal answers.
 * FOR    Connect/Manage agent, Invite member, New project, Prompt to Plan, Import/Export, PE review, schedule
 *        and QTO dialogs.
 * DEBUG  - Esc does nothing: check the module-level openModals stack; a modal that never unmounted would stay
 *          top-most.
 *        - Focus lands on the wrong control: mark the one you want with data-autofocus.
 *        - A dialog opens behind another: raise its z prop (the Connect dialog uses 80 over the settings
 *          frame).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

/* Accessible modal: Esc and backdrop close, focus moves in and is restored on close,
 * Tab is trapped inside the dialog. Esc is handled on the document, not on the dialog: when the focused
 * control disables itself (a "Generate" button mid-request) focus drops to <body> and key events no longer
 * pass through the dialog. Only the top-most modal answers, so a dialog over another closes first. */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** open modals, last = top-most */
const openModals: symbol[] = [];

/** Dialog with a title, optional subtitle, body, and an optional footer for buttons. */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = "32rem",
  z = 60,
  className,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  z?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef<Element | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const id = Symbol("modal");
    openModals.push(id);
    prev.current = document.activeElement;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus();

    const onDocKey = (e: KeyboardEvent) => {
      if (openModals[openModals.length - 1] !== id || !el) return;
      if (e.key === "Escape") {
        e.stopPropagation(); // keeps a settings frame underneath from also closing
        closeRef.current();
      } else if (e.key === "Tab" && !el.contains(document.activeElement)) {
        const nodes = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (nodes.length) {
          e.preventDefault();
          (e.shiftKey ? nodes[nodes.length - 1] : nodes[0]).focus();
        }
      }
    };
    document.addEventListener("keydown", onDocKey, true);
    return () => {
      document.removeEventListener("keydown", onDocKey, true);
      openModals.splice(openModals.indexOf(id), 1);
      (prev.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  /** Tab wraps inside the dialog */
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="anim-fade fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "var(--scrim)", zIndex: z }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKey}
        className={cn("anim-pop flex max-h-[88vh] w-full flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-pop outline-none", className)}
        style={{ maxWidth: width }}
      >
        <header className="flex items-start gap-3 border-b border-soft px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[0.9375rem] font-semibold text-t1">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[0.75rem] text-t2">{subtitle}</p>}
          </div>
          <button aria-label="Close" onClick={onClose} className="-mr-1 rounded p-1 text-t3 hover:bg-t1/10 hover:text-t1">
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-soft bg-panel-alt px-4 py-2.5">{footer}</footer>}
      </div>
    </div>
  );
}
