/**
 * lib/links.test.ts
 *
 * WHAT   Unit tests of lib/links.ts: a linked project drawn in at its place and turn with every id prefixed, a save of
 *        the other project showing up in the link (and not in a merged copy), the side-by-side placement of a
 *        community on one parcel, and the link / merge / community ids.
 * FOR    `npm test`. Catches a linked house that lands in the wrong place, a link that stops updating, or a merge that
 *        keeps changing after it was frozen.
 * DEBUG  - "LK1:… is missing": blockOf filtered the element (terrain or hidden) or the prefix changed.
 *        - The live test fails: sourceWork no longer reads the saved record (lib/persist.ts readStored).
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

import { baseWithMerged, isLinkedId, linkableProjects, linkOf, mergeOf, nextBlockId, nextCommunityId, parcelAround, sideBySide, withLinks, type ProjectLink } from "./links";
import { writeStored } from "./persist";
import { getScene } from "./scene";
import type { DrawnItem, SavedWork } from "./draw/types";
import { COTTAGE } from "./mock-data";

const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const COT = COTTAGE.id;
const RES = "residence-2br-miami";

/** Save work for a project as the app's Save would. */
function save(projectId: string, drawn: DrawnItem[], hidden: string[] = []) {
  const work: SavedWork = { v: 1, projectId, at: 1, drawn, xf: {}, hidden, locked: [], isolated: null, renames: {}, materialOverrides: {}, colors: {}, elColors: {}, types: {}, groups: {}, project: {} };
  assert.ok(writeStored("demo", projectId, { work, versions: [], dirty: false, savedAt: 1 }));
}
const shed: DrawnItem = { id: "D-1", kind: "wall", name: "Shed wall", level: "level1", z: 0, pts: [[0, -20], [10, -20]], p: { thick: 0.5, height: 8 } };

beforeEach(() => mem.clear());

describe("ids", () => {
  it("tells linked elements apart and finds their link", () => {
    assert.equal(isLinkedId("LK2:W-1"), true);
    assert.equal(isLinkedId("MG1:W-1"), false);
    assert.equal(linkOf("LK12:W-1"), "LK12");
    assert.equal(linkOf("W-1"), null);
  });

  it("takes the first free link or merge number", () => {
    assert.equal(nextBlockId("LK", []), "LK1");
    assert.equal(nextBlockId("LK", [{ id: "LK1" }, { id: "LK3" }]), "LK2");
    assert.equal(nextBlockId("MG", [{ id: "LK1" }, { id: "MG1" }]), "MG2");
  });

  it("numbers a new community past open tabs and saved ones", () => {
    assert.equal(nextCommunityId("demo", []), "community-1");
    save("community-2", []);
    assert.equal(nextCommunityId("demo", ["community-1"]), "community-3");
  });
});

describe("a linked project", () => {
  const base = getScene("residence");
  const cottage = getScene("cottage");
  const link = (rot: 0 | 180): ProjectLink => ({ id: "LK1", projectId: COT, name: "Cottage", at: [200, 10], rot });
  const sample = cottage.elements.find((e) => e.category === "Wall")!;

  it("is drawn in at its place with every id prefixed, and the ground widened to hold it", () => {
    const s = withLinks(base, [link(0)], "demo");
    const el = s.elementById[`LK1:${sample.id}`];
    assert.ok(el, `LK1:${sample.id} is missing`);
    near(el.min[0], sample.min[0] + 200);
    near(el.min[1], sample.min[1] + 10);
    near(el.max[2], sample.max[2]);
    assert.ok(s.elements.length > base.elements.length);
    assert.equal(s.elements.filter((e) => e.id.startsWith("LK1:")).every((e) => isLinkedId(e.id)), true);
    const ground = s.prisms.find((p) => p.terrain && p.axis === "z")!;
    assert.ok(Math.max(...ground.poly.map((q) => q[0])) >= el.max[0] + 25);
    assert.equal(s.lots?.[0].id, "LK1");
    assert.equal(s.lots?.[0].linked, true);
  });

  it("can be turned 180° about its origin", () => {
    const el = withLinks(base, [link(180)], "demo").elementById[`LK1:${sample.id}`];
    near(el.min[0], 200 - sample.max[0]);
    near(el.max[1], 10 - sample.min[1]);
  });

  it("shows the other project's work as last saved, and leaves out what it hid", () => {
    assert.equal(withLinks(base, [link(0)], "demo").elementById["LK1:D-1"], undefined);
    save(COT, [shed], [sample.id]);
    const s = withLinks(base, [link(0)], "demo");
    const w = s.elementById["LK1:D-1"];
    assert.ok(w, "the saved wall is not in the link");
    near(w.min[0], 200);
    assert.equal(s.elementById[`LK1:${sample.id}`], undefined);
  });

  it("does not change once merged, even when the other project is saved again", () => {
    save(COT, [shed]);
    const m = mergeOf("demo", link(0), "MG1")!;
    save(COT, [shed, { ...shed, id: "D-2", pts: [[0, -30], [10, -30]] }]);
    const merged = [m];
    const s = baseWithMerged(base, merged);
    assert.ok(s.elementById["MG1:D-1"]);
    assert.equal(s.elementById["MG1:D-2"], undefined);
    assert.equal(baseWithMerged(base, merged), s, "the same merge list should give the same scene");
    assert.equal(s.lots?.[0].linked, false);
  });

  it("lists the samples and saved projects to link, never itself or a community", () => {
    save("untitled-4", []);
    save("community-1", []);
    const ids = linkableProjects("demo", RES).map((p) => p.id);
    assert.ok(ids.includes(COT) && ids.includes("untitled-4"));
    assert.ok(!ids.includes(RES) && !ids.includes("community-1"));
  });
});

describe("a community on one parcel", () => {
  const blank = getScene("blank");
  const lotsOf = (placed: ReturnType<typeof sideBySide>) =>
    withLinks(blank, placed.map((p, i) => ({ id: `LK${i + 1}`, projectId: p.projectId, name: p.projectId, at: p.at, rot: p.rot })), "demo").lots!;
  const box = (pts: [number, number][]) => ({ x0: Math.min(...pts.map((q) => q[0])), x1: Math.max(...pts.map((q) => q[0])), y0: Math.min(...pts.map((q) => q[1])), y1: Math.max(...pts.map((q) => q[1])) });

  it("sets the lots side by side with the gap between them, fronts in line", () => {
    const placed = sideBySide("demo", [RES, COT], 20, false);
    const [a, b] = lotsOf(placed).map((l) => box(l.pts));
    near(a.x0, 0);
    near(b.x0 - a.x1, 20);
    near(a.y0, b.y0);
  });

  it("turns every second house to face the first across a 40 ft street", () => {
    const placed = sideBySide("demo", [RES, COT], 20, true);
    assert.deepEqual(placed.map((p) => p.rot), [0, 180]);
    const [a, b] = lotsOf(placed).map((l) => box(l.pts));
    near(a.y0 - b.y1, 40);
  });

  it("draws the parcel around every lot and frames the camera on the houses", () => {
    const placed = sideBySide("demo", [RES, COT], 20, true);
    const lots = lotsOf(placed).map((l) => box(l.pts));
    const p = box(parcelAround("demo", placed));
    near(p.x0, Math.min(...lots.map((l) => l.x0)));
    near(p.x1, Math.max(...lots.map((l) => l.x1)));
    near(p.y0, Math.min(...lots.map((l) => l.y0)));
    near(p.y1, Math.max(...lots.map((l) => l.y1)));
    const s = withLinks(blank, placed.map((q, i) => ({ id: `LK${i + 1}`, projectId: q.projectId, name: q.projectId, at: q.at, rot: q.rot })), "demo");
    assert.notDeepEqual(s.footprint, blank.footprint);
  });
});
