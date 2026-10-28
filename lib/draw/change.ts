/**
 * lib/draw/change.ts
 *
 * WHAT   One description of "what a tool changed" (Change) and the function that turns it into a store update
 *        (applyChange), so every tool, command and dialog edits the model the same way: add, replace and remove
 *        drawn items, set or clear the move / rotate / scale of built-in elements, hide built-in elements and
 *        patch the per-element maps (types, colours, materials, groups), and set the site (its place on the map
 *        and the property line). Also deleteChange (what DELETE does:
 *        removes drawn items and the doors, windows and framing that depended on them; hides built-in ones).
 * FOR    workspace.edit(label, (s) => applyChange(s, change)) gives undo / redo and the unsaved-changes flag for
 *        free. Used by lib/draw/tools.ts, modify.ts and lib/commands.ts.
 * DEBUG  - A delete leaves a door behind: dependents are found through item.p.host / p.pick; add new host
 *          references there.
 *        - An edit is not undoable: it bypassed edit(); route it through edit() with applyChange.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { SiteGeo } from "../geo";
import type { MergedBlock, ProjectLink } from "../links";
import type { Sheet, WsState } from "../store/workspace-store";
import type { DrawnItem, XForm } from "./types";

/** A model edit: everything optional, applied together as one undo step. */
export interface Change {
  add?: DrawnItem[];
  /** replace drawn items that already exist (matched by id) */
  replace?: DrawnItem[];
  remove?: string[];
  /** set (or, with null, clear) the move / rotate / scale of built-in elements */
  xf?: Record<string, XForm | null>;
  /** hide built-in elements (the way a built-in element is deleted) */
  hide?: string[];
  /** per-element maps to replace */
  set?: Partial<Pick<WsState, "types" | "elColors" | "materialOverrides" | "renames" | "groups" | "locked">>;
  /** new layout sheets (elevation, section and site views), and the one to open */
  addSheets?: Sheet[];
  openSheet?: string;
  /** the site: where it is on the map and its property line (null removes it) */
  site?: SiteGeo | null;
  /** the linked projects and the merged copies (replace the whole lists) */
  links?: ProjectLink[];
  merged?: MergedBlock[];
}

/** The store update for a change. */
export function applyChange(s: WsState, ch: Change): Partial<WsState> {
  let drawn = s.drawn;
  const gone = new Set(ch.remove ?? []);
  if (gone.size) drawn = drawn.filter((i) => !gone.has(i.id));
  if (ch.replace?.length) {
    const byId = new Map(ch.replace.map((i) => [i.id, i]));
    drawn = drawn.map((i) => byId.get(i.id) ?? i);
  }
  if (ch.add?.length) drawn = [...drawn, ...ch.add];
  const out: Partial<WsState> = { drawn };
  if (ch.xf) {
    const xf = { ...s.xf };
    for (const [id, v] of Object.entries(ch.xf)) {
      if (v) xf[id] = v;
      else delete xf[id];
    }
    out.xf = xf;
  }
  if (ch.hide?.length) out.hidden = Array.from(new Set([...s.hidden, ...ch.hide]));
  if (ch.set) Object.assign(out, ch.set);
  if (ch.addSheets?.length) out.sheets = [...s.sheets, ...ch.addSheets];
  if (ch.openSheet) out.layoutTab = ch.openSheet;
  if (ch.site !== undefined || ch.links || ch.merged) {
    const project = { ...(out.project ?? s.project) };
    if (ch.site) project.site = ch.site;
    else if (ch.site === null) delete project.site;
    if (ch.links) project.links = ch.links;
    if (ch.merged) project.merged = ch.merged;
    out.project = project;
  }
  if (gone.size || ch.hide?.length) {
    const dead = new Set([...gone, ...(ch.hide ?? [])]);
    out.selection = s.selection.filter((id) => !dead.has(id));
    const groups: Record<string, string[]> = {};
    for (const [g, ids] of Object.entries(ch.set?.groups ?? s.groups)) {
      const left = ids.filter((id) => !dead.has(id));
      if (left.length > 1) groups[g] = left;
    }
    out.groups = groups;
  }
  return out;
}

/** What deleting these ids does: drawn items go (with whatever hangs on them), built-in elements are hidden. */
export function deleteChange(s: WsState, ids: string[]): Change {
  const drawnIds = new Set(s.drawn.map((i) => i.id));
  const remove = new Set(ids.filter((id) => drawnIds.has(id)));
  // doors, windows, framing and trusses hosted on something that is going away go with it, and so do the wires
  // and pipes of a fixture that goes
  for (const it of s.drawn) {
    const host = it.p.host;
    if (typeof host === "string" && (ids.includes(host) || remove.has(host))) remove.add(it.id);
    if ((it.kind === "wire" || it.kind === "pipelink") && (remove.has(String(it.p.from)) || remove.has(String(it.p.to)))) remove.add(it.id);
  }
  return { remove: [...remove], hide: ids.filter((id) => !drawnIds.has(id)) };
}
