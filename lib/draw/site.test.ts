/**
 * lib/draw/site.test.ts
 *
 * WHAT   Unit tests of the site objects (lib/draw/site.ts): the line helpers (offsets, ribbons, dashes, grown
 *        outlines, point in outline, seeded randomness), pools with their buried shell, boulders, flower beds,
 *        roads with their lines, curbs and sidewalks, sidewalk joints, road signs, traffic lights, drains and
 *        gutters, fences and garden walls, and the scene elements they become (categories and layers).
 * FOR    `npm test`.
 * DEBUG  - A count changes after a look tweak (more flower clumps, another lamp): the tests count parts by look,
 *          so adjust the numbers with the drawing.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getScene } from "../scene";
import type { V2 } from "../scene/types";
import { composeScene } from "./compose";
import { FENCE_HEIGHT, FENCE_TYPES, dashes, drainParts, fenceParts, flowerBedParts, gutterParts, inside, offsetLine, offsetPolygon, poolOutline, poolParts, ribbon, roadParts, rockParts, seeded, sidewalkParts, signalParts, signParts } from "./site";
import type { DrawnItem } from "./types";

const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const area = (p: V2[]) => Math.abs(p.reduce((s, q, i) => s + (q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1]), 0)) / 2;
const SQUARE: V2[] = [[0, 0], [10, 0], [10, 10], [0, 10]];

describe("the line helpers", () => {
  it("moves a line sideways, to its left for a positive distance, mitring the corners", () => {
    const l = offsetLine([[0, 0], [10, 0], [10, 10]], 1);
    assert.deepEqual(l[0], [0, 1]);
    near(l[1][0], 9);
    near(l[1][1], 1);
    near(l[2][0], 9);
  });

  it("makes a band of a width and cuts a line into dashes", () => {
    near(area(ribbon([[0, 0], [20, 0]], 4)), 80);
    const d = dashes([[0, 0], [100, 0]], 10, 30);
    assert.equal(d.length, 3);
    near(d[0][d[0].length - 1][0] - d[0][0][0], 10);
  });

  it("grows an outline outwards and tells inside from outside", () => {
    near(area(offsetPolygon(SQUARE, 1)), 144);
    assert.ok(inside([5, 5], SQUARE));
    assert.ok(!inside([11, 5], SQUARE));
  });

  it("gives the same random numbers for the same seed", () => {
    const a = seeded("U-1");
    const b = seeded("U-1");
    assert.equal(a(), b());
    assert.notEqual(seeded("U-2")(), seeded("U-1")());
  });
});

describe("pools, boulders and beds", () => {
  it("builds a pool: water at grade, its shell and depth below ground, coping and a deck around it", () => {
    for (const shape of ["rectangle", "oval", "freeform", "lshape"] as const) assert.ok(poolOutline(shape, 32, 16).length >= 4, shape);
    const parts = poolParts([0, 0], 0, "rectangle", 32, 16, 6, 4);
    const water = parts.find((p) => p.look === "water" && !p.under)!;
    near(water.z0, 0);
    near(area(water.poly), 32 * 16, 0.5);
    const buried = parts.filter((p) => p.under);
    assert.ok(buried.some((p) => p.look === "concrete" && p.z0 <= -6), "the shell goes down to the depth");
    assert.ok(parts.some((p) => p.look === "deck" || p.pattern), "a deck");
  });

  it("stacks a boulder from irregular tiers, the same each time for an item", () => {
    const one = rockParts([0, 0], 3, 1, "R1");
    assert.ok(one.length >= 3 && one.every((p) => p.look === "rock"));
    assert.deepEqual(rockParts([0, 0], 3, 1, "R1"), one);
    assert.ok(rockParts([0, 0], 3, 3, "R1").length > one.length, "a cluster has more");
  });

  it("fills a flower bed with mulch and clumps of the colours chosen, all inside the bed", () => {
    const parts = flowerBedParts(SQUARE, 0.7, "warm", "F1");
    assert.equal(parts[0].look, "mulch");
    const blooms = parts.filter((p) => p.look.startsWith("flower"));
    assert.ok(blooms.length >= 20);
    assert.ok(blooms.every((p) => p.look === "flowerRed" || p.look === "flowerYellow"), "reds and yellows");
    for (const p of parts.slice(1)) {
      const c: V2 = [p.poly.reduce((s, q) => s + q[0], 0) / p.poly.length, p.poly.reduce((s, q) => s + q[1], 0) / p.poly.length];
      assert.ok(inside(c, SQUARE), "a clump outside the bed");
    }
  });
});

describe("roads and drainage", () => {
  const line: V2[] = [[0, 0], [100, 0]];

  it("lays asphalt, a double yellow centre line, curbs and sidewalks on both sides", () => {
    const parts = roadParts(line, { width: 24, curb: true, walks: "both", centre: "double" });
    near(area(parts.find((p) => p.look === "asphalt")!.poly), 2400);
    assert.equal(parts.filter((p) => p.look === "stripeYellow").length, 2);
    assert.ok(parts.filter((p) => p.look === "concrete").length >= 4, "curb, gutter and walks");
    const plain = roadParts(line, { width: 24, curb: false, walks: "none", centre: "none" });
    assert.ok(!plain.some((p) => p.look === "stripeYellow" || p.look === "concrete"));
    assert.ok(roadParts(line, { width: 24, curb: false, walks: "none", centre: "dashed" }).filter((p) => p.look === "stripeWhite").length > 4, "dashes");
  });

  it("joints a sidewalk every 5 ft", () => {
    assert.equal(sidewalkParts(line, 5).length - 1, 19);
  });

  it("puts a stop sign's red face on a post, and three lamps on each signal head", () => {
    const stop = signParts([0, 0], 0, "stop");
    assert.ok(stop.some((p) => p.look === "metal" && p.z1 >= 8), "the post");
    assert.equal(stop.filter((p) => p.look === "signRed").length, 3, "an octagon in three bands");
    const signal = signalParts([0, 0], 0, 20);
    for (const look of ["lampRed", "lampAmber", "lampGreen"] as const) assert.equal(signal.filter((p) => p.look === look).length, 2, look);
  });

  it("buries a drain's catch basin and drops gutters' downspouts to splash blocks", () => {
    for (const t of ["inlet", "area", "trench"] as const) assert.ok(drainParts([0, 0], 0, t).some((p) => p.under), t);
    const g = gutterParts([0, 0], [30, 0], 9, [0, -1], 0, ["a", "b"]);
    assert.equal(g.filter((p) => p.look === "gutter").length, 1 + 2 * 2, "the gutter, two downspouts and their kick-outs");
    assert.equal(g.filter((p) => p.look === "concrete").length, 2, "two splash blocks");
  });
});

describe("fences and garden walls", () => {
  const run: V2[] = [[0, 0], [16, 0]];

  it("builds every kind to its height, with posts at the ends and every few feet", () => {
    for (const t of FENCE_TYPES) {
      const parts = fenceParts(run, t, FENCE_HEIGHT[t]);
      assert.ok(parts.length >= 4, t);
      const top = Math.max(...parts.map((p) => p.z1));
      assert.ok(top >= FENCE_HEIGHT[t] && top <= FENCE_HEIGHT[t] + 0.6, `${t} is ${top} ft high`);
    }
    // a wood privacy fence 16 ft long: posts at 0, 8 and 16 ft
    assert.equal(fenceParts(run, "privacy", 6).filter((p) => p.z1 === 6.15).length, 3);
  });

  it("gives a picket fence its pickets, a chain-link fence a see-through mesh and a garden wall its piers", () => {
    const pickets = fenceParts(run, "picket", 3.5).filter((p) => p.z0 === 0.25);
    assert.ok(pickets.length >= 30, `${pickets.length} pickets`);
    assert.ok(new Set(pickets.map((p) => p.z1)).size === 2, "alternating tops");
    assert.ok(fenceParts(run, "chainlink", 4).some((p) => p.glass), "the mesh");
    const wall = fenceParts(run, "masonry", 6);
    assert.ok(wall.some((p) => p.look === "concrete" && p.z0 === 6), "a cap");
    assert.ok(wall.filter((p) => p.z1 === 6.4).length >= 2, "piers");
  });

  it("goes round a closed outline, and draws nothing for a single point", () => {
    const yard: V2[] = [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]];
    assert.ok(fenceParts(yard, "iron", 5).length > fenceParts(run, "iron", 5).length);
    assert.deepEqual(fenceParts([[0, 0]], "privacy", 6), []);
  });
});

describe("site objects in the scene", () => {
  const at = (id: string, kind: DrawnItem["kind"], pts: V2[], p: DrawnItem["p"]): DrawnItem => ({ id, kind, name: id, level: "site", z: 0, pts, p });
  const s = composeScene(
    getScene("cottage"),
    [
      at("POOL", "pool", [[20, 80]], { shape: "oval", l: 30, w: 15, depth: 6, deck: 4, rot: 0 }),
      at("ROAD", "road", [[-40, -42], [70, -42]], { width: 24, curb: true, walks: "both", centre: "double" }),
      at("SIG", "signal", [[60, -26]], { arm: 20, rot: 0 }),
      at("ROCK", "rock", [[40, 50]], { size: 3, count: 2 }),
      { ...at("FENCE", "fence", [[35, 2], [35, 30]], { type: "picket" }), closed: false },
    ],
    {},
  );
  const el = (id: string) => s.elementById[id];

  it("puts each on its layer with its category, so it can be listed, hidden and costed", () => {
    assert.equal(el("POOL")?.category, "Pool");
    assert.equal(el("POOL")?.layer, "landscape");
    assert.equal(el("ROAD")?.category, "Road");
    assert.equal(el("ROAD")?.layer, "civil");
    assert.equal(el("SIG")?.layer, "civil");
    assert.equal(el("ROCK")?.category, "Rock");
    assert.equal(el("FENCE")?.category, "Fence");
    assert.equal(el("FENCE")?.layer, "landscape");
    assert.ok(s.prisms.some((p) => p.id === "POOL" && p.underground), "the pool's shell is below grade");
  });
});
