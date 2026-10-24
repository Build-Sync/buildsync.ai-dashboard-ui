import {
  EXPLORER_IDS,
  PALETTE_IDS,
  RIBBON_TAB_IDS,
  VIEW_MODES,
  type ExplorerId,
  type PaletteId,
  type RibbonTabId,
  type ViewMode,
} from "./types";

/* Workspace UI state that lives in the URL query (spec §8.1 routing rule 2). */

export interface WorkspaceQuery {
  tab: RibbonTabId;
  panel: PaletteId;
  explorer: ExplorerId;
  view: ViewMode;
  section: boolean;
  /** "start" shows the Start tab instead of the open project */
  doc: "project" | "start";
  /** /demo only: which sample project is open */
  project: string | null;
}

export const DEFAULT_QUERY: WorkspaceQuery = {
  tab: "home",
  panel: "properties",
  explorer: "model",
  view: "3d",
  section: false,
  doc: "project",
  project: null,
};

type Raw = Record<string, string | string[] | undefined> | URLSearchParams;

function pick(raw: Raw, key: string): string | undefined {
  if (raw instanceof URLSearchParams) return raw.get(key) ?? undefined;
  const v = raw[key];
  return Array.isArray(v) ? v[0] : v;
}

function oneOf<T extends string>(list: readonly T[], v: string | undefined, fallback: T): T {
  return v && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function parseQuery(raw: Raw): WorkspaceQuery {
  const section = pick(raw, "section");
  const doc = pick(raw, "doc");
  return {
    tab: oneOf(RIBBON_TAB_IDS, pick(raw, "tab"), DEFAULT_QUERY.tab),
    panel: oneOf(PALETTE_IDS, pick(raw, "panel"), DEFAULT_QUERY.panel),
    explorer: oneOf(EXPLORER_IDS, pick(raw, "explorer"), DEFAULT_QUERY.explorer),
    view: oneOf(VIEW_MODES, pick(raw, "view"), DEFAULT_QUERY.view),
    section: section === "1" || section === "true",
    doc: doc === "start" ? "start" : "project",
    project: pick(raw, "project") ?? null,
  };
}

/** True when the URL carries any workspace parameter. */
export function hasWorkspaceParams(raw: Raw): boolean {
  return ["tab", "panel", "explorer", "view", "section", "doc"].some((k) => pick(raw, k) !== undefined);
}

/** Serialize only non-default values so URLs stay short and shareable. */
export function serializeQuery(q: WorkspaceQuery): string {
  const p = new URLSearchParams();
  if (q.project) p.set("project", q.project);
  if (q.doc !== DEFAULT_QUERY.doc) p.set("doc", q.doc);
  if (q.view !== DEFAULT_QUERY.view) p.set("view", q.view);
  if (q.tab !== DEFAULT_QUERY.tab) p.set("tab", q.tab);
  if (q.panel !== DEFAULT_QUERY.panel) p.set("panel", q.panel);
  if (q.explorer !== DEFAULT_QUERY.explorer) p.set("explorer", q.explorer);
  if (q.section) p.set("section", "1");
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function sameQuery(a: WorkspaceQuery, b: WorkspaceQuery): boolean {
  return serializeQuery(a) === serializeQuery(b);
}
