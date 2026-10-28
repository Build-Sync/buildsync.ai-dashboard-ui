/**
 * components/workspace/Ribbon/ribbon.config.ts
 *
 * WHAT   The definition of the whole ribbon: the tabs (Home, Insert, Systems, Annotate, View, Analyze, AI,
 *        Collaborate, Manage: the order you work in, lib/types.ts RIBBON_TAB_IDS), each with what it is for (`purpose`, shown by
 *        the tutorial and the Button Guide) and panels of large and small buttons. Every item names its icon, the
 *        command it runs, a description of what it does (the tooltip and the Button Guide) and an optional
 *        accent-fill rule. Home ends with the pinned Help panel (Tutorial, Button Guide, Shortcuts); View ends with
 *        the pinned Panels panel (Interfaces and the window switches). Pinned panels never fold into a flyout.
 * FOR    RibbonTabs and RibbonPanels render from RIBBON. To add a button, add an item here and make sure its
 *        command exists in lib/commands.ts (or is a /settings route).
 * DEBUG  - A button does nothing: item.command must be a registered command or a /settings route.
 *        - A button is highlighted wrongly: item.active rules (toggle:grid, layer:electrical, view:2d,
 *          style:xray, section, dock:timeline, persp, ortho3d, flag:rulers, underlay, look:plumbing) are interpreted by isActive
 *          in RibbonPanels.tsx.
 *        - A panel folds into a flyout at a width it used to fit: panels fold from the right (fit.ts), so a wider
 *          tab hides its last panels first. Home keeps Modify (with Offset) right after Draw, as AutoCAD does.
 *        - Layout looks odd: panelColumns puts each large button in its own column and stacks up to three
 *          consecutive small buttons.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { IconKey } from "@/components/icons";
import { RIBBON_TAB_IDS, type RibbonTabId } from "@/lib/types";

/* Ribbon definition (spec §10.4). Large buttons are 28px icons with a label under them;
 * consecutive small buttons stack three to a column. Order inside a panel is render order. */

/** One ribbon button: icon, label, command, tooltip text, size and optional active rule. */
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
  /** accent-fill rule: toggle:grid · layer:electrical · view:2d · style:xray · section · dock:timeline · persp · ortho3d · flag:rulers · underlay */
  active?: string;
}

/** A named group of buttons inside a tab. */
export interface RibbonPanel {
  id: string;
  name: string;
  items: RibbonItem[];
  /** never folds into a flyout, however narrow the window (Help on Home: the tutorial stays one click away) */
  pin?: boolean;
}

/** A ribbon tab with its panels. */
export interface RibbonTab {
  id: RibbonTabId;
  label: string;
  /** what the tab is for, in a sentence or two (the tutorial and the Button Guide show it) */
  purpose: string;
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

/** Every ribbon tab (shown in the order of RIBBON_TAB_IDS, lib/types.ts). */
const TABS: RibbonTab[] = [
  {
    id: "home",
    label: "Home",
    purpose: "Draw and build: lines and shapes, walls, doors, windows, slabs, roofs, structure and MEP, then move, copy, offset or trim them. Measure, layers, and Help (the tutorial, the Button Guide and the shortcuts) are here too.",
    panels: [
      {
        id: "draw",
        name: "Draw",
        items: [
          item("line", "Line", "line", "LINE", "Draw straight lines: click (or type) each point; Enter ends", L),
          item("pline", "Polyline", "polyline", "PLINE", "Draw connected line segments as one polyline; C closes it, Enter ends", L),
          item("rect", "Rectangle", "rectangle", "RECTANG", "Draw a rectangle from two opposite corners (or type @width,height)", S),
          item("circle", "Circle", "circle", "CIRCLE", "Draw a circle from its centre and a radius (click or type it)", S),
          item("arc", "Arc", "arc", "ARC", "Draw an arc through three points: start, a point on it, end", S),
          item("spline", "Spline", "spline", "SPLINE", "Draw a smooth curve through the points you click", S),
          item("hatch", "Hatch", "hatch", "HATCH", "Fill a closed area with a pattern: click inside walls or a closed shape", S),
        ],
      },
      {
        id: "modify",
        name: "Modify",
        items: [
          item("move", "Move", "move", "MOVE", "Move the selection (or drag it with the mouse)", L),
          item("rotate", "Rotate", "rotate", "ROTATE", "Turn the selection about a base point by an angle you click or type", L),
          item("offset", "Offset", "offset", "OFFSET", "Make a parallel copy of a line, polyline, circle or wall at a distance", L),
          item("copy", "Copy", "copy", "COPY", "Copy the selection from a base point to as many places as you click", S),
          item("mirror", "Mirror", "mirror", "MIRROR", "Mirror the selection across a line of two points (keep or delete the original)", S),
          item("scale", "Scale", "scale", "SCALE", "Make the selection bigger or smaller about a base point by a factor", S),
          item("trim", "Trim", "trim", "TRIM", "Cut lines and walls back to a cutting edge: click the part to remove", S),
          item("extend", "Extend", "extend", "EXTEND", "Lengthen lines and walls until they meet a boundary edge", S),
          item("fillet", "Fillet", "fillet", "FILLET", "Round two lines into an arc of a radius, or close the corner with radius 0", S),
          item("chamfer", "Chamfer", "chamfer", "CHAMFER", "Cut a corner of two lines with a straight bevel at a distance", S),
          item("array", "Array", "array", "ARRAY", "Copies in rows and columns, or around a centre", S),
          item("split", "Split", "split", "SPLIT", "Break a line or wall in two at the point you click", S),
          item("join", "Join", "join", "JOIN", "Join lines or walls that meet end to end into one", S),
          item("align", "Align", "align", "ALIGN", "Line the selection up with another element: pick source and target points", S),
        ],
      },
      {
        id: "building",
        name: "Building",
        items: [
          item("wall", "Wall", "wall", "WALL", "Draw walls by their centre line: type, height and load-bearing in the tool bar", L),
          item("door", "Door", "door", "DOOR", "Put a door in a wall: click the wall where it goes (type, hinge, swing in the tool bar)", L),
          item("window", "Window", "window", "WINDOW", "Put a window in a wall: click the wall where it goes (type in the tool bar)", L),
          item("slab", "Slab", "slab", "SLAB", "Draw a floor slab from its outline (R for a rectangle); thickness from its type", S),
          item("roof", "Roof", "roof", "ROOF", "Draw a roof from its outline, on top of the storey you are on", S),
          item("stair", "Stair", "stair", "STAIR", "Draw a stair from its bottom to its top: width and rise in the tool bar", S),
          item("column", "Column", "column", "COLUMN", "Place a structural column with a click: size and height from its type", S),
          item("beam", "Beam", "beam", "BEAM", "Draw a beam between two points at the top of the storey", S),
          item("ramp", "Ramp", "ramp", "RAMP", "Draw an accessible ramp at a 1:12 slope from its bottom to its top", S),
          item("room", "Room", "room", "ROOM", "Name a room: click inside walls; its area is measured and follows the walls", S),
        ],
      },
      {
        id: "structure",
        name: "Structure",
        items: [
          item("foundation", "Foundation", "foundation", "FOUNDATION", "Draw a footing or foundation from its outline, below grade (dashed on plans)", L),
          item("truss", "Trusses", "truss", "TRUSS", "Lay out trusses under a roof or slab you click, at the spacing in the tool bar", L),
          item("framing", "Framing", "framing", "FRAMING", "Lay out studs, joists or rafters in a wall, slab or roof you click", S),
          item("brace", "Bracing", "brace", "BRACE", "Draw a diagonal brace from its bottom point to its top point", S),
          item("connect", "Connections", "connect", "CONNECT", "Add a structural connection where two members you click meet", S),
        ],
      },
      {
        id: "mep",
        name: "MEP",
        items: [
          item("hvac", "HVAC", "hvac", "HVAC", "Place HVAC equipment: an AC condenser, mini-split, air handler, diffuser or return grille", L),
          item("elec", "Electrical", "electrical", "ELEC", "Place lights, switches, outlets, fans, detectors, the panel or an inverter (also toggles the layer)", L, { active: "layer:electrical" }),
          item("plumb", "Plumbing", "plumbing", "PLUMB", "Place sinks, faucets, toilets, tubs, showers or the water heater (also toggles the layer)", L, { active: "layer:plumbing" }),
          item("wire", "Wire", "wiring", "WIRE", "Click a switch (or a panel), then each light, fan or outlet it feeds: the switch controls them", L),
          item("pipeconnect", "Pipe Connect", "pipeconnect", "PIPECONNECT", "Click the water heater, the supply or the drain stack, then each fixture: hot, cold or drain pipes", L),
          item("duct", "Ducts", "duct", "DUCT", "Draw a duct run through the points you click, at the height in the tool bar", S),
          item("pipe", "Pipes", "pipe", "PIPE", "Draw a pipe run through the points you click, at the height in the tool bar", S),
          item("tray", "Cable Trays", "tray", "TRAY", "Draw a cable tray run through the points you click", S),
          item("fire", "Fire Protection", "fire", "FIRE", "Place sprinkler heads or fire alarms (turns the Fire layer on)", S),
          item("fixt", "Fixtures", "fixture", "FIXT", "Place any fixture of the catalogue: lights, switches, outlets, sinks, toilets, tubs, AC units", S),
          item("equip", "Equipment", "equipment", "EQUIP", "Place equipment: the water heater, air handler, AC condenser, panel, inverter, battery or a generator", S),
        ],
      },
      {
        id: "properties",
        name: "Properties",
        items: [
          item("chtype", "Change Type", "chtype", "CHTYPE", "Switch the selected element to another type (e.g. a CMU wall to concrete)", L),
          item("chmat", "Material", "material", "CHMAT", "Change the selected element's material and colour", S),
          item("chdim", "Dimensions", "dimensions", "CHDIM", "Type new dimensions for the selected element (length, height, thickness …)", S),
          item("attach", "Attach", "attach", "ATTACH HOST", "Attach drawn elements to a host (a wall, slab or roof) so they move with it", S, { cmdLabel: "ATTACH" }),
          item("detach", "Detach", "detach", "DETACH", "Detach drawn elements from their host so they move on their own", S),
        ],
      },
      {
        id: "layers",
        name: "Layers",
        items: [
          item("layer", "Layer Properties", "layers", "LAYER", "Open the layer table: show, hide, lock and colour each layer", L),
          item("isolate", "Isolate", "isolate", "ISOLATE", "Show only the selection; Show All brings the rest back", S),
          item("laylck", "Lock", "lock", "LAYLCK", "Lock (or unlock) the layer of the selected element against edits", S),
          item("group", "Group", "group", "GROUP", "Group the selection so it selects and moves as one", S),
          item("ungroup", "Ungroup", "ungroup", "UNGROUP", "Break the selected group back into its elements", S),
        ],
      },
      {
        id: "measure",
        name: "Measure",
        items: [
          item("dist", "Distance", "distance", "DIST", "Measure the distance between two points (and its x, y and angle)", L),
          item("area", "Area", "area", "AREA", "Measure an area: click its corners, or click inside a closed shape", S),
          item("volume", "Volume", "volume", "VOLUME", "Measure the volume of the element you click", S),
          item("angle", "Angle", "angle", "ANGLE", "Measure the angle between two lines, or of three points", S),
          item("elev", "Elevation", "elevation", "ELEV", "Read the elevation of a point and of the element under it", S),
          item("id", "Coordinate", "coordinate", "ID", "Read the x, y and z coordinates of a point", S),
          item("clear", "Clearance", "clearance", "CLEAR", "Measure the clear distance between two elements", S),
        ],
      },
      {
        id: "help",
        name: "Help",
        pin: true,
        items: [
          item("tutorial", "Tutorial", "tutorial", "TUTORIAL", "A guided tour of the screen: what every area and every tab is for. Skip it any time", L),
          item("buttonguide", "Button Guide", "guide", "BUTTONGUIDE", "Every button by tab: what it looks like, what it does and where it is (the eye shows it on screen)", S),
          item("shortcutlist", "Shortcuts", "keyboard", "SHORTCUTS", "Every keyboard shortcut and command alias", S),
        ],
      },
    ],
  },
  {
    id: "insert",
    label: "Insert",
    purpose: "Bring things into the project: DWG / DXF drawings, surveys and terrain, drone images, PDFs to trace, the site location and property line, other projects (linked or merged), library parts, site objects (shed, pool, trees, bushes, boulders, flower and gravel beds, septic tank), images and text.",
    panels: [
      {
        id: "import",
        name: "Import",
        items: [
          item("dwg", "DWG / DXF", "dwg", "ATTACH", "Bring in an AutoCAD drawing (DXF; save a DWG as DXF): its lines, arcs and text on the plan", L),
          item("survey", "Survey / LandXML", "survey", "IMPORT", "Bring in survey points (LandXML or CSV): the ground's contours replace the sample's", L),
          item("drone", "Drone", "drone", "DRONE", "Bring in a drone orthomosaic (JPG / PNG) to trace, or a point cloud (LAS) for the ground", L),
          item("pdf", "PDF / Image", "pdf", "PDFATTACH", "Place an image of a site plan or survey under the drawing at its real width, to trace", L),
        ],
      },
      {
        id: "site",
        name: "Site",
        items: [
          item("geo", "Site Location", "mapIcon", "GEOLOCATE", "Coordinates of the site, its property line, Google Maps and the land within a mile", L),
          item("propline", "Property Line", "compass", "PROPLINE", "Draw the property line: click the corners or type bearings and distances", L),
          item("sitefrommap", "Site from Map", "mapIcon", "SITEFROMMAP", "From the site's coordinates: the ground's contours from public elevation data and the satellite photo under the plan, then the site plan sheet", L),
          item("terrain", "Terrain / Topography", "terrain", "TERRAIN", "Make the ground from points (CSV, LandXML or LAS): contours at the interval you pick", L),
          item("soil", "Soil Data", "soil", "SOIL", "Keep a soil report's numbers with the project: bearing, site class, groundwater, percolation", L),
          item("groundtype", "Ground Type", "ground", "GROUND", "Choose the kind of ground (lawn, dirt, clay, loam, sand, gravel, rock): its look in 3D and on the sheets, and the soil values the checks use", L),
        ],
      },
      {
        id: "siteobjects",
        name: "Site Objects",
        items: [
          item("place", "Place by Measure", "ruler", "PLACE", "Type a size and a distance from the building and the object goes there: a shed, pool, tree, bush, boulder, flower bed, septic tank, slab or box", L),
          item("pool", "Pool", "pool", "POOL", "A pool (rectangle, oval, freeform or L) with its depth and the deck around it: click where it goes", S),
          item("shed", "Shed", "shed", "SHED", "A shed or outbuilding: width, depth, height and roof in the tool bar, then click or type x,y", S),
          item("tree", "Tree", "tree", "TREE", "A shade tree, palm or pine with its height and canopy", S),
          item("bush", "Bush", "shrub", "BUSH", "A bush or shrub with its height and spread", S),
          item("flowers", "Flower Bed", "flower", "FLOWERS", "Outline a flower bed (R for a rectangle): mulch and flowering plants in the colours you pick", S),
          item("fence", "Fence / Wall", "fence", "FENCE", "Draw a fence or a garden wall by its line: wood privacy, picket, chain link, wrought iron, vinyl or masonry (C closes it round a yard)", S),
          item("rock", "Boulders", "rock", "ROCK", "A landscape boulder or a cluster of them, sized in the tool bar", S),
          item("gravel", "Gravel Bed", "gravel", "GRAVEL", "Outline a bed of gravel or river rock", S),
          item("septic", "Septic Tank", "septic", "SEPTIC", "A septic tank and its drain field, buried: dashed on plans, seen with View → Below Grade", S),
        ],
      },
      {
        id: "reference",
        name: "Reference",
        items: [
          item("xref", "Link Project", "xref", "XREF", "Bring another project onto this parcel: keep it separate (live: it updates here when saved) or merge an editable copy", L),
          item("community", "Community", "community", "COMMUNITY", "A new project with several projects side by side (or facing across a street) on one parcel", L),
          item("links", "Linked Projects", "palettes", "LINKS", "The Links palette: move, turn, open, merge or unlink the projects on this parcel", S),
          item("mat", "Materials", "material", "MATERIAL", "Open the materials and components library in the Model Explorer", L),
        ],
      },
      {
        id: "components",
        name: "Components",
        items: [
          item("furn", "Furniture", "furniture", "FURN", "Place furniture in the 2D plan or the 3D view: sofas, beds, tables and chairs, kitchen, office, laundry and outdoor pieces; pick one in the tool bar or the Library, R turns it", L),
          item("fixlib", "Fixtures", "fixture", "FIXT LIB", "Place fixtures from the library with a click", S, { cmdLabel: "FIXT" }),
          item("meplib", "MEP Parts", "mepparts", "MEPLIB", "Place MEP parts from the library: outlets, lights, panels, valves, diffusers, sprinklers", S),
          item("strlib", "Structural Parts", "strparts", "STRLIB", "Place structural parts from the library: steel columns and footing pads", S),
        ],
      },
      {
        id: "media",
        name: "Media",
        items: [
          item("image", "Image", "image", "IMAGE", "Place an image file on the drawing with a click, at the width in the tool bar", S),
          item("text", "Text", "text", "TEXT", "Place text on the drawing: type it in the tool bar, then click", S),
          item("note", "Annotation", "note", "NOTE", "Place a yellow note on the drawing", S),
        ],
      },
    ],
  },
  {
    id: "systems",
    label: "Systems",
    purpose: "The building's and the site's services: lights, switches, outlets, fans, detectors, solar panels and the inverter; sinks, faucets, toilets, tubs, showers, the water heater and AC units; the wires and pipes that connect them, and whether they are drawn as lines or as the pipes and cables; roads, sidewalks, signs, traffic lights, storm drains and gutters.",
    panels: [
      {
        id: "lighting",
        name: "Lighting & Power",
        items: [
          item("light", "Light", "light", "LIGHT", "Place a ceiling light (recessed, pendant or sconce in the tool bar); wire it to a switch", L),
          item("switch", "Switch", "switch", "SWITCH", "Place a light switch on a wall (single, 3-way or dimmer); then wire it to its lights", S),
          item("outlet", "Outlet", "outlet", "OUTLET", "Place an outlet on a wall (duplex, GFCI or 240 V)", S),
          item("ceilingfan", "Ceiling Fan", "fan", "CEILINGFAN", "Place a ceiling fan with a light; wire it to a switch", S),
          item("smoke", "Smoke Detector", "smoke", "SMOKEDETECTOR", "Place a smoke / CO detector on the ceiling", S),
          item("thermostat", "Thermostat", "thermostat", "THERMOSTAT", "Place a thermostat on a wall", S),
          item("inverter", "Inverter", "inverter", "INVERTER", "Place a solar inverter on a wall", S),
          item("solarpanels", "Solar Panels", "solarpanel", "SOLARPANEL", "Click a roof slope (the array follows it) or the ground (racked): rows and panels in the tool bar", L),
        ],
      },
      {
        id: "plumbingfix",
        name: "Plumbing & Air",
        items: [
          item("sink", "Sink", "sink", "SINK", "Place a vanity and sink against a wall (kitchen, pedestal or double in the tool bar)", L),
          item("faucet", "Faucet", "faucet", "FAUCET", "Place a faucet on a counter", S),
          item("toilet", "Toilet", "toilet", "TOILET", "Place a toilet against a wall", S),
          item("tub", "Bathtub", "tub", "TUB", "Place a bathtub (alcove or freestanding)", S),
          item("shower", "Shower", "shower", "SHOWER", "Place a glass shower against a wall", S),
          item("waterheater", "Water Heater", "waterheater", "WATERHEATER", "Place a water heater (tank or tankless); pipe hot water from it", S),
          item("acunit", "AC Unit", "ac", "ACUNIT", "Place an AC condenser outside (or a mini-split)", S),
        ],
      },
      {
        id: "connect",
        name: "Connect",
        items: [
          item("iwire", "Wire", "wiring", "WIRE", "Click a switch (or a panel), then each light, fan or outlet it feeds: the switch controls them", L),
          item("ipipeconnect", "Pipe Connect", "pipeconnect", "PIPECONNECT", "Click the water heater, the supply or the drain stack, then each fixture: hot, cold or drain pipes", L),
          item("pipeview", "Pipes", "pipes", "PIPEVIEW", "Show plumbing as real pipes (cold blue, hot red, drains brown) instead of dotted lines", S, { active: "look:plumbing" }),
          item("wireview", "Wires", "wires", "WIREVIEW", "Show electrical as the cables (yellow power, white switched legs) instead of dashed lines", S, { active: "look:electrical" }),
          item("switchon", "Switch On / Off", "switch", "SWITCHON", "Turn the selected switches on or off: the lights they feed light up", S),
        ],
      },
      {
        id: "roads",
        name: "Roads & Drainage",
        items: [
          item("road", "Road", "road", "ROAD", "Draw a road by its centre line: lanes and lines, curb and gutter and sidewalks (tool bar)", L),
          item("sidewalk", "Sidewalk", "sidewalk", "SIDEWALK", "Draw a concrete sidewalk by its line, with joints every 5 ft", S),
          item("sign", "Sign", "sign", "SIGN", "A road sign on its post: stop, yield, speed limit, street names, no parking, one way", S),
          item("signal", "Traffic Light", "signal", "SIGNAL", "A traffic light on a mast arm over the road", S),
          item("drain", "Drain", "drain", "DRAIN", "A curb inlet with its catch basin, an area drain or a trench drain", S),
          item("gutter", "Gutters", "gutter", "GUTTER", "Click a roof: gutters along its eaves with downspouts and splash blocks", S),
        ],
      },
    ],
  },
  {
    id: "annotate",
    label: "Annotate",
    purpose: "Document the drawing: dimensions, leaders, tags, section and elevation marks, place labels, grids, and the door / window schedule and quantity take-off.",
    panels: [
      {
        id: "dimensions",
        name: "Dimensions",
        items: [
          item("dim", "Dimension", "dim", "DIM", "Dimension between two points, then click where the dimension line goes", L),
          item("leader", "Leader", "leader", "LEADER", "Draw an arrow from a point to a note", S),
          item("atext", "Text", "text", "TEXT", "Place text on the drawing: type it in the tool bar, then click", S),
          item("tag", "Tag", "tag", "TAG", "Tag an element with its name and id: click it, then where the tag goes", S),
        ],
      },
      {
        id: "markers",
        name: "Markers",
        items: [
          item("secline", "Section", "section", "SECTIONLINE", "Draw a section mark (a cut line with letter bubbles) on the plan", L),
          item("aviewelev", "Elevation View", "velev", "VIEWELEV", "Place two points at any angle, or a centre and radius for a circular elevation: it opens on its own sheet", L),
          item("aviewsec", "Section View", "section", "VIEWSECTION", "Draw a cut line and see the section on its own sheet", L),
          item("label", "Place Label", "map", "LABEL", "Name a place: shown on the plan and floating in 3D", L),
          item("elevmark", "Spot Elevation", "elevation", "ELEVMARK", "Mark the elevation of a spot on the plan", S),
          item("detail", "Detail", "detail", "DETAIL", "Circle an area for a detail callout", S),
          item("gridline", "Grid", "gridline", "GRIDLINE", "Draw a structural grid line with its bubble (lettered or numbered)", S),
        ],
      },
      {
        id: "schedules",
        name: "Schedules",
        items: [
          item("schedule", "Door/Window Schedule", "schedule", "SCHEDULE", "The door and window schedule made from the model (export as CSV)", L),
          item("qto", "Quantity Take-off", "qto", "QTO", "Material quantities and costs counted from the model (export as CSV)", L),
        ],
      },
    ],
  },
  {
    id: "analyze",
    label: "Analyze",
    purpose: "Check the design: structural stress and loads, wind, seismic, solar and energy, grading and traffic, clashes and code compliance, cost and schedule.",
    panels: [
      {
        id: "structural",
        name: "Structural",
        items: [
          item("struct", "Structural", "struct", "STRUCT", "Full structural analysis → Stress Test palette", L),
          item("stress", "Stress Test", "stress", "STRESS", "Run a stress test on an element or the whole frame and colour the model by stress", L),
          item("loads", "Load", "load", "LOADS", "Set up the load cases and combinations for the stress test", S),
          item("deflect", "Deflection", "deflect", "DEFLECT", "Check beam deflection against span limits (L/360) in the stress test", S),
        ],
      },
      {
        id: "environment",
        name: "Environment",
        items: [
          item("solar", "Solar", "solar", "SOLAR", "Sun path, shading, window / PV suggestions", L, { active: "flag:solar" }),
          item("wind", "Wind", "wind", "WIND", "Simulate hurricane wind on the building (speed and direction)", S),
          item("seismic", "Seismic", "seismic", "SEISMIC", "Simulate an earthquake on the building", S),
          item("thermal", "Thermal", "thermal", "THERMAL", "Simulate heat gain and loss through the envelope", S),
          item("energy", "Energy", "energy", "ENERGY", "Simulate the building's yearly energy use", S),
        ],
      },
      {
        id: "asite",
        name: "Site",
        items: [
          item("grading", "Grading", "grading", "GRADING", "Earthwork from the model and the ground: cut, fill, excavation, and the fall away from the foundation", L),
          item("traffic", "Traffic Radius", "traffic", "TRAFFIC", "The street map of the 10 miles around the site, to judge access and traffic", L),
        ],
      },
      {
        id: "checks",
        name: "Checks",
        items: [
          item("clash", "Clash Detect", "clash", "CLASH", "Find where pipes and ducts cross or crowd the structure, with a fix for each", L),
          item("codecheck", "Code Check", "codecheck", "CODECHECK", "Check the model against the jurisdiction's code, with the section cited for each rule", L),
          item("matcheck", "Material Analysis", "matcheck", "MATCHECK", "Material quantities from the model and what the climate and soil ask of them", S),
          item("construct", "Constructability", "construct", "CONSTRUCT", "Pours, counts, pump and crane reach, staging room and the build order, from the model", S),
        ],
      },
      {
        id: "costtime",
        name: "Cost & Time",
        items: [
          item("cost", "Cost", "cost", "COST", "The cost estimate: total, range, materials and workforce", L),
          item("schedq", "Schedule Query", "schedq", "SCHEDQ", "Open the timeline to see the building on any day: 1, 3, 6 months or a custom range", L),
          item("workforce", "Workforce", "workforce", "WORKFORCE", "The trades and how many people are on site in each phase", S),
        ],
      },
      {
        id: "simulate",
        name: "Simulate",
        items: [item("simulate", "Disaster Simulation", "simulate", "SIMULATE", "Build a disaster scenario (hurricane, flood, fire, earthquake …) and see what breaks", L)],
      },
    ],
  },
  {
    id: "collaborate",
    label: "Collaborate",
    purpose: "Work with others: comments, markups, issues and tasks pinned to the model, PE sign-off and approvals, review mode, sharing and the version history.",
    panels: [
      {
        id: "review",
        name: "Review",
        items: [
          item("comment", "Comment", "comment", "COMMENT", "Pin a comment to an element so the team sees it in the model", L),
          item("markup", "Markup", "markup", "MARKUP", "Draw a red markup over the drawing with a comment", S),
          item("issue", "Issue", "issue", "ISSUE", "Raise an issue on an element: severity, assignee and due date", S),
          item("task", "Task", "task", "TASK", "Assign a task on the model in the Issues list", S),
          item("pin", "Pin", "pin", "PIN", "Pin a note to a spot in the model", S),
        ],
      },
      {
        id: "approval",
        name: "Approval",
        items: [
          item("pesign", "PE Sign-off", "pesign", "PESIGN", "Send flagged items to the PE review queue", L),
          item("approvals", "Approvals", "approvals", "APPROVALS", "The approvals each stage needs, and who has signed", S),
          item("revmode", "Review Mode", "review", "REVIEW", "Read-only review: nothing can be changed until you turn it off", S, { active: "flag:reviewMode" }),
        ],
      },
      {
        id: "share",
        name: "Share",
        items: [
          item("share", "Share", "share", "SHARE", "Invite people to the project and set their roles", L),
          item("perms", "Permissions", "perms", "PERMS", "Who can do what in the project: owners, engineers, PE reviewers, viewers", S),
          item("history", "History", "history", "HISTORY", "The activity log of the project: who changed what, and when", S),
          item("versions", "Versions", "versions", "VERSIONS", "Save, compare and restore versions of the project", S),
        ],
      },
    ],
  },
  {
    id: "ai",
    label: "AI",
    purpose: "Ask the AI: plain-English questions, Prompt to Plan, design and code reviews, cost and material advice, proposed edits you accept or reject, and the agent council.",
    panels: [
      {
        id: "ask",
        name: "Ask",
        items: [
          item("ask", "Ask BuildSync", "ask", "ASK", "Ask BuildSync AI anything in plain English in the command line", L),
          item("p2p", "Prompt to Plan", "p2p", "P2P", "Describe a building in words and get a starter plan to work from", L),
          item("explain", "Explain", "explain", "EXPLAIN", "Ask the AI why the selected element fails its checks", L),
          item("aigen", "Generate", "generate", "AIGEN", "Ask the AI to generate elements from a description", S),
          item("aiauto", "Automate", "automate", "AIAUTO", "Ask the AI to repeat a change across the model (every level, every room …)", S),
        ],
      },
      {
        id: "airev",
        name: "Review",
        items: [
          item("aireview", "Design Review", "aireview", "AIREVIEW", "An AI review of the design: recommendations you apply or ignore", L),
          item("aicode", "Code Review", "aicode", "AICODE", "An AI review against the building code, in the AI Analysis palette", S),
          item("aierr", "Error Detect", "aierr", "AIERR", "The AI looks for modelling errors (gaps, overlaps, missing hosts)", S),
        ],
      },
      {
        id: "advise",
        name: "Advise",
        items: [
          item("aicost", "Cost Estimator", "aicost", "AICOST", "Ask the AI for a cost estimate and ways to save", S),
          item("aimat", "Material Advisor", "aimat", "AIMAT", "Ask the AI which materials suit this climate and site", S),
          item("aiopt", "Optimize", "aiopt", "AIOPT", "Ask the AI to optimise the structure for cost without losing strength", S),
          item("aicmp", "Compare", "aicompare", "AICMP", "Ask the AI to compare two options (e.g. CMU against steel)", S),
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
          item("connectors", "Connectors", "connectors", "CONNECTORS", "Connect AI agents (Claude, ChatGPT, Gemini …) and route tasks to them", L),
          item("agent", "Switch Agent", "agent", "AGENT", "Choose which connected AI agent answers in the command line", L),
        ],
      },
    ],
  },
  {
    id: "view",
    label: "View",
    purpose: "Look at the model: 2D plan or 3D, orbit and walk, elevations, sections, site plan and topography, visual styles and section cuts, what is shown, and which windows are open (Interfaces).",
    panels: [
      {
        id: "navigate",
        name: "Navigate",
        items: [
          item("plan", "2D Plan", "plan", "PLAN", "Show the 2D floor plan of the level you are on", L, { active: "view:2d" }),
          item("3d", "3D View", "view3d", "3DVIEW", "Show the model in 3D: drag to turn it, scroll to zoom", L, { active: "view:3d" }),
          item("orbit", "Orbit", "orbit", "3DORBIT", "Drag to turn the 3D view around the model", S),
          item("walk", "Walk", "walk", "3DWALK", "Walk through the model at eye height in perspective", S),
          item("zoome", "Zoom Extents", "zoomext", "ZOOM E", "Fit everything in the drawing to the window", S),
        ],
      },
      {
        id: "drawings",
        name: "Elevations & Sections",
        items: [
          item("viewelev", "Elevation", "velev", "VIEWELEV", "Two points at any angle (diagonal), a circle (radius), a drawn line, or a side N, S, E, W: the elevation opens on its own sheet; drag the points or type an angle or radius to adjust", L),
          item("viewsec", "Section", "section", "VIEWSECTION", "Draw a cut line, pick the side to look at: the section opens on a sheet", L),
          item("viewsite", "Site Plan", "terrain", "VIEWSITE", "Top view of the site and its topography contours, on a sheet", L),
          item("viewtopo", "Topography", "grading", "VIEWTOPO", "The site's contours shaded by height, with the property line, on a sheet", S),
          item("viewplans", "All Levels", "plan", "VIEWPLANS", "Every storey's floor plan side by side on one sheet", S),
          item("fplan", "Foundation Plan", "foundation", "FOUNDATIONPLAN", "The foundation: stem walls, slab, piers, and the footings and septic system dashed below ground", S),
          item("viewsbrowser", "Views", "explorer", "VIEWS", "The list of drawings in the Model Explorer: plans, site, topography, elevations, sections", S),
        ],
      },
      {
        id: "views",
        name: "Views",
        items: [
          item("vtop", "Top", "vtop", "-VIEW TOP", "Look straight down at the model from above", S, { cmdLabel: "-VIEW" }),
          item("vfront", "Front", "vfront", "-VIEW FRONT", "Look at the front (south) of the model, flat", S, { cmdLabel: "-VIEW" }),
          item("vback", "Back", "vback", "-VIEW BACK", "Look at the back (north) of the model, flat", S, { cmdLabel: "-VIEW" }),
          item("vleft", "Left", "vleft", "-VIEW LEFT", "Look at the left (west) side of the model, flat", S, { cmdLabel: "-VIEW" }),
          item("vright", "Right", "vright", "-VIEW RIGHT", "Look at the right (east) side of the model, flat", S, { cmdLabel: "-VIEW" }),
          item("vbottom", "Bottom", "vbottom", "-VIEW BOTTOM", "Look up at the model from below", S, { cmdLabel: "-VIEW" }),
          item("vplan", "Floor Plan", "vplan", "-VIEW FLOORPLAN", "Switch to the floor plan of the level you are on", S, { cmdLabel: "-VIEW" }),
          item("velev", "Elevation", "velev", "-VIEW ELEVATION", "A flat elevation view of the model", S, { cmdLabel: "-VIEW" }),
        ],
      },
      {
        id: "projection",
        name: "Projection",
        items: [
          item("persp", "Perspective", "persp", "PERSP", "A perspective camera: far things look smaller", S, { active: "persp" }),
          item("ortho3d", "Orthographic", "ortho3d", "ORTHO3D", "An orthographic camera: true sizes, no perspective", S, { active: "ortho3d" }),
        ],
      },
      {
        id: "vstyle",
        name: "Visual Style",
        items: [
          item("wire", "Wireframe", "wire", "VSCURRENT WIREFRAME", "Draw the model as its edges only, no faces", S, { cmdLabel: "VSCURRENT", active: "style:wireframe" }),
          item("shaded", "Shaded", "shaded", "VSCURRENT SHADED", "Draw the model in flat grey shades", S, { cmdLabel: "VSCURRENT", active: "style:shaded" }),
          item("real", "Realistic", "realistic", "VSCURRENT REALISTIC", "Draw the model with its colours, the sun and shadows", S, { cmdLabel: "VSCURRENT", active: "style:realistic" }),
          item("xray", "X-Ray", "xray", "VSCURRENT XRAY", "See through the model: everything half transparent", S, { cmdLabel: "VSCURRENT", active: "style:xray" }),
        ],
      },
      {
        id: "section",
        name: "Section",
        items: [
          item("section", "Section Cut", "section", "SECTIONPLANE", "Cut the 3D model open along a plane to see the foundation, framing and MEP inside", L, { active: "section" }),
          item("secbox", "Section Box", "sectionbox", "SECTIONBOX", "Cut the 3D model to a box around the part you want to see", L, { active: "flag:sectionBox" }),
          item("cutaway", "Cutaway", "sectionbox", "CUTAWAY", "Cut the 3D model 4 ft above the floor of the level you are on, like a dollhouse, so the rooms and furniture show", L, { active: "flag:cutaway" }),
        ],
      },
      {
        id: "display",
        name: "Display",
        items: [
          item("grid", "Grid", "grid", "GRID", "Show or hide the dot grid (F7)", S, { active: "toggle:grid" }),
          item("rulers", "Rulers", "rulers", "RULERS", "Show or hide the rulers along the drawing", S, { active: "flag:rulers" }),
          item("guides", "Guides", "guides", "GUIDES", "Show or hide the guide lines on the drawing", S, { active: "flag:guides" }),
          item("snap", "Snap", "snap", "SNAP", "Snap the cursor to the grid spacing (F9)", S, { active: "toggle:snap" }),
          item("ortho", "Ortho", "ortho", "ORTHO", "Keep lines straight: horizontal or vertical only (F8; hold Shift to flip it)", S, { active: "toggle:ortho" }),
          item("full", "Full Screen", "full", "FULL", "Fill the whole screen with the workspace", S, { active: "flag:fullscreen" }),
          item("labels", "Labels", "tag", "LABELS", "Show or hide place labels and the property line's bearings, in the plan and in 3D", S, { active: "flag:labels" }),
          item("roomlabels", "Room Names", "roomName", "ROOMLABELS", "Show or hide room names and areas in the 2D plan, in 3D and on plan sheets", S, { active: "flag:roomLabels" }),
          item("furnlabels", "Furniture Names", "sofa", "FURNLABELS", "Show or hide the name of each piece of furniture, in the 2D plan and in 3D", S, { active: "flag:furnLabels" }),
          item("vpipeview", "Pipes", "pipes", "PIPEVIEW", "Plumbing as real pipes instead of dotted drawing lines", S, { active: "look:plumbing" }),
          item("vwireview", "Wires", "wires", "WIREVIEW", "Electrical as the cables instead of dashed drawing lines", S, { active: "look:electrical" }),
          item("underlay", "Underlay", "layers", "UNDERLAY", "Other storeys faded under the 2D plan: the level below, then all levels", S, { active: "underlay" }),
          item("belowgrade", "Below Grade", "foundation", "BELOWGRADE", "See the foundation in 3D: the ground turns see-through and the house fades, showing footings, stem walls, piers and the septic system", S, { active: "flag:belowGrade" }),
        ],
      },
      {
        id: "visibility",
        name: "Visibility",
        items: [
          item("visisolate", "Isolate", "isolate", "ISOLATE", "Show only the selection; Show All brings the rest back", S),
          item("hide", "Hide", "hide", "HIDE", "Hide the selected elements until Show All", S),
          item("showall", "Show All", "showall", "UNHIDE", "Show everything that was hidden or isolated", S, { cmdLabel: "UNISOLATE" }),
        ],
      },
      {
        id: "panels",
        name: "Panels",
        // the way back after hiding windows, and Interfaces: never folded away
        pin: true,
        items: [
          item("interfaces", "Interfaces", "interfaces", "INTERFACES", "Save and switch window arrangements: which windows show, their size and side, and which tabs they keep", L),
          item("explorer", "Explorer", "explorer", "EXPLORER", "Show or hide the Model Explorer window", S, { active: "dock:explorer" }),
          item("palettes", "Palettes", "palettes", "PALETTES", "Show or hide the palettes window", S, { active: "dock:palettes" }),
          item("timeline", "Timeline", "timeline", "TIMELINE", "Show or hide the timeline window", S, { active: "dock:timeline" }),
          item("cmdline", "Command Line", "cmdline", "CMDLINE", "Show or hide the command line window", S, { active: "dock:cmdline" }),
        ],
      },
    ],
  },
  {
    id: "manage",
    label: "Manage",
    purpose: "Set the project up: settings, units, grid and snap, AI connectors, templates, drawing standards, permissions and your account.",
    panels: [
      {
        id: "settings",
        name: "Settings",
        items: [
          item("settings", "Settings", "settings", "SETTINGS", "All settings: general, units, grid and snap, display, rendering, shortcuts, AI, help", L),
          item("connectors", "Connectors", "connectors", "CONNECTORS", "Connect AI agents and route tasks to them", L),
          item("aisettings", "AI Settings", "aisettings", "AISETTINGS", "The default AI agent, what context it sees, and how detailed its answers are", L),
        ],
      },
      {
        id: "standards",
        name: "Standards",
        items: [
          item("units", "Units", "units", "UNITS", "Feet-inches or metric, precision, angles, currency and dates", L),
          item("gridsnap", "Grid & Snap", "gridsnap", "GRIDSNAP", "Grid spacing, snap, object snaps and tracking", L),
          item("templates", "Templates", "templates", "TEMPLATES", "Start a new project from a template on the Start tab", L),
          item("standards", "Project Standards", "standards", "STANDARDS", "This project's drawing standards: layers, text and dimension styles", L),
        ],
      },
      {
        id: "account",
        name: "Account",
        items: [
          item("perms", "Permissions", "perms", "PERMS", "Who can do what in the project: roles and members", L),
          item("account", "Account", "account", "ACCOUNT", "Your profile, seat, PE licence, billing and security", L),
        ],
      },
    ],
  },
];

/** All ribbon tabs in display order. */
export const RIBBON: RibbonTab[] = RIBBON_TAB_IDS.map((id) => TABS.find((t) => t.id === id)!);

/** The ribbon tabs indexed by tab id. */
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
