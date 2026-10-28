/**
 * lib/reports.test.ts
 *
 * WHAT   Unit tests of lib/reports.ts: the ground height from a survey grid and from contour rings, the grading,
 *        material and constructability reports of the sample houses, and clash detection of MEP runs against
 *        structure (hard, soft, clear, and a penetration that needs a sleeve).
 * FOR    `npm test`. Catches a report that stops counting the footings or septic system, and a clash check that
 *        misses a pipe through a wall or flags one a foot away.
 * DEBUG  - A clash test fails by a little: the run's radius comes from its width (width / 3 / 2 ft) in detectClashes.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { constructabilityReport, detectClashes, gradingReport, groundAt, materialReport } from "./reports";
import { getScene } from "./scene";
import type { Run, Scene, SceneElement, V3 } from "./scene/types";
import { COTTAGE, RESIDENCE } from "./mock-data";

describe("the ground", () => {
  it("reads an imported survey grid at the nearest point", () => {
    const s: Scene = { ...getScene("blank"), terrainGrid: { x0: 0, y0: 0, step: 10, nx: 3, ny: 2, z: [1, 2, 3, 4, 5, 6] } };
    assert.equal(groundAt(s, [0, 0]), 1);
    assert.equal(groundAt(s, [19, 2]), 3);
    assert.equal(groundAt(s, [11, 12]), 5);
    assert.equal(groundAt(s, [-50, 99]), 4, "outside the grid it takes the nearest edge");
  });

  it("takes the smallest contour ring around a point, and the lowest contour outside them all", () => {
    const ring = (r: number, z: number) => ({ id: `C${r}`, z, label: String(z), pts: [[-r, -r], [r, -r], [r, r], [-r, r]] as [number, number][] });
    const s: Scene = { ...getScene("blank"), contours: [ring(50, -2), ring(20, -1)] };
    assert.equal(groundAt(s, [0, 0]), -1);
    assert.equal(groundAt(s, [30, 0]), -2);
    assert.equal(groundAt(s, [80, 0]), -2);
  });
});

describe("reports from the model", () => {
  it("grading counts the cut and fill, the footing and septic excavation, and checks the fall on every side", () => {
    for (const kind of ["residence", "cottage"] as const) {
      const lines = gradingReport(getScene(kind));
      assert.match(lines[0], /^Building pad/);
      assert.ok(lines.some((l) => /^Cut \d/.test(l)), kind);
      assert.ok(lines.some((l) => /footings and stem walls [\d.]+ cy · septic tank/.test(l)), `${kind}: ${lines.join(" | ")}`);
      assert.match(lines[lines.length - 1], /^Drainage:/);
    }
  });

  it("material and constructability reports have findings for both houses", () => {
    for (const [kind, project] of [["residence", RESIDENCE], ["cottage", COTTAGE]] as const) {
      const scene = getScene(kind);
      const m = materialReport(scene, project);
      const c = constructabilityReport(scene, project);
      assert.ok(m.length >= 3 && c.length >= 3, `${kind}: ${m.length} material, ${c.length} constructability`);
      assert.ok([...m, ...c].every((l) => l.length > 10 && !/NaN|undefined|Infinity/.test(l)), [...m, ...c].join(" | "));
    }
  });
});

describe("clash detection", () => {
  // a real wall of the sample, moved to a known box, and a slab beside it
  const real = getScene("residence").elements.find((e) => e.category === "Wall")!;
  const wall: SceneElement = { ...real, id: "W-1", name: "Wall W-1", min: [0, 0, 0], max: [10, 0.67, 9] };
  const slab: SceneElement = { ...real, id: "S-1", name: "Slab S-1", category: "Slab", min: [20, 0, 0], max: [30, 10, 0.33] };
  const pipe = getScene("residence").runs.find((r) => r.kind === "plumbing")!;
  const run = (id: string, pts: V3[], width = 1.5): Run => ({ ...pipe, id, pts, width, label: id });
  const sceneWith = (runs: Run[]): Scene => ({ ...getScene("blank"), elements: [wall, slab], elementById: { "W-1": wall, "S-1": slab }, runs });

  it("finds a pipe through a wall (hard), one just touching its face (soft), and passes one a foot away", () => {
    const r = 1.5 / 3 / 2;
    const found = detectClashes(sceneWith([
      run("P-through", [[5, -3, 4], [5, 3, 4]]),
      run("P-near", [[0, -r - 0.1, 4], [10, -r - 0.1, 4]]),
      run("P-clear", [[0, -1 - r, 4], [10, -1 - r, 4]]),
    ]));
    assert.deepEqual(found.map((c) => [c.a.split(" ")[0], c.kind]), [["P-through", "HARD"], ["P-near", "SOFT"]]);
    assert.deepEqual(found[0].elementIds, ["W-1"]);
    assert.match(found[0].fix, /Sleeve the plumbing through Wall W-1/);
  });

  it("calls a vertical run through a slab a penetration that needs a sleeve", () => {
    const [c] = detectClashes(sceneWith([run("P-riser", [[25, 5, -2], [25, 5, 3]])]));
    assert.equal(c.kind, "HARD");
    assert.match(c.fix, /Sleeve the penetration through Slab S-1/);
  });

  it("reports each run against each element once, with ids that exist", () => {
    const s = getScene("residence");
    const found = detectClashes(s);
    const pairs = found.map((c) => `${c.a}|${c.elementIds[0]}`);
    assert.equal(new Set(pairs).size, pairs.length);
    assert.ok(found.every((c) => s.elementById[c.elementIds[0]]));
  });
});
