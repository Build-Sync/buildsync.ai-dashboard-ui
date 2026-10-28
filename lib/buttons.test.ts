/**
 * lib/buttons.test.ts
 *
 * WHAT   The backtest of every ribbon button: each one is run through the command registry exactly as a click does
 *        (runCommand), against a fresh workspace and app store holding the sample house, and its own expected effect is
 *        checked: the tool it starts, the dialog, palette or explorer tab it opens, the view, sheet, toggle or flag it
 *        changes, the settings page it goes to, or the result it writes (computed reports, AI answers). A button with
 *        no expectation here fails the test, so a new button has to say what it does.
 * FOR    `npm test`. The browser click-through of the same buttons is e2e/buttons.mjs.
 * DEBUG  - "no expectation for X": add X to EXPECT with what the button should do.
 *        - A tool-starting button fails: its command must have a tool in lib/draw (TOOLS).
 *        - localStorage is a Map here; document and window are absent, so FULL reports that politely and IMAGE
 *          waits for a file (its picker resolves "cancelled").
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { RIBBON } from "../components/workspace/Ribbon/ribbon.config";
import { TOOL_COMMANDS, resolveCommand, runCommand, type CommandCtx } from "./commands";
import { COTTAGE, RESIDENCE } from "./mock-data";
import { createAppStore, type AppState } from "./store/app-store";
import { createWorkspaceStore, type WsState } from "./store/workspace-store";
import type { HistoryLine, Project } from "./types";
import { DEFAULT_QUERY } from "./workspace-query";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
} as Storage;

interface Run {
  before: WsState;
  after: WsState;
  app: AppState;
  pushed: string[];
  logs: HistoryLine[];
}
type Check = (r: Run) => string | null;

const ok = (cond: boolean, why: string) => (cond ? null : why);
const tool = (name: string): Check => (r) => ok(r.after.activeTool === name && !!r.after.session, `expected the ${name} tool to start, got ${r.after.activeTool}`);
const modal = (id: string): Check => (r) => ok(r.after.modal?.id === id, `expected the ${id} dialog, got ${r.after.modal?.id ?? "none"}`);
const palette = (id: string): Check => (r) => ok(r.after.panel === id && r.after.docks.palettes, `expected the ${id} palette, got ${r.after.panel}`);
const explorer = (id: string): Check => (r) => ok(r.after.explorer === id && r.after.docks.explorer, `expected the ${id} explorer tab, got ${r.after.explorer}`);
const route = (path: string): Check => (r) => ok(r.pushed.includes(path), `expected to go to ${path}, went to ${r.pushed.join(", ") || "nowhere"}`);
const flips = (pick: (s: WsState) => unknown, what: string): Check => (r) => ok(JSON.stringify(pick(r.before)) !== JSON.stringify(pick(r.after)), `${what} did not change`);
const logged = (re: RegExp, what: string): Check => (r) => ok(r.logs.some((l) => re.test(l.text)), `expected ${what} in the command line; got: ${r.logs.map((l) => l.text).join(" | ").slice(0, 300)}`);
const sheetOpened: Check = (r) => ok(r.after.layoutTab !== "model" && r.after.sheets.some((s) => s.id === r.after.layoutTab), `expected a sheet to open, layout tab is ${r.after.layoutTab}`);
const all = (...checks: Check[]): Check => (r) => checks.map((c) => c(r)).find((x) => x) ?? null;
const SELECT = (ids: string[]) => (s: WsState) => s.select(ids);
const piece = (toolName: string, type: string): Check => all(tool(toolName), (r) => ok(r.after.toolOpts[toolName]?.type === type, `expected the ${type} picked in the ${toolName} tool bar, got ${String(r.after.toolOpts[toolName]?.type)}`));
/** A drawn light switch, selected (for Switch On / Off). */
const SWITCH_SELECTED = (s: WsState) => (s.patch({ drawn: [...s.drawn, { id: "SW-T", kind: "fixture", name: "Switch T", level: "level1", z: 0, pts: [[1, 12]], p: { type: "switch", rot: 90 } }] }), s.select(["SW-T"]));

/** What each ribbon command must do (keyed by its command text as the ribbon runs it), and any set-up it needs. */
const EXPECT: Record<string, { check: Check; prep?: (s: WsState) => void; project?: Project }> = {
  // Home · Help
  TUTORIAL: { check: (r) => ok(!!r.app.tour, "the tour did not start") },
  BUTTONGUIDE: { check: modal("button-guide") },
  SHORTCUTS: { check: route("/settings/shortcuts") },
  // Home · Layers
  LAYER: { check: explorer("layers") },
  ISOLATE: { check: (r) => ok(!!r.after.isolated?.includes("W-L1-S"), "the selection was not isolated"), prep: SELECT(["W-L1-S"]) },
  LAYLCK: { check: (r) => ok(!!r.after.project.layers.find((l) => l.id === "walls")?.locked, "the walls layer was not locked"), prep: SELECT(["W-L1-S"]) },
  GROUP: { check: (r) => ok(Object.keys(r.after.groups).length === 1, "no group was made"), prep: SELECT(["W-L1-S", "W-L1-N"]) },
  UNGROUP: { check: (r) => ok(Object.keys(r.after.groups).length === 0, "the group stayed"), prep: (s) => (s.patch({ groups: { "GROUP-01": ["W-L1-S", "W-L1-N"] } }), s.select(["W-L1-S"])) },
  // Insert
  ATTACH: { check: modal("import") },
  IMPORT: { check: modal("import") },
  DRONE: { check: modal("import") },
  PDFATTACH: { check: modal("import") },
  TERRAIN: { check: modal("import") },
  SOIL: { check: modal("import") },
  GEOLOCATE: { check: palette("site") },
  SITEFROMMAP: { check: logged(/elevation data|internet/i, "the elevation data being read") },
  PLACE: { check: modal("place") },
  XREF: { check: modal("link-project") },
  COMMUNITY: { check: all(modal("link-project"), (r) => ok(r.after.modal?.data?.community === true, "the dialog is not in community mode")) },
  LINKS: { check: palette("links") },
  MATERIAL: { check: explorer("library") },
  FURN: { check: all(tool("FURN"), explorer("library")) },
  "FIXT LIB": { check: all(tool("FIXT LIB"), explorer("library")) },
  MEPLIB: { check: all(tool("MEPLIB"), explorer("library")) },
  STRLIB: { check: all(tool("STRLIB"), explorer("library")) },
  // Insert · Lighting & Power, Plumbing & Air: the fixture tool of the system with the piece picked
  LIGHT: { check: piece("ELEC", "ceilinglight") },
  SWITCH: { check: piece("ELEC", "switch") },
  OUTLET: { check: piece("ELEC", "outlet") },
  CEILINGFAN: { check: piece("ELEC", "ceilingfan") },
  SMOKEDETECTOR: { check: piece("ELEC", "smoke") },
  THERMOSTAT: { check: piece("ELEC", "thermostat") },
  INVERTER: { check: piece("ELEC", "inverter") },
  SINK: { check: piece("PLUMB", "vanity") },
  FAUCET: { check: piece("PLUMB", "faucet") },
  TOILET: { check: piece("PLUMB", "toilet") },
  TUB: { check: piece("PLUMB", "bathtub") },
  SHOWER: { check: piece("PLUMB", "shower") },
  WATERHEATER: { check: piece("PLUMB", "waterheater") },
  ACUNIT: { check: piece("HVAC", "condenser") },
  // Insert · Connect
  SWITCHON: { check: (r) => ok(r.after.drawn.some((i) => i.id === "SW-T" && i.p.on === true), "the switch did not turn on"), prep: SWITCH_SELECTED },
  PIPEVIEW: { check: flips((s) => s.mepLook.plumbing, "the plumbing look") },
  WIREVIEW: { check: flips((s) => s.mepLook.electrical, "the electrical look") },
  // Annotate
  SCHEDULE: { check: modal("schedule") },
  QTO: { check: modal("qto") },
  // View
  PLAN: { check: (r) => ok(r.after.view === "2d", "not in 2D") },
  "3DVIEW": { check: (r) => ok(r.after.view === "3d", "not in 3D"), prep: (s) => s.setView("2d") },
  "3DORBIT": { check: (r) => ok(r.after.navTool === "orbit", "orbit is not the navigation tool") },
  "3DWALK": { check: (r) => ok(r.after.navTool === "walk" && r.after.camera.perspective, "not walking in perspective") },
  "ZOOM E": { check: (r) => ok((r.after.focus?.n ?? 0) > (r.before.focus?.n ?? 0), "nothing was framed") },
  VIEWSITE: { check: sheetOpened },
  VIEWTOPO: { check: sheetOpened },
  VIEWPLANS: { check: sheetOpened },
  FOUNDATIONPLAN: { check: (r) => ok(r.after.view === "2d" && r.after.plan.level === "foundation", "the foundation plan is not shown") },
  VIEWS: { check: explorer("views") },
  "-VIEW TOP": { check: (r) => ok(r.after.view === "2d", "Top is not the plan") },
  "-VIEW FRONT": { check: (r) => ok(r.after.view === "3d" && r.after.camera.bearing === 180 && r.after.camera.pitch === 0, "not the front view") },
  "-VIEW BACK": { check: (r) => ok(r.after.view === "3d" && r.after.camera.bearing === 0 && r.after.camera.pitch === 0, "not the back view") },
  "-VIEW LEFT": { check: (r) => ok(r.after.camera.bearing === 270 && r.after.camera.pitch === 0, "not the left view") },
  "-VIEW RIGHT": { check: (r) => ok(r.after.camera.bearing === 90 && r.after.camera.pitch === 0, "not the right view") },
  "-VIEW BOTTOM": { check: (r) => ok(r.after.camera.pitch === -90, "not the bottom view") },
  "-VIEW FLOORPLAN": { check: (r) => ok(r.after.view === "2d", "not the floor plan") },
  "-VIEW ELEVATION": { check: (r) => ok(r.after.view === "3d" && r.after.camera.pitch === 0, "not an elevation view") },
  INTERFACES: { check: modal("interfaces") },
  PERSP: { check: (r) => ok(r.after.camera.perspective, "not perspective") },
  ORTHO3D: { check: (r) => ok(!r.after.camera.perspective, "not orthographic"), prep: (s) => s.setCamera({ perspective: true }) },
  "VSCURRENT WIREFRAME": { check: (r) => ok(r.after.styleOverride === "wireframe", "style not wireframe") },
  "VSCURRENT SHADED": { check: (r) => ok(r.after.styleOverride === "shaded", "style not shaded") },
  "VSCURRENT REALISTIC": { check: (r) => ok(r.after.styleOverride === "realistic", "style not realistic") },
  "VSCURRENT XRAY": { check: (r) => ok(r.after.styleOverride === "xray", "style not x-ray") },
  SECTIONPLANE: { check: flips((s) => s.section, "the section cut") },
  SECTIONBOX: { check: flips((s) => s.sectionBox, "the section box") },
  GRID: { check: flips((s) => s.toggles.grid, "GRID") },
  RULERS: { check: flips((s) => s.rulers, "the rulers") },
  GUIDES: { check: flips((s) => s.guides, "the guides") },
  SNAP: { check: flips((s) => s.toggles.snap, "SNAP") },
  ORTHO: { check: flips((s) => s.toggles.ortho, "ORTHO") },
  FULL: { check: logged(/FULL/, "the FULL command") },
  LABELS: { check: flips((s) => s.labels, "the labels") },
  ROOMLABELS: { check: flips((s) => s.roomLabels, "the room names") },
  FURNLABELS: { check: flips((s) => s.furnLabels, "the furniture names") },
  GROUND: { check: palette("site") },
  CUTAWAY: { check: flips((s) => s.cutaway, "the cutaway") },
  UNDERLAY: { check: flips((s) => s.planShow, "the underlay") },
  BELOWGRADE: { check: flips((s) => s.belowGrade, "below grade") },
  HIDE: { check: (r) => ok(r.after.hidden.includes("W-L1-S"), "the selection was not hidden"), prep: SELECT(["W-L1-S"]) },
  UNHIDE: { check: (r) => ok(!r.after.hidden.length && r.after.isolated === null, "something is still hidden"), prep: (s) => s.setHidden(["W-L1-S"], true) },
  EXPLORER: { check: flips((s) => s.docks.explorer, "the explorer") },
  PALETTES: { check: flips((s) => s.docks.palettes, "the palettes") },
  TIMELINE: { check: flips((s) => s.docks.timeline, "the timeline") },
  CMDLINE: { check: flips((s) => s.docks.cmdline, "the command line") },
  // Analyze
  STRUCT: { check: palette("stress-test") },
  STRESS: { check: palette("stress-test") },
  LOADS: { check: all(palette("stress-test"), (r) => ok(r.after.stressSetup.loadCase === "combined", "load case not combined")) },
  DEFLECT: { check: palette("stress-test") },
  SOLAR: { check: flips((s) => s.solar, "the solar study") },
  WIND: { check: all(palette("simulation"), (r) => ok(r.after.simSetup.type === "hurricane", "not a hurricane simulation")) },
  SEISMIC: { check: all(palette("simulation"), (r) => ok(r.after.simSetup.type === "seismic", "not a seismic simulation")) },
  THERMAL: { check: all(palette("simulation"), (r) => ok(r.after.simSetup.type === "thermal", "not a thermal simulation")) },
  ENERGY: { check: all(palette("simulation"), (r) => ok(r.after.simSetup.type === "energy", "not an energy simulation")) },
  GRADING: { check: all(logged(/Cut \d/, "cut and fill"), logged(/Drainage/, "the drainage check")) },
  TRAFFIC: { check: all(palette("site"), (r) => ok(r.after.mapView.radius === 10 && r.after.mapView.base === "streets", "the map is not at 10 miles of streets")) },
  CLASH: { check: palette("clash") },
  CODECHECK: { check: all(palette("compliance"), logged(/Code check against/, "the code check")) },
  MATCHECK: { check: all(logged(/Concrete [\d.]+ cy/, "concrete quantities"), logged(/Coastal|hurricane|Termites/i, "climate advice")) },
  CONSTRUCT: { check: all(logged(/Footprint/, "the footprint"), logged(/Concrete pours/, "the pours")) },
  COST: { check: palette("cost") },
  SCHEDQ: { check: (r) => ok(r.after.timeline.open && r.after.dockSize.timeline !== "min", "the timeline did not open") },
  WORKFORCE: { check: all(palette("cost"), logged(/Workforce/, "the workforce")) },
  SIMULATE: { check: palette("simulation") },
  // Collaborate
  COMMENT: { check: all(palette("comments"), (r) => ok(r.after.activeTool === "COMMENT", "not placing a comment")) },
  ISSUE: { check: palette("issues") },
  TASK: { check: palette("issues") },
  PESIGN: { check: modal("pe-signoff") },
  APPROVALS: { check: modal("approvals") },
  REVIEW: { check: flips((s) => s.reviewMode, "review mode") },
  SHARE: { check: modal("share") },
  PERMS: { check: route("/settings/permissions") },
  HISTORY: { check: all(palette("versions"), (r) => ok(r.after.versionsTab === "history", "not the history list")) },
  VERSIONS: { check: all(palette("versions"), (r) => ok(r.after.versionsTab === "versions", "not the versions list")) },
  // AI
  ASK: { check: (r) => ok(r.after.cmdFocus > r.before.cmdFocus && r.after.docks.cmdline, "the command line did not take focus") },
  P2P: { check: modal("p2p") },
  EXPLAIN: { check: (r) => ok(r.logs.some((l) => l.kind === "ai"), "no answer from the agent") },
  AIGEN: { check: (r) => ok(r.after.cmdInput.startsWith("Generate"), "the prompt was not put in the command line") },
  AIAUTO: { check: (r) => ok(r.after.cmdInput.startsWith("Repeat"), "the prompt was not put in the command line") },
  AIREVIEW: { check: all(palette("ai-analysis"), (r) => ok(r.after.aiAnalysis.running || !!r.after.aiAnalysis.items?.length, "the review did not start")) },
  AICODE: { check: palette("ai-analysis") },
  AIERR: { check: palette("ai-analysis") },
  AICOST: { check: (r) => ok(r.logs.some((l) => l.kind === "ai"), "no answer from the agent") },
  AIMAT: { check: (r) => ok(r.logs.some((l) => l.kind === "ai"), "no answer from the agent") },
  AIOPT: { check: (r) => ok(r.logs.some((l) => l.kind === "ai"), "no answer from the agent") },
  AICMP: { check: (r) => ok(r.logs.some((l) => l.kind === "ai"), "no answer from the agent") },
  AIEDIT: { check: (r) => ok(r.after.cmdInput.length > 0, "no edit prompt") },
  COUNCIL: { check: palette("council") },
  CONNECTORS: { check: route("/settings/integrations") },
  AGENT: { check: (r) => ok(r.after.agentMenu, "the agent menu did not open") },
  // Manage
  SETTINGS: { check: route("/settings/general") },
  AISETTINGS: { check: route("/settings/ai") },
  UNITS: { check: route("/settings/units") },
  GRIDSNAP: { check: route("/settings/grid-snap") },
  TEMPLATES: { check: (r) => ok(r.after.doc === "start", "the Start tab did not open") },
  STANDARDS: { check: all(modal("project-info"), (r) => ok(r.after.modal?.data?.tab === "standards", "not the standards tab")) },
  ACCOUNT: { check: route("/settings/account") },
};

/** Fresh stores holding a project, and a router that records where it was sent. */
function setup(project: Project) {
  const app = createAppStore();
  const ws = createWorkspaceStore(
    { mode: "demo", project, query: DEFAULT_QUERY },
    { toast: (t, tone) => app.getState().toast(t, tone), log: (k, t) => app.getState().log(k, t), setDirty: (id, v) => app.getState().setDirty(id, v) },
  );
  const pushed: string[] = [];
  const ctx: CommandCtx = { ws, app, router: { push: (h) => void pushed.push(h), replace: (h) => void pushed.push(h), back: () => void pushed.push("back") } };
  return { app, ws, pushed, ctx };
}

const items = RIBBON.flatMap((t) => t.panels.flatMap((p) => p.items.map((it) => ({ tab: t.label, panel: p.name, it }))));

test("every ribbon button runs a known command", () => {
  for (const { tab, panel, it } of items) {
    if (it.command.startsWith("/")) continue;
    assert.ok(resolveCommand(it.command), `${tab} › ${panel} › ${it.label}: "${it.command}" is not a command`);
  }
});

test("every ribbon button has a description that says what it does", () => {
  // a category ("Measure", "Toggle", "Named view") or a pointer ("→ Cost palette") is not a description
  const generic = /^(toggle|measure|navigation|named view|camera|render mode|insert from library|pinned to model|recommendations)$|^(→|opens )/i;
  for (const { tab, panel, it } of items) {
    assert.ok(it.desc.length >= 25 && !generic.test(it.desc), `${tab} › ${panel} › ${it.label}: description "${it.desc}" is too thin`);
  }
});

for (const { tab, panel, it } of items) {
  test(`${tab} › ${panel} › ${it.label} (${it.command}) does what it says`, async () => {
    const def = resolveCommand(it.command)?.def;
    assert.ok(def, `unknown command ${it.command}`);
    const spec = EXPECT[it.command] ?? (TOOL_COMMANDS.has(def.name) ? { check: tool(def.name) } : null);
    assert.ok(spec, `no expectation for ${it.command}: add it to EXPECT`);
    const { app, ws, pushed, ctx } = setup(spec.project ?? RESIDENCE);
    spec.prep?.(ws.getState());
    const before = ws.getState();
    const seen = app.getState().history.length;
    await runCommand(ctx, it.command);
    const after = ws.getState();
    const logs = app.getState().history.slice(seen);
    const unknown = logs.find((l) => /Unknown command/.test(l.text));
    assert.equal(unknown, undefined, `logged: ${unknown?.text}`);
    const crashed = logs.find((l) => / failed: /.test(l.text) && !/IMAGE failed/.test(l.text));
    assert.equal(crashed, undefined, `logged: ${crashed?.text}`);
    const why = spec.check({ before, after, app: app.getState(), pushed, logs });
    assert.equal(why, null, why ?? "");
  });
}

test("the cottage sample opens with foundations and a septic system", async () => {
  const { ctx, ws } = setup(COTTAGE);
  await runCommand(ctx, "FOUNDATIONPLAN");
  assert.equal(ws.getState().plan.level, "foundation");
  const { sceneOf } = await import("./draw/scene-of");
  const scene = sceneOf(ws.getState());
  assert.ok(scene.elements.some((e) => e.category === "Footing"), "the cottage has footings");
  assert.ok(scene.elements.some((e) => e.category === "Septic"), "the cottage has a septic system");
  assert.equal(COTTAGE.levels.filter((l) => l.id === "level1" || l.id === "level2").length, 1, "one storey");
  assert.equal(scene.rooms.filter((r) => /BEDROOM/.test(r.name)).length, 2, "two bedrooms");
  assert.equal(scene.rooms.filter((r) => /BATH/.test(r.name)).length, 1, "one bath");
});
