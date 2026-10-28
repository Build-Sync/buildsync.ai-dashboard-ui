/**
 * lib/draw/types.ts
 *
 * WHAT   The data model of everything a user draws: DrawnItem (one thing the user added: a line, wall, slab, duct,
 *        dimension …), XForm (a move / rotation / scale applied to a built-in element of the sample building),
 *        SavedWork (the snapshot that Save writes and Restore reads), the TOOL_* helpers' ToolSession (the state
 *        of the command in progress) and Preview (what to draw under the cursor while a tool waits for a point).
 * FOR    The workspace store holds `drawn` (DrawnItem[]) and `xf` (id → XForm); lib/draw/compose.ts turns them
 *        into scene geometry; lib/draw/tools.ts and modify.ts create and change them; lib/persist.ts saves them.
 * DEBUG  - Everything is plain JSON on purpose (numbers, strings, arrays): it is saved to localStorage and
 *          exported to .bsd files, so do not put functions, Maps or class instances in a DrawnItem.
 *        - `p` holds the per-kind numbers (height, thick, width, rot …); defaults live in compose.ts, so an
 *          item with an empty `p` still draws.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { LevelKey, V2 } from "../scene/types";
import type { Aff } from "./geom";

/** What a drawn item is. Drafting kinds are flat 2D marks; the rest become walls, slabs, runs and so on. */
export type ItemKind =
  // drafting (2D marks drawn on the level)
  | "line" | "polyline" | "rect" | "circle" | "arc" | "spline" | "hatch" | "room"
  // building
  | "wall" | "door" | "window" | "slab" | "roof" | "stair" | "column" | "beam" | "ramp"
  // structure
  | "foundation" | "framing" | "truss" | "brace" | "connection"
  // MEP and placed components
  | "duct" | "pipe" | "tray" | "device" | "fixture" | "equipment" | "furniture"
  // annotation
  | "text" | "note" | "dim" | "leader" | "tag" | "secmark" | "elevmark" | "detail" | "gridline" | "markup" | "pin" | "label" | "image"
  // elevation marks: a line at any angle, or a circle (each has its own sheet, lib/elevation.ts)
  | "elevline" | "elevarc"
  // site objects (lib/draw/site.ts)
  | "pool" | "rock" | "gravel" | "road" | "sidewalk" | "sign" | "signal" | "drain" | "gutter" | "solar" | "fence"
  // connections between fixtures: a wire (electrical) or a pipe (plumbing), routed between their ports
  | "wire" | "pipelink"
  // site objects
  | "shed" | "tree" | "flowers" | "septic"
  // an imported solid (an IFC element): a plan outline with a bottom and a top
  | "solid"
  // a copy of a built-in element of the sample building
  | "clone";

/** Per-kind numbers and text (see compose.ts for the names and defaults). */
export type Params = Record<string, number | string | boolean>;

/** One thing the user drew. */
export interface DrawnItem {
  id: string;
  kind: ItemKind;
  /** shown in the Model Explorer and Properties */
  name: string;
  level: LevelKey;
  /** base elevation in feet */
  z: number;
  /** defining points in plan, feet */
  pts: V2[];
  closed?: boolean;
  p: Params;
  /** clone only: the built-in element copied, and the full transform from its original position */
  src?: string;
  aff?: Aff;
  dz?: number;
}

/**
 * A move / rotation / scale applied to a built-in element: an affine in plan, plus a height change.
 * Heights map as z' = zc + (z - zc) * sz + dz (sz and zc default to 1 and 0).
 */
export interface XForm {
  aff: Aff;
  dz: number;
  sz?: number;
  zc?: number;
  /**
   * A stretch instead of a full move: only the corners inside this plan window [x0, y0, x1, y1] move (by the
   * transform's translation). A wall joined to a moved wall keeps its far end and follows with the near one.
   */
  win?: [number, number, number, number];
  /** a further move or stretch applied after this one (moves of an element that was stretched before) */
  then?: XForm;
  /** a built-in door or window slid along its wall: the wall's old hole is filled and a new one cut */
  slide?: { host: string; at0: number; at: number; w: number; sill: number; head: number };
}

/** What a drawing tool shows under the cursor while it waits for the next point. */
export interface Preview {
  /** polylines and polygons in plan feet */
  shapes: { pts: V2[]; closed?: boolean; dashed?: boolean; fill?: boolean; tone?: "draw" | "ghost" | "measure" }[];
  /** text labels at plan points */
  labels: { at: V2; text: string }[];
}

/** The command in progress: which tool, its current step and what it has collected. */
export interface ToolSession {
  tool: string;
  /** a tool-specific step name, e.g. "first", "second", "select", "base", "target" */
  step: string;
  pts: V2[];
  picks: string[];
  data: Record<string, number | string | boolean>;
}

/** A measurement left on the drawing until the next tool or Esc. */
export interface MeasureResult {
  title: string;
  text: string;
  pts: V2[];
  closed?: boolean;
}

/** Everything Save writes for one project: the user's work and the per-project view of it. */
export interface SavedWork {
  v: 1;
  projectId: string;
  /** milliseconds since 1970 */
  at: number;
  drawn: DrawnItem[];
  xf: Record<string, XForm>;
  hidden: string[];
  locked: string[];
  isolated: string[] | null;
  renames: Record<string, string>;
  materialOverrides: Record<string, string>;
  colors: Record<string, string>;
  elColors: Record<string, string>;
  types: Record<string, string>;
  groups: Record<string, string[]>;
  /** the project record without its version list (comments, issues, layers, cost, information …) */
  project: unknown;
  /** layout sheets, including the elevations, sections and site plans the user made */
  sheets?: import("../store/workspace-store").Sheet[];
}
