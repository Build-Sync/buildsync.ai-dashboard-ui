/**
 * lib/draw/mep.test.ts
 *
 * WHAT   Unit tests of the MEP fixtures and their connections: the fixture catalogue (whole pieces, legacy types),
 *        fixtures composed with their ports, wires from a switch that light what they feed, hot, cold and drain
 *        pipes (supply through the ceiling, drains under the slab falling towards the stack), deleting a fixture
 *        taking its wires along, the wall a fixture snaps to, the roof a solar array sits on, gutters on the
 *        eaves, and how the renderer draws the lines (dotted / dashed drawing lines or real pipes and wires).
 * FOR    `npm test`.
 * DEBUG  - A wall-snap test fails after a change to the demo cottage: the points are inside its rooms (the west
 *          wall's inside face is at x ≈ 0.7; partition P-3 has a door between y = 25 and 28).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getScene } from "../scene";
import { makeProjector } from "../scene/camera";
import { renderScene } from "../scene/render";
import { DEFAULT_APPEARANCE, type LevelKey, type V2 } from "../scene/types";
import type { WsState } from "../store/workspace-store";
import { deleteChange } from "./change";
import { composeScene, linkPath } from "./compose";
import { FIXTURE_GROUPS, FIXTURE_IDS, FIXTURES, fixtureBase, fixtureOf, fixturesOf } from "./fixtures";
import { nearestWallFace, roofSurfaceAt } from "./tools-mep";
import { eavesOf } from "./tools-site";
import type { DrawnItem } from "./types";

const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const span = (pts: V2[], k: 0 | 1) => Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k]));
const fixture = (id: string, type: string, at: V2, p: Record<string, unknown> = {}): DrawnItem => ({ id, kind: "fixture", name: id, level: "level1", z: 0, pts: [at], p: { type, ...p } });
const link = (id: string, kind: "wire" | "pipelink", from: string, to: string, sub: string): DrawnItem => ({ id, kind, name: id, level: "level1", z: 0, pts: [], p: { from, to, sub } });

describe("the fixture catalogue", () => {
  it("has whole pieces in every group, each the size it says", () => {
    assert.ok(FIXTURE_IDS.length >= 40);
    for (const g of FIXTURE_GROUPS) assert.ok(Object.values(FIXTURES).some((f) => f.group === g), g);
    for (const f of Object.values(FIXTURES)) {
      for (const part of f.parts) {
        assert.ok(part.z1 > part.z0, `${f.id}: a part with no height`);
        assert.ok(part.poly.length >= 3, `${f.id}: a part with no outline`);
      }
      const all = f.parts.flatMap((p) => p.poly);
      near(span(all, 0), f.w, 0.01);
      near(span(all, 1), f.d, 0.01);
    }
    assert.equal(new Set(Object.values(FIXTURES).map((f) => f.label)).size, FIXTURE_IDS.length, "labels are unique");
  });

  it("knows the fixtures asked for: lights, switches, outlets, a fan, AC, solar inverter, sink, faucet, toilet, tub", () => {
    for (const id of ["ceilinglight", "switch", "outlet", "ceilingfan", "condenser", "minisplit", "inverter", "battery", "vanity", "kitchensink", "faucet", "toilet", "bathtub", "shower", "waterheater"]) assert.ok(FIXTURES[id], id);
  });

  it("reads the plain boxes drawn before it as catalogue pieces", () => {
    assert.equal(fixtureOf("sink")?.id, "vanity");
    assert.equal(fixtureOf("ahu")?.id, "airhandler");
    assert.equal(fixtureOf("heater")?.id, "waterheater");
    assert.equal(fixtureOf("nonsense"), null);
  });

  it("splits by system and hangs ceiling pieces from the ceiling", () => {
    assert.ok(fixturesOf("plumbing").every((f) => f.system === "plumbing"));
    assert.ok(fixturesOf("electrical").some((f) => f.role === "switch"));
    near(fixtureBase(FIXTURES.ceilinglight, 9) + FIXTURES.ceilinglight.h, 9);
    near(fixtureBase(FIXTURES.switch, 9), FIXTURES.switch.base);
  });
});

describe("wiring a switch to its lights", () => {
  const scene = getScene("cottage");
  const items = [fixture("S1", "switch", [0.7, 12], { rot: 90 }), fixture("L1", "ceilinglight", [6, 9]), fixture("L2", "recessed", [10, 9]), link("W1", "wire", "S1", "L1", "switched"), link("W2", "wire", "L1", "L2", "switched")];

  it("builds the pieces, a plan symbol for each and a wire from the switch's box to the light", () => {
    const s = composeScene(scene, items, {});
    assert.ok(s.prisms.some((p) => p.id === "S1") && s.prisms.some((p) => p.id === "L1"), "the pieces are built");
    assert.ok(s.devices.find((d) => d.id === "L1")?.planOnly, "the light's symbol is for the plan");
    const w = s.runs.find((r) => r.id === "W1")!;
    assert.equal(w.layer, "electrical");
    assert.equal(w.sub, "switched");
    near(w.pts[0][0], 0.7, 1e-6);
    near(w.pts[0][1], 12, 1e-6);
    const last = w.pts[w.pts.length - 1];
    near(last[0], 6, 1e-6);
    near(last[1], 9, 1e-6);
    assert.ok(Math.max(...w.pts.map((p) => p[2])) > 7, "it runs through the ceiling");
  });

  it("lights what the switch feeds when it is on, through a light wired on from another", () => {
    const off = composeScene(scene, items, {});
    assert.ok(!off.devices.some((d) => d.lit), "nothing is lit with the switch off");
    const on = composeScene(scene, items.map((i) => (i.id === "S1" ? { ...i, p: { ...i.p, on: true } } : i)), {});
    assert.ok(on.devices.find((d) => d.id === "L1")?.lit, "the light it is wired to");
    assert.ok(on.devices.find((d) => d.id === "L2")?.lit, "the light wired on from that light");
  });

  it("takes a fixture's wires and pipes with it when the fixture is deleted", () => {
    const ch = deleteChange({ drawn: items } as WsState, ["L1"]);
    assert.deepEqual([...(ch.remove ?? [])].sort(), ["L1", "W1", "W2"]);
  });
});

describe("piping fixtures", () => {
  const scene = getScene("cottage");
  const items = [fixture("WH", "waterheater", [26, 26]), fixture("V1", "vanity", [13, 24.5]), fixture("ST", "stack", [20, 30]), link("P1", "pipelink", "WH", "V1", "hot"), link("P2", "pipelink", "ST", "V1", "drain")];

  it("runs hot water from the heater through the ceiling to the sink", () => {
    const p = composeScene(scene, items, {}).runs.find((r) => r.id === "P1")!;
    assert.equal(p.layer, "plumbing");
    assert.equal(p.sub, "hot");
    assert.ok(Math.max(...p.pts.map((q) => q[2])) > 7);
  });

  it("runs a drain under the slab, falling 1/4 in per foot from the sink to the stack", () => {
    const p = composeScene(scene, items, {}).runs.find((r) => r.id === "P2")!;
    assert.equal(p.sub, "drain");
    const low = p.pts.filter((q) => q[2] < 0);
    assert.ok(low.length >= 2, "it is under the floor");
    const atSink = low.find((q) => q[0] === 13 && q[1] === 24.5)!;
    const atStack = low.find((q) => q[0] === 20 && q[1] === 30)!;
    near(atSink[2] - atStack[2], ((7 + 5.5) * 0.25) / 12, 1e-6);
  });

  it("keeps hot below cold in the ceiling so both show", () => {
    const port = { at: [0, 0, 1] as [number, number, number], floor: 0, ceiling: 9 };
    const to = { ...port, at: [10, 0, 1] as [number, number, number] };
    const top = (sub: "hot" | "cold") => Math.max(...linkPath(port, to, sub).map((q) => q[2]));
    assert.ok(top("hot") < top("cold"));
  });
});

describe("where fixtures and arrays go", () => {
  const scene = getScene("cottage");

  it("snaps to the inside face of the nearest wall, facing the room", () => {
    const f = nearestWallFace(scene, "level1", [1, 12])!;
    assert.ok(f.foot[0] > 0.3 && f.foot[0] < 1, `foot at x = ${f.foot[0]}`);
    near(f.out[0], 1, 1e-6);
  });

  it("does not stand a fixture against a door's header or the end of a wall at a doorway", () => {
    // (16, 26) is in the doorway of partition P-3: the jamb's 4 in end is the nearest face
    near(nearestWallFace(scene, "level1", [16, 26])!.foot[1], 25, 1e-6);
    const f = nearestWallFace(scene, "level1", [16, 26], 2.5, 1.5)!;
    assert.ok(Math.abs(f.foot[1] - 25) > 0.2, "a face as wide as a toilet");
  });

  it("reads the roof's slope where a solar array goes, and its eaves for gutters", () => {
    const west = roofSurfaceAt(scene, "R-01", [5, 15])!;
    const east = roofSurfaceAt(scene, "R-02", [22, 15])!;
    near(west.pitch, (Math.atan(5 / 12) * 180) / Math.PI, 0.01);
    assert.notEqual(west.uphill, east.uphill, "the two slopes face away from each other");
    assert.ok(west.z > 9 && west.z < 16);
    assert.equal(eavesOf(scene, "R-01").length, 1, "a gable slope has one eave");
    assert.equal(eavesOf(scene, "PO-ROOF").length, 4, "a flat roof drains all round");
  });

  it("lays a solar array of rows × panels on the roof", () => {
    const s = composeScene(scene, [{ id: "PV", kind: "solar", name: "PV", level: "site", z: 12, pts: [[5, 15]], p: { rows: 2, cols: 5, rot: 0, zc: 12.5, tilt: 22.6 } }], {});
    assert.equal(s.prisms.filter((p) => p.id === "PV" && p.category === "Solar").length >= 10, true);
  });
});

describe("drawing pipes and wires", () => {
  const scene = composeScene(getScene("cottage"), [fixture("WH", "waterheater", [26, 26]), fixture("V1", "vanity", [13, 24.5]), link("P1", "pipelink", "WH", "V1", "hot"), fixture("S1", "switch", [0.7, 12], { rot: 90, on: true }), fixture("L1", "ceilinglight", [6, 9]), link("W1", "wire", "S1", "L1", "switched")], {});
  const proj = makeProjector({ bearing: 0, pitch: 90, zoom: 1, panX: 0, panY: 0, perspective: false }, { w: 800, h: 600 }, scene.center, scene.radius);
  const base = { scene, proj, style: "realistic" as const, plan: { cutZ: 4, levels: ["level1" as LevelKey] }, sectionY: null, colors: DEFAULT_APPEARANCE, layers: {}, hidden: new Set<string>(), isolated: null, phaseState: null, shadows: false, edges: true, tint: {}, dimOthers: false, sun: [0.4, -0.5, 0.75] as [number, number, number], ghostMep: false };
  const look = (svg: string, id: string) => svg.match(new RegExp(`data-run="${id}" data-look="(\\w+)"`))?.[1];

  it("draws plumbing as dotted lines and electrical as dashed by default", () => {
    const svg = renderScene(base).svg;
    assert.equal(look(svg, "P1"), "lines");
    assert.equal(look(svg, "W1"), "lines");
    assert.match(svg, /stroke-dasharray="0.1 3.2"[^>]*data-run="P1"/);
  });

  it("draws them as the pipes and cables themselves when asked", () => {
    const svg = renderScene({ ...base, mepLook: { plumbing: "pipes", electrical: "wires" } }).svg;
    assert.equal(look(svg, "P1"), "real");
    assert.equal(look(svg, "W1"), "real");
  });

  it("makes a light glow when its switch is on", () => {
    assert.match(renderScene(base).svg, /data-lit="L1"/);
  });

  it("outlines a fixture on the plan in the theme ink (fill and stroke in one style attribute)", () => {
    const svg = renderScene(base).svg;
    const polys = [...svg.matchAll(/<polygon data-el="V1"[^>]*>/g)].map((m) => m[0]);
    assert.ok(polys.length > 0, "the vanity is on the plan");
    assert.ok(polys.every((p) => (p.match(/style=/g) ?? []).length === 1 && p.includes("stroke:var(--vp-ink)")), polys[0]);
  });

  it("keeps the pipes of the cut storey in a 3D cutaway", () => {
    const iso = makeProjector({ bearing: 225, pitch: 35, zoom: 1, panX: 0, panY: 0, perspective: false }, { w: 800, h: 600 }, scene.center, scene.radius);
    const svg = renderScene({ ...base, proj: iso, plan: null, cutAt: 4 }).svg;
    assert.ok(svg.includes('data-run="P1"'), "the hot water pipe in the ceiling");
  });
});
