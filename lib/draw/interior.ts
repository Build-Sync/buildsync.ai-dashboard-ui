/**
 * lib/draw/interior.ts
 *
 * WHAT   Standing inside a room (the room view):
 *        - the rooms sorted by building and storey (roomGroups: the project's own house first, then each linked or
 *          merged house of a community, each by storey from the ground up; roomsOfBuilding for Next / Previous Room);
 *        - a room's outline (found the way the ROOM tool finds one), the rooms of a storey (roomsOn) and the room a
 *          point is in (roomAt);
 *        - where to stand in a room and which way to look (roomView: stepped back from the room's name where there
 *          is most floor, looking across the room at eye height);
 *        - the ceilings drawn over the rooms while you stand inside (withCeilings: the model has none; you would look
 *          up into the roof), each at the height of the walls around its room.
 * FOR    The room view: a double-click on a room's name in 2D or 3D, the Room to Room button of the top bar and
 *        WALKIN, NEXTROOM / PREVROOM / LEAVEROOM, ModelViewport (the camera's `eye`) and the room bar
 *        (Viewport/RoomBar.tsx).
 * DEBUG  - The view stands at the room's name looking north: the outline was not found (a doorway with no door leaf
 *          lets the fill leak out, or the name sits on a wall); roomView then steps back over the walls' faces.
 *        - No ceiling over a room: same cause, or no wall reaches into it. Ceilings carry ids that start with
 *          CEILING_ID, which the viewport ignores when picking (they are not elements).
 *        - A house is listed under the project's name: its rooms carry no `building` tag; a linked or merged house's
 *          rooms get one (its block id and name) in lib/links.ts blockOf.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { EYE_HEIGHT, ROOM_FOV, bearingTowards, type Camera } from "../scene/camera";
import type { LevelKey, Prism, RoomLabel, Scene, V2 } from "../scene/types";
import { enclosureAt } from "./enclose";
import { pointInPoly, polyArea } from "./geom";

/** Ceilings drawn in a room view have ids that start with this; they are not elements of the model. */
export const CEILING_ID = "ceiling:";

const outlines = new WeakMap<Scene, Map<string, V2[] | null>>();

/** The outline of a room (found once per scene), or null when its walls do not close it. */
export function roomOutline(scene: Scene, room: RoomLabel): V2[] | null {
  let m = outlines.get(scene);
  if (!m) outlines.set(scene, (m = new Map()));
  if (!m.has(room.id)) {
    const poly = enclosureAt(scene, room.level, room.at, null);
    m.set(room.id, poly && poly.length >= 3 && Math.abs(polyArea(poly)) > 4 ? poly : null);
  }
  return m.get(room.id) ?? null;
}

/** The rooms of a storey, in the order the project lists them. */
export function roomsOn(scene: Scene, level: LevelKey): RoomLabel[] {
  return scene.rooms.filter((r) => r.level === level);
}

/** A building of the project: the project's own, or a house linked or merged into it (a community has several). */
export interface Building {
  id: string;
  name: string;
}

/** The storeys of a building that have rooms, lowest first, each with its rooms. */
export interface RoomLevel {
  level: LevelKey;
  rooms: RoomLabel[];
}

/** A building with its rooms, by storey. */
export interface RoomGroup {
  building: Building;
  levels: RoomLevel[];
}

/** The id the project's own building has in a RoomGroup (linked and merged ones use their block id, LK1 or MG1). */
export const OWN_BUILDING = "own";

/** The building a room is in; `ownName` names the project's own. */
export function buildingOf(room: RoomLabel, ownName: string): Building {
  return room.building ?? { id: OWN_BUILDING, name: ownName };
}

/**
 * Every room of the scene sorted by building (the project's own first, then each linked or merged house in the order
 * they were added), and inside each building by storey from the ground up. A project with one house has one group.
 */
export function roomGroups(scene: Scene, ownName: string): RoomGroup[] {
  const groups = new Map<string, RoomGroup>();
  for (const r of scene.rooms) {
    const b = buildingOf(r, ownName);
    let g = groups.get(b.id);
    if (!g) groups.set(b.id, (g = { building: b, levels: [] }));
    let lv = g.levels.find((l) => l.level === r.level);
    if (!lv) g.levels.push((lv = { level: r.level, rooms: [] }));
    lv.rooms.push(r);
  }
  const z = (l: LevelKey) => scene.levelZ[l] ?? 0;
  for (const g of groups.values()) g.levels.sort((a, b) => z(a.level) - z(b.level));
  return [...groups.values()].sort((a, b) => (a.building.id === OWN_BUILDING ? -1 : 0) - (b.building.id === OWN_BUILDING ? -1 : 0));
}

/** The rooms of the building a room is in: storey by storey from the ground up, in the order the project lists them. */
export function roomsOfBuilding(scene: Scene, room: RoomLabel): RoomLabel[] {
  const id = room.building?.id ?? OWN_BUILDING;
  const g = roomGroups(scene, "").find((x) => x.building.id === id);
  return g ? g.levels.flatMap((l) => l.rooms) : [room];
}

/** The room a point of a storey is in, if any. */
export function roomAt(scene: Scene, level: LevelKey, pt: V2): RoomLabel | null {
  return roomsOn(scene, level).find((r) => {
    const poly = roomOutline(scene, r);
    return poly ? pointInPoly(pt, poly) : false;
  }) ?? null;
}

/** How far from `from` along direction `dir` the nearest of these edges is (Infinity when the ray meets none). */
function freeRun(edges: [V2, V2][], from: V2, dir: V2): number {
  let best = Infinity;
  for (const [a, b] of edges) {
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const den = dir[0] * ey - dir[1] * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a[0] - from[0]) * ey - (a[1] - from[1]) * ex) / den;
    const u = ((a[0] - from[0]) * dir[1] - (a[1] - from[1]) * dir[0]) / den;
    if (t > 1e-6 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  return best;
}

/**
 * Where to stand in a room and which way to look: back from the room's name in the direction with the most free
 * floor (into a corner of a closed room; within its own part of an open plan), looking across it at eye height.
 */
export function roomView(scene: Scene, room: RoomLabel): Pick<Camera, "eye" | "bearing" | "pitch" | "fov"> {
  const z = (scene.levelZ[room.level] ?? 0) + EYE_HEIGHT;
  const poly = roomOutline(scene, room);
  const at0 = room.at;
  // the room's outline; when it does not close (an open stair, a leaking doorway), the faces of the storey's walls
  const closed = !!poly && pointInPoly(at0, poly);
  const edges: [V2, V2][] =
    poly && closed
      ? poly.map((q, i) => [q, poly[(i + 1) % poly.length]])
      : scene.prisms.filter((p) => p.axis === "z" && p.level === room.level && (p.category === "Wall" || p.category === "Partition") && !p.underground).flatMap((p) => p.poly.map((q, i): [V2, V2] => [q, p.poly[(i + 1) % p.poly.length]]));
  // step back no further than the room's own size, keeping clear of the walls
  const reach = Math.max(4, Math.min(13, Math.sqrt(room.area || 100) * 0.75));
  let best: { at: V2; d: number } | null = null;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + 0.13;
    const dir: V2 = [Math.cos(a), Math.sin(a)];
    const free = freeRun(edges, at0, dir);
    const d = Math.min(reach, free - 1.6);
    const at: V2 = [at0[0] + dir[0] * d, at0[1] + dir[1] * d];
    // without an outline, stay well inside the building (a ray can slip out through a window or door)
    const f = scene.footprint;
    if (!closed && (at[0] < f.x0 + 1.5 || at[0] > f.x1 - 1.5 || at[1] < f.y0 + 1.5 || at[1] > f.y1 - 1.5)) continue;
    if (d > (best?.d ?? 1.5)) best = { at, d };
  }
  if (!best) return { eye: [at0[0], at0[1], z], bearing: 180, pitch: 6, fov: ROOM_FOV };
  return { eye: [best.at[0], best.at[1], z], bearing: bearingTowards(best.at, at0), pitch: 6, fov: ROOM_FOV };
}

/** The height of a room's ceiling: the usual top of the walls and partitions of its storey that reach into it. */
function ceilingHeight(scene: Scene, level: LevelKey, box: { x0: number; y0: number; x1: number; y1: number }): number | null {
  const tops = new Map<number, number>();
  for (const p of scene.prisms) {
    if (p.axis !== "z" || p.level !== level || (p.category !== "Wall" && p.category !== "Partition") || p.underground) continue;
    // a wall of another building (or a far part of this one) says nothing about this room
    const xs = p.poly.map((q) => q[0]);
    const ys = p.poly.map((q) => q[1]);
    if (Math.max(...xs) < box.x0 - 1 || Math.min(...xs) > box.x1 + 1 || Math.max(...ys) < box.y0 - 1 || Math.min(...ys) > box.y1 + 1) continue;
    const t = Math.round(p.a1 * 10) / 10;
    tops.set(t, (tops.get(t) ?? 0) + 1);
  }
  let best: number | null = null;
  let n = 0;
  for (const [t, c] of tops) if (c > n || (c === n && best !== null && t > best)) [best, n] = [t, c];
  return best;
}

const ceilinged = new WeakMap<Scene, Map<LevelKey, Scene>>();

/** The scene with a ceiling over every room of a storey whose outline closes, for standing inside. */
export function withCeilings(scene: Scene, level: LevelKey): Scene {
  let m = ceilinged.get(scene);
  if (!m) ceilinged.set(scene, (m = new Map()));
  const known = m.get(level);
  if (known) return known;
  const extra: Prism[] = [];
  for (const r of roomsOn(scene, level)) {
    const poly = roomOutline(scene, r);
    if (!poly) continue;
    const box = { x0: Math.min(...poly.map((q) => q[0])), y0: Math.min(...poly.map((q) => q[1])), x1: Math.max(...poly.map((q) => q[0])), y1: Math.max(...poly.map((q) => q[1])) };
    const top = ceilingHeight(scene, level, box);
    if (top === null) continue;
    const id = `${CEILING_ID}${r.id}`;
    extra.push({ key: id, id, name: `${r.name} ceiling`, category: "Slab", layer: "walls", level, system: "Architectural", axis: "z", poly, a0: top - 0.06, a1: top - 0.01, color: "porcelain", material: "Gypsum board ceiling, painted", phase: "finishes" });
  }
  const out = extra.length ? { ...scene, prisms: [...scene.prisms, ...extra] } : scene;
  m.set(level, out);
  return out;
}
