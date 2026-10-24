import { AGENT_META } from "./agents";
import { routeLabel, routePrompt } from "./services/ai";
import { getScene, levelLabel } from "./scene";
import { describeView } from "./scene/camera";
import type { AppStore } from "./store/app-store";
import type { ModalId, ToggleKey, WsStore } from "./store/workspace-store";
import type { LayerId, PaletteId, RibbonTabId, VisualStyle } from "./types";
import { SIM_TYPES, type SimType } from "./services/analysis";

/* Command registry. Every ribbon button, command-line alias, keyboard shortcut,
 * context-menu item and app-bar search result resolves through here (spec §10.10). */

export interface Router {
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
}

export interface CommandCtx {
  ws: WsStore;
  app: AppStore;
  router: Router;
}

export interface CommandDef {
  name: string;
  title: string;
  desc: string;
  group: string;
  aliases?: string[];
  /** default keyboard shortcut, e.g. "F8", "Ctrl+Shift+S" */
  key?: string;
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

const onOff = (v: boolean) => (v ? "<On>" : "<Off>");

function flip(c: CommandCtx, key: ToggleKey, label: string) {
  const s = wsState(c);
  s.toggle(key);
  log(c, "ok", `✓ ${label} ${onOff(wsState(c).toggles[key])}`);
}

/** Generic drafting/modelling tool: becomes the active tool and prints an AutoCAD-style prompt. */
function tool(name: string, title: string, desc: string, group: string, prompt = "Specify first point:", aliases?: string[], needsSel = false): CommandDef {
  return {
    name,
    title,
    desc,
    group,
    aliases,
    run: (c) => {
      const s = wsState(c);
      if (s.reviewMode) return toast(c, "Review mode is read-only.", "warn");
      const p = needsSel && !s.selection.length ? "Select objects:" : needsSel ? `${s.selection.length} selected. ${prompt}` : prompt;
      s.setTool(name, p);
      log(c, "info", `${name}  ${p}`);
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

function report(name: string, title: string, desc: string, group: string, lines: string[], tab?: RibbonTabId): CommandDef {
  return {
    name,
    title,
    desc,
    group,
    run: (c) => {
      if (tab) wsState(c).setTab(tab);
      log(c, "ok", `✓ ${title}`);
      lines.forEach((l) => log(c, "info", `  ${l}`));
      toast(c, `${title} complete`, "info");
    },
  };
}

const layerTool = (name: string, title: string, desc: string, layer: LayerId, prompt: string): CommandDef => ({
  name,
  title,
  desc,
  group: "Home",
  run: (c) => {
    const s = wsState(c);
    const cur = s.project.layers.find((l) => l.id === layer);
    const next = !cur?.visible;
    s.toggleLayer(layer, next);
    if (next) {
      s.setTool(name, prompt);
      log(c, "ok", `✓ ${title} layer on. ${prompt}`);
    } else {
      s.setTool(null);
      log(c, "ok", `✓ ${title} layer off`);
    }
  },
});

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
  const scene = getScene(s.project.sceneKind);
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
      desc: "Save a copy of the project",
      group: "File",
      key: "Ctrl+Shift+S",
      run: (c) => {
        if (wsState(c).mode === "demo") return wsState(c).openModal("start-free");
        toast(c, "Saved a copy (mock)", "info");
        log(c, "ok", `✓ Saved copy of ${wsState(c).project.fileName}`);
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
      run: (c) => {
        const l = wsState(c).redo();
        if (l) log(c, "ok", `✓ Redo: ${l}`);
        else log(c, "warn", "⚠ Nothing to redo");
      },
    },
    modal("PROJINFO", "Project Information", "Name, address, client, architect, engineer, jurisdiction", "File", "project-info"),
    modal("VERSIONS", "Project Versions", "View and restore earlier versions", "Collaborate", "versions", { tab: "versions" }),
    modal("HISTORY", "History", "Activity log for this project", "Collaborate", "versions", { tab: "history" }),
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
    { name: "CUTCLIP", title: "Cut", desc: "Cut the selection", group: "Edit", key: "Ctrl+X", run: (c) => { const s = wsState(c); if (!s.selection.length) return toast(c, "Nothing selected", "warn"); s.patch({ clipboard: s.selection }); s.setHidden(s.selection, true); toast(c, `Cut ${s.selection.length} element(s)`); } },
    { name: "COPYCLIP", title: "Copy", desc: "Copy the selection", group: "Edit", key: "Ctrl+C", run: (c) => { const s = wsState(c); if (!s.selection.length) return toast(c, "Nothing selected", "warn"); s.patch({ clipboard: s.selection }); toast(c, `Copied ${s.selection.length} element(s)`); } },
    { name: "PASTECLIP", title: "Paste", desc: "Paste at the cursor", group: "Edit", key: "Ctrl+V", run: (c) => { const s = wsState(c); if (!s.clipboard.length) return toast(c, "Clipboard is empty", "warn"); s.setHidden(s.clipboard, false); log(c, "ok", `✓ Pasted ${s.clipboard.length} element(s)`); } },
    { name: "DUPLICATE", title: "Duplicate", desc: "Duplicate the selection in place", group: "Edit", key: "Ctrl+D", run: (c) => { const s = wsState(c); if (!s.selection.length) return toast(c, "Nothing selected", "warn"); s.edit("Duplicate", () => ({})); log(c, "ok", `✓ Duplicated ${s.selection.length} element(s) (offset 1'-0")`); } },
    { name: "DELETE", title: "Delete", desc: "Delete the selection", group: "Edit", key: "Delete", aliases: ["ERASE"], run: (c) => { const s = wsState(c); if (!s.selection.length) return toast(c, "Nothing selected", "warn"); const locked = s.selection.filter((i) => s.locked.includes(i)); if (locked.length) return toast(c, "Locked elements can't be deleted. Unlock first.", "warn"); const n = s.selection.length; s.setHidden(s.selection, true); s.clearSelection(); log(c, "ok", `✓ Deleted ${n} element(s)`); } },
    { name: "SELECTALL", title: "Select All", desc: "Select every visible element", group: "Edit", key: "Ctrl+A", run: (c) => { const s = wsState(c); const scene = getScene(s.project.sceneKind); const vis = s.project.layers.filter((l) => l.visible).map((l) => l.id); s.select(scene.elements.filter((e) => vis.includes(e.layer) && !s.hidden.includes(e.id) && e.layer !== "topography").map((e) => e.id)); log(c, "ok", `✓ ${wsState(c).selection.length} selected`); } },
    { name: "DESELECT", title: "Deselect All", desc: "Clear the selection", group: "Edit", key: "Esc", run: (c) => wsState(c).clearSelection() },
    { name: "FIND", title: "Find / Replace", desc: "Search commands, settings and elements", group: "Edit", key: "Ctrl+K", run: (c) => wsState(c).patch({ searchFocus: wsState(c).searchFocus + 1 }) },
    { name: "GROUP", title: "Group", desc: "Group the selection", group: "Edit", key: "Ctrl+G", run: (c) => { const s = wsState(c); if (s.selection.length < 2) return toast(c, "Select two or more elements to group", "warn"); s.edit("Group", () => ({})); log(c, "ok", `✓ Grouped ${s.selection.length} elements as GROUP-01`); } },
    { name: "UNGROUP", title: "Ungroup", desc: "Dissolve the selected group", group: "Edit", run: (c) => { wsState(c).edit("Ungroup", () => ({})); log(c, "ok", "✓ Ungrouped"); } },
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
    tool("HVAC", "HVAC", "Air handlers, ducts and diffusers", "Home", "Specify equipment location:"),
    layerTool("ELEC", "Electrical", "Panels, circuits and devices (also toggles the layer)", "electrical", "Specify device location:"),
    layerTool("PLUMB", "Plumbing", "Supply, waste and vent (also toggles the layer)", "plumbing", "Specify fixture location:"),
    tool("DUCT", "Ducts", "Duct runs", "Home", "Specify duct start point:"),
    tool("PIPE", "Pipes", "Pipe runs", "Home", "Specify pipe start point:"),
    tool("TRAY", "Cable trays", "Cable tray runs", "Home", "Specify tray start point:"),
    tool("FIRE", "Fire protection", "Sprinklers and alarms", "Home", "Specify sprinkler head location:"),
    tool("FIXT", "Fixtures", "Place fixtures", "Home", "Specify fixture location:"),
    tool("EQUIP", "Equipment", "Place equipment", "Home", "Specify equipment location:"),
  );
  /* Modify */
  add(
    tool("MOVE", "Move", "Move the selection", "Home", "Specify base point:", ["M"], true),
    tool("ROTATE", "Rotate", "Rotate the selection", "Home", "Specify base point:", ["RO"], true),
    tool("SCALE", "Scale", "Scale the selection", "Home", "Specify base point:", ["SC"], true),
    tool("MIRROR", "Mirror", "Mirror the selection", "Home", "Specify first point of mirror line:", ["MI"], true),
    tool("OFFSET", "Offset", "Offset curves or walls", "Home", "Specify offset distance:", ["O"]),
    tool("TRIM", "Trim", "Trim to a cutting edge", "Home", "Select cutting edges:", ["TR"]),
    tool("EXTEND", "Extend", "Extend to a boundary", "Home", "Select boundary edges:", ["EX"]),
    tool("FILLET", "Fillet", "Round a corner", "Home", "Select first object:"),
    tool("CHAMFER", "Chamfer", "Bevel a corner", "Home", "Select first line:"),
    tool("ARRAY", "Array", "Repeat in a pattern", "Home", "Select objects:", undefined, true),
    tool("SPLIT", "Split", "Split an element in two", "Home", "Specify split point:"),
    tool("JOIN", "Join", "Join elements", "Home", "Select source object:"),
    tool("ALIGN", "Align", "Align objects to others", "Home", "Specify first source point:", undefined, true),
    tool("COPY", "Copy", "Copy the selection", "Home", "Specify base point:", ["CO"], true),
  );
  /* Properties */
  add(
    tool("CHTYPE", "Change Type", "Change the selected element's type", "Home", "Select element:", undefined, true),
    tool("CHMAT", "Material", "Change the selected element's material", "Home", "Select element:", undefined, true),
    tool("CHDIM", "Dimensions", "Edit the selected element's dimensions", "Home", "Select element:", undefined, true),
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
    { name: "LAYLCK", title: "Lock Layer", desc: "Lock the layer of the selection", group: "Home", run: (c) => { const s = wsState(c); const scene = getScene(s.project.sceneKind); const el = scene.elementById[s.selection[0]]; if (!el) return toast(c, "Select an element to lock its layer", "warn"); s.toggleLayerLock(el.layer); log(c, "ok", `✓ Layer ${el.layer} lock toggled`); } },
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
    modal("GEOLOCATE", "Place on Map", "Google Maps location and 3D terrain", "Insert", "geolocate"),
    modal("TERRAIN", "Terrain / Topography", "Contours and grading surface", "Insert", "import", { kind: "terrain" }),
    modal("SOIL", "Soil Data", "Attach a soil test report", "Insert", "import", { kind: "soil" }),
    modal("XREF", "Xref", "Link another BuildSync project", "Insert", "import", { kind: "xref" }),
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
        name: n,
        title: { FURN: "Furniture", "FIXT LIB": "Fixtures (library)", MEPLIB: "MEP parts", STRLIB: "Structural parts" }[n],
        desc: "Insert from the component library",
        group: "Insert",
        run: (c) => {
          wsState(c).setExplorer("library");
          log(c, "ok", "✓ Component library opened. Drag a component into the viewport.");
        },
      }),
    ),
    tool("IMAGE", "Image", "Place an image on the drawing", "Insert", "Specify insertion point:"),
    tool("TEXT", "Text", "Place text on the drawing", "Insert", "Specify first corner of text box:"),
    tool("NOTE", "Annotation", "Place a note on the drawing", "Insert", "Specify note location:"),
  );

  /* ── Annotate */
  add(
    tool("DIM", "Dimension", "Measurements and dimension strings", "Annotate", "Specify first extension line origin:"),
    tool("LEADER", "Leader", "Callout with a leader line", "Annotate", "Specify leader start point:"),
    tool("TAG", "Tag", "Label elements", "Annotate", "Select element to tag:"),
    tool("SECTIONLINE", "Section", "Section reference mark", "Annotate", "Specify section line start:"),
    tool("ELEVMARK", "Elevation", "Elevation reference mark", "Annotate", "Specify elevation mark point:"),
    tool("DETAIL", "Detail", "Detail callout", "Annotate", "Specify detail boundary:"),
    tool("GRIDLINE", "Grid", "Structural grid line", "Annotate", "Specify grid line start:"),
    modal("SCHEDULE", "Door/Window Schedule", "Generated tables from the model", "Annotate", "schedule"),
    modal("QTO", "Quantity Take-off", "Material quantities from the model", "Annotate", "qto"),
  );

  /* ── Analyze */
  add(
    showPanel("STRESS", "Stress Test", "Stress Test palette with heat overlay", "Analyze", "analyze", "stress-test", ["ST"], (c) => wsState(c).patch({ stressOverlay: !!wsState(c).stressResult })),
    showPanel("STRUCT", "Structural", "Full structural analysis", "Analyze", "analyze", "stress-test", undefined, (c) => wsState(c).setStressSetup({ elementId: "all" })),
    showPanel("LOADS", "Load cases", "Load cases and combinations", "Analyze", "analyze", "stress-test", undefined, (c) => wsState(c).setStressSetup({ loadCase: "combined" })),
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
    report("GRADING", "Grading", "Cut and fill against site contours", "Analyze", ["Cut 412 cy · Fill 365 cy · Net export 47 cy", "Max slope 4.2% away from the foundation (min 2%: pass)"]),
    report("TRAFFIC", "Traffic Radius", "Traffic within a 10 mi radius", "Analyze", ["10 mi radius: 3 arterials, peak 1,840 veh/hr on SW 27th Ave", "Site access level of service: B. No turn lane required."]),
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
    report("MATCHECK", "Material Analysis", "Material suitability for climate and soil", "Analyze", ["Galvanized rebar recommended at stem walls (chloride exposure, coastal)", "Concrete mix: 4000 psi with 25% fly ash meets HVHZ durability class XS1"]),
    report("CONSTRUCT", "Constructability", "Sequencing and access review", "Analyze", ["Crane reach covers the full footprint from the south drive", "Pour Level 2 slab and beams in one phase to save a mobilisation"]),
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
    { name: "3DWALK", title: "Walk", desc: "Walk through the model", group: "View", run: (c) => { const s = wsState(c); s.setView("3d"); s.setNavTool("walk"); s.setCamera({ pitch: 12, perspective: true, zoom: 1.6 }); log(c, "info", "3DWALK  Drag to look around, scroll to move."); } },
    { name: "ZOOM", title: "Zoom Extents", desc: "Fit the model to the window", group: "View", aliases: ["ZE", "ZOOME"], run: (c) => { wsState(c).zoomExtents(); log(c, "ok", "✓ Zoom extents"); } },
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
    { name: "SHORTCUTS", title: "Keyboard Shortcuts", desc: "Show the shortcut cheat sheet", group: "Manage", key: "Ctrl+/", run: (c) => c.router.push("/settings/shortcuts") },
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

export const COMMANDS: CommandDef[] = buildCommands();

const INDEX = new Map<string, CommandDef>();
for (const d of COMMANDS) {
  INDEX.set(d.name.toUpperCase(), d);
  for (const a of d.aliases ?? []) INDEX.set(a.toUpperCase(), d);
}

export function findCommand(name: string): CommandDef | undefined {
  return INDEX.get(name.toUpperCase());
}

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
  const resolved = resolveCommand(text, app.settings.shortcuts.aliases);
  if (resolved) {
    await resolved.def.run(c, resolved.args);
    return;
  }
  await askAgent(c, text);
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

export function commandDisplay(command: string): string {
  return command.replace(/ (HOST|LIB)$/, "");
}

