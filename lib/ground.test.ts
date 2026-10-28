/**
 * lib/ground.test.ts
 *
 * WHAT   Unit tests of lib/ground.ts and of the ground in the model: the presumptive bearing values follow the code
 *        table (FBC-R Table R401.4.1), typed names are understood, the report lines say what a ground means for the
 *        footings and a drain field, and choosing a ground (one undo step) changes the project and the colour of
 *        its surface; the 3D view and the sheets draw its texture.
 * FOR    `npm test`. Catches a ground that silently falls back to lawn, or a bearing value off the code table.
 * DEBUG  - A colour test fails: setGround (lib/commands.ts) writes GROUNDS[g].top into colors.topography.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GROUNDS, GROUND_TYPES, groundNotes, groundOf, parseGround } from "./ground";
import { setGround } from "./commands";
import { createWorkspaceStore } from "./store/workspace-store";
import { COTTAGE } from "./mock-data";
import { renderScene } from "./scene/render";
import { makeProjector } from "./scene/camera";
import { getScene } from "./scene";
import { DEFAULT_APPEARANCE } from "./scene/types";
import { DEFAULT_QUERY } from "./workspace-query";

describe("kinds of ground", () => {
  it("use the code table's presumptive bearing values", () => {
    assert.equal(GROUNDS.clay.bearing, 1500);
    assert.equal(GROUNDS.sand.bearing, 2000);
    assert.equal(GROUNDS.gravel.bearing, 3000);
    assert.equal(GROUNDS.rock.bearing, 4000);
    for (const g of GROUND_TYPES) assert.ok(GROUNDS[g].bearing >= 1500, g);
  });

  it("understand what people type", () => {
    assert.equal(parseGround("clay"), "clay");
    assert.equal(parseGround("Clay soil"), "clay");
    assert.equal(parseGround("SANDY"), "sand");
    assert.equal(parseGround("loam"), "loam");
    assert.equal(parseGround("dirt"), "dirt");
    assert.equal(parseGround("grass"), "lawn");
    assert.equal(parseGround("limestone"), "rock");
    assert.equal(parseGround("marshmallow"), null);
  });

  it("say what the ground means for footings and a septic drain field", () => {
    const [footing, septic] = groundNotes(GROUNDS.clay);
    assert.match(footing, /1,500 psf/);
    assert.match(footing, /expansive/);
    assert.match(septic, /60–120 min\/in/);
    assert.match(groundNotes(GROUNDS.rock)[1], /does not percolate/);
    assert.equal(groundOf({}).id, "lawn");
  });
});

describe("choosing the ground", () => {
  const store = () => createWorkspaceStore({ mode: "demo", project: structuredClone(COTTAGE), query: DEFAULT_QUERY }, { toast: () => {}, log: () => {}, setDirty: () => {} });

  it("changes the project and the colour of the surface in one undo step", () => {
    const ws = store();
    setGround(ws, "clay");
    assert.equal(ws.getState().project.ground, "clay");
    assert.equal(ws.getState().colors.topography, GROUNDS.clay.top);
    ws.getState().undo();
    assert.equal(ws.getState().project.ground, undefined);
    assert.equal(ws.getState().colors.topography, DEFAULT_APPEARANCE.topography);
  });

  it("draws its texture on the ground in 3D and its colour on the cut faces", () => {
    const scene = getScene("cottage");
    const proj = makeProjector({ bearing: 225, pitch: 35, zoom: 1, panX: 0, panY: 0, perspective: false }, { w: 800, h: 600 }, scene.center, scene.radius);
    const base = { scene, proj, style: "realistic" as const, plan: null, sectionY: null, colors: DEFAULT_APPEARANCE, layers: {}, hidden: new Set<string>(), isolated: null, phaseState: null, shadows: false, edges: true, tint: {}, dimOthers: false, sun: [0.4, -0.5, 0.75] as [number, number, number], ghostMep: false };
    const svg = renderScene({ ...base, ground: { side: GROUNDS.sand.side, pattern: GROUNDS.sand.pattern } }).svg;
    assert.match(svg, /url\(#bs-ground-sand\)/);
    assert.doesNotMatch(renderScene(base).svg, /bs-ground-/);
  });
});
