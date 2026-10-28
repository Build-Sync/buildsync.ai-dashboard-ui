/**
 * lib/draw/tools-site.ts
 *
 * WHAT   The site tools, sized in the tool bar and placed with a click (or a typed x,y), on the ground:
 *        POOL (rectangle, oval, freeform or L: length, width, depth, deck) · FENCE (draw its line, C closes it:
 *        wood privacy, picket, chain link, wrought iron, vinyl or a masonry garden wall) · ROCK (a boulder or a cluster) ·
 *        GRAVEL (a gravel or river-rock bed: outline it) · ROAD (draw its centre line: width, curb and gutter,
 *        sidewalks, centre line) · SIDEWALK (draw its line) · SIGN (stop, yield, speed limit, street name, no
 *        parking, one way) · SIGNAL (a traffic light on a mast arm) · DRAIN (curb inlet, area drain, trench drain) ·
 *        GUTTER (click a roof: gutters along its eaves with downspouts at the ends).
 *        The shapes are in lib/draw/site.ts; the composer turns the items into prisms.
 * FOR    Insert → Site Objects and Systems → Roads & Drainage (lib/commands.ts), loaded by lib/draw/index.ts.
 * DEBUG  - GUTTER finds no eaves: the click must land on a roof (its element's prisms are read for their lowest
 *          edges); a flat roof gets gutters on all four sides.
 *        - A road or sidewalk is not drawn: it needs two points or more (Enter ends the line).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { Scene, V2 } from "../scene/types";
import { circlePts } from "./geom";
import { mkItem, register, type ToolEnv } from "./session";
import { FENCE_HEIGHT, offsetPolygon, poolOutline, type FenceType, type PoolShape } from "./site";
import { boundary, boxGhost, onSite, pathTool, place, prev, put, shp, showLayer } from "./tools";

const turn = (pts: V2[], deg: number, c: V2): V2[] => {
  const r = (deg * Math.PI) / 180;
  return pts.map(([x, y]) => [c[0] + x * Math.cos(r) - y * Math.sin(r), c[1] + x * Math.sin(r) + y * Math.cos(r)] as V2);
};
const count = (env: ToolEnv, kind: string) => env.s.drawn.filter((i) => i.kind === kind).length + 1;

register("POOL", place({
  prompt: "Click where the pool's centre goes (or type x,y). Shape, length, width, depth and deck are in the tool bar:",
  label: "Pool",
  begin: (env) => showLayer(env, "landscape"),
  build: (pt, _c, env) => {
    const shape = env.opt("shape", "rectangle");
    const l = env.opt("l", 32);
    const w = env.opt("w", 16);
    env.say("info", `Pool ${count(env, "pool")}: ${env.fmt(l)} × ${env.fmt(w)}, ${env.fmt(env.opt("depth", 6))} deep, ${shape}. Its shell is below ground: see it with View → Below Grade or a section.`);
    return [mkItem(env, "pool", [pt], { shape, l, w, depth: env.opt("depth", 6), deck: env.opt("deck", 4), rot: env.opt("rot", 0) }, { ...onSite(env), name: `Pool ${count(env, "pool")}` })];
  },
  ghost: (pt, env) => {
    const water = turn(poolOutline(env.opt("shape", "rectangle") as PoolShape, env.opt("l", 32), env.opt("w", 16)), env.opt("rot", 0), pt);
    const deck = env.opt("deck", 4);
    const shapes = [shp(water, { closed: true, fill: true })];
    if (deck > 0) shapes.push(shp(turn(offsetPolygon(poolOutline(env.opt("shape", "rectangle") as PoolShape, env.opt("l", 32), env.opt("w", 16)), 1.25 + deck), env.opt("rot", 0), pt), { closed: true, dashed: true }));
    return prev(shapes, [{ at: pt, text: `${env.fmt(env.opt("l", 32))} × ${env.fmt(env.opt("w", 16))}` }]);
  },
}));

register(["ROCK", "BOULDER"], place({
  prompt: "Click where the boulder goes (or type x,y). Size and how many are in the tool bar:",
  label: "Boulder",
  begin: (env) => showLayer(env, "landscape"),
  build: (pt, _c, env) => [mkItem(env, "rock", [pt], { size: env.opt("size", 3), count: env.opt("count", 1) }, { ...onSite(env), name: `Boulder ${count(env, "rock")}` })],
  ghost: (pt, env) => prev([shp(circlePts(pt, env.opt("size", 3) / 2 + (env.opt("count", 1) > 1 ? env.opt("size", 3) * 0.6 : 0), 20), { closed: true, fill: true })]),
}));

register(["GRAVEL", "ROCKBED"], boundary({ kind: "gravel", label: "Gravel bed", prompt: "Outline the gravel or river-rock bed", params: (env) => ({ p: { rock: env.opt("rock", false) } }), level: "site", z: (env) => env.scene.grade, layer: "landscape" }));

register("ROAD", pathTool({
  first: "Specify the start of the road's centre line:",
  next: "Specify the next point of the centre line [Enter = finish, U = undo]:",
  min: 2,
  closable: false,
  layer: "civil",
  commit: (pts, _c, env) =>
    void put(env, "Road", [mkItem(env, "road", pts, { width: env.opt("width", 24), curb: env.opt("curb", true), walks: env.opt("walks", "both"), centre: env.opt("centre", "double") }, { ...onSite(env), name: `Road ${count(env, "road")}` })]),
}));

const FENCE_NAMES: Record<string, string> = { privacy: "Privacy Fence", picket: "Picket Fence", chainlink: "Chain-Link Fence", iron: "Iron Fence", vinyl: "Vinyl Fence", masonry: "Garden Wall" };
register("FENCE", pathTool({
  first: "Specify the start of the fence or garden wall (its line):",
  next: "Specify the next point [Enter = finish, C = close, U = undo]:",
  min: 2,
  closable: true,
  layer: "landscape",
  commit: (pts, closed, env) => {
    const type = env.opt("type", "privacy") as FenceType;
    const h = env.optAuto("h", FENCE_HEIGHT[type] ?? 6);
    const n = env.s.drawn.filter((i) => i.kind === "fence" && i.p.type === type).length + 1;
    put(env, FENCE_NAMES[type] ?? "Fence", [mkItem(env, "fence", pts, { type, h }, { ...onSite(env), closed, name: `${FENCE_NAMES[type] ?? "Fence"} ${n}` })]);
    const run = pts.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), closed ? Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) : 0);
    env.say("ok", `✓ ${FENCE_NAMES[type] ?? "Fence"} ${n}: ${env.fmt(run)} long, ${env.fmt(h)} high`);
  },
}));

register("SIDEWALK", pathTool({
  first: "Specify the start of the sidewalk (its centre line):",
  next: "Specify the next point [Enter = finish, U = undo]:",
  min: 2,
  closable: false,
  layer: "civil",
  commit: (pts, _c, env) => void put(env, "Sidewalk", [mkItem(env, "sidewalk", pts, { width: env.opt("width", 5) }, { ...onSite(env), name: `Sidewalk ${count(env, "sidewalk")}` })]),
}));

const SIGN_NAMES: Record<string, string> = { stop: "Stop Sign", yield: "Yield Sign", speed: "Speed Limit Sign", street: "Street Name Sign", noparking: "No Parking Sign", oneway: "One Way Sign" };
register("SIGN", place({
  prompt: "Click where the sign's post goes (or type x,y). Kind and which way it faces are in the tool bar:",
  label: "Sign",
  begin: (env) => showLayer(env, "civil"),
  build: (pt, _c, env) => [mkItem(env, "sign", [pt], { type: env.opt("type", "stop"), rot: env.opt("rot", 0) }, { ...onSite(env), name: `${SIGN_NAMES[env.opt("type", "stop")] ?? "Sign"} ${count(env, "sign")}` })],
  ghost: (pt, env) => {
    const face = turn([[-1, -0.6], [1, -0.6]], env.opt("rot", 0), pt);
    return prev([shp(circlePts(pt, 0.3, 10), { closed: true, fill: true }), shp(face)]);
  },
}));

register(["SIGNAL", "STOPLIGHT", "TRAFFICLIGHT"], place({
  prompt: "Click where the traffic light's pole goes (or type x,y). The arm reaches over the road in the direction set in the tool bar:",
  label: "Traffic light",
  begin: (env) => showLayer(env, "civil"),
  build: (pt, _c, env) => [mkItem(env, "signal", [pt], { rot: env.opt("rot", 0), arm: env.opt("arm", 20) }, { ...onSite(env), name: `Traffic Light ${count(env, "signal")}` })],
  ghost: (pt, env) => {
    const arm = turn([[0, 0], [env.opt("arm", 20), 0]], env.opt("rot", 0), pt);
    return prev([shp(circlePts(pt, 0.5, 12), { closed: true, fill: true }), shp(arm)], [{ at: arm[1], text: `arm ${env.fmt(env.opt("arm", 20))}` }]);
  },
}));

register("DRAIN", place({
  prompt: "Click where the drain goes (or type x,y): a curb inlet at the road's edge, an area drain in a low spot, or a trench drain across a driveway:",
  label: "Drain",
  begin: (env) => showLayer(env, "civil"),
  build: (pt, _c, env) => {
    const type = env.opt("type", "inlet");
    const names: Record<string, string> = { inlet: "Curb Inlet", area: "Area Drain", trench: "Trench Drain" };
    return [mkItem(env, "drain", [pt], { type, rot: env.opt("rot", 0), len: env.opt("len", 8) }, { ...onSite(env), name: `${names[type] ?? "Drain"} ${count(env, "drain")}` })];
  },
  ghost: (pt, env) => {
    const type = env.opt("type", "inlet");
    if (type === "area") return prev([shp(circlePts(pt, 0.55, 16), { closed: true, fill: true })]);
    return boxGhost(type === "trench" ? env.opt("len", 8) : 3, type === "trench" ? 0.7 : 2, env.opt("rot", 0))(pt);
  },
}));

/**
 * The eaves of a roof: the low edges of its sloped pieces (each runs along the extrusion of a gable or shed roof),
 * or all four sides of a flat one, with the direction pointing away from the roof.
 */
export function eavesOf(scene: Scene, roofId: string): { a: V2; b: V2; z: number; out: V2 }[] {
  const ps = scene.prisms.filter((p) => p.id === roofId);
  const lines: { a: V2; b: V2; z: number; out: V2 }[] = [];
  const xs = ps.flatMap((p) => (p.axis === "y" ? p.poly.map((q) => q[0]) : p.poly.map((q) => q[0])));
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  for (const p of ps) {
    if (p.axis === "y") {
      const zmin = Math.min(...p.poly.map((q) => q[1]));
      for (const x of [...new Set(p.poly.filter((q) => q[1] <= zmin + 0.01).map((q) => Math.round(q[0] * 100) / 100))]) {
        if (lines.some((l) => Math.abs(l.a[0] - x) < 0.05 && Math.abs(l.z - zmin) < 0.05)) continue;
        lines.push({ a: [x, p.a0], b: [x, p.a1], z: zmin, out: [x >= cx ? 1 : -1, 0] });
      }
    } else {
      const px = p.poly.map((q) => q[0]);
      const py = p.poly.map((q) => q[1]);
      const [x0, x1, y0, y1] = [Math.min(...px), Math.max(...px), Math.min(...py), Math.max(...py)];
      const z = p.a1;
      lines.push({ a: [x0, y0], b: [x1, y0], z, out: [0, -1] }, { a: [x1, y0], b: [x1, y1], z, out: [1, 0] }, { a: [x1, y1], b: [x0, y1], z, out: [0, 1] }, { a: [x0, y1], b: [x0, y0], z, out: [-1, 0] });
    }
  }
  // the longest eaves first; a gable has two
  return lines.sort((l, m) => Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]) - Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1])).slice(0, 4);
}

register("GUTTER", {
  prompt: () => "Click a roof: gutters go along its eaves, with a downspout and splash block at each end:",
  begin: (env) => showLayer(env, "roof"),
  click: (_s, c, env) => {
    const el = c.hit ? env.scene.elementById[c.hit] : undefined;
    if (!el || el.category !== "Roof") return env.toast("Click a roof (its slope, not a wall).", "warn");
    // a gable roof is often one element per slope: take in every roof piece that touches the one clicked
    // (a sloped roof takes in the other sloped pieces only: a flat porch roof against it keeps its own)
    const sloped = (id: string) => env.scene.prisms.some((p) => p.id === id && p.axis === "y");
    const touching = env.scene.elements.filter((o) => o.id === el.id || (o.category === "Roof" && o.level === el.level && sloped(o.id) === sloped(el.id) && o.min[0] <= el.max[0] + 0.5 && o.max[0] >= el.min[0] - 0.5 && o.min[1] <= el.max[1] + 0.5 && o.max[1] >= el.min[1] - 0.5));
    const eaves = touching.flatMap((o) => eavesOf(env.scene, o.id)).filter((e, i, all) => all.findIndex((f) => Math.hypot(f.a[0] - e.a[0], f.a[1] - e.a[1]) + Math.hypot(f.b[0] - e.b[0], f.b[1] - e.b[1]) < 0.2) === i);
    if (!eaves.length) return env.toast("That roof has no eave to hang a gutter on.", "warn");
    const n0 = count(env, "gutter");
    const items = eaves.map((e, i) =>
      mkItem(env, "gutter", [e.a, e.b], { eave: e.z, ox: e.out[0], oy: e.out[1], ends: "ab", grade: env.scene.grade }, { level: el.level, z: 0, name: `Gutter ${n0 + i} (${el.name})` }),
    );
    if (put(env, "Gutters", items)) env.say("ok", `✓ ${items.length} gutters along the eaves of ${el.name}, with ${items.length * 2} downspouts`);
  },
  enter: (_s, env) => env.done(),
});
