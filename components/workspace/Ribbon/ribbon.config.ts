import type { IconKey } from "@/components/icons";
import type { RibbonTabId } from "@/lib/types";

/* Ribbon definition (spec §10.4). Large buttons are 28px icons with a label under them;
 * consecutive small buttons stack three to a column. Order inside a panel is render order. */

export interface RibbonItem {
  id: string;
  label: string;
  icon: IconKey;
  /** executed through the command registry, or a /settings route */
  command: string;
  desc: string;
  size: "large" | "small";
  /** shown in the tooltip's "Command:" line when it differs from `command` */
  cmdLabel?: string;
  /** accent-fill rule: toggle:grid · layer:electrical · view:2d · style:xray · section · dock:timeline · persp · ortho3d · flag:rulers */
  active?: string;
}

export interface RibbonPanel {
  id: string;
  name: string;
  items: RibbonItem[];
}

export interface RibbonTab {
  id: RibbonTabId;
  label: string;
  panels: RibbonPanel[];
}

const L = "large" as const;
const S = "small" as const;

function item(
  id: string,
  label: string,
  icon: IconKey,
  command: string,
  desc: string,
  size: "large" | "small",
  extra: Partial<Pick<RibbonItem, "cmdLabel" | "active">> = {},
): RibbonItem {
  return { id, label, icon, command, desc, size, ...extra };
}

export const RIBBON: RibbonTab[] = [
  {
    id: "home",
    label: "Home",
    panels: [
      {
        id: "draw",
        name: "Draw",
        items: [
          item("line", "Line", "line", "LINE", "Straight reference line", L),
          item("pline", "Polyline", "polyline", "PLINE", "Connected segments", L),
          item("rect", "Rectangle", "rectangle", "RECTANG", "Rectangular geometry", S),
          item("circle", "Circle", "circle", "CIRCLE", "Circular geometry", S),
          item("arc", "Arc", "arc", "ARC", "Curved geometry", S),
          item("spline", "Spline", "spline", "SPLINE", "Freeform curve", S),
          item("hatch", "Hatch", "hatch", "HATCH", "Pattern fill", S),
        ],
      },
      {
        id: "building",
        name: "Building",
        items: [
          item("wall", "Wall", "wall", "WALL", "Walls with height, thickness, material", L),
          item("door", "Door", "door", "DOOR", "Insert door into wall", L),
          item("window", "Window", "window", "WINDOW", "Insert window into wall", L),
          item("slab", "Slab", "slab", "SLAB", "Floor slab", S),
          item("roof", "Roof", "roof", "ROOF", "Roof from boundary", S),
          item("stair", "Stair", "stair", "STAIR", "Stair run", S),
          item("column", "Column", "column", "COLUMN", "Structural column", S),
          item("beam", "Beam", "beam", "BEAM", "Structural beam", S),
          item("ramp", "Ramp", "ramp", "RAMP", "Accessible ramp", S),
          item("room", "Room", "room", "ROOM", "Define room / space", S),
        ],
      },
      {
        id: "structure",
        name: "Structure",
        items: [
          item("foundation", "Foundation", "foundation", "FOUNDATION", "Footings, slab on grade, piles", L),
          item("truss", "Trusses", "truss", "TRUSS", "Roof / floor trusses", L),
          item("framing", "Framing", "framing", "FRAMING", "Joists, rafters, studs", S),
          item("brace", "Bracing", "brace", "BRACE", "Lateral bracing", S),
          item("connect", "Connections", "connect", "CONNECT", "Structural connections", S),
        ],
      },
      {
        id: "mep",
        name: "MEP",
        items: [
          item("hvac", "HVAC", "hvac", "HVAC", "Air handlers, ducts, diffusers", L),
          item("elec", "Electrical", "electrical", "ELEC", "Panels, circuits, devices (also toggles the layer)", L, { active: "layer:electrical" }),
          item("plumb", "Plumbing", "plumbing", "PLUMB", "Supply, waste, vent (also toggles the layer)", L, { active: "layer:plumbing" }),
          item("duct", "Ducts", "duct", "DUCT", "Duct runs", S),
          item("pipe", "Pipes", "pipe", "PIPE", "Pipe runs", S),
          item("tray", "Cable trays", "tray", "TRAY", "Cable tray runs", S),
          item("fire", "Fire protection", "fire", "FIRE", "Sprinklers, alarms", S),
          item("fixt", "Fixtures", "fixture", "FIXT", "Placed components", S),
          item("equip", "Equipment", "equipment", "EQUIP", "Placed components", S),
        ],
      },
      {
        id: "modify",
        name: "Modify",
        items: [
          item("move", "Move", "move", "MOVE", "Transform selection", L),
          item("rotate", "Rotate", "rotate", "ROTATE", "Transform selection", L),
          item("scale", "Scale", "scale", "SCALE", "Transform selection", S),
          item("mirror", "Mirror", "mirror", "MIRROR", "Transform selection", S),
          item("offset", "Offset", "offset", "OFFSET", "Edit curves / walls", S),
          item("trim", "Trim", "trim", "TRIM", "Edit curves / walls", S),
          item("extend", "Extend", "extend", "EXTEND", "Edit curves / walls", S),
          item("fillet", "Fillet", "fillet", "FILLET", "Corners and patterns", S),
          item("chamfer", "Chamfer", "chamfer", "CHAMFER", "Corners and patterns", S),
          item("array", "Array", "array", "ARRAY", "Corners and patterns", S),
          item("split", "Split", "split", "SPLIT", "Edit / arrange", S),
          item("join", "Join", "join", "JOIN", "Edit / arrange", S),
          item("align", "Align", "align", "ALIGN", "Edit / arrange", S),
          item("copy", "Copy", "copy", "COPY", "Edit / arrange", S),
        ],
      },
      {
        id: "properties",
        name: "Properties",
        items: [
          item("chtype", "Change Type", "chtype", "CHTYPE", "Edit selected element", L),
          item("chmat", "Material", "material", "CHMAT", "Edit selected element", S),
          item("chdim", "Dimensions", "dimensions", "CHDIM", "Edit selected element", S),
          item("attach", "Attach", "attach", "ATTACH HOST", "Host / unhost elements", S, { cmdLabel: "ATTACH" }),
          item("detach", "Detach", "detach", "DETACH", "Host / unhost elements", S),
        ],
      },
      {
        id: "layers",
        name: "Layers",
        items: [
          item("layer", "Layer Properties", "layers", "LAYER", "Opens Explorer → Layers", L),
          item("isolate", "Isolate", "isolate", "ISOLATE", "Visibility / grouping", S),
          item("laylck", "Lock", "lock", "LAYLCK", "Visibility / grouping", S),
          item("group", "Group", "group", "GROUP", "Visibility / grouping", S),
          item("ungroup", "Ungroup", "ungroup", "UNGROUP", "Visibility / grouping", S),
        ],
      },
      {
        id: "measure",
        name: "Measure",
        items: [
          item("dist", "Distance", "distance", "DIST", "Measure", L),
          item("area", "Area", "area", "AREA", "Measure", S),
          item("volume", "Volume", "volume", "VOLUME", "Measure", S),
          item("angle", "Angle", "angle", "ANGLE", "Measure / check", S),
          item("elev", "Elevation", "elevation", "ELEV", "Measure / check", S),
          item("id", "Coordinate", "coordinate", "ID", "Measure / check", S),
          item("clear", "Clearance", "clearance", "CLEAR", "Measure / check", S),
        ],
      },
    ],
  },
  {
    id: "insert",
    label: "Insert",
    panels: [
      {
        id: "import",
        name: "Import",
        items: [
          item("dwg", "DWG / DXF", "dwg", "ATTACH", "Overlay AutoCAD / Civil 3D plan or survey", L),
          item("survey", "Survey / LandXML", "survey", "IMPORT", "Civil 3D surface, survey points", L),
          item("drone", "Drone", "drone", "DRONE", "DroneDeploy orthomosaic / point cloud", L),
          item("pdf", "PDF / Image", "pdf", "PDFATTACH", "Underlay to trace", L),
        ],
      },
      {
        id: "site",
        name: "Site",
        items: [
          item("geo", "Place on Map", "map", "GEOLOCATE", "Google Maps location + 3D terrain", L),
          item("terrain", "Terrain / Topography", "terrain", "TERRAIN", "Contours, grading surface", L),
          item("soil", "Soil Data", "soil", "SOIL", "Attach soil test report", L),
        ],
      },
      {
        id: "reference",
        name: "Reference",
        items: [
          item("xref", "Xref", "xref", "XREF", "Link another BuildSync project", L),
          item("mat", "Materials", "material", "MATERIAL", "Opens Explorer → Library", L),
        ],
      },
      {
        id: "components",
        name: "Components",
        items: [
          item("furn", "Furniture", "furniture", "FURN", "Insert from library", S),
          item("fixlib", "Fixtures", "fixture", "FIXT LIB", "Insert from library", S, { cmdLabel: "FIXT" }),
          item("meplib", "MEP parts", "mepparts", "MEPLIB", "Insert from library", S),
          item("strlib", "Structural parts", "strparts", "STRLIB", "Insert from library", S),
        ],
      },
      {
        id: "media",
        name: "Media",
        items: [
          item("image", "Image", "image", "IMAGE", "Place on drawing", S),
          item("text", "Text", "text", "TEXT", "Place on drawing", S),
          item("note", "Annotation", "note", "NOTE", "Place on drawing", S),
        ],
      },
    ],
  },
  {
    id: "annotate",
    label: "Annotate",
    panels: [
      {
        id: "dimensions",
        name: "Dimensions",
        items: [
          item("dim", "Dimension", "dim", "DIM", "Measurements, callouts, labels", L),
          item("leader", "Leader", "leader", "LEADER", "Measurements, callouts, labels", S),
          item("atext", "Text", "text", "TEXT", "Measurements, callouts, labels", S),
          item("tag", "Tag", "tag", "TAG", "Measurements, callouts, labels", S),
        ],
      },
      {
        id: "markers",
        name: "Markers",
        items: [
          item("secline", "Section", "section", "SECTIONLINE", "Drawing references", L),
          item("elevmark", "Elevation", "elevation", "ELEVMARK", "Drawing references", S),
          item("detail", "Detail", "detail", "DETAIL", "Drawing references", S),
          item("gridline", "Grid", "gridline", "GRIDLINE", "Drawing references", S),
        ],
      },
      {
        id: "schedules",
        name: "Schedules",
        items: [
          item("schedule", "Door/Window Schedule", "schedule", "SCHEDULE", "Generated tables", L),
          item("qto", "Quantity Take-off", "qto", "QTO", "Material quantities from model", L),
        ],
      },
    ],
  },
  {
    id: "analyze",
    label: "Analyze",
    panels: [
      {
        id: "structural",
        name: "Structural",
        items: [
          item("struct", "Structural", "struct", "STRUCT", "Full structural analysis → Stress Test palette", L),
          item("stress", "Stress Test", "stress", "STRESS", "Stress Test palette + heat overlay", L),
          item("loads", "Load", "load", "LOADS", "Load cases", S),
          item("deflect", "Deflection", "deflect", "DEFLECT", "Span limits", S),
        ],
      },
      {
        id: "environment",
        name: "Environment",
        items: [
          item("solar", "Solar", "solar", "SOLAR", "Sun path, shading, window / PV suggestions", L, { active: "flag:solar" }),
          item("wind", "Wind", "wind", "WIND", "→ Simulation palette", S),
          item("seismic", "Seismic", "seismic", "SEISMIC", "→ Simulation palette", S),
          item("thermal", "Thermal", "thermal", "THERMAL", "→ Simulation palette", S),
          item("energy", "Energy", "energy", "ENERGY", "→ Simulation palette", S),
        ],
      },
      {
        id: "asite",
        name: "Site",
        items: [
          item("grading", "Grading", "grading", "GRADING", "Cut / fill against site contours", L),
          item("traffic", "Traffic Radius", "traffic", "TRAFFIC", "Radius traffic analysis (default 10 mi)", L),
        ],
      },
      {
        id: "checks",
        name: "Checks",
        items: [
          item("clash", "Clash Detect", "clash", "CLASH", "→ Clash palette", L),
          item("codecheck", "Code Check", "codecheck", "CODECHECK", "→ Compliance palette", L),
          item("matcheck", "Material Analysis", "matcheck", "MATCHECK", "Material suitability for climate / soil", S),
          item("construct", "Constructability", "construct", "CONSTRUCT", "Sequencing and access review", S),
        ],
      },
      {
        id: "costtime",
        name: "Cost & Time",
        items: [
          item("cost", "Cost", "cost", "COST", "→ Cost palette", L),
          item("schedq", "Schedule Query", "schedq", "SCHEDQ", "Opens Timeline with a window picker", L),
          item("workforce", "Workforce", "workforce", "WORKFORCE", "Trades / headcount by phase", S),
        ],
      },
      {
        id: "simulate",
        name: "Simulate",
        items: [item("simulate", "Disaster Simulation", "simulate", "SIMULATE", "→ Simulation palette (scenario builder)", L)],
      },
    ],
  },
  {
    id: "collaborate",
    label: "Collaborate",
    panels: [
      {
        id: "review",
        name: "Review",
        items: [
          item("comment", "Comment", "comment", "COMMENT", "Pinned to model", L),
          item("markup", "Markup", "markup", "MARKUP", "Pinned to model", S),
          item("issue", "Issue", "issue", "ISSUE", "Issue → Issues palette", S),
          item("task", "Task", "task", "TASK", "Pinned to model", S),
          item("pin", "Pin", "pin", "PIN", "Pinned to model", S),
        ],
      },
      {
        id: "approval",
        name: "Approval",
        items: [
          item("pesign", "PE Sign-off", "pesign", "PESIGN", "Send flagged items to the PE review queue", L),
          item("approvals", "Approvals", "approvals", "APPROVALS", "Approval list", S),
          item("revmode", "Review Mode", "review", "REVIEW", "Read-only review", S, { active: "flag:reviewMode" }),
        ],
      },
      {
        id: "share",
        name: "Share",
        items: [
          item("share", "Share", "share", "SHARE", "Invite people", L),
          item("perms", "Permissions", "perms", "PERMS", "Roles", S),
          item("history", "History", "history", "HISTORY", "Activity", S),
          item("versions", "Versions", "versions", "VERSIONS", "View / restore versions", S),
        ],
      },
    ],
  },
  {
    id: "ai",
    label: "AI",
    panels: [
      {
        id: "ask",
        name: "Ask",
        items: [
          item("ask", "Ask BuildSync", "ask", "ASK", "Focuses the command line", L),
          item("p2p", "Prompt to Plan", "p2p", "P2P", "Describe a building → starter plan", L),
          item("explain", "Explain", "explain", "EXPLAIN", "“Why is this failing?” on selection", L),
          item("aigen", "Generate", "generate", "AIGEN", "Generate elements", S),
          item("aiauto", "Automate", "automate", "AIAUTO", "Repeat tasks", S),
        ],
      },
      {
        id: "airev",
        name: "Review",
        items: [
          item("aireview", "Design Review", "aireview", "AIREVIEW", "Results → AI Analysis palette", L),
          item("aicode", "Code Review", "aicode", "AICODE", "Results → AI Analysis palette", S),
          item("aierr", "Error Detect", "aierr", "AIERR", "Results → AI Analysis palette", S),
        ],
      },
      {
        id: "advise",
        name: "Advise",
        items: [
          item("aicost", "Cost Estimator", "aicost", "AICOST", "Recommendations", S),
          item("aimat", "Material Advisor", "aimat", "AIMAT", "Recommendations", S),
          item("aiopt", "Optimize", "aiopt", "AIOPT", "Recommendations", S),
          item("aicmp", "Compare", "aicompare", "AICMP", "Recommendations", S),
        ],
      },
      {
        id: "aiedit",
        name: "Edit",
        items: [item("aiedit", "AI Model Editor", "aiedit", "AIEDIT", "Agent proposes edits → preview → accept / reject", L)],
      },
      {
        id: "council",
        name: "Council",
        items: [item("council", "Agent Council", "council", "COUNCIL", "Put a decision to several connected agents. They debate and each casts a vote → Council palette", L)],
      },
      {
        id: "agents",
        name: "Agents",
        items: [
          item("connectors", "Connectors", "connectors", "CONNECTORS", "→ /settings/integrations", L),
          item("agent", "Switch Agent", "agent", "AGENT", "Opens the agent menu", L),
        ],
      },
    ],
  },
  {
    id: "view",
    label: "View",
    panels: [
      {
        id: "navigate",
        name: "Navigate",
        items: [
          item("plan", "2D Plan", "plan", "PLAN", "Switch viewport to 2D", L, { active: "view:2d" }),
          item("3d", "3D View", "view3d", "3DVIEW", "Switch viewport to 3D", L, { active: "view:3d" }),
          item("orbit", "Orbit", "orbit", "3DORBIT", "Navigation", S),
          item("walk", "Walk", "walk", "3DWALK", "Navigation", S),
          item("zoome", "Zoom Extents", "zoomext", "ZOOM E", "Navigation", S),
        ],
      },
      {
        id: "views",
        name: "Views",
        items: [
          item("vtop", "Top", "vtop", "-VIEW TOP", "Named view", S, { cmdLabel: "-VIEW" }),
          item("vfront", "Front", "vfront", "-VIEW FRONT", "Named view", S, { cmdLabel: "-VIEW" }),
          item("vback", "Back", "vback", "-VIEW BACK", "Named view", S, { cmdLabel: "-VIEW" }),
          item("vleft", "Left", "vleft", "-VIEW LEFT", "Named view", S, { cmdLabel: "-VIEW" }),
          item("vright", "Right", "vright", "-VIEW RIGHT", "Named view", S, { cmdLabel: "-VIEW" }),
          item("vbottom", "Bottom", "vbottom", "-VIEW BOTTOM", "Named view", S, { cmdLabel: "-VIEW" }),
          item("vplan", "Floor Plan", "vplan", "-VIEW FLOORPLAN", "Named view", S, { cmdLabel: "-VIEW" }),
          item("velev", "Elevation", "velev", "-VIEW ELEVATION", "Named view", S, { cmdLabel: "-VIEW" }),
        ],
      },
      {
        id: "projection",
        name: "Projection",
        items: [
          item("persp", "Perspective", "persp", "PERSP", "Camera", S, { active: "persp" }),
          item("ortho3d", "Orthographic", "ortho3d", "ORTHO3D", "Camera", S, { active: "ortho3d" }),
        ],
      },
      {
        id: "vstyle",
        name: "Visual Style",
        items: [
          item("wire", "Wireframe", "wire", "VSCURRENT WIREFRAME", "Render mode", S, { cmdLabel: "VSCURRENT", active: "style:wireframe" }),
          item("shaded", "Shaded", "shaded", "VSCURRENT SHADED", "Render mode", S, { cmdLabel: "VSCURRENT", active: "style:shaded" }),
          item("real", "Realistic", "realistic", "VSCURRENT REALISTIC", "Render mode", S, { cmdLabel: "VSCURRENT", active: "style:realistic" }),
          item("xray", "X-Ray", "xray", "VSCURRENT XRAY", "Render mode", S, { cmdLabel: "VSCURRENT", active: "style:xray" }),
        ],
      },
      {
        id: "section",
        name: "Section",
        items: [
          item("section", "Section Cut", "section", "SECTIONPLANE", "Cutaway reveals foundation, framing, MEP", L, { active: "section" }),
          item("secbox", "Section Box", "sectionbox", "SECTIONBOX", "Cutaway reveals foundation, framing, MEP", L, { active: "flag:sectionBox" }),
        ],
      },
      {
        id: "display",
        name: "Display",
        items: [
          item("grid", "Grid", "grid", "GRID", "Toggle", S, { active: "toggle:grid" }),
          item("rulers", "Rulers", "rulers", "RULERS", "Toggle", S, { active: "flag:rulers" }),
          item("guides", "Guides", "guides", "GUIDES", "Toggle", S, { active: "flag:guides" }),
          item("snap", "Snap", "snap", "SNAP", "Toggle", S, { active: "toggle:snap" }),
          item("ortho", "Ortho", "ortho", "ORTHO", "Toggle", S, { active: "toggle:ortho" }),
          item("full", "Full Screen", "full", "FULL", "Toggle", S, { active: "flag:fullscreen" }),
        ],
      },
      {
        id: "visibility",
        name: "Visibility",
        items: [
          item("visisolate", "Isolate", "isolate", "ISOLATE", "Selection visibility", S),
          item("hide", "Hide", "hide", "HIDE", "Selection visibility", S),
          item("showall", "Show All", "showall", "UNHIDE", "Selection visibility", S, { cmdLabel: "UNISOLATE" }),
        ],
      },
      {
        id: "panels",
        name: "Panels",
        items: [
          item("explorer", "Explorer", "explorer", "EXPLORER", "Show / hide docks", S, { active: "dock:explorer" }),
          item("palettes", "Palettes", "palettes", "PALETTES", "Show / hide docks", S, { active: "dock:palettes" }),
          item("timeline", "Timeline", "timeline", "TIMELINE", "Show / hide docks", S, { active: "dock:timeline" }),
          item("cmdline", "Command Line", "cmdline", "CMDLINE", "Show / hide docks", S, { active: "dock:cmdline" }),
        ],
      },
    ],
  },
  {
    id: "manage",
    label: "Manage",
    panels: [
      {
        id: "settings",
        name: "Settings",
        items: [
          item("settings", "Settings", "settings", "SETTINGS", "Opens /settings/general", L),
          item("connectors", "Connectors", "connectors", "CONNECTORS", "Opens /settings/integrations", L),
          item("aisettings", "AI Settings", "aisettings", "AISETTINGS", "Opens /settings/ai", L),
        ],
      },
      {
        id: "standards",
        name: "Standards",
        items: [
          item("units", "Units", "units", "UNITS", "Opens /settings/units", L),
          item("gridsnap", "Grid & Snap", "gridsnap", "GRIDSNAP", "Opens /settings/grid-snap", L),
          item("templates", "Templates", "templates", "TEMPLATES", "Start from a template", L),
          item("standards", "Project Standards", "standards", "STANDARDS", "Drawing standards for this project", L),
        ],
      },
      {
        id: "account",
        name: "Account",
        items: [
          item("perms", "Permissions", "perms", "PERMS", "Opens /settings/permissions", L),
          item("account", "Account", "account", "ACCOUNT", "Opens /settings/account", L),
        ],
      },
    ],
  },
];

export const RIBBON_BY_ID: Record<RibbonTabId, RibbonTab> = Object.fromEntries(RIBBON.map((t) => [t.id, t])) as Record<RibbonTabId, RibbonTab>;

/** Group a panel's items into render columns: a large button, or up to three stacked small ones. */
export function panelColumns(items: RibbonItem[]): RibbonItem[][] {
  const cols: RibbonItem[][] = [];
  const run: RibbonItem[] = [];
  const flush = () => {
    while (run.length) cols.push(run.splice(0, 3));
  };
  for (const it of items) {
    if (it.size === "large") {
      flush();
      cols.push([it]);
    } else run.push(it);
  }
  flush();
  return cols;
}
