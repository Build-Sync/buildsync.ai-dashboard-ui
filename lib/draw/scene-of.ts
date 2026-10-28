/**
 * lib/draw/scene-of.ts
 *
 * WHAT   sceneOf(state): the composed scene (built-in scene + merged copies of other projects + everything the user
 *        drew + moves of built-in elements + the linked projects, lib/links.ts) for a workspace state, memoised on its
 *        inputs (and the link revision, which goes up when a linked project is saved) so repeated calls are free.
 * FOR    Commands, the store and tools read the scene through this instead of getScene(kind), which only knows
 *        the built-in model; useScene() in components/workspace/hooks.ts uses composeScene with React's memo.
 * DEBUG  - The scene looks stale after an edit: the cache key is the identity of `drawn` and `xf`, so an edit
 *          must replace those arrays / objects (the store's edit() does) rather than mutate them.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { baseWithMerged, linkRevision, withLinks, type MergedBlock, type ProjectLink } from "../links";
import { getScene } from "../scene";
import type { Scene } from "../scene/types";
import type { ProjectTerrain, SceneKind } from "../types";
import { composeScene } from "./compose";
import type { DrawnItem, XForm } from "./types";

/** What a scene is built from. */
interface SceneInput {
  project: { sceneKind: SceneKind; links?: ProjectLink[]; merged?: MergedBlock[]; terrain?: ProjectTerrain };
  drawn: DrawnItem[];
  xf: Record<string, XForm>;
  mode?: "app" | "demo";
  /** the link revision the caller rendered with (defaults to the current one) */
  rev?: number;
}

let last: { kind: SceneKind; drawn: DrawnItem[]; xf: Record<string, XForm>; links?: ProjectLink[]; merged?: MergedBlock[]; terrain?: ProjectTerrain; mode?: string; rev: number; scene: Scene } | null = null;

/** The scene of a workspace state: the built-in model with merged copies, the user's drawn items and moves, and the linked projects. */
export function sceneOf(s: SceneInput): Scene {
  const kind = s.project.sceneKind;
  const { links, merged, terrain } = s.project;
  const rev = links?.length ? (s.rev ?? linkRevision.get()) : 0;
  if (last && last.kind === kind && last.drawn === s.drawn && last.xf === s.xf && last.links === links && last.merged === merged && last.terrain === terrain && last.mode === s.mode && last.rev === rev) return last.scene;
  let scene = withLinks(composeScene(baseWithMerged(getScene(kind), merged), s.drawn, s.xf), links, s.mode ?? "demo");
  // an imported survey replaces the sample's contours
  if (terrain) scene = { ...scene, contours: terrain.contours, terrainGrid: { ...terrain.grid, seaLevel: terrain.seaLevel } };
  last = { kind, drawn: s.drawn, xf: s.xf, links, merged, terrain, mode: s.mode, rev, scene };
  return scene;
}
