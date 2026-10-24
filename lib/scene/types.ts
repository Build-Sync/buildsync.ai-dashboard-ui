import type { LayerId } from "../types";

/* Scene model for the SVG viewport.
 * World axes: X = east, Y = north, Z = up. Units are feet.
 * Geometry is built from axis-extruded prisms so a section cut is just a
 * clamp / half-plane clip — no CSG needed. */

export type V2 = [number, number];
export type V3 = [number, number, number];

export type LevelKey = "site" | "foundation" | "level1" | "level2" | "roof";

/** Keys of the user-editable Appearance colours (Properties → Appearance). */
export type AppearanceKey = "walls" | "roof" | "structural" | "topography" | "electrical" | "plumbing";
export type AppearanceMap = Record<AppearanceKey, string>;

export const DEFAULT_APPEARANCE: AppearanceMap = {
  walls: "#c9ced8",
  roof: "#b4604a",
  structural: "#8f9bb0",
  topography: "#4d6a52",
  electrical: "#f4c542",
  plumbing: "#3fb6e8",
};

/** Fixed colour slots that are not user editable. */
export type FixedColor =
  | "glass"
  | "door"
  | "interior"
  | "soil"
  | "furniture"
  | "fixture"
  | "landscape"
  | "paving"
  | "hvac"
  | "fire";

export type ColorKey = AppearanceKey | FixedColor;

export const FIXED_COLORS: Record<FixedColor, string> = {
  glass: "#7fc4e8",
  door: "#8a6a4c",
  interior: "#e6e1d6",
  soil: "#6b5742",
  furniture: "#a28a6c",
  fixture: "#dfe7ee",
  landscape: "#3f8a4e",
  paving: "#8b919b",
  hvac: "#9fb4c8",
  fire: "#ef5b5b",
};

export type Category =
  | "Wall"
  | "Partition"
  | "Door"
  | "Window"
  | "Column"
  | "Beam"
  | "Slab"
  | "Roof"
  | "Truss"
  | "Stair"
  | "Foundation"
  | "Footing"
  | "Topography"
  | "Furniture"
  | "Fixture"
  | "Landscape"
  | "Paving";

export type SystemName = "Architectural" | "Structural" | "MEP" | "Site" | "Interior";

export type PhaseKey =
  | "site"
  | "foundation"
  | "structure1"
  | "structure2"
  | "roof"
  | "envelope"
  | "mep"
  | "finishes";

export const PHASE_ORDER: PhaseKey[] = [
  "site",
  "foundation",
  "structure1",
  "structure2",
  "roof",
  "envelope",
  "mep",
  "finishes",
];

export interface Prism {
  /** unique per prism; `id` below is the element it belongs to (a wall with openings is many prisms) */
  key: string;
  id: string;
  name: string;
  category: Category;
  layer: LayerId;
  level: LevelKey;
  system: SystemName;
  /** extrusion axis: 'z' extrudes an XY polygon vertically; 'y' extrudes an XZ polygon along Y */
  axis: "z" | "y";
  poly: V2[];
  a0: number;
  a1: number;
  color: ColorKey;
  material: string;
  phase: PhaseKey;
  loadBearing?: boolean;
  /** Part of the terrain block (cut face shows soil). */
  terrain?: boolean;
  /** Below finished grade: hidden unless the section cut / X-ray reveals it. */
  underground?: boolean;
  /** Only drawn when a section cut is active (framing, trusses). */
  sectionOnly?: boolean;
  /** Below grade: in section view only the cut face is drawn (soil profile), never the sides. */
  capOnly?: boolean;
  /** Renders translucent glass. */
  glass?: boolean;
  /** Paint after everything in its band (frames, devices). */
  lift?: number;
}

export type RunKind = "electrical" | "plumbing" | "hvac" | "fire";

export interface Run {
  id: string;
  layer: LayerId;
  kind: RunKind;
  pts: V3[];
  width?: number;
  label?: string;
  phase: PhaseKey;
  level: LevelKey;
  underground?: boolean;
}

export interface Device {
  id: string;
  layer: LayerId;
  kind: RunKind;
  at: V3;
  shape: "panel" | "outlet" | "light" | "fixture" | "head" | "unit" | "valve";
  label?: string;
  phase: PhaseKey;
  level: LevelKey;
}

export interface Tree {
  id: string;
  at: V3;
  kind: "palm" | "shade" | "shrub";
  height: number;
  radius: number;
}

export interface Contour {
  id: string;
  z: number;
  pts: V2[];
  label?: string;
}

export interface Callout {
  id: string;
  at: V3;
  dx: number;
  dy: number;
  text: string;
  sub?: string;
}

export interface StressPoint {
  id: string;
  at: V3;
  ksi: number;
  elementId: string;
  label: string;
}

export interface RoomLabel {
  id: string;
  name: string;
  at: V2;
  area: number;
  level: LevelKey;
}

export interface DoorSwing {
  id: string;
  hinge: V2;
  radius: number;
  /** degrees, world CCW from +X */
  a0: number;
  a1: number;
  level: LevelKey;
}

export interface Dimension {
  id: string;
  from: V2;
  to: V2;
  /** perpendicular offset in feet */
  offset: number;
  text: string;
  level: LevelKey;
}

export interface GridBubble {
  id: string;
  at: V2;
  label: string;
}

/** One selectable model element (a group of prisms sharing an id). */
export interface SceneElement {
  id: string;
  name: string;
  category: Category;
  layer: LayerId;
  level: LevelKey;
  system: SystemName;
  color: ColorKey;
  material: string;
  phase: PhaseKey;
  loadBearing: boolean;
  min: V3;
  max: V3;
  keys: string[];
}

export interface Scene {
  kind: "residence" | "clinic" | "blank";
  prisms: Prism[];
  elements: SceneElement[];
  elementById: Record<string, SceneElement>;
  runs: Run[];
  devices: Device[];
  trees: Tree[];
  contours: Contour[];
  callouts: Callout[];
  stress: StressPoint[];
  rooms: RoomLabel[];
  swings: DoorSwing[];
  dims: Dimension[];
  grid: GridBubble[];
  /** bounding box centre + radius for camera fit */
  center: V3;
  radius: number;
  /** finished-grade elevation (terrain top) */
  grade: number;
  /** default section plane (Y), in feet */
  sectionY: number;
  /** floor elevations by level key, for plan cuts */
  levelZ: Record<LevelKey, number>;
  footprint: { x0: number; y0: number; x1: number; y1: number };
}
