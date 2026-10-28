/**
 * lib/draw/compose.test.ts
 *
 * WHAT   Unit tests of composeScene and the room finder: walls with door and window openings carved out, slabs,
 *        stairs built from steps, columns, runs and devices, joists on a wall, trusses under a roof, moves of
 *        built-in elements (and the y-extruded pieces that only follow axis-aligned changes), clones, flat 2D marks
 *        and the room found inside four walls.
 * FOR    `npm test`.
 * DEBUG  - A count is off by one: new pieces of a carved wall get keys `${id}#u${n}`; filter prisms by `id`.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getScene } from "../scene";
import { prismBounds } from "../scene/builder";
import { canTransform, composeScene, frameOfElement, wallFrameOf } from "./compose";
import { enclosureAt } from "./enclose";
import { affRotate, affTranslate, polyArea, rectPts } from "./geom";
import type { DrawnItem } from "./types";

let n = 0;
const item = (kind: DrawnItem["kind"], pts: DrawnItem["pts"], p: DrawnItem["p"] = {}, extra: Partial<DrawnItem> = {}): DrawnItem => ({ id: `T-${++n}`, kind, name: `${kind} ${n}`, level: "level1", z: 0, pts, p, ...extra });
const blank = () => getScene("blank");
const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

describe("composeScene", () => {
  it("returns the base scene itself when there is nothing to add", () => {
    const base = blank();
    assert.equal(composeScene(base, [], {}), base);
  });

  it("makes a wall from two points with its thickness and height", () => {
    const w = item("wall", [[0, 0], [10, 0]], { thick: 0.67, height: 10 });
    const s = composeScene(blank(), [w], {});
    const el = s.elementById[w.id];
    assert.equal(el.category, "Wall");
    near(el.max[0] - el.min[0], 10);
    near(el.max[1] - el.min[1], 0.67);
    near(el.max[2] - el.min[2], 10);
  });

  it("cuts a door out of the wall it is hosted on and adds the leaf and the swing", () => {
    const w = item("wall", [[0, 0], [10, 0]], { thick: 0.67, height: 10 });
    const d = item("door", [[5, 0]], { host: w.id, at: 3.5, w: 3, sill: 0, head: 6.67 });
    const s = composeScene(blank(), [w, d], {});
    const pieces = s.prisms.filter((p) => p.id === w.id);
    assert.ok(pieces.length >= 3, `wall is split around the door (${pieces.length} pieces)`);
    const f = wallFrameOf(pieces)!;
    near(f.len, 10, 1e-6);
    // nothing of the wall is left in the doorway below the head
    const inDoorway = pieces.filter((p) => {
      const b = prismBounds(p);
      return b.min[0] < 6.4 && b.max[0] > 3.6 && b.min[2] < 6;
    });
    assert.equal(inDoorway.length, 0, "the doorway is empty");
    assert.ok(s.prisms.some((p) => p.id === d.id), "door leaf");
    assert.equal(s.swings.length, 1, "door swing arc on the plan");
    assert.equal(s.elementById[d.id].category, "Door");
  });

  it("cuts a window with a sill: wall remains below and above it", () => {
    const w = item("wall", [[0, 0], [10, 0]], { height: 10 });
    const o = item("window", [[5, 0]], { host: w.id, at: 4, w: 3, sill: 3, head: 7 });
    const s = composeScene(blank(), [w, o], {});
    const pieces = s.prisms.filter((p) => p.id === w.id).map(prismBounds);
    assert.ok(pieces.some((b) => b.max[2] <= 3.0001 && b.min[0] < 5.5 && b.max[0] > 5.5), "wall below the sill");
    assert.ok(pieces.some((b) => b.min[2] >= 6.9999 && b.min[0] < 5.5 && b.max[0] > 5.5), "wall above the head");
  });

  it("makes slabs, roofs, columns, beams with the heights of their level", () => {
    const slab = item("slab", rectPts([0, 0], [10, 8]), { thick: 0.5 }, { closed: true });
    const col = item("column", [[2, 2]], { size: 1 });
    const beam = item("beam", [[0, 0], [10, 0]], { width: 0.67, depth: 1 });
    const s = composeScene(blank(), [slab, col, beam], {});
    near(s.elementById[slab.id].max[2], 0);
    near(s.elementById[slab.id].min[2], -0.5);
    near(s.elementById[col.id].max[2], 10); // the blank scene's storey is 10 ft
    near(s.elementById[beam.id].max[2], 10);
    near(s.elementById[beam.id].min[2], 9);
  });

  it("builds a stair from steps that rise one storey", () => {
    const st = item("stair", [[0, 0], [0, 12]], { width: 3.5, rise: 10 });
    const s = composeScene(blank(), [st], {});
    const steps = s.prisms.filter((p) => p.id === st.id);
    assert.ok(steps.length >= 14 && steps.length <= 24, `${steps.length} steps`);
    near(Math.max(...steps.map((p) => p.a1)), 10, 1e-6);
  });

  it("makes runs and devices that can be picked, on layers that follow their system", () => {
    const duct = item("duct", [[0, 0], [10, 0], [10, 5]], { h: 8.8 });
    const dev = item("device", [[3, 3]], { rk: "plumbing", shape: "valve", h: 1.5 });
    const s = composeScene(blank(), [duct, dev], {});
    const run = s.runs.find((r) => r.id === duct.id)!;
    assert.equal(run.kind, "hvac");
    assert.equal(run.pick, true);
    assert.equal(run.pts[0][2], 8.8);
    const d = s.devices.find((x) => x.id === dev.id)!;
    assert.equal(d.layer, "plumbing");
    assert.equal(s.elementById[dev.id].category, "Device");
  });

  it("lays studs on a wall and trusses under a roof, drawn only in section / x-ray", () => {
    const w = item("wall", [[0, 0], [12, 0]], { height: 10 });
    const fr = item("framing", [], { host: w.id, spacing: 1.333 });
    const roof = item("roof", rectPts([0, 0], [12, 10]), { thick: 0.5 }, { closed: true, level: "roof", z: 10 });
    const tr = item("truss", [], { host: roof.id, spacing: 2 }, { level: "roof" });
    const s = composeScene(blank(), [w, fr, roof, tr], {});
    const studs = s.prisms.filter((p) => p.id === fr.id);
    assert.ok(studs.length >= 8, `${studs.length} studs`);
    assert.ok(studs.every((p) => p.sectionOnly));
    const trusses = s.prisms.filter((p) => p.id === tr.id);
    assert.ok(trusses.length === 15 && trusses.every((p) => p.axis === "y" && p.sectionOnly));
  });

  it("lists flat 2D marks as drafts with a selection box, not as prisms", () => {
    const line = item("line", [[0, 0], [4, 3]]);
    const circle = item("circle", [[10, 10], [12, 10]]);
    const s = composeScene(blank(), [line, circle], {});
    assert.equal(s.drafts?.length, 2);
    assert.equal(s.prisms.filter((p) => p.id === line.id).length, 0);
    near(s.elementById[circle.id].max[0], 12, 0.05);
    assert.equal(s.elementById[line.id].layer, "drafting");
  });
});

describe("built-in elements", () => {
  it("moves and rotates a built-in wall; a clone keeps the original in place", () => {
    const base = getScene("residence");
    const before = base.elementById["W-L1-W"];
    const moved = composeScene(base, [], { "W-L1-W": { aff: affTranslate(-10, 0), dz: 0 } });
    near(moved.elementById["W-L1-W"].min[0], before.min[0] - 10);
    const rotated = composeScene(base, [], { "W-L1-W": { aff: affRotate(Math.PI / 2, 0, 0), dz: 0 } });
    assert.ok(Math.abs(rotated.elementById["W-L1-W"].max[0] - rotated.elementById["W-L1-W"].min[0]) > 20, "a 32 ft wall turned 90° is now wide in X");
    const clone = item("clone", [], { sz: 1, zc: 0 }, { src: "W-L1-W", aff: affTranslate(30, 0), dz: 0 });
    const s = composeScene(base, [clone], {});
    near(s.elementById["W-L1-W"].min[0], before.min[0]);
    near(s.elementById[clone.id].min[0], before.min[0] + 30);
  });

  it("refuses a free rotation of gable and roof pieces but allows moves and quarter... of nothing else", () => {
    const base = getScene("residence");
    const gable = base.prisms.find((p) => p.axis === "y");
    assert.ok(gable, "the residence has y-extruded pieces");
    assert.equal(canTransform(base, gable!.id, affRotate(0.3)), false);
    assert.equal(canTransform(base, gable!.id, affTranslate(5, 5)), true);
    assert.equal(canTransform(base, "W-L1-W", affRotate(0.3)), true);
  });

  it("cuts a door into a built-in wall too", () => {
    const base = getScene("residence");
    const f = frameOfElement(base, "W-L1-N")!;
    assert.ok(f && f.len > 20);
    const d = item("door", [[10, 31]], { host: "W-L1-N", at: 12, w: 3, sill: 0, head: 6.67 });
    const s = composeScene(base, [d], {});
    assert.ok(s.prisms.filter((p) => p.id === "W-L1-N").length >= base.prisms.filter((p) => p.id === "W-L1-N").length);
    assert.ok(s.prisms.some((p) => p.id === d.id));
  });
});

describe("enclosureAt", () => {
  it("finds the room inside four drawn walls and refuses a click outside them", () => {
    const walls = [
      item("wall", [[0, 0], [12, 0]], { thick: 0.67, height: 10 }),
      item("wall", [[12, 0], [12, 10]], { thick: 0.67, height: 10 }),
      item("wall", [[12, 10], [0, 10]], { thick: 0.67, height: 10 }),
      item("wall", [[0, 10], [0, 0]], { thick: 0.67, height: 10 }),
    ];
    const s = composeScene(blank(), walls, {});
    const room = enclosureAt(s, "level1", [6, 5], null);
    assert.ok(room, "a room");
    const a = Math.abs(polyArea(room!));
    assert.ok(a > 85 && a < 112, `about 11.3 x 9.3 ft (${a.toFixed(1)} sf)`);
    assert.equal(enclosureAt(s, "level1", [30, 30], null), null, "outside is not enclosed");
  });

  it("uses a closed shape the user drew", () => {
    const r = item("rect", rectPts([0, 0], [4, 4]), {}, { closed: true });
    const s = composeScene(blank(), [r], {});
    assert.equal(enclosureAt(s, "level1", [2, 2], null)?.length, 4);
    assert.equal(enclosureAt(s, "level1", [2, 2], r.id)?.length, 4);
  });
});

/* ── moving with the mouse: connected things adjust ───────────────────── */
import { applyChange } from "./change";
import { planGrip, planMove } from "./modify";
import { renderScene } from "../scene/render";
import { makeProjector } from "../scene/camera";
import { DEFAULT_APPEARANCE } from "../scene/types";
import type { WsState } from "../store/workspace-store";

/** A workspace state with just what the move planner reads. */
const wsOf = (drawn: DrawnItem[], xf: WsState["xf"] = {}) => ({ drawn, xf, locked: [], hidden: [], selection: [], groups: {}, project: { layers: [] } }) as unknown as WsState;
const loop = () => [
  item("wall", [[0, 0], [12, 0]], { thick: 0.67, height: 10 }),
  item("wall", [[12, 0], [12, 10]], { thick: 0.67, height: 10 }),
  item("wall", [[12, 10], [0, 10]], { thick: 0.67, height: 10 }),
  item("wall", [[0, 10], [0, 0]], { thick: 0.67, height: 10 }),
];

describe("planMove and planGrip", () => {
  it("moving a wall drags the ends of the walls joined to it, and their doors stay where they were", () => {
    const walls = loop();
    const door = item("door", [[4, 0]], { host: walls[0].id, at: 2.5, w: 3, sill: 0, head: 6.67 });
    const s = wsOf([...walls, door]);
    const scene = composeScene(blank(), s.drawn, {});
    const r = planMove(s, scene, [walls[1].id], [3, 0]);
    const next = { ...s, ...applyChange(s, r.change) } as WsState;
    const byId = Object.fromEntries(next.drawn.map((i) => [i.id, i]));
    assert.deepEqual(byId[walls[1].id].pts, [[15, 0], [15, 10]], "the east wall moved");
    assert.deepEqual(byId[walls[0].id].pts, [[0, 0], [15, 0]], "the south wall stretched");
    assert.deepEqual(byId[walls[2].id].pts, [[15, 10], [0, 10]], "the north wall stretched");
    assert.deepEqual(byId[walls[3].id].pts, [[0, 10], [0, 0]], "the west wall stayed");
    near(byId[door.id].p.at as number, 2.5, 1e-9);
  });

  it("dragging a grip moves one point and what is joined there", () => {
    const walls = loop();
    const s = wsOf(walls);
    const scene = composeScene(blank(), walls, {});
    const ch = planGrip(s, scene, walls[2].id, 1, [0, 14])!;
    const next = { ...s, ...applyChange(s, ch) } as WsState;
    const byId = Object.fromEntries(next.drawn.map((i) => [i.id, i]));
    assert.deepEqual(byId[walls[2].id].pts, [[12, 10], [0, 14]]);
    assert.deepEqual(byId[walls[3].id].pts, [[0, 14], [0, 0]], "the joined west wall followed");
  });

  it("a room made from a click re-finds its walls after a move", () => {
    const walls = loop();
    const room = item("room", rectPts([0, 0], [12, 10]), { sx: 6, sy: 5 }, { closed: true });
    const s = wsOf([...walls, room]);
    const before = composeScene(blank(), s.drawn, {});
    const a0 = Math.abs(polyArea(before.items![room.id].pts));
    const r = planMove(s, before, [walls[1].id], [4, 0]);
    const next = { ...s, ...applyChange(s, r.change) } as WsState;
    const after = composeScene(blank(), next.drawn, {});
    const a1 = Math.abs(polyArea(after.items![room.id].pts));
    assert.ok(a1 > a0 + 30, `the room grew with the wall (${a0.toFixed(1)} → ${a1.toFixed(1)} sf)`);
  });

  it("moving a built-in wall carries its windows and stretches the walls, slab and footings joined to it", () => {
    const base = getScene("residence");
    const s = wsOf([]);
    const r = planMove(s, base, ["W-L1-E"], [3, 0]);
    const xf = r.change.xf as WsState["xf"];
    assert.ok(xf["W-L1-E"], "the wall moved");
    assert.ok(xf["W-L1-S"]?.win && xf["W-L1-N"]?.win && xf["SL-L1"]?.win, "south and north walls and the slab stretch");
    const windows = base.elements.filter((e) => e.category === "Window" && e.min[0] > 23 && e.level === "level1").map((e) => e.id);
    assert.ok(windows.length > 0 && windows.every((id) => xf[id] && !xf[id].win), "the east windows move with the wall");
    const after = composeScene(base, [], xf);
    near(after.elementById["SL-L1"].max[0], base.elementById["SL-L1"].max[0] + 3, 1e-6);
    near(after.elementById["W-L1-S"].max[0], base.elementById["W-L1-S"].max[0] + 3, 1e-6);
    near(after.elementById["W-L1-W"].min[0], base.elementById["W-L1-W"].min[0], 1e-9);
  });

  it("a built-in window slides along its wall, which is re-cut around it", () => {
    const base = getScene("residence");
    const win = base.elements.find((e) => e.category === "Window" && e.level === "level1" && e.max[1] < 1)!;
    assert.ok(win, "a window in the south wall");
    const r = planMove(wsOf([]), base, [win.id], [2, 5]); // the y part is across the wall and is dropped
    const x = (r.change.xf as WsState["xf"])[win.id];
    assert.ok(x?.slide, "slid, not moved freely");
    const after = composeScene(base, [], { [win.id]: x });
    near(after.elementById[win.id].min[0], win.min[0] + 2, 1e-6);
    near(after.elementById[win.id].min[1], win.min[1], 1e-9);
  });
});

describe("cuts in four directions", () => {
  it("an east-west cut keeps the chosen side only", () => {
    const scene = getScene("residence");
    const proj = makeProjector({ bearing: 270, pitch: 0, zoom: 1, panX: 0, panY: 0, perspective: false }, { w: 800, h: 600 }, scene.center, scene.radius);
    const render = (keep: 1 | -1) =>
      renderScene({ scene, proj, style: "shaded", plan: null, sectionY: null, cut: { axis: 0, at: 12, keep }, colors: DEFAULT_APPEARANCE, layers: {}, hidden: new Set(), isolated: null, phaseState: null, shadows: false, edges: true, tint: {}, dimOthers: false, sun: [0.3, -0.5, 0.8], ghostMep: false }).svg;
    const east = render(1);
    const west = render(-1);
    assert.ok(east.includes('data-el="W-L1-E"') && !east.includes('data-el="W-L1-W"'), "keeping the east half drops the west wall");
    assert.ok(west.includes('data-el="W-L1-W"') && !west.includes('data-el="W-L1-E"'), "keeping the west half drops the east wall");
  });
});
