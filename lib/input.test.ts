/**
 * lib/input.test.ts
 *
 * WHAT   Unit tests for lib/input.ts: telling a mouse wheel from a trackpad, the sticky classifier, and how a
 *        wheel / pinch event becomes zoom and pan amounts under each "Scroll gesture" setting.
 * FOR    `npm test`. Protects the viewport's scroll feel on Mac trackpads, Windows precision touchpads and mice.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWheelClassifier, interpretWheel, isMouseWheel, wheelPixels, type WheelLike } from "./input";

const wheel = (o: Partial<WheelLike>): WheelLike => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, ...o });
/** one notch of a Windows mouse wheel in Chromium */
const NOTCH = wheel({ deltaY: 100, wheelDeltaY: -120 });
/** a slice of a Mac trackpad two-finger scroll */
const TRACKPAD = wheel({ deltaY: 7.5, deltaX: 1.5, wheelDeltaY: -22.5 });
/** a trackpad pinch as Chromium reports it */
const PINCH = wheel({ deltaY: -4, ctrlKey: true, wheelDeltaY: 12 });

describe("wheelPixels", () => {
  it("converts lines and pages to pixels", () => {
    assert.deepEqual(wheelPixels(wheel({ deltaY: 3, deltaMode: 1 })), { dx: 0, dy: 48 });
    assert.deepEqual(wheelPixels(wheel({ deltaY: 1, deltaMode: 2 })), { dx: 0, dy: 800 });
    assert.deepEqual(wheelPixels(wheel({ deltaX: 5, deltaY: 6 })), { dx: 5, dy: 6 });
  });
});

describe("isMouseWheel", () => {
  it("recognises notched wheels", () => {
    assert.equal(isMouseWheel(NOTCH), true);
    assert.equal(isMouseWheel(wheel({ deltaY: 3, deltaMode: 1 })), true); // Firefox reports lines
  });
  it("recognises smooth trackpad scrolling", () => {
    assert.equal(isMouseWheel(TRACKPAD), false);
    assert.equal(isMouseWheel(wheel({ deltaY: 2 })), false);
    assert.equal(isMouseWheel(wheel({ deltaY: 100, deltaX: 3, wheelDeltaY: -120 })), false); // sideways component
  });
});

describe("createWheelClassifier", () => {
  it("keeps its verdict inside one gesture even if a trackpad delta looks like a notch", () => {
    let t = 0;
    const classify = createWheelClassifier(250, () => t);
    assert.equal(classify(TRACKPAD), false);
    t += 16;
    assert.equal(classify(wheel({ deltaY: 40, wheelDeltaY: -120 })), false); // would read as a wheel on its own
    t += 16;
    assert.equal(classify(TRACKPAD), false);
  });
  it("re-decides after a pause, so switching devices is noticed", () => {
    let t = 0;
    const classify = createWheelClassifier(250, () => t);
    assert.equal(classify(TRACKPAD), false);
    t += 1000;
    assert.equal(classify(NOTCH), true);
  });
});

describe("interpretWheel", () => {
  it("auto: a mouse wheel zooms, scrolling down zooms out", () => {
    const r = interpretWheel(NOTCH, "auto", true);
    assert.ok(r.zoom < 1 && r.zoom > 0.8, String(r.zoom));
    assert.equal(r.panY, 0);
  });
  it("auto: a trackpad pans, content following the fingers", () => {
    const r = interpretWheel(TRACKPAD, "auto", false);
    assert.equal(r.zoom, 1);
    assert.equal(r.panX, -1.5);
    assert.equal(r.panY, -7.5);
  });
  it("zoom: scrolling zooms on any device and sideways scroll pans", () => {
    const r = interpretWheel(TRACKPAD, "zoom", false);
    assert.ok(r.zoom < 1);
    assert.equal(r.panX, -1.5);
    assert.equal(r.panY, 0);
  });
  it("pan: scrolling pans even with a mouse wheel", () => {
    const r = interpretWheel(NOTCH, "pan", true);
    assert.equal(r.zoom, 1);
    assert.equal(r.panY, -100);
  });
  it("pinch always zooms, with enough gain to feel right, in every mode", () => {
    for (const pref of ["auto", "zoom", "pan"] as const) {
      const r = interpretWheel(PINCH, pref, false);
      assert.ok(r.zoom > 1.03, `${pref}: ${r.zoom}`); // fingers apart (deltaY < 0) zooms in
      assert.equal(r.panX, 0);
      assert.equal(r.panY, 0);
    }
  });
  it("Ctrl+wheel on a mouse zooms at the ordinary wheel rate, not the pinch rate", () => {
    const r = interpretWheel(wheel({ deltaY: -100, ctrlKey: true, wheelDeltaY: 120 }), "auto", true);
    assert.ok(r.zoom > 1.1 && r.zoom < 1.25, String(r.zoom));
  });
});
