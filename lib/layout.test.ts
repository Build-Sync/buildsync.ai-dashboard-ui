/**
 * lib/layout.test.ts
 *
 * WHAT   Unit tests of lib/layout.ts and lib/tour.ts: an arrangement read from storage is always valid (sizes, dragged
 *        widths, sides, the bottom order, palette and explorer tabs), the first saved format still loads, saved
 *        interfaces round-trip without the built-in ones, side windows sit in the right order on each edge, the
 *        eye button cycles its three sizes, and the tour has one step per ribbon tab.
 * FOR    `npm test`. Catches a bad stored layout that breaks the workspace on load, and a tour that falls out of step
 *        with the ribbon.
 * DEBUG  - A sanitize test fails: a new Arrangement field needs a check in sanitize() and a default.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
};

import {
  BUILT_IN_INTERFACES, DEFAULT_ARRANGEMENT, INTERFACES_KEY, LAYOUT_KEY, allInterfaces, clampDockPx, cloneArrangement, nextDockSize,
  readInterfaces, readLayout, sameArrangement, sanitize, sideDocks, writeInterfaces, writeLayout,
} from "./layout";
import { tourSeen, tourSteps } from "./tour";
import { RIBBON } from "../components/workspace/Ribbon/ribbon.config";

beforeEach(() => mem.clear());

describe("window arrangements", () => {
  it("turns anything unreadable into the default", () => {
    for (const raw of [null, 42, "x", [], { shown: "yes", size: { explorer: "huge" }, side: { palettes: "up" } }]) assert.deepEqual(sanitize(raw), DEFAULT_ARRANGEMENT);
  });

  it("keeps the valid parts, clamps dragged sizes and drops unknown or repeated tabs", () => {
    const a = sanitize({
      shown: { timeline: false },
      size: { palettes: "large" },
      px: { explorer: 9999, cmdline: 10, palettes: "wide" },
      side: { explorer: "right" },
      bottom: ["cmdline", "timeline"],
      palettes: ["cost", "nope", "cost", "health"],
      explorer: [],
    });
    assert.equal(a.shown.timeline, false);
    assert.equal(a.shown.explorer, true);
    assert.equal(a.size.palettes, "large");
    assert.deepEqual(a.px, { explorer: 640, cmdline: 104 });
    assert.equal(a.side.explorer, "right");
    assert.deepEqual(a.bottom, ["cmdline", "timeline"]);
    assert.deepEqual(a.palettes, ["cost", "health"]);
    assert.deepEqual(a.explorer, DEFAULT_ARRANGEMENT.explorer, "the explorer always keeps a tab");
    assert.deepEqual(sanitize({ bottom: ["cmdline", "cmdline"] }).bottom, DEFAULT_ARRANGEMENT.bottom);
  });

  it("clamps a dragged size to the window's limits and the screen", () => {
    assert.equal(clampDockPx("timeline", 50), 96);
    assert.equal(clampDockPx("timeline", 700, { w: 1400, h: 800 }), 560);
    assert.equal(clampDockPx("palettes", 700, { w: 1000, h: 900 }), 450);
  });

  it("saves the arrangement with its interface, and still loads the first format (sizes only)", () => {
    assert.equal(readLayout(), null);
    const a = cloneArrangement(DEFAULT_ARRANGEMENT);
    a.size.timeline = "large";
    writeLayout(a, "scheduling");
    assert.deepEqual(readLayout(), { a, iface: "scheduling" });
    mem.set(LAYOUT_KEY, JSON.stringify({ explorer: "min", palettes: "large", timeline: "bogus" }));
    const old = readLayout()!;
    assert.equal(old.iface, null);
    assert.deepEqual(old.a.size, { explorer: "min", palettes: "large", timeline: "min", cmdline: "mid" });
    mem.set(LAYOUT_KEY, "{not json");
    assert.equal(readLayout(), null);
  });

  it("stores only the user's interfaces and cleans what it reads back", () => {
    const mine = { id: "u1", name: "Mine", desc: "Big palettes", a: { ...cloneArrangement(DEFAULT_ARRANGEMENT), palettes: ["cost" as const] } };
    assert.ok(writeInterfaces([...BUILT_IN_INTERFACES, mine]));
    assert.deepEqual(readInterfaces(), [mine]);
    mem.set(INTERFACES_KEY, JSON.stringify([{ id: "u2", name: "x".repeat(99) }, { name: "no id" }, 7]));
    const [r] = readInterfaces();
    assert.equal(r.name.length, 60);
    assert.equal(r.desc, "Saved by you");
    assert.deepEqual(r.a, DEFAULT_ARRANGEMENT);
    assert.equal(allInterfaces([r])[0].id, "standard");
  });

  it("ships built-in interfaces that are valid and all different", () => {
    for (const i of BUILT_IN_INTERFACES) assert.deepEqual(sanitize(i.a), i.a, i.id);
    for (const [k, i] of BUILT_IN_INTERFACES.entries()) for (const j of BUILT_IN_INTERFACES.slice(k + 1)) assert.ok(!sameArrangement(i.a, j.a), `${i.id} = ${j.id}`);
  });

  it("puts the explorer outermost when both side windows share an edge", () => {
    assert.deepEqual(sideDocks({ explorer: "left", palettes: "right" }, "left"), ["explorer"]);
    assert.deepEqual(sideDocks({ explorer: "left", palettes: "left" }, "left"), ["explorer", "palettes"]);
    assert.deepEqual(sideDocks({ explorer: "right", palettes: "right" }, "right"), ["palettes", "explorer"]);
  });

  it("cycles the eye button: normal, fully open, header only, normal", () => {
    assert.deepEqual([nextDockSize("mid"), nextDockSize("large"), nextDockSize("min")], ["large", "min", "mid"]);
  });
});

describe("the tour", () => {
  const tabs = RIBBON.map((t) => ({ id: t.id, label: t.label, purpose: t.purpose, panels: t.panels.map((p) => p.name) }));
  const steps = tourSteps(tabs);

  it("explains every ribbon tab in the ribbon's order, with what it is for", () => {
    const tabSteps = steps.filter((s) => s.id.startsWith("tab-"));
    assert.deepEqual(tabSteps.map((s) => s.tab), RIBBON.map((t) => t.id));
    for (const [i, s] of tabSteps.entries()) {
      assert.ok(s.body.includes(RIBBON[i].purpose), s.id);
      assert.ok(s.target?.startsWith(`#tab-${RIBBON[i].id}`), s.id);
    }
  });

  it("starts with a welcome, ends with what to do next, and every step says something", () => {
    assert.equal(steps[0].id, "welcome");
    assert.match(steps[0].body, /any time/);
    assert.equal(new Set(steps.map((s) => s.id)).size, steps.length);
    assert.ok(steps.every((s) => s.title && s.body.length > 40));
  });

  it("asks once: not seen until it is taken or skipped", () => {
    assert.equal(tourSeen(), false);
    mem.set("bs.tour", "done");
    assert.equal(tourSeen(), true);
  });
});
