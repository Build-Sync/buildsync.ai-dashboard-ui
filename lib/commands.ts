/**
 * lib/commands.ts
 *
 * WHAT   The command registry. Every ribbon button, command-line alias, keyboard shortcut, context-menu item
 *        and search result resolves through COMMANDS: each command has a name, title, description, group,
 *        aliases, default shortcut and a run() function. Also resolveCommand (typed text to command, user
 *        aliases first), runInput (the command line) and runCommand (ribbon and menus), and askAgent (anything
 *        unknown goes to the AI agent).
 *        Drawing and editing commands (LINE, WALL, MOVE, TRIM …) start the tool of the same name in lib/draw
 *        (beginTool); while a tool runs, typed points and keywords go to it before anything else (runInput).
 *        DELETE, copy / paste, duplicate and group act on drawn items and built-in elements; SAVEAS downloads a
 *        .bsd file and OPENFILE loads one (lib/persist.ts). The fixture pieces (LIGHT, SWITCH, SINK, TOILET, TUB …:
 *        PIECES) start the ELEC / PLUMB / HVAC tool with that piece picked; PIPEVIEW and WIREVIEW switch how pipes
 *        and wires are drawn; SWITCHON turns the selected switches on or off. WALKIN / NEXTROOM / PREVROOM /
 *        LEAVEROOM (and 3DWALK) stand you inside a room and take you from room to room (enterRoom, walkTo: the
 *        camera glides there); ROTATE90 / ROTATE90CCW turn the selection a quarter (or, while a placing tool runs,
 *        the piece it puts down next); FURNLABELS switches furniture names.
 * FOR    One place to add a feature: add a command here, then reference its name from the ribbon
 *        (ribbon.config.ts) or a menu. Shortcuts are stored in canonical form where "Ctrl" means the primary
 *        modifier (⌘ on a Mac); lib/shortcuts.ts and useHotkeys.ts match them per OS.
 * OS     `key` is the default shortcut for every OS; `macKey` replaces it on macOS where the convention differs
 *        ("" = none there, e.g. FULL: F11 is Show Desktop on macOS); `altKeys` also run the command everywhere
 *        (e.g. NEW also on Ctrl/⌘+Alt+N because browsers keep Ctrl/⌘+N for a new window).
 * DEBUG  - Typed text does nothing: resolveCommand matches the first word (and two-word names such as "ATTACH
 *          HOST") case-insensitively against names and aliases; anything else is sent to the AI agent.
 *        - A ribbon button logs "Unknown command": its item.command in ribbon.config.ts is not a name or alias
 *          here.
 *        - A shortcut does not fire: another command may use the same combo, or the browser reserves it; check
 *          bindingsOf in lib/shortcuts.ts and Settings → Shortcuts (which flags clashes).
 *        - A drawing command does nothing: its name must be a key of TOOLS (lib/draw/tools.ts, modify.ts);
 *          lib/persist.test.ts fails when a tool() command has no tool.
 *        - Commands run against CommandCtx = { ws, app, router }; use wsState(c) / c.app.getState() inside
 *          run().
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { AGENT_META } from "./agents";
import { routeLabel, routePrompt } from "./services/ai";
import { levelLabel } from "./scene";
import { applyChange, beginTool, deleteChange, planTransform, sceneOf, toolEnter, toolText } from "./draw";
import { affRotate, affTranslate } from "./draw/geom";
import { turnPlacing } from "./draw/tools";
import { exportBsd, parseBsd, snapshotOf } from "./persist";
import { saveFile } from "./save-file";
import { HOME_CAMERA, describeView, normBearing, type Camera } from "./scene/camera";
import { roomAt, roomGroups, roomView, roomsOfBuilding, roomsOn } from "./draw/interior";
import { isPlaced } from "./geo";
import { isLinkedId } from "./links";
import { GROUNDS, GROUND_TYPES, groundOf, parseGround, type GroundType } from "./ground";
import { pieceOf } from "./draw/furniture";
import { fixtureOf } from "./draw/fixtures";
import { constructabilityReport, gradingReport, materialReport } from "./reports";
import { aerialItem, areaAround, groundFromMap } from "./sitemap";
import { uid } from "./utils";
import { openView } from "./views";
import type { AppStore } from "./store/app-store";
import type { ModalId, ToggleKey, WsStore } from "./store/workspace-store";
import type { LayerId, PaletteId, RibbonTabId, VisualStyle } from "./types";
import { SIM_TYPES, type SimType } from "./services/analysis";

/* Command registry. Every ribbon button, command-line alias, keyboard shortcut,
 * context-menu item and app-bar search result resolves through here (spec §10.10). */

/** The part of the Next.js router that commands use. */
export interface Router {
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
}

/** Everything a command needs: the workspace store, the app store and the router. */
export interface CommandCtx {
  ws: WsStore;
  app: AppStore;
  router: Router;
}

/** One command: name, title, description, group, aliases, shortcuts and what it does. */
export interface CommandDef {
  name: string;
  title: string;
  desc: string;
  group: string;
  aliases?: string[];
  /** default keyboard shortcut, e.g. "F8", "Ctrl+Shift+S". "Ctrl" is the primary modifier: ⌘ on a Mac. */
  key?: string;
  /** replaces `key` on macOS where the platform convention differs ("" = no default shortcut there) */
  macKey?: string;
  /** more combos that also run the command on every platform (e.g. when a browser reserves the main one) */
  altKeys?: string[];
  run: (c: CommandCtx, args: string[]) => void | Promise<void>;
}

/* ── tiny helpers ─────────────────────────────────────────────────────── */
const log = (c: CommandCtx, kind: Parameters<ReturnType<AppStore["getState"]>["log"]>[0], text: string) => c.app.getState().log(kind, text);
const toast = (c: CommandCtx, text: string, tone: "ok" | "info" | "warn" | "bad" = "ok") => c.app.getState().toast(text, tone);
const wsState = (c: CommandCtx) => c.ws.getState();

function openPanel(c: CommandCtx, tab: RibbonTabId | null, panel: PaletteId) {
  const s = wsState(c);
  if (tab) s.setTab(tab);
  s.setPanel(panel);
}

/** Give the site another kind of ground (one undo step): the project remembers it and the ground's surface colour follows. */
export function setGround(ws: CommandCtx["ws"], g: GroundType): void {
  ws.getState().edit("Ground type", (st) => ({ project: { ...st.project, ground: g }, colors: { ...st.colors, topography: GROUNDS[g].top } }));
}

const onOff = (v: boolean) => (v ? "<On>" : "<Off>");

function flip(c: CommandCtx, key: ToggleKey, label: string) {
  const s = wsState(c);
  s.toggle(key);
  log(c, "ok", `✓ ${label} ${onOff(wsState(c).toggles[key])}`);
}

/** The names of the commands that start a drawing or editing tool (lib/commands.test.ts checks each has a tool). */
export const TOOL_COMMANDS = new Set<string>();

/**
 * Drawing / editing tool: starts the tool of the same name from lib/draw (click points in the viewport or type them
 * in the command line). A name without a tool there (it would be a bug, a unit test checks) only prints its prompt.
 */
function tool(name: string, title: string, desc: string, group: string, prompt = "Specify first point:", aliases?: string[]): CommandDef {
  TOOL_COMMANDS.add(name);
  return {
    name,
    title,
    desc,
    group,
    aliases,
    run: (c) => {
      if (beginTool(c, name)) return;
      const s = wsState(c);
      if (s.reviewMode) return toast(c, "Review mode is read-only.", "warn");
      s.setTool(name, prompt);
      log(c, "info", `${name}  ${prompt}`);
    },
  };
}

function route(name: string, title: string, desc: string, href: string, aliases?: string[], key?: string): CommandDef {
  return { name, title, desc, group: "Manage", aliases, key, run: (c) => c.router.push(href) };
}

function modal(name: string, title: string, desc: string, group: string, id: ModalId, data?: Record<string, string | number | boolean>, aliases?: string[], key?: string): CommandDef {
  return { name, title, desc, group, aliases, key, run: (c) => wsState(c).openModal(id, data) };
}

function showPanel(name: string, title: string, desc: string, group: string, tab: RibbonTabId | null, panel: PaletteId, aliases?: string[], extra?: (c: CommandCtx) => void): CommandDef {
  return {
    name,
    title,
    desc,
    group,
    aliases,
    run: (c) => {
      openPanel(c, tab, panel);
      extra?.(c);
      log(c, "ok", `✓ ${title} panel opened`);
    },
  };
}

function prompt(name: string, title: string, desc: string, text: string, run = false): CommandDef {
  return {
    name,
    title,
    desc,
    group: "AI",
    run: async (c) => {
      const s = wsState(c);
      const subject = s.selection[0] ? ` (${s.selection[0]})` : "";
      const t = text.replace("{sel}", subject);
      if (run) await askAgent(c, t);
      else {
        s.setCmdInput(t);
        log(c, "info", `${name}: edit the prompt and press Enter.`);
      }
    },
  };
}

/** A check worked out from the model when it runs (lib/reports.ts): its lines go to the command line. */
function computed(name: string, title: string, desc: string, lines: (c: CommandCtx) => string[]): CommandDef {
  return {
    name,
    title,
    desc,
    group: "Analyze",
    run: (c) => {
      const out = lines(c);
      log(c, "ok", `✓ ${title} (from the model, advisory)`);
      out.forEach((l) => log(c, "info", `  ${l}`));
      wsState(c).setCmdInput("", false);
      wsState(c).setDockSize("cmdline", "large");
      toast(c, `${title}: ${out.length} findings in the command line`, "info");
    },
  };
}

const layerTool = (name: string, title: string, desc: string, layer: LayerId, prompt: string): CommandDef => ({
  name: (TOOL_COMMANDS.add(name), name),
  title,
  desc,
  group: "Home",
  run: (c) => {
    const s = wsState(c);
    const cur = s.project.layers.find((l) => l.id === layer);
    // pressing the button again while its tool is running turns the layer (and the tool) off
    const turnOff = !!cur?.visible && s.activeTool === name;
    s.toggleLayer(layer, !turnOff);
    if (!turnOff) {
      log(c, "ok", `✓ ${title} layer on`);
      if (!beginTool(c, name)) s.setTool(name, prompt);
    } else {
      s.setTool(null);
      log(c, "ok", `✓ ${title} layer off`);
    }
  },
});

/** The fixture pieces with a command of their own: [command, title, description, tool, catalogue id, aliases]. */
const PIECES: [string, string, string, string, string, string[]][] = [
  ["LIGHT", "Light", "Place a ceiling light (or pick a recessed light, pendant or sconce in the tool bar); wire it to a switch", "ELEC", "ceilinglight", ["CEILINGLIGHT", "LIGHTS"]],
  ["SWITCH", "Switch", "Place a light switch on a wall (single, 3-way or dimmer in the tool bar); then WIRE it to the lights", "ELEC", "switch", ["LIGHTSWITCH"]],
  ["OUTLET", "Outlet", "Place an outlet on a wall (duplex, GFCI or 240 V in the tool bar)", "ELEC", "outlet", ["RECEPTACLE"]],
  ["CEILINGFAN", "Ceiling Fan", "Place a ceiling fan with a light; wire it to a switch", "ELEC", "ceilingfan", ["FAN"]],
  ["SMOKEDETECTOR", "Smoke Detector", "Place a smoke / CO detector on the ceiling", "ELEC", "smoke", ["SMOKE"]],
  ["THERMOSTAT", "Thermostat", "Place a thermostat on a wall", "ELEC", "thermostat", []],
  ["INVERTER", "Inverter", "Place a solar inverter on a wall; wire the panel and the solar array's circuit to it", "ELEC", "inverter", ["SOLARINVERTER"]],
  ["SINK", "Sink", "Place a bathroom vanity and sink against a wall (kitchen sink, pedestal sink or a double vanity in the tool bar)", "PLUMB", "vanity", ["VANITY", "LAVATORY"]],
  ["FAUCET", "Faucet", "Place a faucet on a counter", "PLUMB", "faucet", []],
  ["TOILET", "Toilet", "Place a toilet against a wall", "PLUMB", "toilet", ["WC"]],
  ["TUB", "Bathtub", "Place a bathtub (alcove or freestanding in the tool bar)", "PLUMB", "bathtub", ["BATHTUB"]],
  ["SHOWER", "Shower", "Place a glass shower (36 × 36) in a corner or against a wall", "PLUMB", "shower", []],
  ["WATERHEATER", "Water Heater", "Place a water heater (tank or tankless in the tool bar); pipe hot water from it to the fixtures", "PLUMB", "waterheater", ["HOTWATER"]],
  ["ACUNIT", "AC Unit", "Place an AC condenser outside (or a mini-split in the tool bar)", "HVAC", "condenser", ["AC", "CONDENSER", "AIRCON"]],
];

/** A command that starts a fixture tool with one piece of the catalogue picked. */
function piece(name: string, title: string, desc: string, toolName: string, type: string, aliases: string[]): CommandDef {
  return {
    name,
    title,
    desc,
    group: "Systems",
    aliases,
    run: (c) => {
      const s = wsState(c);
      if (s.reviewMode) return toast(c, "Review mode is read-only.", "warn");
      s.patch({ toolOpts: { ...s.toolOpts, [toolName]: { ...(s.toolOpts[toolName] ?? {}), type } } });
      beginTool(c, toolName);
    },
  };
}

/**
 * A quarter turn: the selection about the centre of its bounds, or, while a placing tool runs, the piece it puts down
 * next. Locked elements and linked projects stay as they are.
 */
function quarterTurn(c: CommandCtx, clockwise: boolean): void {
  const s = wsState(c);
  if (s.reviewMode) return toast(c, "Review mode is read-only.", "warn");
  const by = clockwise ? -90 : 90;
  const tool = s.session?.tool;
  if (tool) {
    const rot = turnPlacing(s, tool, by);
    if (rot !== null) return log(c, "ok", `✓ Turned to ${rot}°`);
  }
  const scene = sceneOf(s);
  const lockedLayer = (id: string) => !!s.project.layers.find((l) => l.id === scene.elementById[id]?.layer)?.locked;
  const ids = s.selection.filter((id) => scene.elementById[id] && scene.elementById[id].layer !== "topography" && !isLinkedId(id) && !s.locked.includes(id) && !lockedLayer(id));
  if (!ids.length) return toast(c, s.selection.length ? "Those elements are locked or part of a linked project." : "Select what to turn first (or use this while placing a piece).", "info");
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of ids) {
    const e = scene.elementById[id];
    x0 = Math.min(x0, e.min[0]); y0 = Math.min(y0, e.min[1]); x1 = Math.max(x1, e.max[0]); y1 = Math.max(y1, e.max[1]);
  }
  const r = planTransform(s, scene, ids, { aff: affRotate((by * Math.PI) / 180, (x0 + x1) / 2, (y0 + y1) / 2) }, false);
  if (r.skipped.length) toast(c, `${r.skipped.length} element(s) can't turn a quarter (gables and roof pieces turn only 180°; doors slide along their wall).`, "warn");
  if (!(r.change.add?.length || r.change.replace?.length || Object.keys(r.change.xf ?? {}).length)) return;
  s.edit(clockwise ? "Turn 90° clockwise" : "Turn 90° counter-clockwise", (st) => applyChange(st, r.change));
  log(c, "ok", `✓ Turned ${ids.length - r.skipped.length} object(s) 90° ${clockwise ? "clockwise" : "counter-clockwise"}`);
}

/* ── the room view ────────────────────────────────────────────────────── */
let glideRun = 0;

/** Move the camera to `to` in about half a second (a walk from room to room), or at once without animation frames. */
function glide(c: CommandCtx, to: Camera): void {
  const s = wsState(c);
  const from = s.camera;
  if (typeof requestAnimationFrame !== "function" || !from.eye || !to.eye) return s.setCamera(to);
  const run = ++glideRun;
  const a = from.eye;
  const b = to.eye;
  const turn = ((to.bearing - from.bearing + 540) % 360) - 180;
  const t0 = performance.now();
  const frame = (now: number) => {
    if (run !== glideRun || !wsState(c).camera.eye) return;
    const k = Math.min(1, (now - t0) / 450);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    wsState(c).setCamera({ ...to, eye: [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e], bearing: normBearing(from.bearing + turn * e), pitch: from.pitch + (to.pitch - from.pitch) * e });
    if (k < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Stand inside a room (the room view), remembering the 3D view to come back to. */
export function enterRoom(c: CommandCtx, roomId: string): boolean {
  const s = wsState(c);
  const scene = sceneOf(s);
  const room = scene.rooms.find((r) => r.id === roomId);
  if (!room) return false;
  const outside = s.outsideCamera ?? (s.camera.eye ? { ...HOME_CAMERA } : s.camera);
  s.patch({ view: "3d", layoutTab: "model", insideRoom: room.id, outsideCamera: outside, navTool: "walk", plan: { ...s.plan, level: room.level } });
  glide(c, { ...s.camera, ...roomView(scene, room), perspective: true, zoom: 1, panX: 0, panY: 0 });
  log(c, "ok", `✓ Inside ${room.name}: drag to look around, scroll to zoom, arrow keys to walk; double-click another room's name to go there; Esc leaves`);
  return true;
}

/** In the room view: walk to a point of the floor (a double-click on it), into whichever room it is in. */
export function walkTo(c: CommandCtx, pt: [number, number]): void {
  const s = wsState(c);
  const eye = s.camera.eye;
  if (!eye) return;
  const scene = sceneOf(s);
  const room = roomAt(scene, s.plan.level, pt);
  if (room && room.id !== s.insideRoom) s.patch({ insideRoom: room.id });
  glide(c, { ...s.camera, eye: [pt[0], pt[1], eye[2]] });
}

/** The next (or previous) room of the building you are in, storey by storey from the ground up, round to the first. */
function stepRoom(c: CommandCtx, dir: 1 | -1): void {
  const s = wsState(c);
  const scene = sceneOf(s);
  const here = scene.rooms.find((r) => r.id === s.insideRoom);
  const rooms = here ? roomsOfBuilding(scene, here) : (roomGroups(scene, s.project.name)[0]?.levels.flatMap((l) => l.rooms) ?? []);
  if (!rooms.length) return toast(c, "This project has no rooms yet: name them with ROOM (Home → Building).", "warn");
  const i = here ? rooms.findIndex((r) => r.id === here.id) : dir > 0 ? -1 : 0;
  enterRoom(c, rooms[(i + dir + rooms.length) % rooms.length].id);
}

/** Paste or duplicate: copies of the ids, one foot north-east of the originals, selected afterwards. */
function pasteOffset(c: CommandCtx, ids: string[], label: string) {
  const s = wsState(c);
  const r = planTransform(s, sceneOf(s), ids, { aff: affTranslate(1, 1) }, true);
  if (!r.newIds.length) return toast(c, "Nothing to copy (those elements can't be duplicated).", "warn");
  s.edit(label, (st) => applyChange(st, r.change));
  s.select(r.newIds);
  log(c, "ok", `✓ ${label}: ${r.newIds.length} element(s)`);
}

/* ── AI ───────────────────────────────────────────────────────────────── */
export async function askAgent(c: CommandCtx, text: string) {
  const app = c.app.getState();
  const s = wsState(c);
  const connected = app.agents.filter((a) => a.connected).map((a) => a.id);
  if (!connected.length) {
    app.log("warn", "⚠ No AI agent connected. Open Settings → Connectors to connect one.");
    app.toast("No agent connected. Open Connectors to add one.", "warn");
    return;
  }
  const active = connected.includes(app.activeAgentId) ? app.activeAgentId : connected[0];
  const scene = sceneOf(s);
  s.patch({ cmdBusy: true });
  try {
    const share = app.settings.ai.shareContext;
    const res = await routePrompt({
      prompt: text,
      activeAgent: active,
      routing: app.settings.routing,
      connected,
      ctx: {
        selection: share ? s.selection : [],
        level: share ? levelLabel(s.plan.level) : "—",
        view: share ? (s.view === "2d" ? "2D plan" : describeView(s.camera)) : "—",
        jurisdiction: share ? s.project.jurisdiction.name : "—",
        shareContext: share,
      },
    });
    const name = AGENT_META[res.agentId].name;
    app.log("ai", routeLabel(res.task, res.agentId) + (res.fellBack ? " (preferred agent not connected)" : ""));
    res.text.forEach((line, i) => app.log("info", i === 0 ? `${name}: ${line}` : `  ${line}`));
    if (app.settings.ai.citeCode && res.task === "compliance") app.log("info", "  Cited: FBC-B §1604.3.1 · FBC-R §R311.7 (mock references)");
    if (res.proposal) {
      wsState(c).addProposal(res.proposal);
      wsState(c).select(res.proposal.elementIds.slice(0, 1).filter((id) => scene.elementById[id]));
      app.log("ai", `→ ${name} proposes an edit. Preview it below, then Accept or Reject.`);
    }
    if (res.task === "p2p") wsState(c).openModal("p2p", { prompt: text });
    if (res.task === "stress" && !res.proposal) wsState(c).setPanel("stress-test");
  } finally {
    wsState(c).patch({ cmdBusy: false });
  }
}

/* ── command table ────────────────────────────────────────────────────── */
function buildCommands(): CommandDef[] {
  const cmds: CommandDef[] = [];
  const add = (...d: CommandDef[]) => cmds.push(...d);

  /* file / quick access */
  add(
    {
      name: "NEW",
      title: "New",
      desc: "Create a new project",
      group: "File",
      key: "Ctrl+N",
      altKeys: ["Ctrl+Alt+N"], // browsers keep Ctrl/⌘+N for "new window"
      run: (c) => {
        if (wsState(c).mode === "demo") return wsState(c).openModal("start-free");
        wsState(c).openModal("new-project");
      },
    },
    {
      name: "OPEN",
      title: "Open",
      desc: "Open the Start tab with recent projects",
      group: "File",
      key: "Ctrl+O",
      run: (c) => wsState(c).setDoc("start"),
    },
    {
      name: "QSAVE",
      title: "Save",
      desc: "Save the project",
      group: "File",
      key: "Ctrl+S",
      aliases: ["SAVE"],
      run: (c) => wsState(c).save(),
    },
    {
      name: "SAVEAS",
      title: "Save As",
      desc: "Download the project as a .bsd file",
      group: "File",
      key: "Ctrl+Shift+S",
      run: (c) => {
        const s = wsState(c);
        const name = s.project.fileName.endsWith(".bsd") ? s.project.fileName : `${s.project.fileName}.bsd`;
        saveFile(name, exportBsd(snapshotOf(s), s.project.versions), "application/json");
        toast(c, `Downloaded ${name}`, "ok");
        log(c, "ok", `✓ Saved a copy as ${name}`);
      },
    },
    {
      name: "OPENFILE",
      title: "Open File",
      desc: "Load a .bsd project file into this project",
      group: "File",
      aliases: ["OPENBSD"],
      run: (c) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".bsd,application/json";
        input.style.display = "none";
        input.setAttribute("data-testid", "bsd-input");
        input.onchange = async () => {
          const file = input.files?.[0];
          input.remove();
          if (!file) return;
          const parsed = parseBsd(await file.text());
          if (!parsed) return toast(c, `${file.name} is not a BuildSync project file.`, "bad");
          const s = wsState(c);
          const kind = (parsed.work.project as { sceneKind?: string } | undefined)?.sceneKind;
          if (kind && kind !== s.project.sceneKind) return toast(c, `${file.name} is a different kind of project. Open it from the Start tab.`, "warn");
          s.importWork(parsed.work, parsed.versions);
          toast(c, `Opened ${file.name}. Undo brings back what you had.`, "ok");
          log(c, "ok", `✓ Opened ${file.name}`);
        };
        document.body.appendChild(input);
        input.click();
      },
    },
    {
      name: "U",
      title: "Undo",
      desc: "Undo the last change",
      group: "File",
      key: "Ctrl+Z",
      aliases: ["UNDO"],
      run: (c) => {
        const l = wsState(c).undo();
        if (l) log(c, "ok", `✓ Undo: ${l}`);
        else log(c, "warn", "⚠ Nothing to undo");
      },
    },
    {
      name: "REDO",
      title: "Redo",
      desc: "Redo the last undone change",
      group: "File",
      key: "Ctrl+Y",
      macKey: "Ctrl+Shift+Z",
      altKeys: ["Ctrl+Shift+Z"],
      run: (c) => {
        const l = wsState(c).redo();
        if (l) log(c, "ok", `✓ Redo: ${l}`);
        else log(c, "warn", "⚠ Nothing to redo");
      },
    },
    modal("PROJINFO", "Project Information", "Name, address, client, architect, engineer, jurisdiction", "File", "project-info"),
    showPanel("VERSIONS", "Project Versions", "Version history: save, compare and restore", "Collaborate", "collaborate", "versions", ["VERSION"], (c) => wsState(c).patch({ versionsTab: "versions" })),
    showPanel("HISTORY", "History", "Activity log for this project", "Collaborate", "collaborate", "versions", undefined, (c) => wsState(c).patch({ versionsTab: "history" })),
    modal("EXPORT", "Export", "PDF, IFC, DWG, report or render", "File", "export"),
    {
      name: "ARCHIVE",
      title: "Archive Project",
      desc: "Move this project to the archive",
      group: "File",
      run: (c) => {
        if (wsState(c).mode === "demo") return wsState(c).openModal("start-free");
        toast(c, "Project archived (mock)", "info");
      },
    },
    {
      name: "CLOSE",
      title: "Close Project",
      desc: "Close this document tab",
      group: "File",
      aliases: ["CLOSEPROJECT"],
      run: (c) => {
        const id = wsState(c).project.id;
        const next = c.app.getState().closeTab(id);
        const base = wsState(c).mode === "demo" ? "/demo" : "/app/projects";
        if (next) c.router.push(wsState(c).mode === "demo" ? `${base}?project=${next}` : `${base}/${next}`);
        else c.router.push(wsState(c).mode === "demo" ? "/demo?doc=start" : "/app");
      },
    },
  );

  /* edit (context menu) */
  add(
    {
      name: "CUTCLIP",
      title: "Cut",
      desc: "Cut the selection",
      group: "Edit",
      key: "Ctrl+X",
      run: (c) => {
        const s = wsState(c);
        if (!s.selection.length) return toast(c, "Nothing selected", "warn");
        if (s.selection.some((i) => s.locked.includes(i))) return toast(c, "Locked elements can't be cut. Unlock first.", "warn");
        const n = s.selection.length;
        s.patch({ clipboard: s.selection });
        s.edit("Cut", (st) => applyChange(st, deleteChange(st, st.selection)));
        toast(c, `Cut ${n} element(s)`);
      },
    },
    { name: "COPYCLIP", title: "Copy", desc: "Copy the selection", group: "Edit", key: "Ctrl+C", run: (c) => { const s = wsState(c); if (!s.selection.length) return toast(c, "Nothing selected", "warn"); s.patch({ clipboard: s.selection }); toast(c, `Copied ${s.selection.length} element(s)`); } },
    {
      name: "PASTECLIP",
      title: "Paste",
      desc: "Paste a copy next to the original",
      group: "Edit",
      key: "Ctrl+V",
      run: (c) => {
        const s = wsState(c);
        if (!s.clipboard.length) return toast(c, "Clipboard is empty", "warn");
        pasteOffset(c, s.clipboard, "Paste");
      },
    },
    {
      name: "DUPLICATE",
      title: "Duplicate",
      desc: "Duplicate the selection, offset by 1 ft",
      group: "Edit",
      key: "Ctrl+D",
      run: (c) => {
        const s = wsState(c);
        if (!s.selection.length) return toast(c, "Nothing selected", "warn");
        pasteOffset(c, s.selection, "Duplicate");
      },
    },
    {
      name: "DELETE",
      title: "Delete",
      desc: "Delete the selection",
      group: "Edit",
      key: "Delete",
      aliases: ["ERASE"],
      run: (c) => {
        const s = wsState(c);
        if (!s.selection.length) return toast(c, "Nothing selected", "warn");
        const locked = s.selection.filter((i) => s.locked.includes(i));
        if (locked.length) return toast(c, "Locked elements can't be deleted. Unlock first.", "warn");
        // a linked project is read-only here: Unlink it in the Links palette, or open it to delete there
        const own = s.selection.filter((i) => !isLinkedId(i));
        if (own.length < s.selection.length) toast(c, "Elements of a linked project can't be deleted here: open that project, or Unlink it in the Links palette.", "warn");
        if (!own.length) return;
        const n = own.length;
        s.edit("Delete", (st) => applyChange(st, deleteChange(st, own)));
        s.clearSelection();
        log(c, "ok", `✓ Deleted ${n} element(s)`);
      },
    },
    { name: "SELECTALL", title: "Select All", desc: "Select every visible element", group: "Edit", key: "Ctrl+A", run: (c) => { const s = wsState(c); const scene = sceneOf(s); const vis = s.project.layers.filter((l) => l.visible).map((l) => l.id); s.select(scene.elements.filter((e) => vis.includes(e.layer) && !s.hidden.includes(e.id) && e.layer !== "topography").map((e) => e.id)); log(c, "ok", `✓ ${wsState(c).selection.length} selected`); } },
    { name: "DESELECT", title: "Deselect All", desc: "Clear the selection", group: "Edit", key: "Esc", run: (c) => wsState(c).clearSelection() },
    { name: "FIND", title: "Find / Replace", desc: "Search commands, settings and elements", group: "Edit", key: "Ctrl+K", run: (c) => wsState(c).patch({ searchFocus: wsState(c).searchFocus + 1 }) },
    {
      name: "GROUP",
      title: "Group",
      desc: "Group the selection so it selects and moves as one",
      group: "Edit",
      key: "Ctrl+G",
      run: (c) => {
        const s = wsState(c);
        if (s.selection.length < 2) return toast(c, "Select two or more elements to group", "warn");
        const members = [...s.selection];
        const n = Object.keys(s.groups).length + 1;
        const id = `GROUP-${String(n).padStart(2, "0")}`;
        const groups: Record<string, string[]> = {};
        // members leave any group they were in; groups left with one member dissolve
        for (const [g, ids] of Object.entries(s.groups)) {
          const left = ids.filter((m) => !members.includes(m));
          if (left.length > 1) groups[g] = left;
        }
        groups[id] = members;
        s.edit("Group", () => ({ groups }));
        log(c, "ok", `✓ Grouped ${members.length} elements as ${id}`);
      },
    },
    {
      name: "UNGROUP",
      title: "Ungroup",
      desc: "Dissolve the selected group",
      group: "Edit",
      run: (c) => {
        const s = wsState(c);
        const hit = Object.entries(s.groups).filter(([, ids]) => ids.some((m) => s.selection.includes(m)));
        if (!hit.length) return toast(c, "The selection is not part of a group", "warn");
        const groups = { ...s.groups };
        for (const [g] of hit) delete groups[g];
        s.edit("Ungroup", () => ({ groups }));
        log(c, "ok", `✓ Ungrouped ${hit.map(([g]) => g).join(", ")}`);
      },
    },
    { name: "LOCK", title: "Lock", desc: "Lock the selection against edits", group: "Edit", run: (c) => { const s = wsState(c); if (!s.selection.length) return toast(c, "Nothing selected", "warn"); s.setLocked(s.selection, true); log(c, "ok", `✓ Locked ${s.selection.length} element(s)`); } },
    { name: "UNLOCK", title: "Unlock", desc: "Unlock the selection", group: "Edit", run: (c) => { const s = wsState(c); s.setLocked(s.selection.length ? s.selection : s.locked, false); log(c, "ok", "✓ Unlocked"); } },
    { name: "PROPERTIES", title: "Properties", desc: "Open the Properties palette", group: "Edit", key: "Ctrl+1", aliases: ["PR"], run: (c) => openPanel(c, null, "properties") },
  );

  /* ── Home ─ Draw */
  add(
    tool("LINE", "Line", "Straight reference line", "Home", "Specify first point:", ["L"]),
    tool("PLINE", "Polyline", "Connected segments", "Home", "Specify start point:", ["PL"]),
    tool("RECTANG", "Rectangle", "Rectangular geometry", "Home", "Specify first corner point:", ["REC"]),
    tool("CIRCLE", "Circle", "Circular geometry", "Home", "Specify center point for circle:", ["C"]),
    tool("ARC", "Arc", "Curved geometry", "Home", "Specify start point of arc:"),
    tool("SPLINE", "Spline", "Freeform curve", "Home", "Specify first point:"),
    tool("HATCH", "Hatch", "Pattern fill", "Home", "Pick internal point:"),
  );
  /* Building */
  add(
    tool("WALL", "Wall", "Walls with height, thickness and material", "Home", "Specify wall start point:", ["W"]),
    tool("DOOR", "Door", "Insert a door into a wall", "Home", "Select a wall to host the door:"),
    tool("WINDOW", "Window", "Insert a window into a wall", "Home", "Select a wall to host the window:"),
    tool("SLAB", "Slab", "Floor slab", "Home", "Specify slab boundary:"),
    tool("ROOF", "Roof", "Roof from a boundary", "Home", "Pick roof boundary:"),
    tool("STAIR", "Stair", "Stair run", "Home", "Specify stair start point:"),
    tool("COLUMN", "Column", "Structural column", "Home", "Specify column location:"),
    tool("BEAM", "Beam", "Structural beam", "Home", "Specify beam start point:"),
    tool("RAMP", "Ramp", "Accessible ramp", "Home", "Specify ramp start point:"),
    tool("ROOM", "Room", "Define a room / space", "Home", "Click inside a closed boundary:"),
  );
  /* Structure */
  add(
    tool("FOUNDATION", "Foundation", "Footings, slab on grade and piles", "Home", "Specify foundation boundary:"),
    tool("FRAMING", "Framing", "Joists, rafters and studs", "Home", "Select host element:"),
    tool("TRUSS", "Trusses", "Roof and floor trusses", "Home", "Select roof boundary:"),
    tool("BRACE", "Bracing", "Lateral bracing", "Home", "Specify brace start point:"),
    tool("CONNECT", "Connections", "Structural connections", "Home", "Select two members to connect:"),
  );
  /* MEP */
  add(
    tool("HVAC", "HVAC", "Place HVAC equipment: an AC condenser, mini-split, air handler, diffuser or return grille", "Home", "Click where the unit goes:"),
    layerTool("ELEC", "Electrical", "Place electrical devices: lights, switches, outlets, fans, detectors, the panel, an inverter … (also toggles the layer)", "electrical", "Click where the device goes:"),
    layerTool("PLUMB", "Plumbing", "Place plumbing fixtures: sinks, faucets, toilets, tubs, showers, the water heater … (also toggles the layer)", "plumbing", "Click where the fixture goes:"),
    tool("DUCT", "Ducts", "Duct runs", "Home", "Specify duct start point:"),
    tool("PIPE", "Pipes", "Pipe runs", "Home", "Specify pipe start point:"),
    tool("TRAY", "Cable Trays", "Cable tray runs", "Home", "Specify tray start point:"),
    tool("FIRE", "Fire Protection", "Sprinklers and alarms", "Home", "Specify sprinkler head location:"),
    tool("FIXT", "Fixtures", "Place any MEP fixture of the catalogue: lights, switches, outlets, sinks, toilets, tubs, AC units …", "Home", "Click where the fixture goes:"),
    tool("EQUIP", "Equipment", "Place equipment: the water heater, air handler, AC condenser, panel, inverter, battery or a generator", "Home", "Click where the equipment goes:"),
    tool("WIRE", "Wire", "Wire electrical devices: click a switch (or a panel, an outlet), then each light, fan or outlet it feeds; the switch then controls them", "Home", "Click the switch, panel or outlet the wire starts at:", ["WIRING", "CONNECTWIRE"]),
    tool("PIPECONNECT", "Pipe Connect", "Pipe plumbing fixtures: click the water heater (hot), the water supply (cold) or the drain stack (waste), then each fixture to connect", "Home", "Click the water heater, the water supply or the drain stack:", ["PCONNECT", "PLUMBTO", "CONNECTPIPE"]),
    tool("SOLARPANEL", "Solar Panels", "A solar array: click a roof slope (it follows the roof) or the ground (racked); rows and panels in the tool bar", "Systems", "Click a roof slope or the ground:", ["SOLARPANELS", "PV", "SOLARARRAY"]),
    ...PIECES.map(([name, title, desc, toolName, type, aliases]) => piece(name, title, desc, toolName, type, aliases)),
    {
      name: "PIPEVIEW",
      title: "Pipes",
      desc: "Show plumbing as the pipes themselves (cold blue, hot red, drains brown, at their real size) instead of dotted drawing lines",
      group: "View",
      aliases: ["PIPES", "PIPELOOK"],
      run: (c) => {
        const s = wsState(c);
        const pipes = s.mepLook.plumbing !== "pipes";
        s.patch({ mepLook: { ...s.mepLook, plumbing: pipes ? "pipes" : "lines" } });
        if (pipes) s.toggleLayer("plumbing", true);
        log(c, "ok", `✓ Plumbing drawn as ${pipes ? "pipes (cold blue, hot red, drain brown)" : "dotted lines"}`);
      },
    },
    {
      name: "WIREVIEW",
      title: "Wires",
      desc: "Show electrical as the cables themselves (yellow power, white switched legs) instead of dashed drawing lines",
      group: "View",
      aliases: ["WIRES", "WIRELOOK"],
      run: (c) => {
        const s = wsState(c);
        const wires = s.mepLook.electrical !== "wires";
        s.patch({ mepLook: { ...s.mepLook, electrical: wires ? "wires" : "lines" } });
        if (wires) s.toggleLayer("electrical", true);
        log(c, "ok", `✓ Electrical drawn as ${wires ? "wires (yellow power, white switched legs)" : "dashed lines"}`);
      },
    },
    {
      name: "SWITCHON",
      title: "Turn Switch On / Off",
      desc: "Turn the selected switches on or off: the lights they are wired to light up (or go dark) in 2D and 3D",
      group: "Systems",
      aliases: ["TOGGLESWITCH", "LIGHTSON"],
      run: (c) => {
        const s = wsState(c);
        const switches = s.drawn.filter((i) => s.selection.includes(i.id) && i.kind === "fixture" && fixtureOf(String(i.p.type ?? ""))?.role === "switch");
        if (!switches.length) return toast(c, "Select a switch first (click it in the plan or in 3D).", "warn");
        const on = !switches.every((i) => i.p.on === true);
        s.edit(on ? "Switch on" : "Switch off", (st) => ({ drawn: st.drawn.map((i) => (switches.some((w) => w.id === i.id) ? { ...i, p: { ...i.p, on } } : i)) }));
        log(c, "ok", `✓ ${switches.map((i) => i.name).join(", ")} ${on ? "on: the lights they control are lit" : "off"}`);
      },
    },
  );
  /* Modify */
  add(
    tool("MOVE", "Move", "Move the selection", "Home", "Specify base point:", ["M"]),
    tool("ROTATE", "Rotate", "Rotate the selection", "Home", "Specify base point:", ["RO"]),
    tool("SCALE", "Scale", "Scale the selection", "Home", "Specify base point:", ["SC"]),
    tool("MIRROR", "Mirror", "Mirror the selection", "Home", "Specify first point of mirror line:", ["MI"]),
    tool("OFFSET", "Offset", "Offset curves or walls", "Home", "Specify offset distance:", ["O"]),
    tool("TRIM", "Trim", "Trim to a cutting edge", "Home", "Select cutting edges:", ["TR"]),
    tool("EXTEND", "Extend", "Extend to a boundary", "Home", "Select boundary edges:", ["EX"]),
    tool("FILLET", "Fillet", "Round a corner", "Home", "Select first object:"),
    tool("CHAMFER", "Chamfer", "Bevel a corner", "Home", "Select first line:"),
    tool("ARRAY", "Array", "Repeat in a pattern", "Home", "Select objects:", undefined),
    tool("SPLIT", "Split", "Split an element in two", "Home", "Specify split point:"),
    tool("JOIN", "Join", "Join elements", "Home", "Select source object:"),
    tool("ALIGN", "Align", "Align objects to others", "Home", "Specify first source point:", undefined),
    tool("COPY", "Copy", "Copy the selection", "Home", "Specify base point:", ["CO"]),
  );
  /* Properties */
  add(
    tool("CHTYPE", "Change Type", "Change the selected element's type", "Home", "Select element:", undefined),
    tool("CHMAT", "Material", "Change the selected element's material", "Home", "Select element:", undefined),
    {
      name: "ROTATE90",
      title: "Turn 90° Clockwise",
      desc: "Turn the selected objects a quarter turn clockwise about their centre; while placing a piece, turn the piece",
      group: "Home",
      aliases: ["TURNRIGHT", "ROTATERIGHT", "TURN"],
      run: (c) => quarterTurn(c, true),
    },
    {
      name: "ROTATE90CCW",
      title: "Turn 90° Counter-Clockwise",
      desc: "Turn the selected objects a quarter turn counter-clockwise about their centre; while placing a piece, turn the piece",
      group: "Home",
      aliases: ["TURNLEFT", "ROTATELEFT"],
      run: (c) => quarterTurn(c, false),
    },
    tool("CHDIM", "Dimensions", "Edit the selected element's dimensions", "Home", "Select element:", undefined),
    tool("ATTACH HOST", "Attach", "Host an element to another", "Home", "Select element to attach:"),
    tool("DETACH", "Detach", "Unhost an element", "Home", "Select element to detach:"),
  );
  /* Layers */
  add(
    {
      name: "LAYER",
      title: "Layer Properties",
      desc: "Opens Explorer → Layers",
      group: "Home",
      aliases: ["LA"],
      run: (c) => {
        wsState(c).setExplorer("layers");
        log(c, "ok", "✓ Layer properties opened");
      },
    },
    { name: "ISOLATE", title: "Isolate", desc: "Isolate the selection", group: "Home", run: (c) => { const s = wsState(c); if (!s.selection.length) return toast(c, "Select something to isolate", "warn"); s.isolate(s.selection); log(c, "ok", `✓ Isolated ${s.selection.length} element(s)`); } },
    { name: "LAYLCK", title: "Lock Layer", desc: "Lock the layer of the selection", group: "Home", run: (c) => { const s = wsState(c); const scene = sceneOf(s); const el = scene.elementById[s.selection[0]]; if (!el) return toast(c, "Select an element to lock its layer", "warn"); s.toggleLayerLock(el.layer); log(c, "ok", `✓ Layer ${el.layer} lock toggled`); } },
    { name: "UNHIDE", title: "Show All", desc: "Show every hidden element", group: "View", aliases: ["UNISOLATE"], run: (c) => { wsState(c).showAll(); log(c, "ok", "✓ All elements visible"); } },
    { name: "HIDE", title: "Hide", desc: "Hide the selection", group: "View", run: (c) => { const s = wsState(c); if (!s.selection.length) return toast(c, "Select something to hide", "warn"); s.setHidden(s.selection, true); log(c, "ok", `✓ Hid ${s.selection.length} element(s)`); s.clearSelection(); } },
  );
  /* Measure */
  add(
    tool("DIST", "Distance", "Measure distance between two points", "Home", "Specify first point:", ["DI"]),
    tool("AREA", "Area", "Measure an area", "Home", "Specify first corner point:"),
    tool("VOLUME", "Volume", "Measure a volume", "Home", "Select object:"),
    tool("ANGLE", "Angle", "Measure an angle", "Home", "Select first line:"),
    tool("ELEV", "Elevation", "Read an elevation", "Home", "Pick a point:"),
    tool("ID", "Coordinate", "List the coordinates of a point", "Home", "Specify point:"),
    tool("CLEAR", "Clearance", "Check clearance between objects", "Home", "Select first object:"),
  );

  /* ── Insert */
  add(
    modal("ATTACH", "DWG / DXF", "Overlay an AutoCAD / Civil 3D plan or survey", "Insert", "import", { kind: "dwg" }),
    modal("IMPORT", "Survey / LandXML", "Civil 3D surface and survey points", "Insert", "import", { kind: "landxml" }),
    modal("DRONE", "Drone", "DroneDeploy orthomosaic or point cloud", "Insert", "import", { kind: "drone" }),
    modal("PDFATTACH", "PDF / Image", "Underlay to trace", "Insert", "import", { kind: "pdf" }),
    showPanel("GEOLOCATE", "Site Location", "Where the site is: coordinates, the property line, Google Maps and the land around it", "Insert", null, "site", ["SITELOCATION", "MAP"]),
    {
      name: "SITEFROMMAP",
      title: "Site from Map",
      desc: "From the site's coordinates: the ground's contours from public elevation data and the satellite photo under the plan, then the site plan",
      group: "Insert",
      aliases: ["SITEPLANFROMMAP", "TOPOFROMMAP", "GROUNDFROMMAP"],
      run: async (c) => {
        const s = wsState(c);
        const site = s.project.site;
        if (!isPlaced(site)) {
          openPanel(c, null, "site");
          return toast(c, "Place the site on the map first (Site palette → Location): the ground and the photo come from its coordinates.", "warn");
        }
        const scene = sceneOf(s);
        const f = scene.footprint;
        const area = areaAround(site, f, 100);
        log(c, "info", "Site from Map: reading public elevation data around the lot…");
        try {
          const r = await groundFromMap(site, area, [(f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2], scene.grade, 1);
          const photo = aerialItem(site, area, scene.grade, uid("U"));
          const old = s.drawn.filter((d) => d.kind === "image" && typeof d.p.tiles === "string").map((d) => d.id);
          wsState(c).edit("Site from the map", (st) => ({ ...applyChange(st, photo ? { remove: old, add: [photo] } : {}), project: { ...st.project, terrain: r.terrain } }));
          log(c, "ok", `✓ Site from the map: ${r.terrain.contours.length} contours (1 ft), ground about ${Math.round(r.seaLevel)} ft above sea level at the building${photo ? ", the satellite photo under the plan" : ""}. Approximate public data: not a survey.`);
          openView(wsState(c), { kind: "site" });
        } catch {
          toast(c, "Couldn't read the public elevation data. This needs an internet connection.", "warn");
        }
      },
    },
    tool("PROPLINE", "Property Line", "Draw the property line: click the corners, or type a bearing and distance for each course (N45°30'E 120)", "Insert", "Specify the first corner of the property line:", ["BOUNDARY"]),
    modal("TERRAIN", "Terrain / Topography", "Contours and grading surface", "Insert", "import", { kind: "terrain" }),
    modal("SOIL", "Soil Data", "Attach a soil test report", "Insert", "import", { kind: "soil" }),
    {
      name: "GROUND",
      title: "Ground Type",
      desc: "Choose the kind of ground: lawn, dirt, clay, loam, sand, gravel or rock. It changes how the ground looks in 3D and on the sheets, and the presumptive soil values the checks use. GROUND CLAY sets it at once",
      group: "Insert",
      aliases: ["GROUNDTYPE", "SOILTYPE", "TERRAINTYPE"],
      run: (c, args) => {
        const typed = args.join(" ").trim();
        if (!typed) {
          openPanel(c, null, "site");
          log(c, "info", `Ground: ${groundOf(wsState(c).project).label}. Pick another in the Site palette, or type GROUND and one of: ${GROUND_TYPES.join(", ")}`);
          return;
        }
        const g = parseGround(typed);
        if (!g) return toast(c, `"${typed}" is not a ground type. Use one of: ${GROUND_TYPES.join(", ")}.`, "warn");
        setGround(c.ws, g);
        log(c, "ok", `✓ Ground: ${GROUNDS[g].label}: presumptive bearing ${GROUNDS[g].bearing.toLocaleString("en-US")} psf; ${GROUNDS[g].septic}`);
      },
    },
    modal("XREF", "Link Project", "Bring another project onto this parcel: keep it separate (a live link that updates when it is saved) or merge an editable copy", "Insert", "link-project", undefined, ["LINK", "LINKPROJECT"]),
    modal("COMMUNITY", "New Community", "A new project with several projects side by side on one parcel, linked or merged", "Insert", "link-project", { community: true }, ["NEWCOMMUNITY", "PARCEL"]),
    showPanel("LINKS", "Linked Projects", "The projects linked or merged into this one: move, turn, open, merge or unlink them", "Insert", null, "links", ["XREFS"]),
    {
      name: "MATERIAL",
      title: "Materials",
      desc: "Opens Explorer → Library",
      group: "Insert",
      run: (c) => {
        wsState(c).setExplorer("library");
        log(c, "ok", "✓ Materials library opened");
      },
    },
    ...(["FURN", "FIXT LIB", "MEPLIB", "STRLIB"] as const).map(
      (n): CommandDef => ({
        name: (TOOL_COMMANDS.add(n), n),
        title: { FURN: "Furniture", "FIXT LIB": "Fixtures (Library)", MEPLIB: "MEP Parts", STRLIB: "Structural Parts" }[n],
        desc:
          n === "FURN"
            ? "Place furniture in the 2D plan or the 3D view: sofas, beds, tables and chairs, kitchen and laundry appliances, office and outdoor pieces (FURN BED-QUEEN picks one; R turns it)"
            : "Insert from the component library",
        group: "Insert",
        run: (c, args) => {
          // FURN <piece>: place that piece of the catalogue
          if (n === "FURN" && args.length) {
            const pc = pieceOf(args.join("-").toLowerCase());
            if (!pc) return toast(c, `No piece of furniture called "${args.join(" ")}". The Library tab lists them all.`, "warn");
            const s = wsState(c);
            s.patch({ toolOpts: { ...s.toolOpts, FURN: { ...(s.toolOpts.FURN ?? {}), type: pc.id } } });
          }
          // opens the library (to drag components from) and starts placing the chosen kind with a click
          wsState(c).setExplorer("library");
          if (!beginTool(c, n)) log(c, "ok", "✓ Component library opened. Drag a component into the viewport.");
        },
      }),
    ),
    tool("IMAGE", "Image", "Place an image on the drawing", "Insert", "Specify insertion point:"),
    tool("SHED", "Shed", "A shed or outbuilding: type its width, depth, height and roof, then click (or type x,y) to place it", "Insert", "Click where the shed goes:", ["OUTBUILDING"]),
    tool("TREE", "Tree", "A shade tree, palm or pine with its height and canopy", "Insert", "Click where the tree goes:"),
    tool("BUSH", "Bush", "A bush or shrub with its height and spread", "Insert", "Click where the bush goes:", ["SHRUB"]),
    tool("FLOWERS", "Flower Bed", "Outline a flower bed (or R for a rectangle): mulch filled with flowering plants in the colours you pick", "Insert", "Outline the flower bed:", ["FLOWERBED", "PLANTING"]),
    tool("POOL", "Pool", "A swimming pool: rectangle, oval, freeform or L-shape, with its length, width, depth and the deck around it; click where it goes", "Insert", "Click where the pool goes:", ["SWIMMINGPOOL"]),
    tool("FENCE", "Fence / Garden Wall", "Draw a fence or a garden wall by its line (C closes it round a yard): wood privacy, picket, chain link, wrought iron, vinyl or masonry, and its height", "Insert", "Specify the start of the fence:", ["GARDENWALL", "SITEWALL", "FENCES"]),
    tool("ROCK", "Boulders", "A landscape boulder or a cluster of them: size and how many in the tool bar, then click", "Insert", "Click where the boulder goes:", ["BOULDER", "ROCKS"]),
    tool("GRAVEL", "Gravel Bed", "Outline a bed of gravel or river rock", "Insert", "Outline the gravel bed:", ["ROCKBED", "RIVERROCK"]),
    tool("ROAD", "Road", "Draw a road by its centre line: pavement width, curb and gutter, sidewalks and the centre line in the tool bar", "Systems", "Specify the start of the road's centre line:", ["STREET"]),
    tool("SIDEWALK", "Sidewalk", "Draw a concrete sidewalk by its line, with control joints every 5 ft", "Systems", "Specify the start of the sidewalk:", ["WALKWAY"]),
    tool("SIGN", "Road Sign", "A road sign on its post: stop, yield, speed limit, street names, no parking, one way", "Systems", "Click where the sign goes:", ["ROADSIGN", "STOPSIGN"]),
    tool("SIGNAL", "Traffic Light", "A traffic light on a mast arm over the road, with red, amber and green lamps", "Systems", "Click where the traffic light's pole goes:", ["STOPLIGHT", "TRAFFICLIGHT"]),
    tool("DRAIN", "Drain", "A storm drain: a curb inlet with its catch basin, an area drain in the yard, or a trench drain across a driveway", "Systems", "Click where the drain goes:", ["STORMDRAIN", "INLET"]),
    tool("GUTTER", "Gutters", "Click a roof: gutters along its eaves, with downspouts and splash blocks at the ends", "Systems", "Click a roof:", ["GUTTERS", "DOWNSPOUT"]),
    tool("SEPTIC", "Septic Tank", "A septic tank with its drain field: tank size, trenches and distance from the tool bar", "Insert", "Click where the septic tank goes:", ["SEPTICTANK"]),
    modal("PLACE", "Place by Measurement", "Put a shed, pool, tree, bush, boulder, flower bed, septic tank, slab or box on the plan by typing its size and its distance from the building", "Insert", "place", undefined, ["PLACEBYMEASURE", "MEASUREPLACE"]),
    tool("TEXT", "Text", "Place text on the drawing", "Insert", "Specify first corner of text box:"),
    tool("NOTE", "Annotation", "Place a note on the drawing", "Insert", "Specify note location:"),
  );

  /* ── Annotate */
  add(
    tool("DIM", "Dimension", "Measurements and dimension strings", "Annotate", "Specify first extension line origin:"),
    tool("LEADER", "Leader", "Callout with a leader line", "Annotate", "Specify leader start point:"),
    tool("TAG", "Tag", "Label elements", "Annotate", "Select element to tag:"),
    tool("SECTIONLINE", "Section", "Section reference mark", "Annotate", "Specify section line start:"),
    tool("ELEVMARK", "Spot Elevation", "Elevation reference mark", "Annotate", "Specify elevation mark point:"),
    tool("LABEL", "Place Label", "Name a place (Kitchen, Parking, Main Entrance): shown on the plan and floating in the 3D view", "Annotate", "Click the place to name:", ["PLACELABEL"]),
    {
      name: "LABELS",
      title: "Labels",
      desc: "Show or hide place labels and the property line's bearings in the 2D plan and the 3D view (room names have their own switch: ROOMLABELS)",
      group: "View",
      run: (c) => {
        const s = wsState(c);
        s.patch({ labels: !s.labels });
        log(c, "ok", `✓ Labels ${onOff(!s.labels)}`);
      },
    },
    {
      name: "FURNLABELS",
      title: "Furniture Names",
      desc: "Show or hide the name of each piece of furniture, in the 2D plan and in 3D",
      group: "View",
      aliases: ["FURNITURENAMES", "FURNNAMES", "FURNITURELABELS"],
      run: (c) => {
        const s = wsState(c);
        s.patch({ furnLabels: !s.furnLabels });
        log(c, "ok", `✓ Furniture names ${onOff(!s.furnLabels)}`);
      },
    },
    {
      name: "ROOMLABELS",
      title: "Room Names",
      desc: "Show or hide room names and areas in the 2D plan, in 3D and on plan sheets",
      group: "View",
      aliases: ["ROOMNAMES", "RMLABELS", "ROOMTAGS"],
      run: (c) => {
        const s = wsState(c);
        s.patch({ roomLabels: !s.roomLabels });
        log(c, "ok", `✓ Room names ${onOff(!s.roomLabels)}`);
      },
    },
    {
      name: "VIEWTOPO",
      title: "Topography",
      desc: "The site's contours shaded by height, with spot grades, on its own sheet",
      group: "View",
      aliases: ["TOPO", "TOPOGRAPHY"],
      run: (c) => log(c, "ok", `✓ ${openView(wsState(c), { kind: "topo" })} opened. The Model tab brings you back.`),
    },
    {
      name: "CUTAWAY",
      title: "Cutaway",
      desc: "Cut the 3D model 4 ft above the floor of the level you are on, like a dollhouse, so the rooms and furniture show from above",
      group: "View",
      aliases: ["DOLLHOUSE", "ROOMSVIEW"],
      run: (c) => {
        const s = wsState(c);
        const on = !s.cutaway;
        s.patch({ cutaway: on, ...(on && s.view === "2d" && s.layoutTab === "model" ? { view: "3d" as const } : {}) });
        log(c, "ok", `✓ Cutaway ${onOff(on)}${on ? `: the model is cut 4 ft above ${levelLabel(s.plan.level)}` : ""}`);
      },
    },
    {
      name: "BELOWGRADE",
      title: "Below Grade",
      desc: "See the foundation in 3D: the ground turns see-through and the house above it fades, so the footings, stem walls, slab, piers, the septic tank and buried pipes show",
      group: "View",
      aliases: ["FOUNDATIONVIEW", "UNDERGROUND"],
      run: (c) => {
        const s = wsState(c);
        const on = !s.belowGrade;
        s.patch({ belowGrade: on, ...(on && s.view === "2d" && s.layoutTab === "model" ? { view: "3d" as const } : {}) });
        log(c, "ok", `✓ Below grade ${onOff(on)}${on ? ": the ground is see-through and the house above it faded, so the foundation and the septic system show" : ""}`);
      },
    },
    {
      name: "FOUNDATIONPLAN",
      title: "Foundation Plan",
      desc: "The plan of the foundation: stem walls, slab and piers, with the footings and the septic system dashed below ground",
      group: "View",
      aliases: ["FPLAN"],
      run: (c) => log(c, "ok", `✓ ${openView(wsState(c), { kind: "plan", level: "foundation" })} plan opened`),
    },
    {
      name: "VIEWPLANS",
      title: "All Levels",
      desc: "Every storey's floor plan side by side on one sheet",
      group: "View",
      aliases: ["ALLPLANS", "ALLLEVELS"],
      run: (c) => log(c, "ok", `✓ ${openView(wsState(c), { kind: "plans" })} opened. The Model tab brings you back.`),
    },
    {
      name: "UNDERLAY",
      title: "Underlay",
      desc: "Show other levels faded under the 2D plan: the level below, then every level, then none",
      group: "View",
      run: (c) => {
        const s = wsState(c);
        const next = s.planShow === "level" ? "below" : s.planShow === "below" ? "all" : "level";
        s.patch({ planShow: next });
        if (s.view !== "2d") s.setView("2d");
        log(c, "ok", `✓ Underlay: ${next === "level" ? "off" : next === "below" ? "the level below" : "all levels"}`);
      },
    },
    {
      name: "VIEWS",
      title: "Views",
      desc: "The list of drawings: floor plans, site, topography, elevations, sections and sheets",
      group: "View",
      aliases: ["BROWSER", "PROJECTBROWSER"],
      run: (c) => {
        wsState(c).setExplorer("views");
        log(c, "ok", "✓ Views opened in the Model Explorer");
      },
    },
    tool("VIEWELEV", "Elevation View", "Place two points at any angle (or a centre and radius for a circular elevation, or pick a drawn line) and the elevation opens on its own sheet; drag the points or type an angle or radius to adjust it", "View", "Specify the first point of the elevation line:", ["ELEVATION"]),
    tool("VIEWSECTION", "Section View", "Draw a cut line and see the building section on its own sheet", "View", "Specify the start of the section line:", ["SECTIONVIEW"]),
    {
      name: "VIEWSITE",
      title: "Site Plan",
      desc: "Top view of the site and its topography contours on its own sheet",
      group: "View",
      aliases: ["SITEPLAN"],
      run: (c) => {
        const s = wsState(c);
        let n = 1;
        while (s.sheets.some((x) => x.id === `SP-${n}`)) n++;
        const id = `SP-${n}`;
        s.edit("Site plan", (st) => applyChange(st, { addSheets: [{ id, name: `${id} Site Plan`, kind: "site", view: { dir: "S", title: "SITE PLAN · TOPOGRAPHY" }, user: true }], openSheet: id }));
        log(c, "ok", `✓ ${id} Site Plan opened. The Model tab brings you back.`);
      },
    },
    tool("DETAIL", "Detail", "Detail callout", "Annotate", "Specify detail boundary:"),
    tool("GRIDLINE", "Grid", "Structural grid line", "Annotate", "Specify grid line start:"),
    modal("SCHEDULE", "Door/Window Schedule", "Generated tables from the model", "Annotate", "schedule"),
    modal("QTO", "Quantity Take-off", "Material quantities from the model", "Annotate", "qto"),
  );

  /* ── Analyze */
  add(
    showPanel("STRESS", "Stress Test", "Stress Test palette with heat overlay", "Analyze", "analyze", "stress-test", ["ST"], (c) => wsState(c).patch({ stressOverlay: !!wsState(c).stressResult })),
    showPanel("STRUCT", "Structural", "Full structural analysis", "Analyze", "analyze", "stress-test", undefined, (c) => wsState(c).setStressSetup({ elementId: "all" })),
    showPanel("LOADS", "Load Cases", "Load cases and combinations", "Analyze", "analyze", "stress-test", undefined, (c) => wsState(c).setStressSetup({ loadCase: "combined" })),
    showPanel("DEFLECT", "Deflection", "Span deflection limits", "Analyze", "analyze", "stress-test", undefined, (c) => wsState(c).setStressSetup({ loadCase: "dead-live" })),
    ...(
      [
        ["WIND", "Wind", "hurricane"],
        ["SEISMIC", "Seismic", "seismic"],
        ["THERMAL", "Thermal", "thermal"],
        ["ENERGY", "Energy", "energy"],
      ] as [string, string, SimType][]
    ).map(([n, t, type]) =>
      showPanel(n, t, `${t} simulation`, "Analyze", "analyze", "simulation", undefined, (c) => wsState(c).setSimSetup({ type })),
    ),
    {
      name: "SOLAR",
      title: "Solar",
      desc: "Sun path, shading, window and PV suggestions",
      group: "Analyze",
      run: (c) => {
        const s = wsState(c);
        s.patch({ solar: !s.solar });
        log(c, "ok", `✓ Solar analysis ${onOff(!s.solar)}`);
        if (!s.solar) {
          log(c, "info", "  Sun path for Miami-Dade, 15:00 on Jun 21: altitude 62°, azimuth 262°.");
          log(c, "info", "  West windows receive 5.4 h of direct sun. Suggest shading on WN-104 and WN-204; PV fits 11 kW on the east slope.");
        }
      },
    },
    computed("GRADING", "Grading", "Earthwork from the model and the ground: cut and fill for the building pad, excavation, and the fall away from the foundation", (c) => gradingReport(sceneOf(wsState(c)))),
    {
      name: "TRAFFIC",
      title: "Traffic Radius",
      desc: "The road network within 10 miles of the site on the street map, to judge access and traffic",
      group: "Analyze",
      run: (c) => {
        const s = wsState(c);
        s.patch({ mapView: { radius: 10, base: "streets" } });
        openPanel(c, "analyze", "site");
        if (!isPlaced(s.project.site)) return toast(c, "Place the site on the map first (Site palette → Location).", "warn");
        log(c, "ok", "✓ Traffic radius: the street map of the 10 mile radius around the site is in the Site palette");
        log(c, "info", "  Traffic counts come from the state DOT (AADT counts): the map shows the roads and how the site connects to them.");
      },
    },
    showPanel("CLASH", "Clash Detect", "Open the Clash palette", "Analyze", "analyze", "clash"),
    {
      name: "CODECHECK",
      title: "Code Check",
      desc: "Open the Compliance palette",
      group: "Analyze",
      aliases: ["CC", "COMPLIANCE"],
      run: (c) => {
        openPanel(c, "analyze", "compliance");
        const s = wsState(c);
        const n = s.project.checks.length;
        log(c, "ok", `✓ Code check against ${s.project.jurisdiction.name} · ${s.project.jurisdiction.codeSet}: ${n} rules`);
      },
    },
    computed("MATCHECK", "Material Analysis", "Material quantities from the model and what the site's climate and soil ask of them", (c) => materialReport(sceneOf(wsState(c)), wsState(c).project)),
    computed("CONSTRUCT", "Constructability", "Pours, counts, pump and crane reach, staging room and the build sequence, from the model", (c) => constructabilityReport(sceneOf(wsState(c)), wsState(c).project)),
    showPanel("COST", "Cost", "Open the Cost palette", "Analyze", "analyze", "cost"),
    showPanel("HEALTH", "Plan Health", "Open the Plan Health Score palette", "Analyze", "analyze", "health"),
    {
      name: "SCHEDQ",
      title: "Schedule Query",
      desc: "Open the Timeline with a window picker",
      group: "Analyze",
      run: (c) => {
        const s = wsState(c);
        s.setTab("analyze");
        s.toggleDock("timeline", true);
        s.setTimeline({ open: true });
        log(c, "ok", "✓ Timeline opened. Pick 1 mo, 3 mo, 6 mo or a custom range.");
      },
    },
    {
      name: "WORKFORCE",
      title: "Workforce",
      desc: "Trades and headcount by phase",
      group: "Analyze",
      run: (c) => {
        const s = wsState(c);
        openPanel(c, "analyze", "cost");
        s.toggleDock("timeline", true);
        s.setTimeline({ open: true });
        log(c, "ok", `✓ Workforce: ${s.project.cost.workforce.reduce((a, w) => a + w.headcount, 0)} peak trades headcount across ${s.project.cost.workforce.length} trades`);
      },
    },
    showPanel("SIMULATE", "Disaster Simulation", "Scenario builder", "Analyze", "analyze", "simulation", undefined),
  );

  /* ── Collaborate */
  add(
    showPanel("COMMENT", "Comment", "Pin a comment to the model", "Collaborate", "collaborate", "comments", undefined, (c) => wsState(c).setTool("COMMENT", "Click an element to pin a comment:")),
    tool("MARKUP", "Markup", "Draw a markup on the model", "Collaborate", "Specify markup start point:"),
    showPanel("ISSUE", "Issue", "Create and track issues", "Collaborate", "collaborate", "issues"),
    showPanel("TASK", "Task", "Assign a task", "Collaborate", "collaborate", "issues"),
    tool("PIN", "Pin", "Pin a note to the model", "Collaborate", "Click an element to pin a note:"),
    modal("PESIGN", "PE Sign-off", "Send flagged items to the PE review queue", "Collaborate", "pe-signoff"),
    modal("APPROVALS", "Approvals", "Approval list", "Collaborate", "approvals"),
    {
      name: "REVIEW",
      title: "Review Mode",
      desc: "Read-only review",
      group: "Collaborate",
      run: (c) => {
        const s = wsState(c);
        s.patch({ reviewMode: !s.reviewMode });
        log(c, "ok", `✓ Review mode ${onOff(!s.reviewMode)}`);
      },
    },
    modal("SHARE", "Share", "Invite people and set roles", "Collaborate", "share"),
    route("PERMS", "Permissions", "Roles and members", "/settings/permissions"),
  );

  /* ── AI */
  add(
    {
      name: "ASK",
      title: "Ask BuildSync",
      desc: "Focuses the command line",
      group: "AI",
      run: (c) => {
        wsState(c).toggleDock("cmdline", true);
        wsState(c).setCmdInput("", true);
      },
    },
    modal("P2P", "Prompt to Plan", "Describe a building and get a starter plan", "AI", "p2p"),
    prompt("EXPLAIN", "Explain", "Why is this failing?", "Why is the selected element{sel} failing?", true),
    prompt("AIGEN", "Generate", "Generate elements from a description", "Generate a "),
    prompt("AIAUTO", "Automate", "Repeat a task across the model", "Repeat this change on every level: "),
    showPanel("AIREVIEW", "Design Review", "Results in the AI Analysis palette", "AI", "ai", "ai-analysis", undefined, (c) => void runAnalysisFor(c)),
    showPanel("AICODE", "Code Review", "Results in the AI Analysis palette", "AI", "ai", "ai-analysis", undefined, (c) => void runAnalysisFor(c)),
    showPanel("AIERR", "Error Detect", "Results in the AI Analysis palette", "AI", "ai", "ai-analysis", undefined, (c) => void runAnalysisFor(c)),
    prompt("AICOST", "Cost Estimator", "Cost recommendations", "Estimate the cost of this building", true),
    prompt("AIMAT", "Material Advisor", "Material recommendations", "Which materials do you recommend for this climate?", true),
    prompt("AIOPT", "Optimize", "Optimization recommendations", "Optimize the structure for cost without losing wind capacity", true),
    prompt("AICMP", "Compare", "Compare options", "Compare a CMU frame with a steel frame for this building", true),
    {
      name: "AIEDIT",
      title: "AI Model Editor",
      desc: "Agent proposes edits → preview → accept or reject",
      group: "AI",
      run: (c) => {
        wsState(c).setCmdInput("Change all exterior walls to concrete");
        log(c, "info", "AIEDIT: describe an edit. Agents only propose; you accept or reject the preview.");
      },
    },
    showPanel("COUNCIL", "Agent Council", "Put a decision to several connected agents", "AI", "ai", "council"),
    route("CONNECTORS", "Connectors", "Connect external AI agents", "/settings/integrations"),
    {
      name: "AGENT",
      title: "Switch Agent",
      desc: "Open the agent menu",
      group: "AI",
      run: (c) => {
        wsState(c).toggleDock("cmdline", true);
        wsState(c).setAgentMenu(true);
      },
    },
  );

  /* ── View */
  add(
    { name: "PLAN", title: "2D Plan", desc: "Switch the viewport to the 2D plan", group: "View", aliases: ["2D"], run: (c) => { wsState(c).setView("2d"); wsState(c).setLayoutTab("model"); log(c, "ok", "✓ 2D plan"); } },
    { name: "3DVIEW", title: "3D View", desc: "Switch the viewport to 3D", group: "View", aliases: ["3D"], run: (c) => { wsState(c).setView("3d"); wsState(c).setLayoutTab("model"); log(c, "ok", "✓ 3D view"); } },
    { name: "3DORBIT", title: "Orbit", desc: "Drag to orbit the model", group: "View", run: (c) => { wsState(c).setView("3d"); wsState(c).setNavTool("orbit"); log(c, "info", "3DORBIT  Drag in the viewport to orbit."); } },
    {
      name: "3DWALK",
      title: "Walk",
      desc: "Walk through the model at eye height: you stand in a room and look around it (drag); double-click another room's name to go there",
      group: "View",
      run: (c) => {
        const s = wsState(c);
        const rooms = roomsOn(sceneOf(s), s.plan.level);
        if (!s.insideRoom && rooms.length) return void enterRoom(c, rooms[0].id);
        // no rooms on this storey: walk in perspective at eye level around the model
        s.setView("3d");
        s.setNavTool("walk");
        if (!s.insideRoom) s.setCamera({ pitch: 12, perspective: true, zoom: 1.6 });
        log(c, "info", "3DWALK  Drag to look around, scroll to move.");
      },
    },
    {
      name: "WALKIN",
      title: "Inside a Room",
      desc: "Room to Room view: stand inside a room at eye height and look around it, up and down (drag); go from room to room, and building to building, like Street View",
      group: "View",
      aliases: ["INSIDE", "ROOMVIEW", "ENTERROOM", "ROOMTOROOM"],
      run: (c, args) => {
        const s = wsState(c);
        const scene = sceneOf(s);
        const q = args.join(" ").trim().toLowerCase();
        // a name matches a room, or "<building> <room>" (a community has several buildings with a kitchen each)
        const named = (r: (typeof scene.rooms)[number]) => [r.name, `${r.building?.name ?? s.project.name} ${r.name}`].map((n) => n.toLowerCase());
        const room = q ? (scene.rooms.find((r) => named(r).includes(q)) ?? scene.rooms.find((r) => named(r).some((n) => n.includes(q)))) : (scene.rooms.find((r) => r.id === s.insideRoom) ?? roomsOn(scene, s.plan.level)[0] ?? scene.rooms[0]);
        if (!room) return toast(c, q ? `No room called "${args.join(" ")}". Room names: ${scene.rooms.map((r) => r.name).join(", ")}.` : "This project has no rooms yet: name them with ROOM (Home → Building).", "warn");
        enterRoom(c, room.id);
      },
    },
    { name: "NEXTROOM", title: "Next Room", desc: "In the room view: go to the next room of the storey", group: "View", run: (c) => stepRoom(c, 1) },
    { name: "PREVROOM", title: "Previous Room", desc: "In the room view: go back to the previous room of the storey", group: "View", run: (c) => stepRoom(c, -1) },
    {
      name: "LEAVEROOM",
      title: "Leave the Room",
      desc: "Step out of the room view back to the 3D view you were in before",
      group: "View",
      aliases: ["EXITROOM", "OUTSIDE"],
      run: (c) => {
        const s = wsState(c);
        if (!s.insideRoom && !s.camera.eye) return log(c, "info", "You are not inside a room.");
        s.patch({ camera: { ...(s.outsideCamera ?? HOME_CAMERA), eye: null }, insideRoom: null, outsideCamera: null, navTool: s.navTool === "walk" ? "select" : s.navTool });
        log(c, "ok", "✓ Back outside");
      },
    },
    { name: "ZOOM", title: "Zoom Extents", desc: "Fit the model to the window", group: "View", aliases: ["ZE", "ZOOME"], run: (c) => {
        const s = wsState(c);
        s.zoomExtents();
        // frame everything that is shown except the ground itself: the building, site objects, linked projects
        const vis = new Set(s.project.layers.filter((l) => l.visible).map((l) => l.id));
        s.frameElements(sceneOf(s).elements.filter((e) => e.layer !== "topography" && vis.has(e.layer) && !s.hidden.includes(e.id)).map((e) => e.id));
        log(c, "ok", "✓ Zoom extents");
      } },
    {
      name: "-VIEW",
      title: "Named Views",
      desc: "Top, Front, Back, Left, Right, Bottom, Floor Plan, Elevation",
      group: "View",
      run: (c, args) => {
        const a = (args[0] ?? "").toLowerCase();
        const map: Record<string, string> = { top: "Top", front: "Front", back: "Back", left: "Left", right: "Right", bottom: "Bottom", floorplan: "Floor Plan", plan: "Floor Plan", elevation: "Elevation", sw: "SW Isometric", se: "SE Isometric", ne: "NE Isometric", nw: "NW Isometric", home: "SW Isometric" };
        const name = map[a.replace(/[\s_-]/g, "")];
        if (!name) return log(c, "warn", `⚠ Unknown view "${args[0] ?? ""}". Try TOP, FRONT, BACK, LEFT, RIGHT, BOTTOM, FLOORPLAN, ELEVATION.`);
        wsState(c).goToNamedView(name);
        log(c, "ok", `✓ View: ${name}`);
      },
    },
    { name: "PERSP", title: "Perspective", desc: "Perspective camera", group: "View", run: (c) => { wsState(c).setCamera({ perspective: true }); log(c, "ok", "✓ Perspective projection"); } },
    { name: "ORTHO3D", title: "Orthographic", desc: "Orthographic camera", group: "View", run: (c) => { wsState(c).setCamera({ perspective: false }); log(c, "ok", "✓ Orthographic projection"); } },
    {
      name: "VSCURRENT",
      title: "Visual Style",
      desc: "Wireframe, Shaded, Realistic or X-Ray",
      group: "View",
      run: (c, args) => {
        const a = (args[0] ?? "").toLowerCase().replace(/[^a-z]/g, "");
        const style = (["wireframe", "shaded", "realistic", "xray"] as VisualStyle[]).find((v) => v === a);
        if (!style) return log(c, "warn", "⚠ Visual style: WIREFRAME, SHADED, REALISTIC or XRAY.");
        wsState(c).setStyle(style);
        log(c, "ok", `✓ Visual style: ${style}`);
      },
    },
    {
      name: "SECTIONPLANE",
      title: "Section Cut",
      desc: "Cutaway reveals foundation, framing and MEP",
      group: "View",
      aliases: ["SECTION", "SEC"],
      run: (c) => {
        const s = wsState(c);
        s.setSection(!s.section);
        log(c, "ok", `✓ Section cut ${onOff(!s.section)}${!s.section ? ` · plane Y = ${s.sectionY.toFixed(1)} ft` : ""}`);
      },
    },
    {
      name: "SECTIONBOX",
      title: "Section Box",
      desc: "Clip the model to a box",
      group: "View",
      run: (c) => {
        const s = wsState(c);
        s.patch({ sectionBox: !s.sectionBox, section: s.sectionBox ? s.section : true });
        log(c, "ok", `✓ Section box ${onOff(!s.sectionBox)}`);
      },
    },
    { name: "GRID", title: "Grid", desc: "Toggle the dot grid", group: "View", key: "F7", run: (c) => flip(c, "grid", "GRID") },
    { name: "RULERS", title: "Rulers", desc: "Toggle the rulers", group: "View", run: (c) => { const s = wsState(c); s.patch({ rulers: !s.rulers }); log(c, "ok", `✓ RULERS ${onOff(!s.rulers)}`); } },
    { name: "GUIDES", title: "Guides", desc: "Toggle the guide lines", group: "View", run: (c) => { const s = wsState(c); s.patch({ guides: !s.guides }); log(c, "ok", `✓ GUIDES ${onOff(!s.guides)}`); } },
    { name: "SNAP", title: "Snap", desc: "Toggle snap to grid", group: "View", key: "F9", run: (c) => flip(c, "snap", "SNAP") },
    { name: "ORTHO", title: "Ortho", desc: "Constrain to horizontal and vertical", group: "View", key: "F8", run: (c) => flip(c, "ortho", "ORTHO") },
    {
      name: "FULL",
      title: "Full Screen",
      desc: "Full-screen workspace",
      group: "View",
      key: "F11",
      macKey: "", // F11 is "Show Desktop" on macOS and ⌃⌘F already toggles full screen there
      run: async (c) => {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else await document.documentElement.requestFullscreen();
        } catch {
          toast(c, "Full screen isn't available in this browser", "warn");
        }
      },
    },
    { name: "EXPLORER", title: "Model Explorer", desc: "Show or hide the explorer", group: "View", run: (c) => { wsState(c).toggleDock("explorer"); } },
    { name: "PALETTES", title: "Palettes", desc: "Show or hide the palettes", group: "View", run: (c) => { wsState(c).toggleDock("palettes"); } },
    { name: "TIMELINE", title: "Timeline", desc: "Show or hide the timeline dock", group: "View", run: (c) => { const s = wsState(c); s.toggleDock("timeline"); s.setTimeline({ open: !s.docks.timeline }); } },
    { name: "CMDLINE", title: "Command Line", desc: "Show or hide the command line", group: "View", key: "Ctrl+9", run: (c) => { wsState(c).toggleDock("cmdline"); } },
    { name: "POLAR", title: "Polar Tracking", desc: "Toggle polar tracking", group: "View", key: "F10", run: (c) => flip(c, "polar", "POLAR") },
    { name: "OSNAP", title: "Object Snap", desc: "Toggle object snap", group: "View", key: "F3", run: (c) => flip(c, "osnap", "OSNAP") },
    { name: "OTRACK", title: "Object Snap Tracking", desc: "Line up with snap points the cursor rested on (horizontal and vertical guides)", group: "View", run: (c) => flip(c, "otrack", "OTRACK") },
    { name: "3DOSNAP", title: "3D Object Snap", desc: "Toggle 3D object snap", group: "View", key: "F4", run: (c) => flip(c, "osnap3d", "3DOSNAP") },
    { name: "DYN", title: "Dynamic Input", desc: "Toggle dynamic input", group: "View", key: "F12", run: (c) => flip(c, "dyn", "DYN") },
    { name: "LWT", title: "Lineweight", desc: "Toggle lineweight display", group: "View", run: (c) => flip(c, "lwt", "LWT") },
    { name: "MODEL", title: "Model Space", desc: "Return to model space", group: "View", run: (c) => { wsState(c).setLayoutTab("model"); flip(c, "model", "MODEL"); } },
  );

  /* ── Manage / settings */
  add(
    route("SETTINGS", "Settings", "Open settings", "/settings/general", ["OPTIONS", "OP"], "Ctrl+,"),
    route("AISETTINGS", "AI Settings", "Default agent, context sharing and detail", "/settings/ai"),
    route("UNITS", "Units", "Measurement system and precision", "/settings/units", ["UN"]),
    route("GRIDSNAP", "Grid & Snap", "Grid, snap and object-snap modes", "/settings/grid-snap", ["DSETTINGS", "DS"]),
    route("ACCOUNT", "Account", "Profile, seat, billing and security", "/settings/account"),
    {
      name: "TEMPLATES",
      title: "Templates",
      desc: "Start from a template",
      group: "Manage",
      run: (c) => wsState(c).setDoc("start"),
    },
    {
      name: "STANDARDS",
      title: "Project Standards",
      desc: "Drawing standards for this project",
      group: "Manage",
      run: (c) => wsState(c).openModal("project-info", { tab: "standards" }),
    },
    { name: "SHORTCUTS", title: "Keyboard Shortcuts", desc: "Every keyboard shortcut and command alias (Settings → Shortcuts)", group: "Help", key: "Ctrl+/", run: (c) => c.router.push("/settings/shortcuts") },
    {
      name: "TUTORIAL",
      title: "Tutorial",
      desc: "A guided tour of the screen: what every area and every ribbon tab is for",
      group: "Help",
      aliases: ["TOUR", "HELP"],
      key: "F1",
      run: (c) => {
        wsState(c).closeModal();
        c.app.getState().startTour(0);
      },
    },
    modal("BUTTONGUIDE", "Button Guide", "Every button by tab: how it looks, what it does and where it is", "Help", "button-guide", undefined, ["GUIDE", "BUTTONS"]),
    modal("INTERFACES", "Interfaces", "Save and switch window arrangements: which windows show, their size, side and tabs", "View", "interfaces", undefined, ["INTERFACE", "WORKSPACES", "UI"]),
    {
      name: "JURISDICTION",
      title: "Change Jurisdiction",
      desc: "Switch the active code set",
      group: "Manage",
      run: (c) => wsState(c).openModal("jurisdiction"),
    },
  );

  /* simulation type shorthand: FLOOD, FIRESIM … */
  for (const t of SIM_TYPES) {
    if (["hurricane", "seismic", "thermal", "energy"].includes(t.id)) continue;
    add({
      name: `SIM${t.id.toUpperCase()}`,
      title: `Simulate: ${t.label}`,
      desc: `${t.label} scenario`,
      group: "Analyze",
      run: (c) => {
        openPanel(c, "analyze", "simulation");
        wsState(c).setSimSetup({ type: t.id });
      },
    });
  }

  return cmds;
}

async function runAnalysisFor(c: CommandCtx) {
  const app = c.app.getState();
  const connected = app.agents.filter((a) => a.connected);
  const agent = connected.find((a) => a.id === app.settings.routing.compliance) ?? connected.find((a) => a.id === app.activeAgentId) ?? connected[0];
  if (!agent) {
    app.toast("Connect an agent to run AI analysis", "warn");
    return;
  }
  await wsState(c).runAnalysis(agent.id);
  app.log("ai", `→ ${agent.name} finished the design review (${wsState(c).aiAnalysis.items?.length ?? 0} recommendations)`);
}

/** Every command, built once at start-up. */
export const COMMANDS: CommandDef[] = buildCommands();

const INDEX = new Map<string, CommandDef>();
for (const d of COMMANDS) {
  INDEX.set(d.name.toUpperCase(), d);
  for (const a of d.aliases ?? []) INDEX.set(a.toUpperCase(), d);
}

/** Look a command up by exact name or alias (case-insensitive). */
export function findCommand(name: string): CommandDef | undefined {
  return INDEX.get(name.toUpperCase());
}

/** A command found for typed text, with the remaining words as arguments. */
export interface Resolved {
  def: CommandDef;
  args: string[];
}

/** Resolve typed text to a command. User aliases (Settings → Shortcuts) win over built-ins. */
export function resolveCommand(text: string, userAliases: Record<string, string> = {}): Resolved | null {
  const tokens = text.trim().split(/\s+/);
  const head = tokens[0]?.toUpperCase();
  if (!head) return null;
  const rest = tokens.slice(1);
  // user alias: command → alias
  for (const [cmd, alias] of Object.entries(userAliases)) {
    if (alias && alias.toUpperCase() === head) {
      const def = INDEX.get(cmd.toUpperCase());
      if (def) return { def, args: rest };
    }
  }
  // multi-word registry names (e.g. "ATTACH HOST", "FIXT LIB", "GROUP LAYER")
  if (tokens.length >= 2) {
    const two = INDEX.get(`${head} ${tokens[1].toUpperCase()}`);
    if (two) return { def: two, args: tokens.slice(2) };
  }
  const def = INDEX.get(head);
  if (def) return { def, args: rest };
  if (head === "ZOOM" || head.startsWith("ZOOM")) {
    const z = INDEX.get("ZOOM");
    if (z && head === "ZOOME") return { def: z, args: ["E"] };
  }
  return null;
}

/** The command line: known commands run locally, anything else goes to the active agent. */
export async function runInput(c: CommandCtx, raw: string): Promise<void> {
  const text = raw.trim();
  if (!text) return;
  const app = c.app.getState();
  app.log("cmd", `› ${text}`);
  // a running drawing tool takes typed points, distances and keywords (C, U, R …) before anything else
  if (wsState(c).session && toolText(c, text)) return;
  const resolved = resolveCommand(text, app.settings.shortcuts.aliases);
  if (resolved) {
    await resolved.def.run(c, resolved.args);
    return;
  }
  await askAgent(c, text);
}

/** Enter in the command line or viewport: finish the object the running tool is drawing. */
export function enterTool(c: CommandCtx): boolean {
  if (!wsState(c).session) return false;
  toolEnter(c);
  return true;
}

/** Run a command by exact name or "NAME ARG" string (ribbon buttons, menus). */
export async function runCommand(c: CommandCtx, command: string): Promise<void> {
  if (command.startsWith("/")) {
    c.router.push(command);
    return;
  }
  const app = c.app.getState();
  const resolved = resolveCommand(command, {});
  if (!resolved) {
    app.log("warn", `⚠ Unknown command: ${command}`);
    return;
  }
  app.log("cmd", `› ${command.toUpperCase()}`);
  await resolved.def.run(c, resolved.args);
}

/** The command name as shown in tooltips (drops internal HOST / LIB suffixes). */
export function commandDisplay(command: string): string {
  return command.replace(/ (HOST|LIB)$/, "");
}

