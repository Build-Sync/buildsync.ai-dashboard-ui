/**
 * lib/room-view.test.ts
 *
 * WHAT   Unit tests of the commands of this round, run through the command registry against a fresh workspace
 *        holding the cottage: the room view (WALKIN by name, NEXTROOM / PREVROOM, LEAVEROOM back to the view
 *        before, 3DWALK walking inside), rooms sorted by building and storey (a cottage with a house linked beside
 *        it, NEXTROOM staying in the building you are in), the quarter turns (ROTATE90 / ROTATE90CCW on the selection, and on the
 *        piece a placing tool puts down next, also by typing R), sizes typed in (withSize: lengths over 0, turns
 *        kept to 0–359°, a solar array's name kept true to its output) and the Furniture Names switch.
 * FOR    `npm test`.
 * DEBUG  - A room view test finds no eye: enterRoom moves the camera at once where there are no animation frames
 *          (here); in the browser it glides there over half a second.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runCommand, type CommandCtx } from "./commands";
import { sceneOf } from "./draw";
import { CEILING_ID, OWN_BUILDING, roomGroups, roomsOfBuilding, withCeilings } from "./draw/interior";
import { sizeOf, withSize } from "./draw/modify";
import { turnPlacing } from "./draw/tools";
import type { DrawnItem } from "./draw/types";
import { COTTAGE } from "./mock-data";
import { createAppStore } from "./store/app-store";
import { createWorkspaceStore } from "./store/workspace-store";
import type { Project } from "./types";
import { DEFAULT_QUERY } from "./workspace-query";

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
} as Storage;

/** A fresh workspace holding the cottage (or another project). */
function setup(project: Project = COTTAGE) {
  const app = createAppStore();
  const ws = createWorkspaceStore({ mode: "demo", project, query: DEFAULT_QUERY }, { toast: (t, tone) => app.getState().toast(t, tone), log: (k, t) => app.getState().log(k, t), setDirty: (id, v) => app.getState().setDirty(id, v) });
  const ctx: CommandCtx = { ws, app, router: { push: () => {}, replace: () => {}, back: () => {} } };
  return { ws, ctx, run: (c: string) => runCommand(ctx, c) };
}
const piece = (id: string, rot = 0): DrawnItem => ({ id, kind: "furniture", name: "Sofa 1", level: "level1", z: 0, pts: [[10, 10]], p: { type: "sofa", w: 7, d: 3, h: 2.8, rot } });

describe("the room view", () => {
  it("WALKIN stands you in a room by its name; LEAVEROOM takes you back to the view before", async () => {
    const { ws, run } = setup();
    ws.getState().setCamera({ bearing: 135 });
    await run("WALKIN bedroom 1");
    const s = ws.getState();
    assert.equal(s.view, "3d");
    assert.ok(s.camera.eye, "an eye in the room");
    assert.equal(s.camera.perspective, true);
    assert.equal(COTTAGE.levels.length > 0, true);
    assert.equal(s.insideRoom, "RM-5");
    assert.equal(s.navTool, "walk");
    await run("LEAVEROOM");
    assert.equal(ws.getState().camera.eye, null);
    assert.equal(ws.getState().camera.bearing, 135, "the view you were in");
    assert.equal(ws.getState().insideRoom, null);
  });

  it("NEXTROOM and PREVROOM go round the rooms of the storey", async () => {
    const { ws, run } = setup();
    await run("WALKIN KITCHEN");
    assert.equal(ws.getState().insideRoom, "RM-2");
    await run("NEXTROOM");
    assert.equal(ws.getState().insideRoom, "RM-3");
    await run("PREVROOM");
    await run("PREVROOM");
    assert.equal(ws.getState().insideRoom, "RM-1");
    await run("PREVROOM");
    assert.equal(ws.getState().insideRoom, "RM-7", "round to the last");
  });

  it("3DWALK walks inside the first room of the storey; a named view steps back out", async () => {
    const { ws, run } = setup();
    await run("3DWALK");
    assert.equal(ws.getState().insideRoom, "RM-1");
    ws.getState().goToNamedView("SW Isometric");
    assert.equal(ws.getState().camera.eye, null);
    assert.equal(ws.getState().insideRoom, null);
  });

  it("says so for a room that does not exist", async () => {
    const { ws, run } = setup();
    await run("WALKIN ballroom");
    assert.equal(ws.getState().insideRoom, null);
  });
});

/** The cottage with the residence linked beside it: a community of two buildings. */
const COMMUNITY: Project = { ...COTTAGE, links: [{ id: "LK1", projectId: "residence-2br-miami", name: "Residence", at: [100, 0], rot: 0 }] };

describe("rooms by building", () => {
  it("sorts every room by building (the project's own first), and inside a building by storey from the ground up", () => {
    const { ws } = setup(COMMUNITY);
    const groups = roomGroups(sceneOf(ws.getState()), COMMUNITY.name);
    assert.deepEqual(groups.map((g) => g.building.id), [OWN_BUILDING, "LK1"]);
    assert.equal(groups[0].building.name, COMMUNITY.name);
    assert.equal(groups[1].building.name, "Residence_2BR_Miami", "a linked house is named after its project");
    assert.deepEqual(groups[0].levels.map((l) => l.level), ["level1"]);
    assert.deepEqual(groups[1].levels.map((l) => l.level), ["level1", "level2"]);
    assert.ok(groups[1].levels[1].rooms.some((r) => r.name === "STUDY"));
    // nothing is listed twice or left out
    assert.equal(groups.flatMap((g) => g.levels.flatMap((l) => l.rooms)).length, sceneOf(ws.getState()).rooms.length);
  });

  it("is one group for a project with one building", () => {
    const { ws } = setup();
    const groups = roomGroups(sceneOf(ws.getState()), "My House");
    assert.equal(groups.length, 1);
    assert.equal(groups[0].building.name, "My House");
  });

  it("NEXTROOM goes through the building you are in, storey by storey, and never into the next house", async () => {
    const { ws, run } = setup(COMMUNITY);
    await run("WALKIN Residence_2BR_Miami STAIR HALL");
    assert.equal(ws.getState().insideRoom, "LK1:RM-5", "named by building and room");
    await run("NEXTROOM");
    assert.equal(ws.getState().insideRoom, "LK1:RM-6", "up to the first room of the next storey");
    assert.equal(ws.getState().plan.level, "level2");
    const rooms = roomsOfBuilding(sceneOf(ws.getState()), sceneOf(ws.getState()).rooms.find((r) => r.id === "LK1:RM-6")!);
    assert.ok(rooms.every((r) => r.building?.id === "LK1"));
    // on to the last room of the building (never a room of the cottage)
    for (let i = rooms.findIndex((r) => r.id === "LK1:RM-6"); i < rooms.length - 1; i++) await run("NEXTROOM");
    assert.equal(ws.getState().insideRoom, rooms[rooms.length - 1].id);
    await run("NEXTROOM");
    assert.equal(ws.getState().insideRoom, rooms[0].id, "round to the first room of the same building");
    await run("PREVROOM");
    assert.equal(ws.getState().insideRoom, rooms[rooms.length - 1].id);
  });

  it("puts a ceiling over the rooms of each building", () => {
    const { ws } = setup(COMMUNITY);
    const withC = withCeilings(sceneOf(ws.getState()), "level1");
    const ids = withC.prisms.filter((p) => p.id.startsWith(CEILING_ID)).map((p) => p.id);
    assert.ok(ids.some((id) => id === `${CEILING_ID}RM-5`), "a room of the cottage");
    assert.ok(ids.some((id) => id.startsWith(`${CEILING_ID}LK1:`)), "a room of the linked house");
  });
});

describe("quarter turns", () => {
  it("turn the selection about its centre, either way", async () => {
    const { ws, run } = setup();
    ws.getState().patch({ drawn: [piece("F-T")] });
    ws.getState().select(["F-T"]);
    await run("ROTATE90");
    const after = ws.getState().drawn.find((i) => i.id === "F-T")!;
    assert.equal(((Number(after.p.rot) % 360) + 360) % 360, 270, "clockwise");
    assert.deepEqual(after.pts[0].map((v) => Math.round(v * 1000) / 1000), [10, 10], "about its own centre");
    await run("ROTATE90CCW");
    await run("ROTATE90CCW");
    assert.equal(((Number(ws.getState().drawn.find((i) => i.id === "F-T")!.p.rot) % 360) + 360) % 360, 90);
  });

  it("turn the piece a placing tool puts down next (the shortcut, or typing R)", async () => {
    const { ws, run } = setup();
    await run("FURN");
    await run("ROTATE90CCW");
    assert.equal(ws.getState().toolOpts.FURN?.rot, 90);
    assert.equal(turnPlacing(ws.getState(), "POOL", 90), 90, "a pool turns as well");
    assert.equal(turnPlacing(ws.getState(), "LINE", 90), null, "a line has nothing to turn");
  });
});

describe("sizes typed in", () => {
  it("keep lengths above zero and turns within 0–359°", () => {
    const it0 = piece("F-1");
    assert.equal(withSize(it0, "w", 0), null);
    assert.equal(withSize(it0, "w", 8)!.p.w, 8);
    assert.equal(withSize(it0, "rot", -90)!.p.rot, 270);
    assert.equal(withSize(it0, "rot", 0)!.p.rot, 0, "a turn may be 0");
  });

  it("keep a solar array's name true to its output, and read the sizes an older one never stored", () => {
    const pv: DrawnItem = { id: "PV", kind: "solar", name: "Solar Array 1 (4.8 kW)", level: "site", z: 0, pts: [[0, 0]], p: { rows: 2, cols: 6 } };
    assert.equal(sizeOf(pv, "pw"), 3.4);
    assert.equal(sizeOf(pv, "watts"), 400);
    const more = withSize(pv, "cols", 10)!;
    assert.equal(more.name, "Solar Array 1 (8.0 kW)");
    assert.equal(withSize(more, "watts", 450)!.name, "Solar Array 1 (9.0 kW)");
  });

  it("the Furniture Names switch flips", async () => {
    const { ws, run } = setup();
    assert.equal(ws.getState().furnLabels, false);
    await run("FURNLABELS");
    assert.equal(ws.getState().furnLabels, true);
  });
});
