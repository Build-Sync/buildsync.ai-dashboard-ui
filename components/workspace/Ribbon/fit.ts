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

/** Which panels to collapse: from the right, only while the tab doesn't fit, never one narrower than its collapsed form. */
export function collapsePlan(widths: number[], available: number, collapsedPx: number): boolean[] {
  const out = widths.map(() => false);
  let total = widths.reduce((a, b) => a + b, 0);
  for (let i = widths.length - 1; i >= 0 && total > available; i--) {
    if (widths[i] <= collapsedPx) continue;
    out[i] = true;
    total += collapsedPx - widths[i];
  }
  return out;
}
