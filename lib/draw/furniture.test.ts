/**
 * lib/draw/furniture.test.ts
 *
 * WHAT   Unit tests of the furniture catalogue (lib/draw/furniture.ts) and of how the model draws it: every piece
 *        is whole (parts with a height and an outline, the size it says), turning and stretching place the parts
 *        right, an older plain-box bed keeps its footprint, a placed piece becomes several solids in their own
 *        colours; and the 3D views that show what is inside or under the house: the Cutaway (nothing above 4 ft
 *        over the floor) and Below Grade (the house faded, the footings drawn).
 * FOR    `npm test`. Catches a piece that comes out inside out or the wrong size, and a view that hides the
 *        rooms or the foundation again.
 * DEBUG  - A size test fails: a part reaches past the piece's width or depth; the catalogue measures pieces from
 *          their parts, so look at the part that sticks out.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FURNITURE, FURNITURE_GROUPS, FURNITURE_IDS, fitPiece, pieceOf, placedParts, planShapes } from "./furniture";
import { composeScene } from "./compose";
import { getScene } from "../scene";
import { makeProjector } from "../scene/camera";
import { renderScene } from "../scene/render";
import { DEFAULT_APPEARANCE, type V2 } from "../scene/types";
import type { DrawnItem } from "./types";

const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const span = (pts: V2[], k: 0 | 1) => Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k]));

describe("the furniture catalogue", () => {
  it("has whole pieces in every group, each the size it says", () => {
    assert.ok(FURNITURE_IDS.length >= 30);
    for (const g of FURNITURE_GROUPS) assert.ok(Object.values(FURNITURE).some((p) => p.group === g), g);
    for (const pc of Object.values(FURNITURE)) {
      assert.ok(pc.parts.length >= 1, pc.id);
      for (const part of pc.parts) {
        assert.ok(part.z1 > part.z0, `${pc.id}: a part with no height`);
        assert.ok(part.poly.length >= 3, `${pc.id}: a part with no outline`);
      }
      const all = pc.parts.flatMap((p) => p.poly);
      near(span(all, 0), pc.w, 0.01);
      near(span(all, 1), pc.d, 0.01);
      assert.ok(pc.h > 0.03 && pc.h < 8, `${pc.id} is ${pc.h} ft high`);
    }
    assert.equal(new Set(Object.values(FURNITURE).map((p) => p.label)).size, FURNITURE_IDS.length, "labels are unique");
  });

  it("draws a plan symbol from the parts: a sofa's cushions, a bed's pillows, a table's chairs", () => {
    assert.ok(planShapes(FURNITURE.sofa, [0, 0], 0).length >= 10);
    assert.ok(FURNITURE["bed-queen"].parts.filter((p) => p.look === "linen").length >= 3, "mattress and two pillows");
    assert.ok(FURNITURE.dining6.parts.length > 6 * 6, "a table with six chairs");
  });

  it("turns and stretches a piece about its centre", () => {
    const pc = FURNITURE["bed-king"];
    const turned = placedParts(pc, [10, 20], 90).flatMap((p) => p.poly);
    near(span(turned, 0), pc.d, 0.01);
    near(span(turned, 1), pc.w, 0.01);
    const wide = placedParts(pc, [0, 0], 0, 2, 1).flatMap((p) => p.poly);
    near(span(wide, 0), pc.w * 2, 0.01);
  });

  it("keeps an older plain-box bed's footprint by turning the new bed instead of squashing it", () => {
    const pc = pieceOf("bed")!;
    assert.equal(pc.id, "bed-queen");
    const fit = fitPiece(pc, 6.5, 5, 0);
    assert.equal(fit.rot, 90);
    near(fit.sx, 5 / pc.w);
    assert.equal(pieceOf("toilet"), null);
  });
});

describe("furniture in the model", () => {
  const item = (type: string, rot = 0): DrawnItem => ({ id: "F-1", kind: "furniture", name: type, level: "level1", z: 0, pts: [[10, 10]], p: { type, rot, w: FURNITURE[type]?.w ?? 6.5, d: FURNITURE[type]?.d ?? 5, h: FURNITURE[type]?.h ?? 2 } });

  it("becomes several solids in their own colours, the size of the piece", () => {
    const s = composeScene(getScene("blank"), [item("sofa")], {});
    const parts = s.prisms.filter((p) => p.id === "F-1");
    assert.ok(parts.length >= 10);
    assert.ok(parts.some((p) => p.color === "fabric") && parts.some((p) => p.color === "cushion"));
    const el = s.elementById["F-1"];
    near(el.max[0] - el.min[0], 7, 0.01);
    near(el.max[2], FURNITURE.sofa.h, 0.01);
  });

  it("draws an older plain-box bed as the new bed, turned to its footprint", () => {
    const old: DrawnItem = { ...item("bed"), p: { type: "bed", rot: 0, w: 6.5, d: 5, h: 2 } };
    const el = composeScene(getScene("blank"), [old], {}).elementById["F-1"];
    near(el.max[0] - el.min[0], 6.5, 0.05);
    near(el.max[1] - el.min[1], 5, 0.05);
  });
});

describe("seeing inside and under the house in 3D", () => {
  const scene = getScene("cottage");
  const proj = makeProjector({ bearing: 225, pitch: 35, zoom: 1, panX: 0, panY: 0, perspective: false }, { w: 800, h: 600 }, scene.center, scene.radius);
  const base = { scene, proj, style: "realistic" as const, plan: null, sectionY: null, colors: DEFAULT_APPEARANCE, layers: {}, hidden: new Set<string>(), isolated: null, phaseState: null, shadows: false, edges: true, tint: {}, dimOthers: false, sun: [0.4, -0.5, 0.75] as [number, number, number], ghostMep: false };
  const roof = scene.elements.find((e) => e.category === "Roof")!;
  const footing = scene.prisms.find((p) => p.category === "Footing" && p.underground)!;
  const wall = scene.elements.find((e) => e.category === "Wall" && e.layer === "walls")!;
  const opacities = (svg: string, id: string) => [...svg.matchAll(new RegExp(`data-el="${id}"[^>]*fill-opacity="([\\d.]+)"`, "g"))].map((m) => Number(m[1]));

  it("the Cutaway leaves out what is more than 4 ft above the floor (the roof) and keeps the walls, cut", () => {
    const svg = renderScene({ ...base, cutAt: 4 }).svg;
    assert.ok(!svg.includes(`data-el="${roof.id}"`), "the roof is cut away");
    assert.ok(svg.includes(`data-el="${wall.id}"`), "the walls stay");
    assert.ok(renderScene(base).svg.includes(`data-el="${roof.id}"`), "without the Cutaway the roof is there");
  });

  it("Below Grade draws the footings and fades the house above them", () => {
    const off = renderScene(base).svg;
    const on = renderScene({ ...base, belowGrade: true }).svg;
    assert.ok(!off.includes(`data-el="${footing.id}"`), "footings are hidden by the ground normally");
    assert.ok(on.includes(`data-el="${footing.id}"`), "Below Grade shows them");
    assert.ok(Math.max(...opacities(on, wall.id)) <= 0.21, "the walls are faded");
    assert.ok(Math.max(...opacities(on, footing.id)) > 0.5, "the footings are solid");
  });
});
