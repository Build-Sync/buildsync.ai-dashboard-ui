import type {
  Callout,
  Category,
  ColorKey,
  Contour,
  Device,
  Dimension,
  DoorSwing,
  GridBubble,
  LevelKey,
  PhaseKey,
  Prism,
  RoomLabel,
  Run,
  Scene,
  SceneElement,
  StressPoint,
  SystemName,
  Tree,
  V2,
  V3,
} from "./types";
import type { LayerId } from "../types";

export const rect = (x0: number, y0: number, x1: number, y1: number): V2[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** Signed polygon area (positive = counter-clockwise). */
export function signedArea(poly: V2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

export function ccw(poly: V2[]): V2[] {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

export interface BaseOpts {
  id: string;
  name: string;
  category: Category;
  layer: LayerId;
  level: LevelKey;
  system: SystemName;
  color: ColorKey;
  material: string;
  phase: PhaseKey;
  loadBearing?: boolean;
  terrain?: boolean;
  underground?: boolean;
  sectionOnly?: boolean;
  capOnly?: boolean;
  glass?: boolean;
  lift?: number;
}

export interface Opening {
  id: string;
  at: number;
  w: number;
  sill: number;
  head: number;
  kind: "door" | "window" | "slider" | "open";
  name?: string;
  swing?: { hinge: "start" | "end"; dir: 1 | -1 };
}

export interface WallOpts extends BaseOpts {
  axis: "x" | "y";
  /** cross-axis extent */
  c0: number;
  c1: number;
  /** along-axis extent */
  s: number;
  e: number;
  z0: number;
  z1: number;
  openings?: Opening[];
}

export class SceneBuilder {
  prisms: Prism[] = [];
  runs: Run[] = [];
  devices: Device[] = [];
  trees: Tree[] = [];
  contours: Contour[] = [];
  callouts: Callout[] = [];
  stress: StressPoint[] = [];
  rooms: RoomLabel[] = [];
  swings: DoorSwing[] = [];
  dims: Dimension[] = [];
  grid: GridBubble[] = [];
  private n = 0;

  private push(p: Omit<Prism, "key">): Prism {
    this.n += 1;
    const prism: Prism = { ...p, key: `${p.id}#${this.n}` };
    this.prisms.push(prism);
    return prism;
  }

  extrudeZ(o: BaseOpts, poly: V2[], z0: number, z1: number): Prism | null {
    if (z1 - z0 < 1e-4) return null;
    return this.push({ ...o, axis: "z", poly: ccw(poly), a0: z0, a1: z1 });
  }

  /** Extrude an XZ polygon along Y from y0 to y1. */
  extrudeY(o: BaseOpts, polyXZ: V2[], y0: number, y1: number): Prism | null {
    if (y1 - y0 < 1e-4) return null;
    return this.push({ ...o, axis: "y", poly: ccw(polyXZ), a0: y0, a1: y1 });
  }

  box(o: BaseOpts, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number): Prism | null {
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4) return null;
    return this.extrudeZ(o, rect(x0, y0, x1, y1), z0, z1);
  }

  /** Wall run (solid segments around openings) plus door/window infill. */
  wall(o: WallOpts): void {
    const { axis, c0, c1, s, e, z0, z1 } = o;
    const place = (a: number, b: number, za: number, zb: number, base: BaseOpts) => {
      if (b - a < 0.02 || zb - za < 0.02) return;
      if (axis === "x") this.box(base, a, c0, b, c1, za, zb);
      else this.box(base, c0, a, c1, b, za, zb);
    };
    const wallBase: BaseOpts = { ...o };
    const ops = [...(o.openings ?? [])].sort((a, b) => a.at - b.at);
    let cur = s;
    const mid = (c0 + c1) / 2;
    for (const op of ops) {
      place(cur, op.at, z0, z1, wallBase);
      place(op.at, op.at + op.w, z0, z0 + op.sill, wallBase);
      place(op.at, op.at + op.w, z0 + op.head, z1, wallBase);
      cur = op.at + op.w;

      const thick = op.kind === "window" || op.kind === "slider" ? 0.12 : 0.2;
      const infill: BaseOpts = {
        id: op.id,
        name: op.name ?? (op.kind === "window" ? "Window" : op.kind === "slider" ? "Sliding Door" : "Door"),
        category: op.kind === "window" ? "Window" : "Door",
        layer: "walls",
        level: o.level,
        system: "Architectural",
        color: op.kind === "door" ? "door" : "glass",
        material:
          op.kind === "door"
            ? "Impact-rated solid core door"
            : "Laminated impact glass, aluminium frame (HVHZ NOA)",
        phase: "envelope",
        glass: op.kind !== "door",
      };
      if (op.kind !== "open") {
        if (axis === "x") this.box(infill, op.at + 0.05, mid - thick / 2, op.at + op.w - 0.05, mid + thick / 2, z0 + op.sill + 0.05, z0 + op.head - 0.05);
        else this.box(infill, mid - thick / 2, op.at + 0.05, mid + thick / 2, op.at + op.w - 0.05, z0 + op.sill + 0.05, z0 + op.head - 0.05);
      }
      if (op.kind === "window") {
        const ledge: BaseOpts = { ...infill, color: "walls", glass: false, material: "Precast sill" };
        if (axis === "x") this.box(ledge, op.at - 0.1, c0 - 0.18, op.at + op.w + 0.1, c0 + 0.02, z0 + op.sill - 0.22, z0 + op.sill);
        else this.box(ledge, c0 - 0.18, op.at - 0.1, c0 + 0.02, op.at + op.w + 0.1, z0 + op.sill - 0.22, z0 + op.sill);
      }
      if (op.kind === "door" && op.swing) {
        const hingeAt = op.swing.hinge === "start" ? op.at : op.at + op.w;
        const hinge: V2 = axis === "x" ? [hingeAt, mid] : [mid, hingeAt];
        // closed leaf points along the run towards the other jamb
        const closed = axis === "x" ? (op.swing.hinge === "start" ? 0 : 180) : op.swing.hinge === "start" ? 90 : 270;
        const open = closed + 90 * op.swing.dir;
        this.swings.push({
          id: `${op.id}-sw`,
          hinge,
          radius: op.w,
          a0: Math.min(closed, open),
          a1: Math.max(closed, open),
          level: o.level,
        });
      }
    }
    place(cur, e, z0, z1, wallBase);
  }

  device(d: Device): void {
    this.devices.push(d);
  }

  run(r: Run): void {
    this.runs.push(r);
  }

  finish(meta: Pick<Scene, "kind" | "grade" | "sectionY" | "levelZ" | "footprint">): Scene {
    const elements = buildElements(this.prisms);
    const byId: Record<string, SceneElement> = {};
    for (const el of elements) byId[el.id] = el;
    // camera fit around the building (not the whole terrain block)
    const f = meta.footprint;
    const hMax = elements.reduce((m, el) => (el.layer === "topography" || el.layer === "landscape" ? m : Math.max(m, el.max[2])), 10);
    const center: V3 = [(f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, hMax / 2 - 1];
    const radius = Math.hypot((f.x1 - f.x0) / 2 + 12, (f.y1 - f.y0) / 2 + 12, hMax / 2 + 2) * 0.82;
    return {
      ...meta,
      prisms: this.prisms,
      elements,
      elementById: byId,
      runs: this.runs,
      devices: this.devices,
      trees: this.trees,
      contours: this.contours,
      callouts: this.callouts,
      stress: this.stress,
      rooms: this.rooms,
      swings: this.swings,
      dims: this.dims,
      grid: this.grid,
      center,
      radius,
    };
  }
}

export function prismBounds(p: Prism): { min: V3; max: V3 } {
  let x0 = Infinity;
  let x1 = -Infinity;
  let b0 = Infinity;
  let b1 = -Infinity;
  for (const [a, b] of p.poly) {
    if (a < x0) x0 = a;
    if (a > x1) x1 = a;
    if (b < b0) b0 = b;
    if (b > b1) b1 = b;
  }
  return p.axis === "z"
    ? { min: [x0, b0, p.a0], max: [x1, b1, p.a1] }
    : { min: [x0, p.a0, b0], max: [x1, p.a1, b1] };
}

function buildElements(prisms: Prism[]): SceneElement[] {
  const map = new Map<string, SceneElement>();
  for (const p of prisms) {
    const { min, max } = prismBounds(p);
    const existing = map.get(p.id);
    if (!existing) {
      map.set(p.id, {
        id: p.id,
        name: p.name,
        category: p.category,
        layer: p.layer,
        level: p.level,
        system: p.system,
        color: p.color,
        material: p.material,
        phase: p.phase,
        loadBearing: !!p.loadBearing,
        min: [...min],
        max: [...max],
        keys: [p.key],
      });
    } else {
      for (let i = 0; i < 3; i++) {
        existing.min[i] = Math.min(existing.min[i], min[i]);
        existing.max[i] = Math.max(existing.max[i], max[i]);
      }
      existing.keys.push(p.key);
      existing.loadBearing = existing.loadBearing || !!p.loadBearing;
    }
  }
  return [...map.values()];
}
