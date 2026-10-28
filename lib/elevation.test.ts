/**
 * lib/elevation.test.ts
 *
 * WHAT   Unit tests of lib/elevation.ts: the viewing direction, plane and camera bearing of a line elevation at any
 *        angle, the facets of a circular (unrolled) elevation, and the angle / length / compass helpers.
 * FOR    `npm test`. Catches a view that looks the wrong way or a circular elevation that faces outwards.
 * DEBUG  - A bearing test fails by 180°: the sign of `look` or of the left normal changed in lineView.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { arcFacets, compassName, elevOfMark, lineAngleLength, lineFrom, lineView, sideOf } from "./elevation";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("a west-to-east line looking left looks north from the south side", () => {
  const v = lineView({ a: [0, 0], b: [10, 0], look: 1 });
  close(v.v[0], 0);
  close(v.v[1], 1);
  close(v.bearing, 180);
  // screen right runs from A to B
  close(v.right[0], 1);
  close(v.right[1], 0);
  // the plane keeps what is north of the line
  assert.ok(v.plane.n[0] * 5 + v.plane.n[1] * 3 >= v.plane.d);
  assert.ok(v.plane.n[0] * 5 + v.plane.n[1] * -3 < v.plane.d);
});

test("looking right flips the view and the bearing", () => {
  const v = lineView({ a: [0, 0], b: [10, 0], look: -1 });
  close(v.v[1], -1);
  close(v.bearing, 0);
});

test("a diagonal line gives a diagonal bearing", () => {
  const v = lineView({ a: [0, 0], b: [10, 10], look: -1 });
  // looking south-east from the north-west
  close(v.bearing, 315);
  assert.equal(compassName(v.bearing), "North-West");
});

test("sideOf tells left from right", () => {
  assert.equal(sideOf([0, 0], [10, 0], [3, 2]), 1);
  assert.equal(sideOf([0, 0], [10, 0], [3, -2]), -1);
});

test("a full circle unrolls into 12 facets that all look at the centre", () => {
  const f = arcFacets({ c: [5, 5], r: 40, start: 0, sweep: 360 });
  assert.equal(f.length, 12);
  for (const e of f) {
    const v = lineView(e).v;
    const mid = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
    const toC = [5 - mid[0], 5 - mid[1]];
    assert.ok(v[0] * toC[0] + v[1] * toC[1] > 0, "facet looks inward");
  }
  // consecutive facets share their ends: the strip has no gaps
  for (let i = 1; i < f.length; i++) {
    close(f[i].a[0], f[i - 1].b[0]);
    close(f[i].a[1], f[i - 1].b[1]);
  }
});

test("a half circle gives 6 facets; a narrow sweep at least 2", () => {
  assert.equal(arcFacets({ c: [0, 0], r: 20, start: 90, sweep: 180 }).length, 6);
  assert.equal(arcFacets({ c: [0, 0], r: 20, start: 0, sweep: 20 }).length, 2);
});

test("angle and length round-trip", () => {
  const b = lineFrom([2, 3], 30, 50);
  const { angle, length } = lineAngleLength([2, 3], b);
  close(angle, 30);
  close(length, 50);
});

test("marks become lines and circles", () => {
  const l = elevOfMark("elevline", [[0, 0], [5, 0]], { look: -1 });
  assert.equal(l?.line?.look, -1);
  const c = elevOfMark("elevarc", [[0, 0], [0, 30]], { sweep: 180 });
  close(c!.arc!.r, 30);
  close(c!.arc!.start, 90);
  assert.equal(c!.arc!.sweep, 180);
  assert.equal(elevOfMark("line", [[0, 0], [1, 1]], {}), null);
});
