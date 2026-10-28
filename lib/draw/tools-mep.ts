/**
 * lib/draw/tools-mep.ts
 *
 * WHAT   The MEP fixture and connection tools:
 *        - ELEC, PLUMB, HVAC, FIXT, EQUIP place a fixture of the catalogue (lib/draw/fixtures.ts), picked in the tool
 *          bar: lights, switches, outlets, fans; sinks, faucets, tubs, toilets, water heaters; AC units … A wall
 *          piece (a switch, a sink, a toilet) snaps to the nearest wall and faces the room; R turns it 90°. Ceiling
 *          pieces hang from the ceiling of the level. In 2D or 3D, it is the same model.
 *        - WIRE: click a switch (or a panel, an outlet), then each light, fan or outlet it feeds. A switch's wires are
 *          switched legs: the switch controls those lights (turn it on in Properties and they glow).
 *        - PIPECONNECT: click the water heater (hot water), the water supply (cold) or the drain stack (waste) — or a
 *          fixture — then each fixture to connect. Pipes a fixture does not take are refused (no hot water to a
 *          toilet). Wires and pipes are routed by the composer and follow the fixtures when they move.
 *        - SOLARPANEL: click a roof and the array follows its slope; click the ground for a racked array.
 * FOR    The MEP commands in lib/commands.ts (and LIGHT, SWITCH, SINK … which preset the piece); loaded by
 *        lib/draw/index.ts.
 * DEBUG  - "Click an electrical device": WIRE needs a fixture of the electrical catalogue (or an older device).
 *        - A wall fixture lands in the middle of a room: no wall within 2.5 ft of the click; click closer to one.
 *          The wall over a door and the 4 in end of a wall at a doorway are skipped (a face must be as wide as the
 *          piece, up to 1.5 ft).
 *        - A solar array sits flat: the click was not on a roof's slope (or the roof is flat); the tilt option
 *          sets it. In 3D the click is followed down the line of sight to where it meets the roof.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { Scene, V2 } from "../scene/types";
import type { DrawnItem } from "./types";
import { str } from "./compose";
import { FIXTURES, fixtureBase, fixtureOf, fixturesOf, type Fixture, type FixtureSystem } from "./fixtures";
import { planShapes } from "./parts";
import { mkItem, register, storeyOf, type ToolDef, type ToolEnv } from "./session";
import { place, prev, put, shp, showLayer } from "./tools";

/* ── placing fixtures ─────────────────────────────────────────────────── */
/** The wall face (at least `minFace` ft long) nearest a point on this level within `max` ft: the foot of the perpendicular and the face's outward direction. */
export function nearestWallFace(scene: Scene, level: string, pt: V2, max = 2.5, minFace = 0): { foot: V2; out: V2; dist: number } | null {
  let best: { foot: V2; out: V2; dist: number } | null = null;
  const walls = scene.prisms.filter((p) => p.axis === "z" && p.level === level && (p.category === "Wall" || p.category === "Partition") && !p.underground);
  const floor = Math.min(...walls.map((p) => p.a0));
  for (const p of walls) {
    // the wall over a door is no place to stand a fixture against
    if (p.a0 > floor + 1) continue;
    const n = p.poly.length;
    for (let i = 0; i < n; i++) {
      const a = p.poly[i];
      const b = p.poly[(i + 1) % n];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const L2 = dx * dx + dy * dy;
      // nor the end of a wall at a doorway, narrower than the fixture
      if (L2 < 0.01 || L2 < minFace * minFace) continue;
      const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L2));
      const foot: V2 = [a[0] + t * dx, a[1] + t * dy];
      const dist = Math.hypot(pt[0] - foot[0], pt[1] - foot[1]);
      // outlines are counter-clockwise: the outside of an edge is on its right
      const L = Math.sqrt(L2);
      const out: V2 = [dy / L, -dx / L];
      // only the face looking at the point
      if ((pt[0] - foot[0]) * out[0] + (pt[1] - foot[1]) * out[1] < -0.05) continue;
      if (dist <= max && (!best || dist < best.dist)) best = { foot, out, dist };
    }
  }
  return best;
}

/** Where a fixture goes for a click: against the nearest wall (facing the room) when it is a wall piece, else at the click. */
export function fixturePlacement(env: ToolEnv, fx: Fixture, pt: V2): { c: V2; rot: number; wall: boolean } {
  const rot = env.opt("rot", 0);
  if (!fx.againstWall) return { c: pt, rot, wall: false };
  const face = nearestWallFace(env.scene, env.level, pt, 2.5, Math.min(fx.w, 1.5));
  if (!face) return { c: pt, rot, wall: false };
  // the piece's back (+y) on the face, its front (-y) towards the room
  const r = (Math.atan2(face.out[0], -face.out[1]) * 180) / Math.PI;
  return { c: [face.foot[0] + face.out[0] * 0.01, face.foot[1] + face.out[1] * 0.01], rot: Math.round(r * 100) / 100, wall: true };
}

const chosen = (env: ToolEnv, fallback: string): Fixture => fixtureOf(env.opt("type", fallback)) ?? FIXTURES[fallback];
const short = (fx: Fixture) => fx.label.split(" (")[0];

/** A tool that places fixtures of one system (or of all) from the catalogue. */
function fixtureTool(fallback: string): ToolDef {
  const def = place({
    prompt: "",
    label: "Fixture",
    build: (pt, _c, env) => {
      const fx = chosen(env, fallback);
      const at = fixturePlacement(env, fx, pt);
      const base = env.optAuto("base", fixtureBase(fx, storeyOf(env)));
      const n = env.s.drawn.filter((i) => i.kind === "fixture" && str(i, "type", "") === fx.id).length + 1;
      if (fx.againstWall && !at.wall) env.toast(`No wall within 2.5 ft: the ${short(fx).toLowerCase()} stands where you clicked. Click closer to a wall to set it against it.`, "info");
      return [mkItem(env, "fixture", [at.c], { type: fx.id, base, rot: at.rot, w: fx.w, d: fx.d, h: fx.h }, { name: `${short(fx)} ${n}` })];
    },
    ghost: (pt, env) => {
      const fx = chosen(env, fallback);
      const at = fixturePlacement(env, fx, pt);
      return prev(planShapes(fx, at.c, at.rot).map((poly, i) => shp(poly, { closed: true, fill: i === 0 })), [{ at: pt, text: `${short(fx)}${at.wall ? " · on the wall" : ""}` }]);
    },
  });
  return {
    ...def,
    begin: (env) => {
      const fx = chosen(env, fallback);
      showLayer(env, fx.layer);
    },
    prompt: (_s, env) => {
      const fx = chosen(env, fallback);
      return `Click where the ${short(fx).toLowerCase()} goes${fx.againstWall ? " (it goes against the nearest wall)" : fx.mount === "ceiling" ? " (it hangs from the ceiling)" : ""}; R turns it, the tool bar picks another piece:`;
    },
    text: (_s, t, env) => {
      if (!/^r$/i.test(t.trim())) return false;
      const tool = env.session.tool;
      const rot = (env.opt("rot", 0) + 90) % 360;
      env.s.patch({ toolOpts: { ...env.s.toolOpts, [tool]: { ...(env.s.toolOpts[tool] ?? {}), rot } } });
      env.say("info", `Turned to ${rot}°`);
      return true;
    },
  };
}

register("ELEC", fixtureTool("outlet"));
register("PLUMB", fixtureTool("vanity"));
register("HVAC", fixtureTool("condenser"));
register(["FIXT", "FIXT LIB"], fixtureTool("toilet"));
register("EQUIP", fixtureTool("waterheater"));

/** The catalogue pieces each fixture tool offers in its tool bar. */
export const FIXTURE_TOOL_SYSTEM: Record<string, FixtureSystem | null> = { ELEC: "electrical", PLUMB: "plumbing", HVAC: "hvac", FIXT: null, "FIXT LIB": null, EQUIP: null };

/* ── connecting: wires and pipes ──────────────────────────────────────── */
/** What a drawn item is in a system: a fixture of the catalogue, or an older device. */
function partOf(it: DrawnItem | undefined): { system: FixtureSystem | "fire"; role: string; fx: Fixture | null } | null {
  if (!it) return null;
  if (it.kind === "fixture" || it.kind === "equipment") {
    const fx = fixtureOf(str(it, "type", ""));
    return fx ? { system: fx.system, role: fx.role, fx } : null;
  }
  if (it.kind === "device") {
    const shape = str(it, "shape", "outlet");
    return { system: str(it, "rk", "electrical") as FixtureSystem, role: shape === "light" ? "light" : shape === "panel" ? "panel" : shape === "outlet" ? "outlet" : "fixture", fx: null };
  }
  return null;
}

register("WIRE", {
  begin: (env) => showLayer(env, "electrical"),
  prompt: (s, env) => {
    const from = s.data.from ? env.item(String(s.data.from)) : undefined;
    return from ? `Click each light, fan or outlet ${from.name} feeds (Enter = done):` : "Click the switch, panel or outlet the wire starts at:";
  },
  click: (s, c, env) => {
    const it = c.hit ? env.item(c.hit) : undefined;
    const part = partOf(it);
    if (!it || !part || part.system !== "electrical") return env.toast("Click an electrical device: a switch, light, outlet, fan or panel.", "warn");
    const fromId = s.data.from ? String(s.data.from) : "";
    if (!fromId) return env.set({ data: { ...s.data, from: it.id }, pts: [it.pts[0]] });
    if (it.id === fromId) return;
    const src = env.item(fromId)!;
    if (env.s.drawn.some((w) => w.kind === "wire" && ((w.p.from === fromId && w.p.to === it.id) || (w.p.from === it.id && w.p.to === fromId)))) return env.toast(`${src.name} and ${it.name} are already wired.`, "info");
    const sub = partOf(src)?.role === "switch" ? "switched" : "power";
    const n = env.s.drawn.filter((w) => w.kind === "wire").length + 1;
    if (put(env, "Wire", [mkItem(env, "wire", [src.pts[0], it.pts[0]], { from: fromId, to: it.id, sub }, { level: src.level, z: src.z, name: `Wire ${n}: ${src.name} → ${it.name}` })]))
      env.say("ok", `✓ ${src.name} → ${it.name}${sub === "switched" ? ": the switch controls it (turn it on in Properties to see it light up)" : ""}`);
  },
  enter: (_s, env) => env.done(),
  preview: (s, cur) => (s.pts.length ? prev([shp([s.pts[0], cur], { dashed: true })]) : null),
});

/** The pipe a source gives: the water heater hot water, the supply cold water, the stack takes waste. */
const LINE_OF: Record<string, "hot" | "cold" | "drain"> = { heater: "hot", supply: "cold", sewer: "drain" };
const LINE_NAME = { hot: "hot water", cold: "cold water", drain: "drain" } as const;

register(["PIPECONNECT", "PCONNECT", "PLUMBTO"], {
  begin: (env) => showLayer(env, "plumbing"),
  prompt: (s, env) => {
    const from = s.data.from ? env.item(String(s.data.from)) : undefined;
    return from ? `Click each fixture to connect to ${from.name} (Enter = done):` : "Click the water heater (hot), the water supply (cold), the drain stack (waste) — or a fixture — to pipe from:";
  },
  click: (s, c, env) => {
    const it = c.hit ? env.item(c.hit) : undefined;
    const part = partOf(it);
    if (!it || !part || part.system !== "plumbing") return env.toast("Click a plumbing fixture: a sink, toilet, tub, shower, the water heater, the supply or the drain stack.", "warn");
    const fromId = s.data.from ? String(s.data.from) : "";
    if (!fromId) return env.set({ data: { ...s.data, from: it.id }, pts: [it.pts[0]] });
    if (it.id === fromId) return;
    const src = env.item(fromId)!;
    const sp = partOf(src)!;
    const choice = env.opt("line", "auto");
    const sub = choice !== "auto" ? (choice as "hot" | "cold" | "drain") : (LINE_OF[sp.role] ?? LINE_OF[part.role] ?? "cold");
    // whichever end does not supply that pipe must take it (cold water goes into a water heater too)
    const takes = (q: typeof part) => !q.fx || (sub === "hot" ? !!q.fx.needs.hot : sub === "cold" ? !!q.fx.needs.cold : !!q.fx.needs.drain);
    const gives = (q: typeof part) => LINE_OF[q.role] === sub;
    const consumer = gives(sp) ? part : gives(part) ? sp : part;
    if (!takes(consumer)) return env.toast(`${consumer.fx?.label ?? "That fixture"} takes no ${LINE_NAME[sub]}.`, "warn");
    if (env.s.drawn.some((w) => w.kind === "pipelink" && w.p.sub === sub && ((w.p.from === fromId && w.p.to === it.id) || (w.p.from === it.id && w.p.to === fromId)))) return env.toast(`${src.name} and ${it.name} already have a ${LINE_NAME[sub]} pipe.`, "info");
    const n = env.s.drawn.filter((w) => w.kind === "pipelink").length + 1;
    if (put(env, "Pipe", [mkItem(env, "pipelink", [src.pts[0], it.pts[0]], { from: fromId, to: it.id, sub }, { level: src.level, z: src.z, name: `${LINE_NAME[sub][0].toUpperCase()}${LINE_NAME[sub].slice(1)} ${n}: ${src.name} → ${it.name}` })]))
      env.say("ok", `✓ ${LINE_NAME[sub]}: ${src.name} → ${it.name}. View → Pipes shows the pipes themselves.`);
  },
  enter: (_s, env) => env.done(),
  preview: (s, cur) => (s.pts.length ? prev([shp([s.pts[0], cur], { dashed: true })]) : null),
});

/* ── solar ────────────────────────────────────────────────────────────── */
/** The roof surface at a point: its height, its pitch and which way is uphill (a multiple of 90°). */
export function roofSurfaceAt(scene: Scene, roofId: string, pt: V2): { z: number; pitch: number; uphill: number } | null {
  let best: { z: number; pitch: number; uphill: number } | null = null;
  const topAt = (poly: V2[], x: number): number | null => {
    let top: number | null = null;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if ((a[0] - x) * (b[0] - x) > 0 || Math.abs(b[0] - a[0]) < 1e-9) continue;
      const z = a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
      if (top === null || z > top) top = z;
    }
    return top;
  };
  for (const p of scene.prisms) {
    if (p.id !== roofId) continue;
    if (p.axis === "y") {
      if (pt[1] < p.a0 || pt[1] > p.a1) continue;
      const z = topAt(p.poly, pt[0]);
      if (z === null) continue;
      // the slope from both sides of the point, or from one side near the ridge or the eave
      const z1 = topAt(p.poly, pt[0] + 0.5);
      const z0 = topAt(p.poly, pt[0] - 0.5);
      const slope = z1 !== null && z0 !== null ? z1 - z0 : z1 !== null ? (z1 - z) / 0.5 : z0 !== null ? (z - z0) / 0.5 : 0;
      if (!best || z > best.z) best = { z, pitch: (Math.atan(Math.abs(slope)) * 180) / Math.PI, uphill: slope >= 0 ? 0 : 180 };
    } else {
      const xs = p.poly.map((q) => q[0]);
      const ys = p.poly.map((q) => q[1]);
      if (pt[0] < Math.min(...xs) || pt[0] > Math.max(...xs) || pt[1] < Math.min(...ys) || pt[1] > Math.max(...ys)) continue;
      if (!best || p.a1 > best.z) best = { z: p.a1, pitch: 0, uphill: 90 };
    }
  }
  return best;
}

register(["SOLARPANEL", "SOLARPANELS", "PV", "SOLARARRAY"], {
  begin: (env) => showLayer(env, "roof"),
  prompt: () => "Click a roof slope for a roof array (it follows the slope), or the ground for a racked array. Rows, columns and tilt are in the tool bar:",
  click: (_s, c, env) => {
    const rows = env.opt("rows", 2);
    const cols = env.opt("cols", 6);
    const el = c.hit ? env.scene.elementById[c.hit] : undefined;
    // the point clicked on the roof's own surface (in 3D the click is read at the roof's height, then refined)
    let surface = null as ReturnType<typeof roofSurfaceAt>;
    let at = c.pt;
    if (el?.category === "Roof") {
      // walk down the line of sight from the roof's top: the first point where the roof is at or above it is where
      // the click met the roof (reading it at the ridge's height alone misses near the eaves and the gable ends)
      const steps = 24;
      for (let k = 0; k <= steps && !surface; k++) {
        const z = el.max[2] - ((el.max[2] - el.min[2]) * k) / steps;
        const q = c.at(z);
        const here = q ? roofSurfaceAt(env.scene, el.id, q) : null;
        if (q && here && here.z >= z - 0.05) {
          at = q;
          surface = here;
        }
      }
      for (let k = 0; k < 3 && surface; k++) {
        const q = c.at(surface.z);
        if (!q) break;
        at = q;
        surface = roofSurfaceAt(env.scene, el.id, at) ?? surface;
      }
    }
    const n = env.s.drawn.filter((i) => i.kind === "solar").length + 1;
    const panel = { pw: env.opt("pw", 3.4), pl: env.opt("pl", 5.6), watts: env.opt("watts", 400) };
    const kw = solarKw(rows, cols, panel.watts);
    if (surface) {
      const tilt = env.optAuto("tilt", surface.pitch);
      put(env, "Solar array", [mkItem(env, "solar", [at], { rows, cols, ...panel, tilt, rot: surface.uphill, zc: surface.z + 0.35, roof: el!.id }, { level: el!.level, z: env.z, name: `Solar Array ${n} (${kw} kW)` })]);
      env.say("ok", `✓ Solar array ${n}: ${rows} × ${cols} panels (${kw} kW) on ${el!.name}, tilted ${surface.pitch.toFixed(0)}° with the roof. Add an inverter (Systems → Inverter) and wire it.`);
      return;
    }
    const tilt = env.optAuto("tilt", 25);
    put(env, "Solar array", [mkItem(env, "solar", [c.pt], { rows, cols, ...panel, tilt, rot: 90, zc: env.scene.grade + 3, ground: true }, { level: "site", z: env.scene.grade, name: `Solar Array ${n} (${kw} kW, ground)` })]);
    env.say("ok", `✓ Ground-mounted solar array ${n}: ${rows} × ${cols} panels (${kw} kW), tilted ${tilt}° to the south.`);
  },
  enter: (_s, env) => env.done(),
  preview: (_s, cur, env) => {
    const rows = env.opt("rows", 2);
    const cols = env.opt("cols", 6);
    const w = cols * (env.opt("pw", 3.4) + 0.1);
    const d = rows * (env.opt("pl", 5.6) * 0.92 + 0.1);
    return prev([shp([[cur[0] - w / 2, cur[1] - d / 2], [cur[0] + w / 2, cur[1] - d / 2], [cur[0] + w / 2, cur[1] + d / 2], [cur[0] - w / 2, cur[1] + d / 2]], { closed: true, fill: true })], [{ at: cur, text: `${rows} × ${cols} panels` }]);
  },
});

/** The output of an array in kW, to one decimal. */
export const solarKw = (rows: number, cols: number, watts: number): string => ((rows * cols * watts) / 1000).toFixed(1);

/** Catalogue pieces of a system, for the tool bars (grouped labels). */
export const fixtureChoices = (system: FixtureSystem | null): [string, string][] => fixturesOf(system ?? undefined).map((f) => [f.id, `${f.group} · ${f.label}`]);
