/**
 * lib/persist.ts
 *
 * WHAT   Saving a project's work. snapshotOf(state) captures what the user changed (drawn items, moves of built-in
 *        elements, hidden / locked / isolated, names, colours, materials, types, groups and the project record
 *        without its version list) as SavedWork; workPatch(work, project) turns a snapshot back into a store
 *        update. readStored / writeStored keep one record per project in localStorage (key
 *        bs.work.<mode>.<projectId>): the latest work plus the version list with a snapshot per version.
 *        summarize() describes what changed between two snapshots ("+3 drawn · 1 changed"). exportBsd /
 *        parseBsd write and read the .bsd project file (JSON) that Save As downloads and Open File loads.
 * FOR    The workspace store's save / loadSaved / restoreVersion / importWork actions, the Versions palette and
 *        the SAVEAS and OPENFILE commands.
 * DEBUG  - Work is not restored after a reload: the key includes the mode (app or demo) and the project id; the
 *          browser may block localStorage (private window), in which case Save reports it and Save As still
 *          downloads a file.
 *        - "Couldn't save": the record is larger than the storage quota; delete old versions in the Versions
 *          palette (only the 20 newest versions keep a snapshot).
 *        - A .bsd file will not open: it must be JSON with format "buildsync-bsd" and a `work` object whose
 *          scene kind matches the open project.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { SavedWork } from "./draw/types";
import { DEFAULT_APPEARANCE } from "./scene/types";
import type { WsState } from "./store/workspace-store";
import type { Project, VersionRecord } from "./types";

/** The file format name written into every .bsd file. */
export const BSD_FORMAT = "buildsync-bsd";
/** Most versions that keep a full snapshot (older ones stay in the list without one). */
export const MAX_SNAPSHOTS = 20;
const MAX_BYTES = 4_500_000;

/** localStorage key of a project's saved work. */
export const workKey = (mode: "app" | "demo", projectId: string): string => `bs.work.${mode}.${projectId}`;

/** What is kept for one project in storage. */
export interface StoredWork {
  work: SavedWork;
  /** the versions saved by the user, newest first */
  versions: VersionRecord[];
  /** true when the work was written as a draft (closed with unsaved changes) */
  dirty: boolean;
  savedAt: number;
}

/** Capture everything the user changed in a project. */
export function snapshotOf(s: Pick<WsState, "project" | "drawn" | "xf" | "hidden" | "locked" | "isolated" | "renames" | "materialOverrides" | "colors" | "elColors" | "types" | "groups"> & { sheets?: WsState["sheets"] }): SavedWork {
  const project = { ...s.project } as Partial<Project>;
  delete project.versions;
  return {
    v: 1,
    projectId: s.project.id,
    at: Date.now(),
    drawn: s.drawn,
    xf: s.xf,
    hidden: s.hidden,
    locked: s.locked,
    isolated: s.isolated,
    renames: s.renames,
    materialOverrides: s.materialOverrides,
    colors: s.colors,
    elColors: s.elColors,
    types: s.types,
    groups: s.groups,
    project,
    ...(s.sheets ? { sheets: s.sheets } : {}),
  };
}

/** The store update that puts a snapshot back (the version list of `project` is kept). */
export function workPatch(work: SavedWork, project: Project): Partial<WsState> {
  const saved = work.project as Partial<Project> | undefined;
  const merged: Project = saved && typeof saved === "object" && Array.isArray(saved.layers) ? ({ ...project, ...saved, versions: project.versions } as Project) : project;
  // a layer added since the work was saved (Roads & Drainage …) joins the saved list
  const missing = project.layers.filter((l) => !merged.layers.some((m) => m.id === l.id));
  if (missing.length) merged.layers = [...merged.layers, ...missing];
  return {
    project: merged,
    drawn: work.drawn ?? [],
    xf: work.xf ?? {},
    hidden: work.hidden ?? [],
    locked: work.locked ?? [],
    isolated: work.isolated ?? null,
    renames: work.renames ?? {},
    materialOverrides: work.materialOverrides ?? {},
    colors: { ...DEFAULT_APPEARANCE, ...(work.colors as Partial<WsState["colors"]>) },
    elColors: work.elColors ?? {},
    types: work.types ?? {},
    groups: work.groups ?? {},
    selection: [],
    ...(Array.isArray(work.sheets) ? { sheets: work.sheets } : {}),
  };
}

const isWork = (w: unknown, projectId?: string): w is SavedWork => {
  const x = w as Partial<SavedWork> | null;
  return !!x && x.v === 1 && Array.isArray(x.drawn) && typeof x.projectId === "string" && (projectId === undefined || x.projectId === projectId);
};

/** The saved record of a project, or null (nothing saved, storage blocked, or the data is not valid). */
export function readStored(mode: "app" | "demo", projectId: string): StoredWork | null {
  try {
    const raw = localStorage.getItem(workKey(mode, projectId));
    if (!raw) return null;
    const rec = JSON.parse(raw) as Partial<StoredWork>;
    if (!isWork(rec.work, projectId)) return null;
    return { work: rec.work, versions: Array.isArray(rec.versions) ? rec.versions : [], dirty: !!rec.dirty, savedAt: typeof rec.savedAt === "number" ? rec.savedAt : rec.work.at };
  } catch {
    return null;
  }
}

/** Write a project's record. Returns false when storage is blocked or full. */
export function writeStored(mode: "app" | "demo", projectId: string, rec: StoredWork): boolean {
  try {
    const text = JSON.stringify(rec);
    if (text.length > MAX_BYTES) return false;
    localStorage.setItem(workKey(mode, projectId), text);
    // projects that link this one redraw it (lib/links.ts); other tabs hear the storage event instead
    try {
      window.dispatchEvent(new CustomEvent("bs-work-saved", { detail: workKey(mode, projectId) }));
    } catch {
      /* no window (tests): nothing listens */
    }
    return true;
  } catch {
    return false;
  }
}

/** Remove a project's saved record. */
export function clearStored(mode: "app" | "demo", projectId: string): void {
  try {
    localStorage.removeItem(workKey(mode, projectId));
  } catch {
    /* blocked storage: nothing to remove */
  }
}

/** A short description of what changed from `prev` to `next` ("+3 drawn · 1 changed · 2 moved"). */
export function summarize(prev: SavedWork | null | undefined, next: SavedWork): string {
  const before = new Map((prev?.drawn ?? []).map((i) => [i.id, JSON.stringify(i)]));
  const after = new Map(next.drawn.map((i) => [i.id, JSON.stringify(i)]));
  let added = 0;
  let changed = 0;
  for (const [id, json] of after) {
    if (!before.has(id)) added++;
    else if (before.get(id) !== json) changed++;
  }
  let removed = 0;
  for (const id of before.keys()) if (!after.has(id)) removed++;
  const moved = Object.keys(next.xf).filter((id) => JSON.stringify(next.xf[id]) !== JSON.stringify(prev?.xf?.[id])).length;
  const hid = next.hidden.filter((id) => !(prev?.hidden ?? []).includes(id)).length;
  const parts = [
    added && `+${added} drawn`,
    removed && `−${removed} deleted`,
    changed && `${changed} changed`,
    moved && `${moved} moved`,
    hid && `${hid} hidden`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : prev ? "No model changes" : `${next.drawn.length} drawn item${next.drawn.length === 1 ? "" : "s"}`;
}

/** The text of a .bsd project file: the current work and the versions that still have a snapshot. */
export function exportBsd(work: SavedWork, versions: VersionRecord[]): string {
  return JSON.stringify({ format: BSD_FORMAT, v: 1, exportedAt: new Date().toISOString(), work, versions: versions.filter((v) => v.ts) }, null, 2);
}

/** Read a .bsd file's text; null when it is not a BuildSync project file. */
export function parseBsd(text: string): { work: SavedWork; versions: VersionRecord[] } | null {
  try {
    const f = JSON.parse(text) as { format?: string; work?: unknown; versions?: VersionRecord[] };
    if (f.format !== BSD_FORMAT || !isWork(f.work)) return null;
    return { work: f.work, versions: Array.isArray(f.versions) ? f.versions.filter((v) => v && typeof v.id === "string" && typeof v.ts === "number") : [] };
  } catch {
    return null;
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (n: number) => String(n).padStart(2, "0");

/** "Oct 27, 14:32" in the viewer's time zone (call it on the client only). */
export function stamp(ts: number): string {
  const d = new Date(ts);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** "just now", "5 min ago", "3 h ago", or the stamp for older saves. */
export function ago(ts: number, now: number): string {
  const m = Math.floor((now - ts) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.floor(m / 60)} h ago`;
  return stamp(ts);
}
