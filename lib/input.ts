/**
 * lib/input.ts
 *
 * WHAT   Pure helpers that interpret pointer-device input for the viewport so a mouse, a Mac trackpad,
 *        a Windows precision touchpad and a Magic Mouse all feel right:
 *        - `createWheelClassifier` tells a notched mouse wheel from smooth trackpad scrolling.
 *        - `interpretWheel` turns one `wheel` event into zoom + pan amounts according to the user's
 *          "Scroll gesture" setting (Auto / Zoom / Pan).
 *        Pinch on a trackpad arrives as a wheel event with ctrlKey set (Chromium, Firefox); Safari sends
 *        its own gesture events instead, which the viewport handles separately.
 * FOR    components/workspace/Viewport/ModelViewport.tsx (the only caller); unit tests in lib/input.test.ts.
 *
 * DEBUG  - Scrolling zooms when you expected panning (or the reverse): set Settings → Display → Scroll
 *          gesture to Zoom or Pan to bypass the Auto guess, then look at `isMouseWheel`.
 *        - Pinch feels too slow/fast: the ctrl+wheel gains in `interpretWheel`.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */

/** What the scroll wheel / two-finger scroll does in the viewport. "auto" guesses from the device. */
export type ScrollGesture = "auto" | "zoom" | "pan";

/** The WheelEvent fields we read; `wheelDeltaY` is the legacy Chromium/Safari field. */
export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  wheelDeltaY?: number;
}

/** What to do for one wheel event. `zoom` is a multiplier (1 = none); pan amounts are screen pixels. */
export interface WheelResult {
  zoom: number;
  panX: number;
  panY: number;
}

const LINE_PX = 16;
const PAGE_PX = 800;
const WHEEL_GAIN = 0.0016;
const PINCH_GAIN = 0.01;

/** Deltas in pixels whatever the device reports (lines and pages come from physical wheels). */
export function wheelPixels(e: WheelLike): { dx: number; dy: number } {
  const k = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1;
  return { dx: e.deltaX * k, dy: e.deltaY * k };
}

/**
 * True for a notched mouse wheel, false for smooth trackpad / Magic Mouse scrolling. Physical wheels
 * report lines (Firefox, some Windows setups) or, in Chromium and Safari, a legacy `wheelDeltaY` that is
 * a multiple of 120 per notch. This is a heuristic; the setting overrides it.
 */
export function isMouseWheel(e: WheelLike): boolean {
  if (e.deltaMode !== 0) return true;
  const wd = e.wheelDeltaY;
  return typeof wd === "number" && wd !== 0 && e.deltaX === 0 && Math.abs(wd) % 120 === 0;
}

/**
 * Classifier with memory: a stream of events from one gesture keeps the first verdict, because a
 * trackpad occasionally produces a delta that looks like a wheel notch (40px → wheelDeltaY 120).
 * A pause longer than `holdMs` lets it re-decide, so switching devices is picked up.
 */
export function createWheelClassifier(holdMs = 250, now: () => number = () => (typeof performance !== "undefined" ? performance.now() : Date.now())) {
  let last = { wheel: true, at: -Infinity };
  return (e: WheelLike): boolean => {
    const t = now();
    if (t - last.at > holdMs) last = { wheel: isMouseWheel(e), at: t };
    else last = { wheel: last.wheel, at: t };
    return last.wheel;
  };
}

/**
 * Interpret one wheel event.
 * - ctrlKey: pinch on a trackpad (tiny deltas, needs a high gain) or Ctrl+wheel on a mouse: always zoom.
 * - "zoom": the wheel zooms about the cursor; sideways scrolling pans.
 * - "pan": scrolling pans in both axes (content follows the fingers); pinch / Ctrl+wheel zooms.
 * - "auto": a mouse wheel zooms, a trackpad pans.
 */
export function interpretWheel(e: WheelLike, pref: ScrollGesture, deviceIsWheel: boolean): WheelResult {
  const { dx, dy } = wheelPixels(e);
  if (e.ctrlKey) return { zoom: Math.exp(-dy * (deviceIsWheel ? WHEEL_GAIN : PINCH_GAIN)), panX: 0, panY: 0 };
  const zooms = pref === "zoom" || (pref === "auto" && deviceIsWheel);
  if (zooms) return { zoom: Math.exp(-dy * WHEEL_GAIN), panX: -dx, panY: 0 };
  return { zoom: 1, panX: -dx, panY: -dy };
}
