/**
 * lib/draw/geom.test.ts
 *
 * WHAT   Unit tests of the drawing geometry (geom.ts) and of typed input (snap.ts): transforms, intersections,
 *        offsets, arcs, polygons, length parsing ("12'-6\"", "6\"", "2m") and typed points.
 * FOR    `npm test`.
 * DEBUG  - A tolerance failure of ~1e-12: compare with `near`, never with strict equality.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  affApply, affDet, affMirror, affMul, affRotate, affScale, affScaleOf, affTranslate, angleBetween, arcFrom3, arcPts, closestOnSeg, dist2, lineIntersect, offsetPolyline, orientedRect, pointInPoly,
  polyArea, polyCentroid, rectPts, segIntersect, splinePts, type Aff,
} from "./geom";
import { parseLen, parseTyped } from "./snap";

const near = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const nearPt = (p: [number, number], q: [number, number], tol = 1e-9) => {
  near(p[0], q[0], tol);
  near(p[1], q[1], tol);
};

describe("affine transforms", () => {
  it("moves, rotates about a point, scales about a point", () => {
    nearPt(affApply(affTranslate(2, 3), [1, 1]), [3, 4]);
    nearPt(affApply(affRotate(Math.PI / 2, 10, 10), [12, 10]), [10, 12]);
    nearPt(affApply(affScale(2, 10, 10), [12, 11]), [14, 12]);
  });
  it("mirrors across a line and reports a negative determinant", () => {
    const m = affMirror([0, 0], [0, 5]); // the Y axis
    nearPt(affApply(m, [3, 2]), [-3, 2]);
    assert.ok(affDet(m) < 0);
    const diag = affMirror([0, 0], [1, 1]);
    nearPt(affApply(diag, [3, 0]), [0, 3]);
  });
  it("composes right to left", () => {
    const m: Aff = affMul(affTranslate(5, 0), affRotate(Math.PI / 2));
    nearPt(affApply(m, [1, 0]), [5, 1]);
    near(affScaleOf(affScale(3)), 3);
  });
});

describe("lines and segments", () => {
  it("finds where two segments cross and rejects ones that do not", () => {
    const h = segIntersect([0, 0], [10, 0], [4, -2], [4, 2]);
    assert.ok(h);
    nearPt(h!.pt, [4, 0]);
    assert.equal(segIntersect([0, 0], [10, 0], [12, -2], [12, 2]), null);
    assert.ok(lineIntersect([0, 0], [10, 0], [12, -2], [12, 2])); // the infinite lines still meet
    assert.equal(lineIntersect([0, 0], [1, 0], [0, 1], [1, 1]), null); // parallel
  });
  it("finds the closest point on a segment, clamped to its ends", () => {
    const c = closestOnSeg([5, 3], [0, 0], [10, 0]);
    nearPt(c.pt, [5, 0]);
    near(c.d, 3);
    nearPt(closestOnSeg([-4, 1], [0, 0], [10, 0]).pt, [0, 0]);
  });
  it("measures the angle between two directions counter-clockwise", () => {
    near(angleBetween([1, 0], [0, 1]), 90);
    near(angleBetween([0, 1], [1, 0]), 270);
  });
});

describe("polygons", () => {
  it("computes area, centroid and containment", () => {
    const r = rectPts([0, 0], [4, 3]);
    near(polyArea(r), 12);
    nearPt(polyCentroid(r), [2, 1.5]);
    assert.ok(pointInPoly([1, 1], r));
    assert.ok(!pointInPoly([5, 1], r));
  });
  it("thickens a segment into an oriented rectangle", () => {
    const p = orientedRect([0, 0], [10, 0], 2);
    near(Math.abs(polyArea(p)), 20);
  });
  it("offsets a closed rectangle inward and outward with mitred corners", () => {
    const r = rectPts([0, 0], [10, 6]); // counter-clockwise: left of each edge is inside
    near(polyArea(offsetPolyline(r, 1, true)), 8 * 4);
    near(polyArea(offsetPolyline(r, -1, true)), 12 * 8);
  });
  it("offsets an open polyline to its left", () => {
    const o = offsetPolyline([[0, 0], [10, 0], [10, 10]], 2, false);
    nearPt(o[0], [0, 2]);
    nearPt(o[1], [8, 2]);
    nearPt(o[2], [8, 10]);
  });
});

describe("curves", () => {
  it("builds the arc through three points and samples it", () => {
    const a = arcFrom3([1, 0], [0, 1], [-1, 0]);
    assert.ok(a);
    nearPt(a!.c, [0, 0]);
    near(a!.r, 1);
    const pts = arcPts(a!, 16);
    nearPt(pts[0], [1, 0]);
    nearPt(pts[8], [0, 1], 1e-9);
    nearPt(pts[16], [-1, 0], 1e-9);
    assert.equal(arcFrom3([0, 0], [1, 1], [2, 2]), null);
  });
  it("sweeps a clockwise three-point arc the right way round", () => {
    const a = arcFrom3([1, 0], [0, -1], [-1, 0])!;
    const mid = arcPts(a, 2)[1];
    nearPt(mid, [0, -1], 1e-9);
  });
  it("passes a spline through its control points", () => {
    const s = splinePts([[0, 0], [5, 5], [10, 0]], 8);
    nearPt(s[0], [0, 0]);
    nearPt(s[8], [5, 5]);
    nearPt(s[s.length - 1], [10, 0]);
    assert.ok(dist2(s[0], s[1]) < 2);
  });
});

describe("typed lengths and points", () => {
  it("reads feet-inches, inches, metres and millimetres", () => {
    near(parseLen("12'-6\"")!, 12.5);
    near(parseLen("12' 6\"")!, 12.5);
    near(parseLen("3'")!, 3);
    near(parseLen("6\"")!, 0.5);
    near(parseLen("2m")!, 2 / 0.3048);
    near(parseLen("500mm")!, 500 / 304.8);
    near(parseLen("3.5")!, 3.5);
    near(parseLen("3.5", "metric-m")!, 3.5 / 0.3048);
    assert.equal(parseLen("hello"), null);
  });
  it("reads x,y, relative and polar points, and a bare distance along the cursor direction", () => {
    assert.deepEqual(parseTyped("3,4", null, null), { kind: "pt", pt: [3, 4] });
    assert.deepEqual(parseTyped("@2,3", [10, 10], null), { kind: "pt", pt: [12, 13] });
    const polar = parseTyped("@5<90", [1, 1], null);
    assert.equal(polar?.kind, "pt");
    if (polar?.kind === "pt") nearPt(polar.pt, [1, 6], 1e-9);
    const along = parseTyped("4", [0, 0], [0, 7]);
    assert.equal(along?.kind, "pt");
    if (along?.kind === "pt") nearPt(along.pt, [0, 4], 1e-9);
    assert.deepEqual(parseTyped("4", null, null), { kind: "dist", d: 4 });
    assert.equal(parseTyped("walls please", null, null), null);
  });
});
