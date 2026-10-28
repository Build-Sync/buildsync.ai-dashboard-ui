/**
 * components/workspace/Ribbon/fit.ts
 *
 * WHAT   The measurements and maths behind ribbon panel collapse. Like AutoCAD, when a tab is wider than the
 *        window, the right-most panels fold into one button each (a pinned panel, Help on Home, never folds). This
 *        module keeps the available width, the
 *        rem size and the measured natural width of each panel (cached per tab, theme, UI scale and font load),
 *        plus a rem-based estimate used until real widths are measured.
 * FOR    RibbonPanels.tsx. The estimate makes the server render and the first browser render agree (no
 *        hydration mismatch); the measured widths then replace it.
 * DEBUG  - Panels collapse too early or too late: check the cache key in RibbonPanels (tab | look | fonts), the
 *          container width read by its ResizeObserver, and COLLAPSED_REM.
 *        - Wrong after web fonts load: ribbonMetrics.invalidate() clears the widths when fonts finish loading;
 *          the Measurer re-measures.
 *        - Windows and Mac differ slightly in text width: that is why real measurement, not the estimate,
 *          decides the final result.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useSyncExternalStore } from "react";
import { panelColumns, type RibbonPanel } from "./ribbon.config";

/* Ribbon panel collapse. Like AutoCAD, when a tab is wider than the window the right-most panels fold
 * into a single button that opens the panel as a flyout. Natural (expanded) panel widths are measured
 * once per tab / theme / UI scale / font load and cached here; until then a rem estimate stands in so the
 * server render and the first client render agree. */

/** width of a collapsed panel: 4.25rem button + 0.5rem section padding + the 1px divider */
export const COLLAPSED_REM = 4.8;

const DEFAULT_CONTAINER = 1432;
const DEFAULT_REM = 16;

interface Metrics {
  /** px available to panels inside the ribbon strip */
  container: number;
  /** px per rem (root font size, so UI scale is honoured) */
  rem: number;
  /** bumped when web fonts finish loading: every cached width is stale */
  fonts: number;
  /** measured expanded widths in px per panel, by cache key */
  natural: Record<string, number[]>;
}

const INITIAL: Metrics = { container: DEFAULT_CONTAINER, rem: DEFAULT_REM, fonts: 0, natural: {} };
let state: Metrics = INITIAL;
const listeners = new Set<() => void>();

function commit(next: Metrics) {
  state = next;
  listeners.forEach((l) => l());
}

/** Write access to the shared ribbon measurements (container width, measured panel widths, font invalidation). */
export const ribbonMetrics = {
  setContainer(container: number, rem: number) {
    if (Math.abs(state.container - container) < 0.5 && state.rem === rem) return;
    commit({ ...state, container, rem });
  },
  setNatural(key: string, widths: number[]) {
    const prev = state.natural[key];
    if (prev && prev.length === widths.length && prev.every((w, i) => Math.abs(w - widths[i]) < 0.5)) return;
    commit({ ...state, natural: { ...state.natural, [key]: widths } });
  },
  /** web fonts changed text widths */
  invalidate() {
    commit({ ...state, fonts: state.fonts + 1, natural: {} });
  },
};

/** Subscribe a component to the shared ribbon measurements. */
export function useRibbonMetrics(): Metrics {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => INITIAL,
  );
}

/* ── estimate (rem), mirrors the sizes in Buttons.tsx ─────────────────── */
const LARGE_COL = 3.45; // w-[3.45rem]
const SMALL_MIN = 4.9; // min-w-[4.9rem]
const SMALL_CHROME = 1.9; // px-1.5 + 14px icon + gap
const GLYPH = 0.34; // average glyph at 11px
const COL_GAP = 0.125; // gap-0.5
const PANEL_CHROME = 0.5 + 0.07; // section px-1 + divider

/** Estimated width of a panel in rem, used until the real width has been measured. */
export function estimatePanelRem(panel: RibbonPanel): number {
  const cols = panelColumns(panel.items);
  let w = 0;
  for (const col of cols) {
    if (col[0].size === "large") w += LARGE_COL;
    else w += Math.max(SMALL_MIN, SMALL_CHROME + GLYPH * Math.max(...col.map((i) => i.label.length)));
  }
  w += COL_GAP * Math.max(0, cols.length - 1);
  return Math.max(w, panel.name.length * 0.36) + PANEL_CHROME;
}

/**
 * Which panels to collapse: from the right, only while the tab doesn't fit, never one narrower than its collapsed form
 * and never a pinned one (Help on Home).
 */
export function collapsePlan(widths: number[], available: number, collapsedPx: number, pinned: boolean[] = []): boolean[] {
  const out = widths.map(() => false);
  let total = widths.reduce((a, b) => a + b, 0);
  for (let i = widths.length - 1; i >= 0 && total > available; i--) {
    if (widths[i] <= collapsedPx || pinned[i]) continue;
    out[i] = true;
    total += collapsedPx - widths[i];
  }
  return out;
}
