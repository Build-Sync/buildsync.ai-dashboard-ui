/**
 * lib/store/workspace-store.ts
 *
 * WHAT   Per-project workspace state: everything the CAD screen needs (ribbon tab, palette, explorer, 2D / 3D,
 *        camera and plan, selection, hidden / locked / isolated elements, colours and renames, toggles, docks,
 *        modal, timeline, stress and simulation results, comments, issues, proposals, undo / redo) and the
 *        actions that change it. Also the arrangement of the dockable windows (lib/layout.ts): their size
 *        (`dockSize`: normal, large or header only), a dragged width / height (`dockPx`), the side they sit on
 *        (`dockSide`), the order of the bottom ones, which palette and explorer tabs show, and the interface in use
 *        (`iface`); everything the user drew (`drawn`) and moved (`xf`), the running drawing tool (`session`,
 *        `toolOpts`, `measure`), and saving: save / loadSaved / restoreVersion write and read the project's
 *        browser record (lib/persist.ts). Layout sheets include the elevations, sections and site plans the
 *        user made (Sheet.view), topography and all-levels plan sheets; adding and closing them is undoable. View
 *        switches that are not edits: `planShow` (other storeys faded under the 2D plan), `labels` (room names
 *        and place labels), `furnLabels` (furniture names), `mepLook` (plumbing as dotted lines or pipes,
 *        electrical as dashed lines or wires) and the room view (`insideRoom`: the camera's `eye` stands in a room;
 *        `outsideCamera` is the view to go back to). The site (where it is on the map, its property line) is
 *        project.site, edited through edit() like the model. One store per (mode, project), cached in the browser so switching document tabs
 *        keeps edits.
 * FOR    useWs / useWsApi in components (lib/store/workspace-provider.tsx) and CommandCtx in lib/commands.ts.
 *        Model edits go through edit(label, fn), which records an undo entry (snapshot of the model part, up to
 *        50) and marks the project dirty.
 * DEBUG  - Undo does nothing: only changes made through edit() are undoable; plain set() calls (selection,
 *          camera) are not. Drawing tools commit through edit() too (applyChange in lib/draw/change.ts).
 *        - Work is gone after a reload: save() writes bs.work.<mode>.<projectId>; loadSaved() puts it back once
 *          after mount (Workspace.tsx). Closing with unsaved changes writes a draft (flushDraft).
 *        - A window is the wrong size: dockSize (lib/layout.ts); the timeline's `open` flag follows it.
 *        - Edits made quickly are merged into one undo step: edit(..., { coalesce: true }) within 1.5 s of the
 *          same label.
 *        - State lost on tab switch: the cache key is `mode:projectId`; a different mode or id is a different
 *          store.
 *        - The URL and the store disagree: only tab, panel, explorer, view, section and doc are mirrored
 *          (UrlMirror in workspace-provider.tsx).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { createStore, type StoreApi } from "zustand/vanilla";
import {
  HOME_CAMERA,
  NAMED_VIEWS,
  normBearing,
  type Camera,
} from "../scene/camera";
import { DEFAULT_APPEARANCE, type AppearanceKey, type AppearanceMap, type LevelKey } from "../scene/types";
import { getScene } from "../scene";
import type { Cut } from "../scene/render";
import type { DrawnItem, MeasureResult, ToolSession, XForm } from "../draw/types";
import { sceneOf } from "../draw/scene-of";
import {
  convene,
  runAiAnalysis,
  runSimulation,
  runStressTest,
  SIM_TYPES,
  type CouncilResult,
  type Recommendation,
  type SimResult,
  type SimSetup,
  type StressResult,
  type StressSetup,
} from "../services/analysis";
import { DEFAULT_ARRANGEMENT, DEFAULT_DOCK_SIZE, cloneArrangement, nextDockSize, type Arrangement, type BottomDock, type DockSize, type Side, type SideDock } from "../layout";
import { MAX_SNAPSHOTS, readStored, snapshotOf, stamp, summarize, workPatch, writeStored, type StoredWork } from "../persist";
import { windowFor, buildSchedule } from "../timeline";
import type {
  AgentId,
  Comment,
  ExplorerId,
  HistoryKind,
  HealthSnapshot,
  LayerId,
  PaletteId,
  Project,
  Proposal,
  RibbonTabId,
  Toast,
  VersionRecord,
  TimelineWindow,
  ViewMode,
  VisualStyle,
} from "../types";
import { clamp, uid } from "../utils";
import type { WorkspaceQuery } from "../workspace-query";

/* Per-project workspace state: everything the CAD screen needs. One store per
 * (mode, project) pair, cached on the client so switching document tabs keeps edits. */

/** The navigation tool chosen on the navigation bar. */
export type NavTool = "select" | "pan" | "zoom" | "orbit" | "walk";
/** Status-bar drafting toggles. */
export type ToggleKey = "model" | "grid" | "snap" | "ortho" | "polar" | "osnap" | "otrack" | "osnap3d" | "dyn" | "lwt";
/** What else the 2D plan shows besides the active level: nothing, the level below (faded), or every level. */
export type PlanShow = "level" | "below" | "all";
/** Dockable areas that can be shown or hidden. */
export type DockKey = "explorer" | "palettes" | "timeline" | "cmdline";

/** Ids of the workspace dialogs. */
export type ModalId =
  | "project-info"
  | "import"
  | "pe-signoff"
  | "jurisdiction"
  | "new-project"
  | "share"
  | "p2p"
  | "export"
  | "start-free"
  | "change-plan"
  | "invite"
  | "shortcuts-help"
  | "schedule"
  | "qto"
  | "approvals"
  | "interfaces"
  | "button-guide"
  | "link-project"
  | "place";
/** The open dialog and its data. */
export interface ModalState {
  id: ModalId;
  data?: Record<string, string | number | boolean>;
}

/** A paper-space layout sheet. */
export interface Sheet {
  id: string;
  name: string;
  /** plan · section · structural · elevation · site (site plan) · topo (topography: contours shaded by height) */
  kind: "plan" | "section" | "structural" | "elevation" | "site" | "topo";
  /** what an Elevation, Section, Site Plan, Topography or floor plan view shows (lib/draw/tools.ts, lib/views.ts make them) */
  view?: SheetViewDef;
  /** made by the user: its tab can be closed */
  user?: boolean;
}

/** An elevation or section: the side the camera stands on, an optional cut, and the title on the sheet. */
export interface SheetViewDef {
  /** the side of the building the camera stands on: N looks south at the north face */
  dir: "N" | "S" | "E" | "W";
  cut?: Cut;
  title: string;
  /** a plan sheet: the levels it draws, one plan each, side by side */
  levels?: LevelKey[];
  /** an elevation along a line at any angle or around a circle: the id of its mark on the plan (an "elevline" or
   *  "elevarc" drawn item, lib/elevation.ts); the sheet follows the mark when it is dragged or edited */
  mark?: string;
}

/** Callbacks into the global store (toast, log, dirty flag) passed in when a store is created. */
export interface WorkspaceHooks {
  toast: (text: string, tone?: Toast["tone"]) => void;
  log: (kind: HistoryKind, text: string) => void;
  setDirty: (projectId: string, dirty: boolean) => void;
}

interface ModelSnapshot {
  project: Project;
  colors: AppearanceMap;
  renames: Record<string, string>;
  hidden: string[];
  locked: string[];
  isolated: string[] | null;
  materialOverrides: Record<string, string>;
  drawn: DrawnItem[];
  xf: Record<string, XForm>;
  elColors: Record<string, string>;
  types: Record<string, string>;
  groups: Record<string, string[]>;
  sheets: Sheet[];
}

interface UndoEntry {
  label: string;
  snap: ModelSnapshot;
}

/** State of the timeline dock. */
export interface TimelineState {
  open: boolean;
  window: TimelineWindow | null;
  playing: boolean;
  zoom: "day" | "week" | "month";
}

/** State and actions of a workspace store. */
export interface WsState {
  mode: "app" | "demo";
  project: Project;

  /* URL-mirrored */
  tab: RibbonTabId;
  panel: PaletteId;
  explorer: ExplorerId;
  view: ViewMode;
  section: boolean;
  doc: "project" | "start";
  demoProject: string | null;

  /* viewport */
  camera: Camera;
  plan: { rotation: number; zoom: number; panX: number; panY: number; level: LevelKey };
  /** the 2D plan also shows the level below, or every level, faded under the active one */
  planShow: PlanShow;
  /** place labels and the property line's course labels in the views (the Labels switch) */
  labels: boolean;
  /** room names and areas in the plan, in 3D and on plan sheets (the Room Names switch) */
  roomLabels: boolean;
  /** the 3D view shows what is below ground (footings, the septic system) through a see-through ground */
  belowGrade: boolean;
  /** the 3D Cutaway: the model cut 4 ft above the active level's floor, so rooms and furniture show from above */
  cutaway: boolean;
  /** how plumbing and electrical runs look: drawing lines (dotted / dashed) or the pipes and wires themselves */
  mepLook: { plumbing: "lines" | "pipes"; electrical: "lines" | "wires" };
  /** furniture names in the plan and in 3D (the Furniture Names switch) */
  furnLabels: boolean;
  /** standing inside a room (the room view: the camera has an `eye`): which room, and the 3D view to go back to */
  insideRoom: string | null;
  outsideCamera: Camera | null;
  /** the Site palette's map: its radius in miles and its base map */
  mapView: { radius: number; base: "satellite" | "streets" };
  styleOverride: VisualStyle | null;
  sectionY: number;
  navTool: NavTool;
  layoutTab: string;
  sheets: Sheet[];
  rulers: boolean;
  guides: boolean;
  fullscreen: boolean;
  solar: boolean;
  clashOverlay: boolean;
  sectionBox: boolean;
  cursor: { x: number; y: number; z: number } | null;
  /** one-shot request for the viewport to frame some elements */
  focus: { ids: string[]; n: number } | null;

  /* toggles + docks */
  toggles: Record<ToggleKey, boolean>;
  docks: Record<DockKey, boolean>;
  /** how much room each shown window takes: normal, large, or just its header */
  dockSize: Record<DockKey, DockSize>;
  /** a width (side windows) or height (bottom windows) dragged on the window's edge, in px; the normal size uses it */
  dockPx: Partial<Record<DockKey, number>>;
  /** the edge each side window sits on */
  dockSide: Record<SideDock, Side>;
  /** the bottom windows from top to bottom */
  bottomOrder: BottomDock[];
  /** palette tabs shown, in order (View → Interfaces, or the × on a tab) */
  paletteTabs: PaletteId[];
  /** explorer tabs shown, in order */
  explorerTabs: ExplorerId[];
  /** the interface (saved arrangement) last applied, lib/layout.ts */
  iface: string | null;

  /* selection and visibility */
  selection: string[];
  hover: string | null;
  hidden: string[];
  locked: string[];
  isolated: string[] | null;
  renames: Record<string, string>;
  materialOverrides: Record<string, string>;
  materialHighlight: string | null;
  colors: AppearanceMap;
  activeTool: string | null;
  toolPrompt: string | null;

  /* drawing: what the user drew, moves of built-in elements, the command in progress */
  /** everything the user drew (lib/draw); the scene shown is composeScene(built-in scene, drawn, xf) */
  drawn: DrawnItem[];
  /** move / rotate / scale of built-in elements by id */
  xf: Record<string, XForm>;
  /** colour of single elements (CHMAT), by element id */
  elColors: Record<string, string>;
  /** the "type" of an element (CHTYPE), by element id */
  types: Record<string, string>;
  /** groups of elements (GROUP): group id → member ids */
  groups: Record<string, string[]>;
  session: ToolSession | null;
  /** tool-bar values per tool (wall height, door type …) */
  toolOpts: Record<string, Record<string, number | string | boolean>>;
  /** the last measurement, drawn on the model until the next tool */
  measure: MeasureResult | null;

  /* analysis */
  stressSetup: StressSetup;
  stressResult: StressResult | null;
  stressRunning: boolean;
  stressOverlay: boolean;
  simSetup: SimSetup;
  simResult: SimResult | null;
  simRunning: boolean;
  simVectors: boolean;
  council: { question: string; result: CouncilResult | null; running: boolean };
  aiAnalysis: { agentId: AgentId | null; items: Recommendation[] | null; running: boolean };
  proposals: Proposal[];
  appliedRecs: string[];
  showClashId: string | null;

  /* timeline */
  timeline: TimelineState;

  /* chrome */
  modal: ModalState | null;
  appMenu: boolean;
  contextMenu: { x: number; y: number } | null;
  agentMenu: boolean;
  cmdInput: string;
  cmdFocus: number;
  cmdBusy: boolean;
  reviewMode: boolean;
  searchFocus: number;
  clipboard: string[];
  healthRange: "all" | "30d" | "version";
  /** which list the Versions palette shows */
  versionsTab: "versions" | "history";
  /** PE workflow: item id → state; plus an audit trail (AI draft → PE edits → signed final) */
  peStatus: Record<string, "queued" | "reviewed" | "signed">;
  peLog: { at: string; actor: string; text: string }[];
  commentFilterUnresolved: boolean;
  dirty: boolean;
  savedAt: number | null;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];

  /* actions */
  applyQuery: (q: WorkspaceQuery) => void;
  setTab: (t: RibbonTabId) => void;
  setPanel: (p: PaletteId) => void;
  setExplorer: (e: ExplorerId) => void;
  setView: (v: ViewMode) => void;
  setSection: (on: boolean) => void;
  setDoc: (d: "project" | "start") => void;

  setCamera: (patch: Partial<Camera>) => void;
  setPlan: (patch: Partial<WsState["plan"]>) => void;
  goToNamedView: (name: string) => void;
  homeView: () => void;
  rotateIso: (dir: 1 | -1) => void;
  rotatePlan: () => void;
  zoomExtents: () => void;
  zoomBy: (f: number) => void;
  setStyle: (s: VisualStyle | null) => void;
  setSectionY: (y: number) => void;
  setNavTool: (t: NavTool) => void;
  setLayoutTab: (id: string) => void;
  addSheet: () => void;
  /** close a sheet the user made (undoable) */
  removeSheet: (id: string) => void;
  patch: (p: Partial<WsState>) => void;
  setCursor: (c: WsState["cursor"]) => void;
  focusElements: (ids: string[]) => void;
  /** frame elements in the viewport without selecting them (Zoom Extents) */
  frameElements: (ids: string[]) => void;

  toggle: (k: ToggleKey, v?: boolean) => void;
  toggleDock: (k: DockKey, v?: boolean) => void;
  setDockSize: (k: DockKey, size: DockSize) => void;
  cycleDock: (k: DockKey) => void;
  /** a dragged width / height (normal size); null goes back to the default */
  setDockPx: (k: DockKey, px: number | null) => void;
  /** put a side window on the left or right edge */
  setDockSide: (k: SideDock, side: Side) => void;
  /** the order of the bottom windows, top first */
  setBottomOrder: (order: BottomDock[]) => void;
  setPaletteTabs: (ids: PaletteId[]) => void;
  setExplorerTabs: (ids: ExplorerId[]) => void;
  /** switch every window to an arrangement (an interface) */
  applyArrangement: (a: Arrangement, iface?: string | null) => void;

  select: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;
  setHover: (id: string | null) => void;

  edit: (label: string, fn: (s: WsState) => Partial<WsState>, opts?: { coalesce?: boolean }) => void;
  undo: () => string | null;
  redo: () => string | null;
  /** Save to this browser and add a version (unless `auto`: a quiet save of the working copy only) */
  save: (opts?: { note?: string; auto?: boolean }) => void;
  /** write the working copy as a draft when the page is closing with unsaved changes */
  flushDraft: () => void;
  /** put the browser-saved work back (once, after mount) */
  loadSaved: () => void;
  restoreVersion: (id: string) => void;
  deleteVersion: (id: string) => void;
  renameVersion: (id: string, label: string) => void;
  /** open a project file's work into this project (undoable) */
  importWork: (work: import("../draw/types").SavedWork, versions: VersionRecord[]) => void;

  toggleLayer: (id: LayerId, v?: boolean) => void;
  toggleLayerLock: (id: LayerId) => void;
  setHidden: (ids: string[], hidden: boolean) => void;
  isolate: (ids: string[]) => void;
  unisolate: () => void;
  showAll: () => void;
  setLocked: (ids: string[], locked: boolean) => void;
  rename: (id: string, name: string) => void;
  setColor: (k: AppearanceKey, hex: string) => void;
  setMaterialHighlight: (m: string | null) => void;
  setTool: (t: string | null, prompt?: string | null) => void;

  openModal: (id: ModalId, data?: ModalState["data"]) => void;
  closeModal: () => void;
  setAppMenu: (v: boolean) => void;
  setContextMenu: (c: WsState["contextMenu"]) => void;
  setAgentMenu: (v: boolean) => void;
  setCmdInput: (t: string, focus?: boolean) => void;

  setStressSetup: (p: Partial<StressSetup>) => void;
  runStress: () => Promise<void>;
  clearStress: () => void;
  applyStressFix: () => void;
  setSimSetup: (p: Partial<SimSetup>) => void;
  runSim: () => Promise<void>;
  clearSim: () => void;
  runCouncil: (question: string, agents: AgentId[]) => Promise<void>;
  setCouncilQuestion: (q: string) => void;
  runAnalysis: (agentId: AgentId) => Promise<void>;
  applyRecommendation: (id: string) => void;

  addProposal: (p: Proposal) => void;
  acceptProposal: (id: string) => void;
  rejectProposal: (id: string) => void;

  setTimeline: (patch: Partial<TimelineState>) => void;
  setWindow: (preset: TimelineWindow["preset"], custom?: { from: number; to: number }) => void;
  clearWindow: () => void;

  addComment: (text: string, elementId?: string) => void;
  replyComment: (id: string, text: string) => void;
  toggleResolveComment: (id: string) => void;
  setCommentFilter: (v: boolean) => void;
  setIssueStatus: (id: string, status: Project["issues"][number]["status"]) => void;
  addIssue: (title: string, elementId?: string) => void;
  setHealthRange: (r: WsState["healthRange"]) => void;
  updateProject: (patch: Partial<Project>) => void;
  setJurisdiction: (name: string, codeSet: string) => void;
  sendToPe: (checkIds: string[]) => void;
  peAdvance: (ids: string[], to: "reviewed" | "signed", note: string, actor: string) => void;
}

/** A workspace store. */
export type WsStore = StoreApi<WsState>;

const FLOOR_SHEETS: Sheet[] = [
  { id: "A-101", name: "A-101 Floor Plan", kind: "plan" },
  { id: "A-201", name: "A-201 Section", kind: "section" },
  { id: "S-301", name: "S-301 Structural", kind: "structural" },
];

const DEFAULT_TOGGLES: Record<ToggleKey, boolean> = {
  model: true,
  grid: true,
  snap: true,
  ortho: true,
  polar: false,
  osnap: true,
  otrack: true,
  osnap3d: false,
  dyn: true,
  lwt: false,
};

const weighted = (h: Pick<HealthSnapshot, "compliance" | "structural" | "cost" | "schedule">) =>
  Math.round(0.3 * h.compliance + 0.3 * h.structural + 0.2 * h.cost + 0.2 * h.schedule);

/** What a workspace store starts from: mode, project and URL query. */
export interface WsInit {
  mode: "app" | "demo";
  project: Project;
  query: WorkspaceQuery;
}

/** Create a workspace store for a project. */
export function createWorkspaceStore(init: WsInit, hooks: WorkspaceHooks): WsStore {
  const scene = getScene(init.project.sceneKind);
  const defaultSim = SIM_TYPES[0];

  return createStore<WsState>()((set, get) => {
    let lastEdit = { label: "", at: 0 };
    let loadedOnce = false;
    const snapshot = (): ModelSnapshot => {
      const s = get();
      return {
        project: s.project,
        colors: s.colors,
        renames: s.renames,
        hidden: s.hidden,
        locked: s.locked,
        isolated: s.isolated,
        materialOverrides: s.materialOverrides,
        drawn: s.drawn,
        xf: s.xf,
        elColors: s.elColors,
        types: s.types,
        groups: s.groups,
        sheets: s.sheets,
      };
    };

    return {
      mode: init.mode,
      project: init.project,

      tab: init.query.tab,
      panel: init.query.panel,
      explorer: init.query.explorer,
      view: init.query.view,
      section: init.query.section,
      doc: init.query.doc,
      demoProject: init.query.project,

      camera: { ...HOME_CAMERA },
      plan: { rotation: 0, zoom: 1.7, panX: 0, panY: 0, level: "level1" },
      planShow: "level",
      labels: true,
      roomLabels: true,
      belowGrade: false,
      cutaway: false,
      mepLook: { plumbing: "lines", electrical: "lines" },
      furnLabels: false,
      insideRoom: null,
      outsideCamera: null,
      mapView: { radius: 1, base: "satellite" },
      styleOverride: null,
      sectionY: scene.sectionY,
      navTool: "select",
      layoutTab: "model",
      sheets: init.project.sceneKind === "blank" ? [] : FLOOR_SHEETS,
      rulers: false,
      guides: false,
      fullscreen: false,
      solar: false,
      clashOverlay: false,
      sectionBox: false,
      cursor: null,
      focus: null,

      toggles: { ...DEFAULT_TOGGLES },
      docks: { explorer: true, palettes: true, timeline: true, cmdline: true },
      dockSize: { ...DEFAULT_DOCK_SIZE },
      dockPx: {},
      dockSide: { ...DEFAULT_ARRANGEMENT.side },
      bottomOrder: [...DEFAULT_ARRANGEMENT.bottom],
      paletteTabs: [...DEFAULT_ARRANGEMENT.palettes],
      explorerTabs: [...DEFAULT_ARRANGEMENT.explorer],
      iface: "standard",

      selection: [],
      hover: null,
      hidden: [],
      locked: [],
      isolated: null,
      renames: {},
      materialOverrides: {},
      materialHighlight: null,
      colors: { ...DEFAULT_APPEARANCE },
      activeTool: null,
      toolPrompt: null,
      drawn: [],
      xf: {},
      elColors: {},
      types: {},
      groups: {},
      session: null,
      toolOpts: {},
      measure: null,

      stressSetup: {
        elementId: scene.elementById["B-L1-M1"] ? "B-L1-M1" : "all",
        loadCase: "dead-live",
        condition: "normal",
        mesh: "medium",
      },
      stressResult: null,
      stressRunning: false,
      stressOverlay: false,
      simSetup: { type: defaultSim.id, intensity: defaultSim.def, direction: 270, duration: 60 },
      simResult: null,
      simRunning: false,
      simVectors: false,
      council: { question: "Should we switch to a steel frame?", result: null, running: false },
      aiAnalysis: { agentId: null, items: null, running: false },
      proposals: [],
      appliedRecs: [],
      showClashId: null,

      timeline: { open: false, window: null, playing: false, zoom: "week" },

      modal: null,
      appMenu: false,
      contextMenu: null,
      agentMenu: false,
      cmdInput: "",
      cmdFocus: 0,
      cmdBusy: false,
      reviewMode: false,
      searchFocus: 0,
      clipboard: [],
      healthRange: "all",
      versionsTab: "versions",
      peStatus: {},
      peLog: [{ at: "Today 09:12", actor: "BuildSync AI", text: "AI-generated draft of the compliance review (unstamped)" }],
      commentFilterUnresolved: false,
      dirty: false,
      savedAt: null,
      undoStack: [],
      redoStack: [],

      /* ── URL-mirrored ─────────────────────────────────────────────── */
      applyQuery: (q) =>
        set({ tab: q.tab, panel: q.panel, explorer: q.explorer, view: q.view, section: q.section, doc: q.doc, demoProject: q.project }),
      setTab: (tab) => set({ tab }),
      // opening a palette or explorer tab from a command also brings its window back from "header only", and the
      // tab back when it was closed
      setPanel: (panel) =>
        set((s) => ({
          panel,
          docks: { ...s.docks, palettes: true },
          dockSize: s.dockSize.palettes === "min" ? { ...s.dockSize, palettes: "mid" } : s.dockSize,
          paletteTabs: s.paletteTabs.includes(panel) ? s.paletteTabs : [...s.paletteTabs, panel],
        })),
      setExplorer: (explorer) =>
        set((s) => ({
          explorer,
          docks: { ...s.docks, explorer: true },
          dockSize: s.dockSize.explorer === "min" ? { ...s.dockSize, explorer: "mid" } : s.dockSize,
          explorerTabs: s.explorerTabs.includes(explorer) ? s.explorerTabs : [...s.explorerTabs, explorer],
        })),
      setView: (view) => set({ view }),
      setSection: (section) => set({ section }),
      setDoc: (doc) => set({ doc }),

      /* ── viewport ─────────────────────────────────────────────────── */
      setCamera: (patch) => set((s) => ({ camera: { ...s.camera, ...patch } })),
      setPlan: (patch) => set((s) => ({ plan: { ...s.plan, ...patch } })),
      goToNamedView: (name) => {
        const v = NAMED_VIEWS[name];
        if (!v) return;
        if (v.plan) {
          set({ view: "2d", layoutTab: "model" });
          return;
        }
        // a named view looks at the whole model: it leaves a room view
        set((s) => ({ view: "3d", layoutTab: "model", camera: { ...(s.outsideCamera ?? s.camera), eye: null, bearing: v.bearing, pitch: v.pitch }, insideRoom: null, outsideCamera: null }));
      },
      homeView: () => set({ camera: { ...HOME_CAMERA }, plan: { ...get().plan, rotation: 0, zoom: 1.7, panX: 0, panY: 0 }, insideRoom: null, outsideCamera: null }),
      rotateIso: (dir) => set((s) => ({ camera: { ...(s.outsideCamera ?? s.camera), eye: null, bearing: normBearing((s.outsideCamera ?? s.camera).bearing + dir * 90) }, insideRoom: null, outsideCamera: null })),
      rotatePlan: () => set((s) => ({ plan: { ...s.plan, rotation: (s.plan.rotation + 90) % 360 } })),
      zoomExtents: () =>
        set((s) => (s.view === "2d" ? { plan: { ...s.plan, zoom: 1.7, panX: 0, panY: 0 } } : { camera: { ...(s.outsideCamera ?? s.camera), eye: null, zoom: 1, panX: 0, panY: 0 }, insideRoom: null, outsideCamera: null })),
      zoomBy: (f) =>
        set((s) =>
          s.view === "2d"
            ? { plan: { ...s.plan, zoom: clamp(s.plan.zoom * f, 0.4, 12) } }
            : { camera: { ...s.camera, zoom: clamp(s.camera.zoom * f, 0.3, 14) } },
        ),
      setStyle: (styleOverride) => set({ styleOverride }),
      setSectionY: (sectionY) => set({ sectionY }),
      setNavTool: (navTool) => set({ navTool }),
      setLayoutTab: (layoutTab) => set({ layoutTab }),
      addSheet: () => {
        const n = get().sheets.length + 1;
        const id = `A-${300 + n}`;
        const sheet: Sheet = { id, name: `${id} Elevation`, kind: "elevation", view: { dir: "S", title: "SOUTH ELEVATION" }, user: true };
        get().edit("New layout", (s) => ({ sheets: [...s.sheets, sheet], layoutTab: id }));
        hooks.toast(`Layout ${id} added`);
      },
      removeSheet: (id) =>
        get().edit("Close layout", (s) => ({ sheets: s.sheets.filter((x) => x.id !== id), layoutTab: s.layoutTab === id ? "model" : s.layoutTab })),
      patch: (p) => set(p),
      setCursor: (cursor) => set({ cursor }),
      focusElements: (ids) => set((s) => ({ focus: { ids, n: (s.focus?.n ?? 0) + 1 }, selection: ids })),
      frameElements: (ids) => set((s) => ({ focus: { ids, n: (s.focus?.n ?? 0) + 1 } })),

      toggle: (k, v) => set((s) => ({ toggles: { ...s.toggles, [k]: v ?? !s.toggles[k] } })),
      toggleDock: (k, v) => set((s) => ({ docks: { ...s.docks, [k]: v ?? !s.docks[k] } })),
      // the timeline's `open` flag mirrors its size: only the header when "min", the Gantt otherwise
      setDockSize: (k, size) =>
        set((s) => ({ dockSize: { ...s.dockSize, [k]: size }, timeline: k === "timeline" ? { ...s.timeline, open: size !== "min" } : s.timeline })),
      cycleDock: (k) => get().setDockSize(k, nextDockSize(get().dockSize[k])),
      // a drag sets the normal size, so a window dragged from "header only" or "large" becomes normal
      setDockPx: (k, px) =>
        set((s) => {
          const dockPx = { ...s.dockPx };
          if (px === null) delete dockPx[k];
          else dockPx[k] = px;
          return { dockPx, dockSize: px === null || s.dockSize[k] === "mid" ? s.dockSize : { ...s.dockSize, [k]: "mid" }, timeline: k === "timeline" && px !== null ? { ...s.timeline, open: true } : s.timeline };
        }),
      setDockSide: (k, side) => set((s) => ({ dockSide: { ...s.dockSide, [k]: side }, docks: { ...s.docks, [k]: true } })),
      setBottomOrder: (bottomOrder) => set({ bottomOrder }),
      // closing the last palette tab hides the palettes window; the active palette moves to the first one left
      setPaletteTabs: (ids) =>
        set((s) => ({ paletteTabs: ids, panel: ids.includes(s.panel) || !ids.length ? s.panel : ids[0], docks: ids.length ? s.docks : { ...s.docks, palettes: false } })),
      setExplorerTabs: (ids) => set((s) => ({ explorerTabs: ids.length ? ids : s.explorerTabs, explorer: ids.length && !ids.includes(s.explorer) ? ids[0] : s.explorer })),
      applyArrangement: (a, iface = null) =>
        set((s) => {
          const c = cloneArrangement(a);
          return {
            docks: c.shown,
            dockSize: c.size,
            dockPx: c.px,
            dockSide: c.side,
            bottomOrder: c.bottom,
            paletteTabs: c.palettes,
            explorerTabs: c.explorer,
            iface,
            panel: c.palettes.includes(s.panel) || !c.palettes.length ? s.panel : c.palettes[0],
            explorer: c.explorer.includes(s.explorer) ? s.explorer : c.explorer[0],
            timeline: { ...s.timeline, open: c.size.timeline !== "min" && c.shown.timeline },
          };
        }),

      /* ── selection ────────────────────────────────────────────────── */
      // selecting one member of a group selects the whole group
      select: (ids, additive) =>
        set((s) => {
          const grouped = new Set(ids);
          for (const members of Object.values(s.groups)) if (members.some((m) => grouped.has(m))) members.forEach((m) => grouped.add(m));
          const all = Array.from(grouped);
          return { selection: additive ? Array.from(new Set([...s.selection, ...all])) : all };
        }),
      clearSelection: () => set({ selection: [] }),
      setHover: (hover) => set((s) => (s.hover === hover ? {} : { hover })),

      /* ── undoable edits ───────────────────────────────────────────── */
      edit: (label, fn, opts) => {
        if (get().reviewMode) {
          hooks.toast("Review mode is read-only. Turn it off (REVIEW) to edit.", "warn");
          return;
        }
        const before = snapshot();
        const now = Date.now();
        // a burst of the same edit (dragging a colour picker) is one undo step
        const coalesce = !!opts?.coalesce && lastEdit.label === label && now - lastEdit.at < 1500 && get().undoStack.length > 0;
        lastEdit = { label, at: now };
        set((s) => ({
          ...fn(s),
          undoStack: coalesce ? s.undoStack : [...s.undoStack.slice(-49), { label, snap: before }],
          redoStack: [],
          dirty: true,
        }));
        hooks.setDirty(get().project.id, true);
      },
      undo: () => {
        const s = get();
        const entry = s.undoStack[s.undoStack.length - 1];
        if (!entry) return null;
        const current = snapshot();
        set({
          ...entry.snap,
          undoStack: s.undoStack.slice(0, -1),
          redoStack: [...s.redoStack, { label: entry.label, snap: current }],
          dirty: s.undoStack.length > 1,
        });
        hooks.setDirty(get().project.id, get().undoStack.length > 0);
        return entry.label;
      },
      redo: () => {
        const s = get();
        const entry = s.redoStack[s.redoStack.length - 1];
        if (!entry) return null;
        const current = snapshot();
        set({
          ...entry.snap,
          redoStack: s.redoStack.slice(0, -1),
          undoStack: [...s.undoStack, { label: entry.label, snap: current }],
          dirty: true,
        });
        hooks.setDirty(get().project.id, true);
        return entry.label;
      },
      save: (opts) => {
        const s = get();
        const now = Date.now();
        const work = { ...snapshotOf(s), at: now };
        const real = s.project.versions.filter((v) => v.ts);
        // a version is added when something changed since the last one (or when asked, or when there is none yet)
        const addVersion = !opts?.auto && (s.dirty || !!opts?.note?.trim() || real.length === 0);
        let versions = s.project.versions;
        if (addVersion) {
          const n = Math.max(0, ...real.map((v) => Number(/^v-(\d+)$/.exec(v.id)?.[1] ?? 0))) + 1;
          const last = real.find((v) => v.snapshot)?.snapshot ?? null;
          const entry: VersionRecord = { id: `v-${n}`, label: opts?.note?.trim() || `Saved ${stamp(now)}`, at: "", by: "You", ts: now, summary: summarize(last, work), snapshot: work };
          const mine = [entry, ...real].map((v, i) => (i < MAX_SNAPSHOTS || !v.snapshot ? v : { ...v, snapshot: undefined }));
          versions = [...mine, ...s.project.versions.filter((v) => !v.ts)];
        }
        const record: StoredWork = { work, versions: versions.filter((v) => v.ts), dirty: false, savedAt: now };
        if (!writeStored(s.mode, s.project.id, record)) {
          hooks.toast("Couldn't save in this browser (storage is full or blocked). Use Save As to download the project.", "bad");
          hooks.log("warn", "Save failed: browser storage is full or blocked. Use Save As to keep a copy.");
          return;
        }
        set({ project: { ...s.project, versions }, dirty: false, savedAt: now });
        hooks.setDirty(s.project.id, false);
        if (!opts?.auto) {
          hooks.toast(s.mode === "demo" ? "Saved in this browser" : "Project saved");
          hooks.log("ok", `Saved ${s.project.fileName}${addVersion ? ` · version "${versions[0].label}"` : ""}`);
        }
      },
      flushDraft: () => {
        const s = get();
        if (!s.dirty) return;
        const stored = readStored(s.mode, s.project.id);
        writeStored(s.mode, s.project.id, { work: { ...snapshotOf(s), at: Date.now() }, versions: s.project.versions.filter((v) => v.ts), dirty: true, savedAt: stored?.savedAt ?? Date.now() });
      },
      loadSaved: () => {
        if (loadedOnce || typeof window === "undefined") return;
        loadedOnce = true;
        const s = get();
        const rec = readStored(s.mode, s.project.id);
        if (!rec) return;
        const seed = s.project.versions.filter((v) => !v.ts);
        const patch = workPatch(rec.work, s.project);
        set({ ...patch, project: { ...(patch.project as Project), versions: [...rec.versions, ...seed] }, dirty: rec.dirty, savedAt: rec.savedAt });
        hooks.setDirty(s.project.id, rec.dirty);
        hooks.log("ok", rec.dirty ? "Recovered your unsaved changes from the last session." : `Restored your saved work (${stamp(rec.savedAt)}).`);
      },
      restoreVersion: (id) => {
        const s = get();
        const v = s.project.versions.find((x) => x.id === id);
        if (!v?.snapshot) {
          hooks.toast("That version has no snapshot to restore.", "warn");
          return;
        }
        const snap = v.snapshot;
        get().edit(`Restore ${v.label}`, (st) => workPatch(snap, st.project));
        hooks.toast(`Restored “${v.label}”. Undo brings back what you had.`);
        hooks.log("ok", `✓ Restored version ${v.label}`);
      },
      deleteVersion: (id) => {
        const s = get();
        const versions = s.project.versions.filter((v) => v.id !== id);
        set({ project: { ...s.project, versions } });
        const rec = readStored(s.mode, s.project.id);
        if (rec) writeStored(s.mode, s.project.id, { ...rec, versions: versions.filter((v) => v.ts) });
      },
      renameVersion: (id, label) => {
        const s = get();
        const versions = s.project.versions.map((v) => (v.id === id ? { ...v, label: label.trim() || v.label } : v));
        set({ project: { ...s.project, versions } });
        const rec = readStored(s.mode, s.project.id);
        if (rec) writeStored(s.mode, s.project.id, { ...rec, versions: versions.filter((v) => v.ts) });
      },
      importWork: (work, versions) => {
        const have = new Set(get().project.versions.map((v) => v.id));
        const extra = versions.filter((v) => !have.has(v.id));
        get().edit("Open file", (st) => {
          const patch = workPatch({ ...work, project: { ...(work.project as object), id: st.project.id, name: st.project.name, fileName: st.project.fileName } }, st.project);
          const merged = [...(st.project.versions.filter((v) => v.ts)), ...extra].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
          return { ...patch, project: { ...(patch.project as Project), versions: [...merged, ...st.project.versions.filter((v) => !v.ts)] } };
        });
      },

      /* ── layers / visibility ──────────────────────────────────────── */
      toggleLayer: (id, v) =>
        get().edit("Layer visibility", (s) => ({
          project: { ...s.project, layers: s.project.layers.map((l) => (l.id === id ? { ...l, visible: v ?? !l.visible } : l)) },
        })),
      toggleLayerLock: (id) =>
        get().edit("Layer lock", (s) => ({
          project: { ...s.project, layers: s.project.layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)) },
        })),
      setHidden: (ids, hidden) =>
        get().edit(hidden ? "Hide" : "Show", (s) => ({
          hidden: hidden ? Array.from(new Set([...s.hidden, ...ids])) : s.hidden.filter((h) => !ids.includes(h)),
        })),
      isolate: (ids) => get().edit("Isolate", () => ({ isolated: ids })),
      unisolate: () => get().edit("Unisolate", () => ({ isolated: null })),
      showAll: () => get().edit("Show all", () => ({ hidden: [], isolated: null })),
      setLocked: (ids, locked) =>
        get().edit(locked ? "Lock" : "Unlock", (s) => ({
          locked: locked ? Array.from(new Set([...s.locked, ...ids])) : s.locked.filter((l) => !ids.includes(l)),
        })),
      rename: (id, name) => get().edit("Rename", (s) => ({ renames: { ...s.renames, [id]: name } })),
      setColor: (k, hex) => get().edit("Appearance colour", (s) => ({ colors: { ...s.colors, [k]: hex } }), { coalesce: true }),
      setMaterialHighlight: (materialHighlight) => set({ materialHighlight }),
      // ending a tool also ends its session and the cursor preview
      setTool: (activeTool, toolPrompt = null) => set(activeTool === null ? { activeTool, toolPrompt, session: null } : { activeTool, toolPrompt }),

      /* ── chrome ───────────────────────────────────────────────────── */
      openModal: (id, data) => set({ modal: { id, data }, appMenu: false, contextMenu: null }),
      closeModal: () => set({ modal: null }),
      setAppMenu: (appMenu) => set({ appMenu }),
      setContextMenu: (contextMenu) => set({ contextMenu }),
      setAgentMenu: (agentMenu) => set({ agentMenu }),
      // asking for focus brings a header-only command line back so the user can type
      setCmdInput: (cmdInput, focus = true) =>
        set((s) => ({ cmdInput, cmdFocus: focus ? s.cmdFocus + 1 : s.cmdFocus, dockSize: focus && s.dockSize.cmdline === "min" ? { ...s.dockSize, cmdline: "mid" } : s.dockSize })),

      /* ── stress test ──────────────────────────────────────────────── */
      setStressSetup: (p) => set((s) => ({ stressSetup: { ...s.stressSetup, ...p } })),
      runStress: async () => {
        const s = get();
        if (s.stressRunning) return;
        set({ stressRunning: true });
        hooks.log("cmd", "› STRESS");
        const result = await runStressTest(s.project, s.stressSetup);
        set({ stressResult: result, stressRunning: false, stressOverlay: true });
        hooks.log(result.safetyFactor < 1 ? "warn" : "ok", `Stress test: max ${result.maxStress.toFixed(1)} ksi, safety factor ${result.safetyFactor.toFixed(2)}`);
      },
      clearStress: () => set({ stressResult: null, stressOverlay: false }),
      applyStressFix: () => {
        const r = get().stressResult;
        if (!r) return;
        const elId = r.setup.elementId;
        get().edit("Apply stress recommendation", (s) => {
          const checks = s.project.checks.map((c) =>
            c.status === "fail" && (elId === "all" || c.elements.includes(elId)) && c.group === "Structural" ? { ...c, status: "pass" as const } : c,
          );
          const issues = s.project.issues.map((i) =>
            i.elementId === elId && i.status !== "resolved" ? { ...i, status: "resolved" as const, resolution: 'Beam deepened to 10" (stress test recommendation)' } : i,
          );
          const h = { ...s.project.health };
          h.structural = Math.min(100, h.structural + 6);
          h.compliance = Math.min(100, h.compliance + 4);
          const score = weighted(h);
          const next = { ...h, delta: h.delta + (score - h.score), score };
          const cost = { ...s.project.cost, total: s.project.cost.total + 2900, hard: s.project.cost.hard + 2900 };
          return {
            project: { ...s.project, checks, issues, health: { ...next, ranges: { ...next.ranges, all: { ...next.ranges.all, score, structural: h.structural, compliance: h.compliance } } }, cost },
            stressResult: { ...r, safetyFactor: 1.31, maxStress: 3.2, deflection: 0.38, fixable: false, failurePoints: [], recommendation: "Applied: B-L1-M1 deepened to 10\". Safety factor is now above 1.25.", points: Object.fromEntries(Object.entries(r.points).map(([k, v]) => [k, Math.min(v, 3.2)])) },
            materialOverrides: elId !== "all" ? { ...s.materialOverrides, [elId]: 'Reinforced concrete, 10" deep (revised)' } : s.materialOverrides,
          };
        });
        hooks.toast("Recommendation applied: Plan Health Score updated");
        hooks.log("ok", "Applied stress-test recommendation. Re-run STRESS to verify.");
      },

      /* ── simulation ───────────────────────────────────────────────── */
      setSimSetup: (p) =>
        set((s) => {
          const next = { ...s.simSetup, ...p };
          if (p.type && p.type !== s.simSetup.type) {
            const def = SIM_TYPES.find((t) => t.id === p.type);
            if (def) next.intensity = def.def;
          }
          return { simSetup: next };
        }),
      runSim: async () => {
        const s = get();
        if (s.simRunning) return;
        set({ simRunning: true });
        hooks.log("cmd", `› SIMULATE ${s.simSetup.type.toUpperCase()}`);
        const result = await runSimulation(s.simSetup);
        set({ simResult: result, simRunning: false, simVectors: true });
        hooks.log(result.breachRisk > 40 ? "warn" : "ok", `Simulation: ${result.headline}`);
      },
      clearSim: () => set({ simResult: null, simVectors: false }),

      /* ── council + AI analysis ────────────────────────────────────── */
      setCouncilQuestion: (question) => set((s) => ({ council: { ...s.council, question } })),
      runCouncil: async (question, agents) => {
        set((s) => ({ council: { ...s.council, question, running: true } }));
        const result = await convene(question, agents);
        set({ council: { question, result, running: false } });
        hooks.log("ai", `→ Council convened (${agents.length} agents): ${result.verdict}`);
      },
      runAnalysis: async (agentId) => {
        set({ aiAnalysis: { agentId, items: get().aiAnalysis.items, running: true } });
        const items = await runAiAnalysis(get().project);
        set({ aiAnalysis: { agentId, items, running: false } });
      },
      applyRecommendation: (id) => {
        const rec = get().aiAnalysis.items?.find((r) => r.id === id);
        if (!rec || get().appliedRecs.includes(id)) return;
        get().edit(`Apply: ${rec.title}`, (s) => ({
          appliedRecs: [...s.appliedRecs, id],
          project: rec.costDelta ? { ...s.project, cost: { ...s.project.cost, total: s.project.cost.total + rec.costDelta, hard: s.project.cost.hard + rec.costDelta } } : s.project,
        }));
        hooks.toast(`Applied: ${rec.title}`);
      },

      /* ── proposals (agents only propose; user accepts) ────────────── */
      addProposal: (p) => set((s) => ({ proposals: [...s.proposals, p] })),
      acceptProposal: (id) => {
        const p = get().proposals.find((x) => x.id === id);
        if (!p) return;
        get().edit(`Accept: ${p.title}`, (s) => {
          let colors = s.colors;
          const mo = { ...s.materialOverrides };
          let project = s.project;
          if (p.effect === "walls-concrete") {
            colors = { ...colors, walls: "#9ca1a9" };
            p.elementIds.forEach((e) => (mo[e] = 'Cast-in-place concrete 8", f\'c 5000 psi'));
          } else if (p.effect === "steel-frame") {
            colors = { ...colors, structural: "#6f86a6" };
            p.elementIds.forEach((e) => (mo[e] = "Hot-dip galvanized steel (HSS / W-shape)"));
          } else if (p.effect === "add-beam") {
            mo["B-L1-M1"] = "Reinforced concrete + mid-span post";
          }
          if (p.costDelta) {
            project = {
              ...project,
              cost: {
                ...project.cost,
                total: project.cost.total + p.costDelta,
                hard: project.cost.hard + p.costDelta,
                materials: project.cost.materials.map((m, i) => (i === 0 ? { ...m, cost: m.cost + p.costDelta! } : m)),
              },
            };
          }
          if (p.effect === "add-beam") {
            project = {
              ...project,
              checks: project.checks.map((c) => (c.id === "CK-05" ? { ...c, status: "pass" as const } : c)),
              issues: project.issues.map((i) => (i.id === "IS-101" ? { ...i, status: "resolved" as const, resolution: "Mid-span post added (AI proposal accepted)" } : i)),
            };
          }
          return { colors, materialOverrides: mo, project, proposals: s.proposals.filter((x) => x.id !== id) };
        });
        hooks.toast(`Accepted: ${p.title}`);
        hooks.log("ok", `✓ Applied edit: ${p.title}`);
      },
      rejectProposal: (id) => {
        const p = get().proposals.find((x) => x.id === id);
        set((s) => ({ proposals: s.proposals.filter((x) => x.id !== id) }));
        if (p) hooks.log("info", `Rejected proposal: ${p.title}`);
      },

      /* ── timeline ─────────────────────────────────────────────────── */
      setTimeline: (patch) =>
        set((s) => {
          const timeline = { ...s.timeline, ...patch };
          // opening the timeline from a command restores it from "header only"; closing it minimises it
          const tlSize: DockSize = patch.open ? (s.dockSize.timeline === "min" ? "mid" : s.dockSize.timeline) : "min";
          const dockSize = patch.open === undefined ? s.dockSize : { ...s.dockSize, timeline: tlSize };
          return { timeline, dockSize };
        }),
      setWindow: (preset, custom) => {
        const sch = buildSchedule(get().project);
        set((s) => ({
          timeline: { ...s.timeline, open: true, window: windowFor(preset, sch.total, custom) },
          dockSize: s.dockSize.timeline === "min" ? { ...s.dockSize, timeline: "mid" } : s.dockSize,
        }));
      },
      clearWindow: () => set((s) => ({ timeline: { ...s.timeline, window: null, playing: false } })),

      /* ── comments / issues / project ──────────────────────────────── */
      addComment: (text, elementId) =>
        get().edit("Add comment", (s) => {
          const c: Comment = { id: uid("CM"), author: "You", text, at: "Just now", resolved: false, elementId, replies: [], attachments: [], history: ["Created by You"] };
          return { project: { ...s.project, comments: [c, ...s.project.comments] } };
        }),
      replyComment: (id, text) =>
        get().edit("Reply", (s) => ({
          project: {
            ...s.project,
            comments: s.project.comments.map((c) =>
              c.id === id ? { ...c, replies: [...c.replies, { id: uid("CR"), author: "You", text, at: "Just now" }], history: [...c.history, "Reply by You"] } : c,
            ),
          },
        })),
      toggleResolveComment: (id) =>
        get().edit("Resolve comment", (s) => ({
          project: {
            ...s.project,
            comments: s.project.comments.map((c) =>
              c.id === id ? { ...c, resolved: !c.resolved, history: [...c.history, c.resolved ? "Reopened by You" : "Resolved by You"] } : c,
            ),
          },
        })),
      setCommentFilter: (commentFilterUnresolved) => set({ commentFilterUnresolved }),
      setIssueStatus: (id, status) =>
        get().edit("Issue status", (s) => ({
          project: { ...s.project, issues: s.project.issues.map((i) => (i.id === id ? { ...i, status, resolution: status === "resolved" ? i.resolution ?? "Marked resolved" : i.resolution } : i)) },
        })),
      addIssue: (title, elementId) =>
        get().edit("Add issue", (s) => ({
          project: {
            ...s.project,
            issues: [
              { id: `IS-${300 + s.project.issues.length}`, severity: "medium", title, location: elementId ? (sceneOf(s).elementById[elementId]?.name ?? "Model") : "Model", elementId, assignee: "You", status: "open", due: "2027-02-01" },
              ...s.project.issues,
            ],
          },
        })),
      setHealthRange: (healthRange) => set({ healthRange }),
      updateProject: (p) => get().edit("Project information", (s) => ({ project: { ...s.project, ...p } })),
      setJurisdiction: (name, codeSet) => {
        get().edit("Change jurisdiction", (s) => ({ project: { ...s.project, jurisdiction: { name, codeSet } } }));
        hooks.toast(`Jurisdiction set to ${name}`);
        hooks.log("ok", `Code set switched to ${name} · ${codeSet}`);
      },
      sendToPe: (checkIds) => {
        set((s) => {
          const status = { ...s.peStatus };
          checkIds.forEach((id) => (status[id] = status[id] ?? "queued"));
          return {
            peStatus: status,
            peLog: [...s.peLog, { at: "Just now", actor: "You", text: `Sent ${checkIds.length} flagged item(s) to the PE review queue: ${checkIds.join(", ")}` }],
          };
        });
        hooks.toast(`${checkIds.length} item${checkIds.length === 1 ? "" : "s"} sent to the PE review queue`, "info");
        hooks.log("ai", `→ ${checkIds.length} flagged item(s) queued for PE review (R. Okafor, PE)`);
      },
      peAdvance: (ids, to, note, actor) => {
        set((s) => {
          const status = { ...s.peStatus };
          ids.forEach((id) => (status[id] = to));
          return {
            peStatus: status,
            peLog: [...s.peLog, { at: "Just now", actor, text: `${to === "signed" ? "Digitally signed" : "Reviewed"} ${ids.join(", ")}${note ? `: ${note}` : ""}` }],
          };
        });
        hooks.log("ok", `✓ PE ${to === "signed" ? "signed" : "reviewed"} ${ids.length} item(s)`);
      },
    };
  });
}

/** The arrangement of the windows in a workspace state (what an interface saves). */
export function arrangementOf(s: Pick<WsState, "docks" | "dockSize" | "dockPx" | "dockSide" | "bottomOrder" | "paletteTabs" | "explorerTabs">): Arrangement {
  return cloneArrangement({ shown: s.docks, size: s.dockSize, px: s.dockPx, side: s.dockSide, bottom: s.bottomOrder, palettes: s.paletteTabs, explorer: s.explorerTabs });
}

/* ── client cache so document tabs keep their edits ─────────────────────── */
const cache = new Map<string, WsStore>();

/** The cached workspace store for a mode and project (created on first use in the browser). */
export function getWorkspaceStore(init: WsInit, hooks: WorkspaceHooks): WsStore {
  if (typeof window === "undefined") return createWorkspaceStore(init, hooks);
  const key = `${init.mode}:${init.project.id}`;
  let s = cache.get(key);
  if (!s) {
    s = createWorkspaceStore(init, hooks);
    cache.set(key, s);
  }
  return s;
}
