/**
 * lib/store/workspace-store.ts
 *
 * WHAT   Per-project workspace state: everything the CAD screen needs (ribbon tab, palette, explorer, 2D / 3D,
 *        camera and plan, selection, hidden / locked / isolated elements, colours and renames, toggles, docks,
 *        modal, timeline, stress and simulation results, comments, issues, proposals, undo / redo) and the
 *        actions that change it. One store per (mode, project), cached in the browser so switching document
 *        tabs keeps edits.
 * FOR    useWs / useWsApi in components (lib/store/workspace-provider.tsx) and CommandCtx in lib/commands.ts.
 *        Model edits go through edit(label, fn), which records an undo entry (snapshot of the model part, up to
 *        50) and marks the project dirty.
 * DEBUG  - Undo does nothing: only changes made through edit() are undoable; plain set() calls (selection,
 *          camera) are not.
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
export type ToggleKey = "model" | "grid" | "snap" | "ortho" | "polar" | "osnap" | "osnap3d" | "dyn" | "lwt";
/** Dockable areas that can be shown or hidden. */
export type DockKey = "explorer" | "palettes" | "timeline" | "cmdline";

/** Ids of the workspace dialogs. */
export type ModalId =
  | "project-info"
  | "import"
  | "pe-signoff"
  | "jurisdiction"
  | "new-project"
  | "versions"
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
  | "geolocate";
/** The open dialog and its data. */
export interface ModalState {
  id: ModalId;
  data?: Record<string, string | number | boolean>;
}

/** A paper-space layout sheet. */
export interface Sheet {
  id: string;
  name: string;
  kind: "plan" | "section" | "structural" | "elevation";
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
  patch: (p: Partial<WsState>) => void;
  setCursor: (c: WsState["cursor"]) => void;
  focusElements: (ids: string[]) => void;

  toggle: (k: ToggleKey, v?: boolean) => void;
  toggleDock: (k: DockKey, v?: boolean) => void;

  select: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;
  setHover: (id: string | null) => void;

  edit: (label: string, fn: (s: WsState) => Partial<WsState>, opts?: { coalesce?: boolean }) => void;
  undo: () => string | null;
  redo: () => string | null;
  save: () => void;

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
      setPanel: (panel) => set((s) => ({ panel, docks: { ...s.docks, palettes: true } })),
      setExplorer: (explorer) => set((s) => ({ explorer, docks: { ...s.docks, explorer: true } })),
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
        set((s) => ({ view: "3d", layoutTab: "model", camera: { ...s.camera, bearing: v.bearing, pitch: v.pitch } }));
      },
      homeView: () => set({ camera: { ...HOME_CAMERA }, plan: { ...get().plan, rotation: 0, zoom: 1.7, panX: 0, panY: 0 } }),
      rotateIso: (dir) => set((s) => ({ camera: { ...s.camera, bearing: normBearing(s.camera.bearing + dir * 90) } })),
      rotatePlan: () => set((s) => ({ plan: { ...s.plan, rotation: (s.plan.rotation + 90) % 360 } })),
      zoomExtents: () =>
        set((s) => (s.view === "2d" ? { plan: { ...s.plan, zoom: 1.7, panX: 0, panY: 0 } } : { camera: { ...s.camera, zoom: 1, panX: 0, panY: 0 } })),
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
        set((s) => ({ sheets: [...s.sheets, { id, name: `${id} Elevation`, kind: "elevation" as const }], layoutTab: id }));
        hooks.toast(`Layout ${id} added`);
      },
      patch: (p) => set(p),
      setCursor: (cursor) => set({ cursor }),
      focusElements: (ids) => set((s) => ({ focus: { ids, n: (s.focus?.n ?? 0) + 1 }, selection: ids })),

      toggle: (k, v) => set((s) => ({ toggles: { ...s.toggles, [k]: v ?? !s.toggles[k] } })),
      toggleDock: (k, v) => set((s) => ({ docks: { ...s.docks, [k]: v ?? !s.docks[k] } })),

      /* ── selection ────────────────────────────────────────────────── */
      select: (ids, additive) =>
        set((s) => ({
          selection: additive ? Array.from(new Set([...s.selection, ...ids])) : ids,
        })),
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
      save: () => {
        if (get().mode === "demo") {
          hooks.toast("Demo edits aren't saved. Start free to save your work.", "info");
          hooks.log("warn", "Demo workspace: changes are not saved. Start free to save.");
          return;
        }
        set({ dirty: false, savedAt: Date.now() });
        hooks.setDirty(get().project.id, false);
        hooks.toast("Project saved");
        hooks.log("ok", `Saved ${get().project.fileName}`);
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
      setTool: (activeTool, toolPrompt = null) => set({ activeTool, toolPrompt }),

      /* ── chrome ───────────────────────────────────────────────────── */
      openModal: (id, data) => set({ modal: { id, data }, appMenu: false, contextMenu: null }),
      closeModal: () => set({ modal: null }),
      setAppMenu: (appMenu) => set({ appMenu }),
      setContextMenu: (contextMenu) => set({ contextMenu }),
      setAgentMenu: (agentMenu) => set({ agentMenu }),
      setCmdInput: (cmdInput, focus = true) => set((s) => ({ cmdInput, cmdFocus: focus ? s.cmdFocus + 1 : s.cmdFocus })),

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
      setTimeline: (patch) => set((s) => ({ timeline: { ...s.timeline, ...patch } })),
      setWindow: (preset, custom) => {
        const sch = buildSchedule(get().project);
        set((s) => ({ timeline: { ...s.timeline, open: true, window: windowFor(preset, sch.total, custom) } }));
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
              { id: `IS-${300 + s.project.issues.length}`, severity: "medium", title, location: elementId ? (getScene(s.project.sceneKind).elementById[elementId]?.name ?? "Model") : "Model", elementId, assignee: "You", status: "open", due: "2027-02-01" },
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
