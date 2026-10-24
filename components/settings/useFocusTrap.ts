/**
 * components/settings/useFocusTrap.ts
 *
 * WHAT   Hook that, while enabled, moves focus into a dialog element, keeps Tab and Shift+Tab cycling inside
 *        it, and gives focus back to the previously focused element when it unmounts.
 * FOR    The settings modal (SettingsFrame), so keyboard and screen-reader users cannot tab into the workspace
 *        behind it.
 * DEBUG  - Tab escapes the dialog: hidden controls are skipped by the offsetParent filter; a visible control
 *          type missing from FOCUSABLE needs adding there.
 *        - Focus is not restored on close: the previous element is read on mount; if it was removed meanwhile
 *          nothing is focused.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Move focus into a dialog on mount, keep Tab inside it, restore focus on unmount. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    const prev = document.activeElement as HTMLElement | null;
    el?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !el) return;
      const nodes = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [ref, enabled]);
}
