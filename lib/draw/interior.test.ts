/**
 * lib/draw/interior.test.ts
 *
 * WHAT   Unit tests of standing inside the model (the room view): the eye camera (projection straight ahead,
 *        what is behind the eye, clicks read back onto the floor, faces and lines cut at the eye, looking around
 *        and stepping), where roomView stands in each room of the cottage, the ceilings drawn over its rooms, and
 *        a render from inside a room (its walls and ceiling drawn, no point of the drawing broken).
 * FOR    `npm test`.
 * DEBUG  - A roomView test fails after the cottage changed: the rooms' outlines come from its walls (enclosureAt);
 *          an open doorway with no door leaf joins two rooms into one outline.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getScene } from "../scene";
import { EYE_HEIGHT, clipNear, clipNearLine, look, makeProjector, stepEye, type Camera } from "../scene/camera";
import { renderScene } from "../scene/render";
import { DEFAULT_APPEARANCE, type V3 } from "../scene/types";
import { pointInPoly } from "./geom";
import { CEILING_ID, roomAt, roomOutline, roomView, roomsOn, withCeilings } from "./interior";

const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const VP = { w: 800, h: 400 };
/** Standing at the origin, 5 ft up, looking north (a bearing of 180: the camera is south of where it looks). */
const NORTH: Camera = { bearing: 180, pitch: 0, zoom: 1, panX: 0, panY: 0, perspective: true, eye: [0, 0, 5], fov: 90 };
const proj = makeProjector(NORTH, VP, [0, 0, 0], 10);

describe("the eye camera", () => {
  it("puts what is straight ahead in the middle, smaller further away", () => {
    const p = proj.project([0, 10, 5]);
    near(p.x, 400);
    near(p.y, 200);
    near(p.depth, 10);
    assert.ok(proj.project([1, 10, 5]).x > 400, "east is on the right");
    assert.ok(proj.scaleAt([0, 20, 5]) < proj.scaleAt([0, 10, 5]));
    assert.ok(proj.project([0, -3, 5]).depth < proj.near, "behind the eye");
  });

  it("reads a click back onto the floor in front, never behind", () => {
    const q = proj.unproject(400, 300, 0)!;
    near(q[0], 0, 1e-6);
    assert.ok(q[1] > 0, "in front");
    assert.equal(proj.unproject(400, 100, 0), null, "above the horizon the ray never meets the floor");
  });

  it("cuts faces and lines where they reach behind the eye", () => {
    const wall: V3[] = [[-5, -5, 0], [-5, 5, 0], [-5, 5, 8], [-5, -5, 8]];
    const front = clipNear(wall, proj);
    assert.ok(front.length >= 3 && front.every((q) => proj.project(q).depth >= proj.near - 1e-9));
    const pieces = clipNearLine([[-5, 5, 5], [0, -5, 5], [5, 5, 5]], proj);
    assert.equal(pieces.length, 2, "a line passing behind comes out in two pieces");
    // an orbit camera keeps everything
    const orbit = makeProjector({ ...NORTH, eye: null }, VP, [0, 0, 0], 10);
    assert.equal(clipNear(wall, orbit), wall);
  });

  it("looks the way the hand drags (Street View) and steps where it looks", () => {
    const right = look(NORTH, 100, 0);
    assert.ok(right.bearing < NORTH.bearing, "a drag to the right turns the view to the left");
    assert.ok(look(NORTH, 0, 100).pitch < 0, "a drag down looks up");
    const on = stepEye(NORTH, 2, 0);
    near(on.eye![1], 2);
    near(on.eye![0], 0);
    near(stepEye(NORTH, 0, 2).eye![0], 2, 1e-9);
  });
});

describe("standing in the cottage's rooms", () => {
  const scene = getScene("cottage");

  it("stands at eye height inside each room, looking towards its name", () => {
    for (const r of scene.rooms) {
      const v = roomView(scene, r);
      near(v.eye![2], (scene.levelZ[r.level] ?? 0) + EYE_HEIGHT);
      const poly = roomOutline(scene, r);
      if (poly) assert.ok(pointInPoly([v.eye![0], v.eye![1]], poly), `${r.name}: the eye is in the room`);
      // looking towards the name: the name is in front of the eye
      const p = makeProjector({ ...NORTH, ...v }, VP, scene.center, scene.radius).project([r.at[0], r.at[1], v.eye![2]]);
      assert.ok(p.depth > 1, `${r.name}: its name is in front`);
    }
  });

  it("knows which room a point is in, and stands two open-plan rooms in different places", () => {
    const bed = scene.rooms.find((r) => r.name === "BEDROOM 1")!;
    assert.equal(roomAt(scene, "level1", bed.at)?.id, bed.id);
    const living = scene.rooms.find((r) => r.name.startsWith("LIVING"))!;
    const kitchen = scene.rooms.find((r) => r.name === "KITCHEN")!;
    assert.notDeepEqual(roomView(scene, living).eye, roomView(scene, kitchen).eye);
  });

  it("puts a ceiling over every closed room at the top of the walls", () => {
    const withC = withCeilings(scene, "level1");
    const ceilings = withC.prisms.filter((p) => p.id.startsWith(CEILING_ID));
    assert.ok(ceilings.length >= 3);
    assert.ok(ceilings.length <= roomsOn(scene, "level1").length);
    assert.ok(ceilings.every((c) => c.a1 > 7 && c.a1 < 10.5), "at about the wall tops");
    assert.equal(withCeilings(scene, "level1"), withC, "made once per scene");
    assert.ok(!scene.prisms.some((p) => p.id.startsWith(CEILING_ID)), "the model itself has none");
  });

  it("draws a room from inside: its walls and ceiling, and nothing broken", () => {
    const bed = scene.rooms.find((r) => r.name === "BEDROOM 1")!;
    const cam: Camera = { ...NORTH, ...roomView(scene, bed) };
    const p = makeProjector(cam, VP, scene.center, scene.radius);
    const svg = renderScene({ scene: withCeilings(scene, "level1"), proj: p, style: "realistic", plan: null, sectionY: null, colors: DEFAULT_APPEARANCE, layers: {}, hidden: new Set<string>(), isolated: null, phaseState: null, shadows: true, edges: true, tint: {}, dimOthers: false, sun: [0.4, -0.5, 0.75], ghostMep: true }).svg;
    assert.ok(svg.includes(`data-el="${CEILING_ID}${bed.id}"`), "the ceiling over the room");
    assert.ok(/data-el="(W|P)-/.test(svg), "walls");
    const nums = [...svg.matchAll(/points="([^"]+)"/g)].flatMap((m) => m[1].split(/[ ,]/).map(Number));
    assert.ok(nums.length > 100 && nums.every(Number.isFinite), "every point a number");
  });
});
