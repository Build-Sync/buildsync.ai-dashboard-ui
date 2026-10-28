/**
 * lib/views.test.ts
 *
 * WHAT   Unit tests of the drawing list (views.ts): which storeys a project has plans for, which levels the plan
 *        underlay draws, the groups and rows of the Views browser and which row is on screen, and that an
 *        existing elevation sheet is found instead of a new one being made.
 * FOR    `npm test`.
 * DEBUG  - A row is missing: viewList only lists the storeys in project.levels and the sheets that exist.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLINIC, RESIDENCE } from "./mock-data";
import type { Sheet } from "./store/workspace-store";
import { findSheet, nextSheetId, planLevels, underlayLevels, viewList } from "./views";

const ALL = ["roof", "level2", "level1", "foundation", "site"];

describe("plans and the underlay", () => {
  it("lists the storeys each project has, with a foundation plan when it has footings", () => {
    assert.deepEqual(planLevels({ project: RESIDENCE }), ["foundation", "level1", "level2", "roof"]);
    assert.deepEqual(planLevels({ project: CLINIC }), ["foundation", "level1", "roof"]);
  });
  it("draws the level below, or above from the ground floor, or every other storey", () => {
    assert.deepEqual(underlayLevels("level2", "below", ALL), ["level1"]);
    assert.deepEqual(underlayLevels("level1", "below", ALL), ["level2"]);
    assert.deepEqual(underlayLevels("level1", "all", ALL), ["level2", "roof"]);
    assert.deepEqual(underlayLevels("level2", "level", ALL), []);
    assert.deepEqual(underlayLevels("level1", "below", ["roof", "level1", "site"]), ["roof"]);
  });
});

describe("the Views browser", () => {
  const sheets: Sheet[] = [
    { id: "A-101", name: "A-101 Floor Plan", kind: "plan" },
    { id: "EL-1", name: "EL-1 North Elevation", kind: "elevation", view: { dir: "N", title: "NORTH ELEVATION" }, user: true },
    { id: "SC-1", name: "SC-1 Section A–A", kind: "section", view: { dir: "S", cut: { axis: 1, at: 10, keep: 1 }, title: "SECTION A–A" }, user: true },
  ];
  const groups = viewList({ project: RESIDENCE, sheets, layoutTab: "model", view: "2d", plan: { rotation: 0, zoom: 1, panX: 0, panY: 0, level: "level2" } });
  const group = (id: string) => groups.find((g) => g.id === id)!;
  it("groups plans, site, elevations, sections, 3D views and sheets", () => {
    assert.deepEqual(groups.map((g) => g.id), ["plans", "site", "elevations", "sections", "3d", "sheets"]);
    assert.deepEqual(group("plans").rows.map((r) => r.label), ["Foundation Plan", "Level 1", "Level 2", "Roof", "All Levels (side by side)"]);
    assert.deepEqual(group("site").rows.map((r) => r.label), ["Site Plan", "Topography"]);
    assert.equal(group("sections").rows.length, 1);
    assert.equal(group("sheets").rows.length, 3);
  });
  it("marks the plan on screen and links the views that already have a sheet", () => {
    assert.equal(group("plans").rows.find((r) => r.active)?.label, "Level 2");
    assert.equal(group("elevations").rows[0].sheet, "EL-1");
    assert.equal(group("elevations").rows[1].sheet, undefined);
  });
  it("finds an existing sheet and names the next free one", () => {
    assert.equal(findSheet(sheets, { kind: "elevation", dir: "N" })?.id, "EL-1");
    assert.equal(findSheet(sheets, { kind: "elevation", dir: "S" }), undefined);
    assert.equal(nextSheetId(sheets, "EL"), "EL-2");
    assert.equal(nextSheetId(sheets, "TP"), "TP-1");
  });
});
