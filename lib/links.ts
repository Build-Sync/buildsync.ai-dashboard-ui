/**
 * lib/links.ts
 *
 * WHAT   Other projects shown inside this one, on the same parcel (a community):
 *        - a link (ProjectLink) keeps the other project separate: it is drawn here, moved to its place (an offset and
 *          a turn of 0° or 180°), read-only, and it updates as soon as that project is saved (in this tab, or another
 *          tab of this browser: linkRevision follows both);
 *        - a merged copy (MergedBlock) is a frozen copy of the other project's work at the moment it was merged: its
 *          elements become part of this project, so they can be moved, copied, hidden and deleted here, and it no
 *          longer follows the original;
 *        - withLinks / baseWithMerged add them to a scene (ids prefixed "LK1:", "MG1:"; names get the project's name;
 *          their rooms are tagged with the building, which the Room to Room menu sorts by),
 *          widen the ground to cover every lot, and list each lot's property line (scene.lots);
 *        - linkableProjects lists what can be linked (the samples, and every project with work saved in this
 *          browser); nextCommunityId / communityWork make a new community project with its links already in place.
 * FOR    sceneOf (lib/draw/scene-of.ts) and useScene, so the viewport, sheets, Model Explorer, Properties and
 *        selection all see linked buildings; the Links palette and the Link Project dialog edit project.links and
 *        project.merged through edit() (undoable, saved with the project).
 * DEBUG  - A linked building does not update: it changes when its project is *saved* (Ctrl+S or auto-save), not
 *          while it is being edited; both must be in the same mode (the demo and the app keep separate work).
 *        - Moving a linked building drags the whole link (commitMove); single linked elements cannot be edited: open
 *          the project, or Merge it to edit a copy here.
 *        - Linked gables and roofs turn only by 0° or 180° (they are extruded along Y).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { composeScene, xformPrism } from "./draw/compose";
import { affApply, type Aff } from "./draw/geom";
import type { DrawnItem, XForm } from "./draw/types";
import { readStored, workKey } from "./persist";
import { getScene } from "./scene";
import { buildElements } from "./scene/builder";
import type { Device, DoorSwing, Prism, RoomLabel, Run, Scene, SceneElement, Tree, V2, V3 } from "./scene/types";
import { isKnownProject, projectById } from "./services/projects";
import type { Project, SceneKind } from "./types";

/** Another project drawn here, kept separate and live. */
export interface ProjectLink {
  /** "LK1", "LK2" …: prefixes the ids of its elements here */
  id: string;
  projectId: string;
  name: string;
  /** where the other project's origin (0, 0) goes in this project, feet */
  at: V2;
  /** a turn of the whole project */
  rot: 0 | 180;
}

/** A frozen copy of another project's work, made part of this one. */
export interface MergedBlock {
  /** "MG1", "MG2" …: prefixes the ids of its elements here */
  id: string;
  projectId: string;
  name: string;
  sceneKind: SceneKind;
  at: V2;
  rot: 0 | 180;
  /** the other project's changes at the moment it was merged */
  work: { drawn: DrawnItem[]; xf: Record<string, XForm>; hidden: string[] };
  boundary?: V2[];
}

/** A property line drawn for a linked or merged project. */
export interface Lot {
  id: string;
  name: string;
  pts: V2[];
  linked: boolean;
}

/** Is this id an element of a linked project (read-only here)? */
export const isLinkedId = (id: string): boolean => /^LK\d+:/.test(id);
/** The link an element id belongs to ("LK1"), or null. */
export const linkOf = (id: string): string | null => /^(LK\d+):/.exec(id)?.[1] ?? null;

/* ── live updates ─────────────────────────────────────────────────────── */
let rev = 0;
const subs = new Set<() => void>();
/** A counter that goes up whenever a project's work is saved in this browser: linked buildings re-read it. */
export const linkRevision = {
  get: (): number => rev,
  subscribe: (fn: () => void): (() => void) => {
    subs.add(fn);
    return () => subs.delete(fn);
  },
  bump: (): void => {
    rev++;
    subs.forEach((f) => f());
  },
};
if (typeof window !== "undefined") {
  // a save in this tab (lib/persist.ts writeStored) and in another tab of this browser
  window.addEventListener("bs-work-saved", () => linkRevision.bump());
  window.addEventListener("storage", (e) => {
    if (e.key?.startsWith("bs.work.")) linkRevision.bump();
  });
}

/* ── reading the other project ────────────────────────────────────────── */
/** The other project's work as saved in this browser (or as shipped, for a sample nobody saved). */
export function sourceWork(mode: "app" | "demo", projectId: string): { project: Project; name: string; drawn: DrawnItem[]; xf: Record<string, XForm>; hidden: string[]; boundary?: V2[]; savedAt: number | null } | null {
  const p = projectById(projectId);
  if (!p) return null;
  const rec = readStored(mode, projectId);
  const saved = rec?.work.project as Partial<Project> | undefined;
  return {
    project: p,
    name: saved?.name ?? p.name,
    drawn: rec?.work.drawn ?? [],
    xf: rec?.work.xf ?? {},
    hidden: rec?.work.hidden ?? [],
    boundary: (saved?.site ?? p.site)?.boundary,
    savedAt: rec?.savedAt ?? null,
  };
}

/** Projects that can be linked here: the samples and every project with work saved in this browser, except `self`. */
export function linkableProjects(mode: "app" | "demo", self: string): { id: string; name: string; savedAt: number | null }[] {
  const ids = new Set<string>(["residence-2br-miami", "cottage-2br-1ba", "clinic-phase1-antigua"]);
  try {
    const prefix = workKey(mode, "");
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) ids.add(k.slice(prefix.length));
    }
  } catch {
    /* storage blocked: only the samples */
  }
  ids.delete(self);
  return [...ids]
    .filter((id) => isKnownProject(id) && !id.startsWith("community-"))
    .map((id) => {
      const w = sourceWork(mode, id);
      return { id, name: w?.name ?? id, savedAt: w?.savedAt ?? null };
    });
}

/* ── geometry ─────────────────────────────────────────────────────────── */
interface Block {
  prisms: Prism[];
  runs: Run[];
  devices: Device[];
  trees: Tree[];
  rooms: RoomLabel[];
  swings: DoorSwing[];
  lot?: Lot;
}

/** The other project's model moved to its place, every id prefixed and every name tagged with the project. */
function blockOf(prefix: string, name: string, kind: SceneKind, work: { drawn: DrawnItem[]; xf: Record<string, XForm>; hidden: string[] }, at: V2, rot: 0 | 180, boundary: V2[] | undefined, linked: boolean): Block {
  const comp = composeScene(getScene(kind), work.drawn, work.xf);
  const hidden = new Set(work.hidden);
  const aff: Aff = rot === 180 ? [-1, 0, 0, -1, at[0], at[1]] : [1, 0, 0, 1, at[0], at[1]];
  const X: XForm = { aff, dz: 0 };
  const P = (q: V2): V2 => affApply(aff, q);
  const P3 = (q: V3): V3 => [...P([q[0], q[1]]), q[2]];
  const tag = (n: string) => `${n} · ${name}`;
  return {
    prisms: comp.prisms
      .filter((p) => !p.terrain && !hidden.has(p.id))
      .map((p) => ({ ...xformPrism(p, X), id: `${prefix}:${p.id}`, key: `${prefix}:${p.key}`, name: tag(p.name) })),
    runs: comp.runs.filter((r) => !hidden.has(r.id)).map((r) => ({ ...r, id: `${prefix}:${r.id}`, pts: r.pts.map(P3), pick: false })),
    devices: comp.devices.filter((d) => !hidden.has(d.id)).map((d) => ({ ...d, id: `${prefix}:${d.id}`, at: P3(d.at), pick: false })),
    trees: comp.trees.filter((t) => !hidden.has(t.id)).map((t) => ({ ...t, id: `${prefix}:${t.id}`, at: P3(t.at), pick: false })),
    rooms: comp.rooms.map((r) => ({ ...r, id: `${prefix}:${r.id}`, at: P(r.at), building: { id: prefix, name } })),
    swings: comp.swings.map((s) => ({ ...s, id: `${prefix}:${s.id}`, hinge: P(s.hinge), a0: s.a0 + rot, a1: s.a1 + rot })),
    lot: boundary && boundary.length > 2 ? { id: prefix, name, pts: boundary.map(P), linked } : undefined,
  };
}

/** Add blocks to a scene: their prisms (as elements), runs, devices, trees, rooms and door swings, a ground wide enough for all, and their lots. */
function addBlocks(scene: Scene, blocks: Block[]): Scene {
  if (!blocks.length) return scene;
  const prisms = blocks.flatMap((b) => b.prisms);
  const elements = buildElements(prisms);
  const byId: Record<string, SceneElement> = { ...scene.elementById };
  for (const e of elements) byId[e.id] = e;
  // the ground: one terrain block wide enough for every building and lot, 25 ft beyond them
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const e of elements) {
    grow(e.min[0], e.min[1]);
    grow(e.max[0], e.max[1]);
  }
  for (const b of blocks) for (const q of b.lot?.pts ?? []) grow(q[0], q[1]);
  let base = scene.prisms;
  const terrain = base.filter((p) => p.terrain && p.axis === "z");
  if (terrain.length && Number.isFinite(x0)) {
    const tx = terrain.flatMap((p) => p.poly.map((q) => q[0]));
    const ty = terrain.flatMap((p) => p.poly.map((q) => q[1]));
    const nx0 = Math.min(Math.min(...tx), x0 - 25);
    const ny0 = Math.min(Math.min(...ty), y0 - 25);
    const nx1 = Math.max(Math.max(...tx), x1 + 25);
    const ny1 = Math.max(Math.max(...ty), y1 + 25);
    const t0 = terrain[0];
    base = [{ ...t0, poly: [[nx0, ny0], [nx1, ny0], [nx1, ny1], [nx0, ny1]] }, ...base.filter((p) => !p.terrain)];
    const te = byId[t0.id];
    if (te) byId[t0.id] = { ...te, min: [nx0, ny0, te.min[2]], max: [nx1, ny1, te.max[2]] };
  }
  const lots = blocks.map((b) => b.lot).filter((l): l is Lot => !!l);
  // a community (an empty parcel) frames its houses: footprint, centre and camera radius come from them
  let frame: Partial<Scene> = {};
  if (scene.kind === "blank" && Number.isFinite(x0)) {
    const built = elements.filter((e) => e.layer !== "landscape" && e.layer !== "utilities" && e.category !== "Paving");
    const bx0 = Math.min(...built.map((e) => e.min[0]));
    const by0 = Math.min(...built.map((e) => e.min[1]));
    const bx1 = Math.max(...built.map((e) => e.max[0]));
    const by1 = Math.max(...built.map((e) => e.max[1]));
    const hMax = Math.max(10, ...built.map((e) => e.max[2]));
    if (Number.isFinite(bx0)) frame = { footprint: { x0: bx0, y0: by0, x1: bx1, y1: by1 }, center: [(bx0 + bx1) / 2, (by0 + by1) / 2, hMax / 2 - 1], radius: Math.hypot((bx1 - bx0) / 2 + 12, (by1 - by0) / 2 + 12, hMax / 2 + 2) * 0.82 };
  }
  return {
    ...scene,
    ...frame,
    prisms: [...base, ...prisms],
    elements: [...scene.elements.map((e) => byId[e.id] ?? e), ...elements],
    elementById: byId,
    runs: [...scene.runs, ...blocks.flatMap((b) => b.runs)],
    devices: [...scene.devices, ...blocks.flatMap((b) => b.devices)],
    trees: [...scene.trees, ...blocks.flatMap((b) => b.trees)],
    rooms: [...scene.rooms, ...blocks.flatMap((b) => b.rooms)],
    swings: [...scene.swings, ...blocks.flatMap((b) => b.swings)],
    lots: [...(scene.lots ?? []), ...lots],
  };
}

const mergedCache = new WeakMap<Scene, { merged: MergedBlock[]; scene: Scene }>();

/** The built-in scene with the merged copies added: they join the base, so moves, copies and hiding work on them. */
export function baseWithMerged(base: Scene, merged: MergedBlock[] | undefined): Scene {
  if (!merged?.length) return base;
  const hit = mergedCache.get(base);
  if (hit && hit.merged === merged) return hit.scene;
  const scene = addBlocks(
    base,
    merged.map((m) => blockOf(m.id, m.name, m.sceneKind, m.work, m.at, m.rot, m.boundary, false)),
  );
  mergedCache.set(base, { merged, scene });
  return scene;
}

/** A scene with the linked projects drawn in: read-only, and as last saved. */
export function withLinks(scene: Scene, links: ProjectLink[] | undefined, mode: "app" | "demo"): Scene {
  if (!links?.length) return scene;
  const blocks: Block[] = [];
  for (const l of links) {
    const w = sourceWork(mode, l.projectId);
    if (!w) continue;
    blocks.push(blockOf(l.id, w.name, w.project.sceneKind, w, l.at, l.rot, w.boundary, true));
  }
  return addBlocks(scene, blocks);
}

/** The next free link or merge id ("LK3", "MG2"). */
export function nextBlockId(prefix: "LK" | "MG", taken: { id: string }[]): string {
  let n = 1;
  while (taken.some((t) => t.id === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** A merged (frozen, editable) copy of a link as it is now. */
export function mergeOf(mode: "app" | "demo", link: ProjectLink, id: string): MergedBlock | null {
  const w = sourceWork(mode, link.projectId);
  if (!w) return null;
  return { id, projectId: link.projectId, name: w.name, sceneKind: w.project.sceneKind, at: link.at, rot: link.rot, work: { drawn: w.drawn, xf: w.xf, hidden: w.hidden }, boundary: w.boundary };
}

/**
 * Where to put several projects on one parcel: side by side, `gap` feet apart, their lots' fronts on one line to the south. With `facing`, every
 * second one is turned 180° and set across a 40 ft street, so the two rows face each other.
 */
export function sideBySide(mode: "app" | "demo", ids: string[], gap: number, facing: boolean): { projectId: string; at: V2; rot: 0 | 180 }[] {
  const boxOf = (id: string) => {
    const w = sourceWork(mode, id);
    return lotBox(w?.boundary, w ? getScene(w.project.sceneKind).footprint : null);
  };
  const rowA = ids.filter((_, i) => !facing || i % 2 === 0);
  const rowB = facing ? ids.filter((_, i) => i % 2 === 1) : [];
  const out: { projectId: string; at: V2; rot: 0 | 180 }[] = [];
  // the lots' front (south) lines on one street line: the one that reaches furthest south stays where it is
  const boxesA = rowA.map(boxOf);
  const front = boxesA.length ? Math.min(...boxesA.map((b) => b.y0)) : 0;
  let x = 0;
  rowA.forEach((id, i) => {
    const b = boxesA[i];
    out.push({ projectId: id, at: [x - b.x0, front - b.y0], rot: 0 });
    x += b.x1 - b.x0 + gap;
  });
  // turned 180°, a lot spans x from at.x − x1 to at.x − x0 and y from at.y − y1 to at.y − y0
  let xb = 0;
  for (const id of rowB) {
    const b = boxOf(id);
    out.push({ projectId: id, at: [xb + b.x1, front - 40 + b.y0], rot: 180 });
    xb += b.x1 - b.x0 + gap;
  }
  return out;
}

/** The box of a lot (its property line, or the building with 20 ft around it). */
function lotBox(boundary: V2[] | undefined, fp: { x0: number; y0: number; x1: number; y1: number } | null): { x0: number; y0: number; x1: number; y1: number } {
  if (boundary && boundary.length > 2) {
    const xs = boundary.map((q) => q[0]);
    const ys = boundary.map((q) => q[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  const f = fp ?? { x0: 0, y0: 0, x1: 30, y1: 30 };
  return { x0: f.x0 - 20, y0: f.y0 - 20, x1: f.x1 + 20, y1: f.y1 + 20 };
}

/** The id for a new community: "community-N" with N not used by any open tab or saved project. */
export function nextCommunityId(mode: "app" | "demo", tabs: string[]): string {
  let n = 1;
  const used = (id: string) => {
    if (tabs.includes(id)) return true;
    try {
      return !!localStorage.getItem(workKey(mode, id));
    } catch {
      return false;
    }
  };
  while (used(`community-${n}`)) n++;
  return `community-${n}`;
}

/** The parcel around placed lots: the union of their boxes. */
export function parcelAround(mode: "app" | "demo", placed: { projectId: string; at: V2; rot: 0 | 180 }[]): V2[] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of placed) {
    const w = sourceWork(mode, p.projectId);
    const b = lotBox(w?.boundary, w ? getScene(w.project.sceneKind).footprint : null);
    const aff: Aff = p.rot === 180 ? [-1, 0, 0, -1, p.at[0], p.at[1]] : [1, 0, 0, 1, p.at[0], p.at[1]];
    for (const q of [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]] as V2[]) {
      const r = affApply(aff, q);
      x0 = Math.min(x0, r[0]);
      y0 = Math.min(y0, r[1]);
      x1 = Math.max(x1, r[0]);
      y1 = Math.max(y1, r[1]);
    }
  }
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}
