/**
 * lib/draw/snap.test.ts
 *
 * WHAT   Unit tests of the AutoCAD-style snapping (snap.ts): end point, midpoint, intersection, perpendicular and
 *        nearest object snaps, which one wins, object snap tracking (horizontal / vertical through acquired
 *        points, and where two of them cross), ortho with its guide line, and typed surveyor bearings.
 * FOR    `npm test`.
 * DEBUG  - A snap test picks a different kind: the closest point snap within `tol` wins; perpendicular and nearest
 *          only apply when no point snap is in reach.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Scene } from "../scene/types";
import type { DrawnItem } from "./types";
import { parseTyped, snapPoint, type SnapCfg } from "./snap";

const near = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const line = (id: string, a: [number, number], b: [number, number]): DrawnItem => ({ id, kind: "line", name: id, level: "level1", z: 0, pts: [a, b], p: {} });

// a horizontal line 0..10 at y = 0, and a vertical one at x = 7 from y = -2 to 6 (they cross at 7, 0)
const scene = { drafts: [line("A", [0, 0], [10, 0]), line("B", [7, -2], [7, 6])], elements: [], items: {} } as unknown as Scene;
const ALL = { endpoint: true, midpoint: true, center: true, intersection: true, perpendicular: true, nearest: true };
const cfg = (o: Partial<SnapCfg> = {}): SnapCfg => ({ grid: false, step: 0.5, ortho: false, polar: false, polarAngle: 45, osnap: true, modes: { ...ALL }, otrack: true, ...o });

describe("object snaps", () => {
  it("locks onto an end point and a midpoint", () => {
    const e = snapPoint([0.2, 0.1], null, scene, "level1", cfg(), 1);
    assert.equal(e.kind, "endpoint");
    assert.deepEqual(e.pt, [0, 0]);
    const m = snapPoint([5.3, 0.2], null, scene, "level1", cfg(), 1);
    assert.equal(m.kind, "midpoint");
    assert.deepEqual(m.pt, [5, 0]);
  });
  it("finds where two lines cross", () => {
    const x = snapPoint([7.3, 0.4], null, scene, "level1", cfg(), 1);
    assert.equal(x.kind, "intersection");
    near(x.pt[0], 7);
    near(x.pt[1], 0);
  });
  it("drops a perpendicular from the last point when no point snap is in reach", () => {
    const p = snapPoint([7.2, 4.3], [3, 4], scene, "level1", cfg(), 1);
    assert.equal(p.kind, "perpendicular");
    near(p.pt[0], 7);
    near(p.pt[1], 4);
    assert.deepEqual(p.guides?.[0][0], [3, 4]);
  });
  it("falls back to the nearest point on a line", () => {
    const n = snapPoint([2.5, 0.3], null, scene, "level1", cfg(), 1);
    assert.equal(n.kind, "nearest");
    near(n.pt[0], 2.5);
    near(n.pt[1], 0);
  });
  it("only uses the modes that are ticked", () => {
    const off = snapPoint([5.3, 0.2], null, scene, "level1", cfg({ modes: { ...ALL, midpoint: false, nearest: false } }), 1);
    assert.equal(off.kind, "none");
    assert.deepEqual(off.pt, [5.3, 0.2]);
  });
});

describe("object snap tracking", () => {
  const free = cfg({ osnap: false });
  it("locks to the vertical and the horizontal through an acquired point", () => {
    const v = snapPoint([5.3, 8], null, scene, "level1", free, 1, [[5, 0]]);
    assert.equal(v.kind, "track");
    assert.deepEqual(v.pt, [5, 8]);
    const h = snapPoint([12, 0.4], null, scene, "level1", free, 1, [[5, 0]]);
    assert.deepEqual(h.pt, [12, 0]);
    assert.deepEqual(h.guides?.[0][0], [5, 0]);
  });
  it("snaps to where the guides of two acquired points cross", () => {
    const x = snapPoint([5.2, 6.3], null, scene, "level1", free, 1, [[5, 0], [0, 6]]);
    assert.equal(x.kind, "track");
    assert.deepEqual(x.pt, [5, 6]);
    assert.equal(x.guides?.length, 2);
  });
  it("does nothing with OTRACK off", () => {
    assert.equal(snapPoint([5.3, 8], null, scene, "level1", cfg({ osnap: false, otrack: false }), 1, [[5, 0]]).kind, "none");
  });
});

describe("ortho and typed bearings", () => {
  it("keeps the line straight from the last point and returns the guide", () => {
    const o = snapPoint([10, 1], [0, 0], scene, "level1", cfg({ osnap: false, ortho: true }), 1);
    assert.equal(o.kind, "ortho");
    assert.deepEqual(o.pt, [10, 0]);
    assert.deepEqual(o.guides, [[[0, 0], [10, 0]]]);
  });
  it("reads a bearing and distance from the last point", () => {
    const t = parseTyped("N90E 60", [0, 0], null, "imperial");
    assert.ok(t && t.kind === "pt");
    near(t.pt[0], 60);
    near(t.pt[1], 0, 1e-9);
    const s = parseTyped("S45°W, 10'", [10, 10], null, "imperial");
    assert.ok(s && s.kind === "pt");
    near(s.pt[0], 10 - 10 * Math.SQRT1_2);
    near(s.pt[1], 10 - 10 * Math.SQRT1_2);
  });
  it("turns a true bearing into the plan with the site's north angle", () => {
    // true north points to the right of the plan: due north runs along +x
    const t = parseTyped("N0E 10", [0, 0], null, "imperial", 90);
    assert.ok(t && t.kind === "pt");
    near(t.pt[0], 10);
    near(t.pt[1], 0, 1e-9);
  });
});
