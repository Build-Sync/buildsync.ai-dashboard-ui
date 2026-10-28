/**
 * lib/views.ts
 *
 * WHAT   The project's drawings as a list, the way Revit's Project Browser shows them: a floor plan per storey,
 *        all storeys side by side, the foundation plan (footings, slab, piers and the septic system, dashed where they
 *        are below ground), the site plan, the topography, the four elevations, the sections the user cut and every
 *        layout sheet. viewList builds that list from the store; openView shows one: a floor plan
 *        switches the model tab to 2D at that level, the others open their sheet and make it first (one undoable
 *        step) when it does not exist yet.
 *        underlayLevels says which other storeys the 2D plan draws faded under the active one (Underlay).
 * FOR    The Views tab of the Model Explorer, the level menu of the 2D viewport, the plan underlay of
 *        ModelViewport, and the VIEWPLANS / VIEWTOPO commands (lib/commands.ts).
 * DEBUG  - A view opens a new sheet every time: findSheet must recognise the existing one (kind, side, levels).
 *        - "Level 2" is missing: the list only shows the storeys the project has (project.levels).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { LevelKey } from "./scene/types";
import type { Sheet, WsState } from "./store/workspace-store";
import { applyChange } from "./draw/change";

/** A side of the building an elevation looks at. */
export type Side = "N" | "S" | "E" | "W";
/** The name of each side. */
export const SIDE_NAME: Record<Side, string> = { N: "North", S: "South", E: "East", W: "West" };

/** One drawing in the browser. */
export type ViewRef =
  | { kind: "plan"; level: LevelKey }
  | { kind: "plans" }
  | { kind: "site" }
  | { kind: "topo" }
  | { kind: "elevation"; dir: Side }
  | { kind: "sheet"; id: string }
  | { kind: "3d"; name: string };

/** A row of the browser: the drawing, its name and whether it is the one on screen. */
export interface ViewRow {
  ref: ViewRef;
  label: string;
  /** the sheet that already shows it, if any */
  sheet?: string;
  active: boolean;
  testId: string;
}

/** Groups of rows, in the order the browser shows them. */
export interface ViewGroup {
  id: "plans" | "site" | "elevations" | "sections" | "3d" | "sheets";
  label: string;
  rows: ViewRow[];
}

const PLAN_LEVELS: LevelKey[] = ["foundation", "level1", "level2", "roof"];

/** The storeys drawn faded under the plan of `level`: none, the next one down (up, from the lowest), or all the others. */
export function underlayLevels(level: LevelKey, show: "level" | "below" | "all", have: readonly string[]): LevelKey[] {
  // the foundation plan is not a storey: it is never drawn under another plan, nor gets one under it
  const storeys = PLAN_LEVELS.filter((l) => l !== "foundation" && have.includes(l));
  const i = storeys.indexOf(level);
  if (show === "level" || i < 0) return [];
  if (show === "all") return storeys.filter((l) => l !== level);
  return i > 0 ? [storeys[i - 1]] : storeys.length > 1 ? [storeys[1]] : [];
}

/** The plans of the project, lowest first: the foundation plan, each storey, the roof. */
export function planLevels(s: Pick<WsState, "project">): LevelKey[] {
  const ids = new Set(s.project.levels.map((l) => l.id));
  return PLAN_LEVELS.filter((l) => ids.has(l));
}

/** The name of a level in this project ("Level 2"). */
export const levelName = (s: Pick<WsState, "project">, level: LevelKey): string => s.project.levels.find((l) => l.id === level)?.name ?? level;

/** The sheet that already shows a drawing, if there is one. */
export function findSheet(sheets: Sheet[], ref: ViewRef): Sheet | undefined {
  switch (ref.kind) {
    case "plans":
      return sheets.find((x) => x.kind === "plan" && (x.view?.levels?.length ?? 0) > 1);
    case "site":
      return sheets.find((x) => x.kind === "site");
    case "topo":
      return sheets.find((x) => x.kind === "topo");
    case "elevation":
      return sheets.find((x) => x.kind === "elevation" && x.view?.dir === ref.dir && !x.view.cut);
    case "sheet":
      return sheets.find((x) => x.id === ref.id);
    default:
      return undefined;
  }
}

/** The next free sheet id with a prefix ("EL-1", "EL-2" …). */
export function nextSheetId(sheets: Sheet[], prefix: string): string {
  let n = 1;
  while (sheets.some((x) => x.id === `${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

/** A new sheet for a drawing that has none yet. */
function newSheet(s: WsState, ref: ViewRef): Sheet | null {
  switch (ref.kind) {
    case "plans": {
      const id = nextSheetId(s.sheets, "PL");
      const levels = planLevels(s).filter((l) => l !== "foundation");
      return { id, name: `${id} Floor Plans`, kind: "plan", view: { dir: "S", title: `FLOOR PLANS · ${levels.map((l) => levelName(s, l).toUpperCase()).join(" · ")}`, levels }, user: true };
    }
    case "site": {
      const id = nextSheetId(s.sheets, "SP");
      return { id, name: `${id} Site Plan`, kind: "site", view: { dir: "S", title: "SITE PLAN · TOPOGRAPHY" }, user: true };
    }
    case "topo": {
      const id = nextSheetId(s.sheets, "TP");
      return { id, name: `${id} Topography`, kind: "topo", view: { dir: "S", title: "TOPOGRAPHY · EXISTING GRADE" }, user: true };
    }
    case "elevation": {
      const id = nextSheetId(s.sheets, "EL");
      return { id, name: `${id} ${SIDE_NAME[ref.dir]} Elevation`, kind: "elevation", view: { dir: ref.dir, title: `${SIDE_NAME[ref.dir].toUpperCase()} ELEVATION` }, user: true };
    }
    default:
      return null;
  }
}

/** Show a drawing: a floor plan or 3D view in the model tab, anything else on its sheet (made first if needed). Returns what was opened. */
export function openView(s: WsState, ref: ViewRef): string {
  if (ref.kind === "plan") {
    s.setLayoutTab("model");
    s.setView("2d");
    s.setPlan({ level: ref.level });
    return levelName(s, ref.level);
  }
  if (ref.kind === "3d") {
    s.setLayoutTab("model");
    s.goToNamedView(ref.name);
    return ref.name;
  }
  const have = findSheet(s.sheets, ref);
  if (have) {
    s.setLayoutTab(have.id);
    return have.name;
  }
  const sheet = newSheet(s, ref);
  if (!sheet) return "";
  s.edit(sheet.name, (st) => applyChange(st, { addSheets: [sheet], openSheet: sheet.id }));
  return sheet.name;
}

/** Everything the Views browser lists, with the one on screen marked. */
export function viewList(s: Pick<WsState, "project" | "sheets" | "layoutTab" | "view" | "plan">): ViewGroup[] {
  const model = s.layoutTab === "model";
  const on = (sheet?: Sheet) => !!sheet && s.layoutTab === sheet.id;
  const plans: ViewRow[] = planLevels(s).map((level) => ({
    ref: { kind: "plan", level },
    label: level === "foundation" ? "Foundation Plan" : levelName(s, level),
    active: model && s.view === "2d" && s.plan.level === level,
    testId: `view-plan-${level}`,
  }));
  if (plans.filter((p) => p.ref.kind === "plan" && p.ref.level !== "foundation").length > 1) {
    const sh = findSheet(s.sheets, { kind: "plans" });
    plans.push({ ref: { kind: "plans" }, label: "All Levels (side by side)", sheet: sh?.id, active: on(sh), testId: "view-plans" });
  }
  const site = findSheet(s.sheets, { kind: "site" });
  const topo = findSheet(s.sheets, { kind: "topo" });
  const elevations: ViewRow[] = (["N", "S", "E", "W"] as Side[]).map((dir) => {
    const sh = findSheet(s.sheets, { kind: "elevation", dir });
    return { ref: { kind: "elevation", dir }, label: `${SIDE_NAME[dir]} Elevation`, sheet: sh?.id, active: on(sh), testId: `view-elev-${dir}` };
  });
  const sections: ViewRow[] = s.sheets
    .filter((x) => x.kind === "section")
    .map((x) => ({ ref: { kind: "sheet", id: x.id }, label: x.name, sheet: x.id, active: on(x), testId: `view-sheet-${x.id}` }));
  const views3d: ViewRow[] = ["SW Isometric", "SE Isometric", "NE Isometric", "NW Isometric"].map((name) => ({
    ref: { kind: "3d", name },
    label: name,
    active: false,
    testId: `view-3d-${name.slice(0, 2).toLowerCase()}`,
  }));
  const sheets: ViewRow[] = s.sheets.map((x) => ({ ref: { kind: "sheet", id: x.id }, label: x.name, sheet: x.id, active: on(x), testId: `view-sheet-${x.id}` }));
  return [
    { id: "plans", label: "Floor Plans", rows: plans },
    {
      id: "site",
      label: "Site",
      rows: [
        { ref: { kind: "site" }, label: "Site Plan", sheet: site?.id, active: on(site), testId: "view-site" },
        { ref: { kind: "topo" }, label: "Topography", sheet: topo?.id, active: on(topo), testId: "view-topo" },
      ],
    },
    { id: "elevations", label: "Elevations", rows: elevations },
    { id: "sections", label: "Sections", rows: sections },
    { id: "3d", label: "3D Views", rows: views3d },
    { id: "sheets", label: "Sheets", rows: sheets },
  ];
}
