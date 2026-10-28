/**
 * lib/draw/options.ts
 *
 * WHAT   The options each drawing tool offers in the tool bar over the viewport (wall height and type, door
 *        width, slab thickness, duct height, the text of a note …) and the "types" a selected element can be
 *        changed to (CHTYPE): TYPE_DEFS lists, per kind, the sizes and materials of each type. Also the
 *        materials list (CHMAT) with the colour each one draws in.
 * FOR    lib/draw/tools.ts reads the options when it creates an item; components/workspace/Viewport/ToolBar.tsx
 *        draws a control for each OptDef; the Properties palette shows the type name.
 * DEBUG  - An option has no effect: tools.ts must read it by the same `key` (opt(env, "height")).
 *        - Numbers are stored in feet; a `unit` of "in" only changes how the field is shown and typed (÷12 / ×12).
 *        - A type changes thickness but not material: put both in the type's `p` / `material`.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { ItemKind, Params } from "./types";
import { FURNITURE, FURNITURE_IDS } from "./furniture";
import { fixturesOf, type FixtureSystem } from "./fixtures";

/** One control in the tool bar. */
export interface OptDef {
  key: string;
  label: string;
  type: "number" | "select" | "text" | "toggle";
  def?: number | string | boolean;
  /** how a number is shown: stored in feet, "in" shows inches */
  unit?: "ft" | "in" | "°" | "";
  /** a number left empty means "automatic" (e.g. the level height) */
  auto?: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

const n = (key: string, label: string, def: number, unit: OptDef["unit"] = "ft", extra: Partial<OptDef> = {}): OptDef => ({ key, label, type: "number", def, unit, ...extra });
const s = (key: string, label: string, def: string, options: [string, string][]): OptDef => ({ key, label, type: "select", def, options: options.map(([value, label]) => ({ value, label })) });
const t = (key: string, label: string, def: string): OptDef => ({ key, label, type: "text", def });
const b = (key: string, label: string, def: boolean): OptDef => ({ key, label, type: "toggle", def });

/** The tool bar of a fixture tool: the piece (from the catalogue), its height above the floor, its turn. */
const fixtureOpts = (system: FixtureSystem | undefined, def: string): OptDef[] => [
  s("type", "Piece", def, fixturesOf(system).map((f) => [f.id, `${f.group} · ${f.label}`])),
  n("base", "Height above floor", 0, "ft", { auto: true }),
  n("rot", "Turn", 0, "°", { min: 0, max: 359 }),
];

/** A type of element: what it is called and what it changes about the element. */
export interface TypeDef {
  value: string;
  label: string;
  p?: Params;
  material?: string;
}

/** The types each kind of element can be switched to (tools place the first one; CHTYPE switches). */
export const TYPE_DEFS: Partial<Record<ItemKind, TypeDef[]>> = {
  wall: [
    { value: "cmu8", label: 'Exterior CMU 8"', p: { thick: 0.67 }, material: 'CMU 8" grouted, #5 vert. @ 32"' },
    { value: "conc10", label: 'Concrete 10"', p: { thick: 0.83 }, material: "Cast-in-place concrete 10\", f'c 5000 psi" },
    { value: "brick6", label: 'Brick veneer 6"', p: { thick: 0.5 }, material: 'Brick veneer on 2×4 stud, 6"' },
    { value: "stud4", label: 'Stud partition 4"', p: { thick: 0.33 }, material: '3-5/8" metal stud, 5/8" gypsum both sides' },
  ],
  door: [
    { value: "single", label: "Single 3'-0\"", p: { w: 3 }, material: "Impact-rated solid core door" },
    { value: "wide", label: "Single 3'-6\" (accessible)", p: { w: 3.5 }, material: "Impact-rated solid core door, ADA hardware" },
    { value: "double", label: "Double 6'-0\"", p: { w: 6 }, material: "Impact-rated double door" },
    { value: "slider", label: "Sliding 6'-0\"", p: { w: 6 }, material: "Impact glass sliding door" },
  ],
  window: [
    { value: "fixed", label: "Fixed 3'-0\" × 4'-0\"", p: { w: 3, sill: 3, head: 7 }, material: "Fixed impact glass, aluminium frame" },
    { value: "casement", label: "Casement 3'-0\" × 4'-0\"", p: { w: 3, sill: 3, head: 7 }, material: "Casement, laminated impact glass (HVHZ NOA)" },
    { value: "slider", label: "Slider 5'-0\" × 4'-0\"", p: { w: 5, sill: 3, head: 7 }, material: "Slider, laminated impact glass (HVHZ NOA)" },
    { value: "picture", label: "Picture 6'-0\" × 5'-0\"", p: { w: 6, sill: 2, head: 7 }, material: "Picture window, laminated impact glass" },
  ],
  slab: [
    { value: "s4", label: 'Slab 4"', p: { thick: 0.33 }, material: '4" concrete slab, WWM' },
    { value: "s6", label: 'Slab 6"', p: { thick: 0.5 }, material: '6" concrete slab, f\'c 4000 psi' },
    { value: "s8", label: 'Slab 8"', p: { thick: 0.67 }, material: '8" two-way slab, f\'c 4000 psi' },
  ],
  roof: [
    { value: "tile", label: "Barrel tile", p: { thick: 0.5 }, material: 'Concrete barrel tile on 5/8" ply (HVHZ)' },
    { value: "metal", label: "Standing-seam metal", p: { thick: 0.33 }, material: "26 ga. standing-seam metal roof" },
    { value: "flat", label: "Flat membrane", p: { thick: 0.5 }, material: "TPO membrane on rigid insulation" },
  ],
  column: [
    { value: "conc12", label: 'Concrete 12"', p: { size: 1, shape: "rect" }, material: "Reinforced concrete 4000 psi, 4-#6" },
    { value: "steel8", label: 'Steel HSS 8"', p: { size: 0.67, shape: "rect" }, material: "Steel HSS 8×8×⅜, ASTM A500 Gr. B" },
    { value: "round14", label: 'Round concrete 14"', p: { size: 1.17, shape: "round" }, material: "Reinforced concrete 4000 psi, 6-#6 spiral" },
  ],
  beam: [
    { value: "conc", label: 'Concrete bond beam 8"×12"', p: { width: 0.67, depth: 1 }, material: "Reinforced concrete bond beam, 2-#5 top/bot" },
    { value: "w12", label: "Steel W12×26", p: { width: 0.5, depth: 1 }, material: "Steel W12×26, ASTM A992" },
    { value: "glulam", label: 'Glulam 5"×12"', p: { width: 0.42, depth: 1 }, material: "Glulam 24F-V4, 5×12" },
  ],
  stair: [
    { value: "concrete", label: "Concrete stair", material: "Cast-in-place concrete, broom finish" },
    { value: "steel", label: "Steel stair", material: "Steel stringers, checker-plate treads" },
    { value: "timber", label: "Timber stair", material: "Hardwood treads on steel stringer" },
  ],
};

/** Materials CHMAT offers, with the colour a changed element is drawn in. */
export const MATERIALS: { id: string; swatch: string; text: string }[] = [
  { id: "Concrete", swatch: "#9aa0a8", text: "Cast-in-place concrete, f'c 4000 psi" },
  { id: "Steel", swatch: "#6f86a6", text: "Structural steel, ASTM A992" },
  { id: "Wood", swatch: "#a97c50", text: "SYP No. 2 lumber" },
  { id: "Glass", swatch: "#7fc4e8", text: "Laminated impact glass" },
  { id: "Brick", swatch: "#b0553d", text: "Clay brick veneer" },
  { id: "Aluminum", swatch: "#c7ccd4", text: "Anodized aluminium" },
  { id: "Insulation", swatch: "#f0d46a", text: "Rigid insulation, R-30" },
  { id: "Gypsum", swatch: "#e6e1d6", text: "Gypsum board, 5/8\" Type X" },
  { id: "Tile", swatch: "#d98c6a", text: "Ceramic tile" },
];

const typeOpts = (kind: ItemKind): [string, string][] => (TYPE_DEFS[kind] ?? []).map((d) => [d.value, d.label]);

/** The tool-bar controls of each tool, keyed by the command name. Tools without an entry show only their prompt. */
export const OPTIONS: Record<string, OptDef[]> = {
  WALL: [s("wtype", "Type", "cmu8", typeOpts("wall")), n("height", "Height", 0, "ft", { auto: true, min: 1 }), b("bearing", "Load-bearing", false)],
  DOOR: [s("dtype", "Type", "single", typeOpts("door")), s("hinge", "Hinge", "start", [["start", "Start"], ["end", "End"]]), s("swing", "Swing", "1", [["1", "Left"], ["-1", "Right"]])],
  WINDOW: [s("wtype", "Type", "fixed", typeOpts("window"))],
  SLAB: [s("stype", "Type", "s6", typeOpts("slab"))],
  ROOF: [s("rtype", "Type", "tile", typeOpts("roof"))],
  STAIR: [n("width", "Width", 3.5, "ft", { min: 2 }), n("rise", "Rise", 0, "ft", { auto: true, min: 1 }), s("ttype", "Type", "concrete", typeOpts("stair"))],
  COLUMN: [s("ctype", "Type", "conc12", typeOpts("column")), n("height", "Height", 0, "ft", { auto: true, min: 1 })],
  BEAM: [s("btype", "Type", "conc", typeOpts("beam"))],
  RAMP: [n("width", "Width", 4, "ft", { min: 3 })],
  FOUNDATION: [n("thick", "Thickness", 1, "in", { min: 0.5 })],
  FRAMING: [n("spacing", "Spacing", 1.333, "in", { min: 0.5 })],
  TRUSS: [n("spacing", "Spacing", 2, "ft", { min: 1 })],
  DUCT: [n("h", "Height above floor", 0, "ft", { auto: true })],
  PIPE: [n("h", "Height above floor", 0, "ft", { auto: true })],
  TRAY: [n("h", "Height above floor", 0, "ft", { auto: true })],
  ELEC: fixtureOpts("electrical", "outlet"),
  PLUMB: fixtureOpts("plumbing", "vanity"),
  FIRE: [s("shape", "Device", "head", [["head", "Sprinkler head"], ["unit", "Alarm unit"]])],
  HVAC: fixtureOpts("hvac", "condenser"),
  FIXT: fixtureOpts(undefined, "toilet"),
  "FIXT LIB": fixtureOpts(undefined, "toilet"),
  EQUIP: fixtureOpts(undefined, "waterheater"),
  PIPECONNECT: [s("line", "Pipe", "auto", [["auto", "By what you click (heater = hot, supply = cold, stack = drain)"], ["cold", "Cold water"], ["hot", "Hot water"], ["drain", "Drain (waste)"]])],
  SOLARPANEL: [n("rows", "Rows", 2, "", { min: 1, max: 12 }), n("cols", "Panels per row", 6, "", { min: 1, max: 30 }), n("pw", "Panel width", 3.4, "ft", { min: 1, max: 6 }), n("pl", "Panel length", 5.6, "ft", { min: 1, max: 9 }), n("watts", "Watts per panel", 400, "", { min: 50, max: 800 }), n("tilt", "Tilt", 0, "°", { auto: true, min: 0, max: 60 })],
  FURN: [s("type", "Piece", "sofa", FURNITURE_IDS.map((id) => [id, `${FURNITURE[id].group} · ${FURNITURE[id].label}`])), n("rot", "Turn", 0, "°", { min: 0, max: 359 })],
  MEPLIB: [s("part", "Part", "outlet", [["outlet", "Outlet"], ["light", "Light"], ["panel", "Panel"], ["valve", "Valve"], ["diffuser", "Diffuser"], ["head", "Sprinkler head"]])],
  STRLIB: [s("part", "Part", "steelcol", [["steelcol", "Steel column"], ["footing", "Footing pad"]])],
  TEXT: [t("text", "Text", "Text")],
  NOTE: [t("text", "Note", "Note")],
  LEADER: [t("text", "Text", "Note")],
  PIN: [t("text", "Note", "Pin")],
  LABEL: [t("text", "Name", "Kitchen")],
  SHED: [n("w", "Width", 8, "ft", { min: 3 }), n("d", "Depth", 10, "ft", { min: 3 }), n("h", "Wall height", 7.5, "ft", { min: 5 }), s("roof", "Roof", "gable", [["gable", "Gable"], ["lean", "Lean-to"], ["flat", "Flat"]]), s("rot", "Rotation", "0", [["0", "0°"], ["90", "90°"], ["180", "180°"], ["270", "270°"], ["45", "45°"]])],
  TREE: [s("species", "Kind", "shade", [["shade", "Shade tree (oak, maple)"], ["palm", "Palm"], ["pine", "Pine"]]), n("h", "Height", 22, "ft", { min: 3 }), n("r", "Canopy radius", 8, "ft", { min: 1 })],
  BUSH: [n("h", "Height", 3.5, "ft", { min: 0.5 }), n("r", "Spread (radius)", 2.5, "ft", { min: 0.5 }), s("bloom", "Flowers", "", [["", "None (green)"], ["#e86a9a", "Pink"], ["#f6f1e7", "White"], ["#f3c623", "Yellow"], ["#d8344a", "Red"], ["#8a4fc4", "Purple"]])],
  FLOWERS: [n("h", "Height", 0.7, "ft", { min: 0.1 }), s("mix", "Colours", "mixed", [["mixed", "Mixed"], ["warm", "Reds and yellows"], ["cool", "Purples and whites"], ["white", "White"]])],
  POOL: [s("shape", "Shape", "rectangle", [["rectangle", "Rectangle"], ["oval", "Oval"], ["freeform", "Freeform (kidney)"], ["lshape", "L-shape"]]), n("l", "Length", 32, "ft", { min: 6 }), n("w", "Width", 16, "ft", { min: 4 }), n("depth", "Depth", 6, "ft", { min: 3, max: 12 }), n("deck", "Deck around it", 4, "ft", { min: 0 }), n("rot", "Turn", 0, "°", { min: 0, max: 359 })],
  FENCE: [s("type", "Kind", "privacy", [["privacy", "Wood privacy fence"], ["picket", "Picket fence"], ["chainlink", "Chain-link fence"], ["iron", "Wrought-iron fence"], ["vinyl", "Vinyl fence"], ["masonry", "Garden wall (masonry)"]]), n("h", "Height", 0, "ft", { auto: true, min: 2, max: 12 })],
  ROCK: [n("size", "Size", 3, "ft", { min: 0.5, max: 12 }), n("count", "How many", 1, "", { min: 1, max: 7 })],
  BOULDER: [n("size", "Size", 3, "ft", { min: 0.5, max: 12 }), n("count", "How many", 1, "", { min: 1, max: 7 })],
  GRAVEL: [b("rock", "River rock (instead of gravel)", false)],
  ROCKBED: [b("rock", "River rock (instead of gravel)", false)],
  ROAD: [n("width", "Pavement width", 24, "ft", { min: 10 }), b("curb", "Curb and gutter", true), s("walks", "Sidewalks", "both", [["both", "Both sides"], ["left", "One side"], ["none", "None"]]), s("centre", "Centre line", "double", [["double", "Double yellow"], ["dashed", "Dashed white"], ["none", "None"]])],
  SIDEWALK: [n("width", "Width", 5, "ft", { min: 3 })],
  SIGN: [s("type", "Sign", "stop", [["stop", "Stop"], ["yield", "Yield"], ["speed", "Speed limit"], ["street", "Street names"], ["noparking", "No parking"], ["oneway", "One way"]]), n("rot", "Faces", 0, "°", { min: 0, max: 359 })],
  SIGNAL: [n("rot", "Arm points", 0, "°", { min: 0, max: 359 }), n("arm", "Arm length", 20, "ft", { min: 8, max: 45 })],
  STOPLIGHT: [n("rot", "Arm points", 0, "°", { min: 0, max: 359 }), n("arm", "Arm length", 20, "ft", { min: 8, max: 45 })],
  TRAFFICLIGHT: [n("rot", "Arm points", 0, "°", { min: 0, max: 359 }), n("arm", "Arm length", 20, "ft", { min: 8, max: 45 })],
  DRAIN: [s("type", "Drain", "inlet", [["inlet", "Curb inlet (road)"], ["area", "Area drain (yard)"], ["trench", "Trench drain (driveway)"]]), n("rot", "Turn", 0, "°", { min: 0, max: 359 }), n("len", "Trench length", 8, "ft", { min: 2 })],
  SEPTIC: [s("gal", "Tank", "1000", [["1000", "1,000 gal (2–3 bedrooms)"], ["1250", "1,250 gal (4 bedrooms)"], ["1500", "1,500 gal (5+ bedrooms)"]]), n("rows", "Field trenches", 3, "", { min: 0, max: 8 }), n("len", "Trench length", 36, "ft", { min: 10 }), n("dist", "Gap to the field", 10, "ft", { min: 4 }), s("rot", "Rotation", "0", [["0", "Field north"], ["90", "Field west"], ["180", "Field south"], ["270", "Field east"]])],
  IMAGE: [n("w", "Width", 6, "ft")],
  MARKUP: [t("text", "Comment", "")],
  FILLET: [n("radius", "Radius", 2, "ft", { min: 0 })],
  CHAMFER: [n("dist", "Distance", 2, "ft", { min: 0.1 })],
  OFFSET: [n("dist", "Distance", 2, "ft", { min: 0.05 })],
  ARRAY: [
    s("type", "Type", "rect", [["rect", "Rectangular"], ["polar", "Polar"]]),
    n("rows", "Rows", 2, "", { min: 1, max: 50 }),
    n("cols", "Columns", 3, "", { min: 1, max: 50 }),
    n("dy", "Row spacing", 10, "ft"),
    n("dx", "Column spacing", 10, "ft"),
    n("count", "Count (polar)", 6, "", { min: 2, max: 100 }),
    n("angle", "Angle (polar)", 360, "°", { min: 1, max: 360 }),
  ],
  MIRROR: [b("keep", "Keep original", true)],
  COPY: [],
  ROTATE: [n("angle", "Angle", 90, "°")],
  SCALE: [n("factor", "Factor", 2, "", { min: 0.01, max: 100 })],
};

/** Stored → shown (feet to inches for "in"). */
export const toShown = (v: number, unit: OptDef["unit"]): number => (unit === "in" ? v * 12 : v);
/** Shown → stored. */
export const fromShown = (v: number, unit: OptDef["unit"]): number => (unit === "in" ? v / 12 : v);
