import { clamp, deg, rad } from "../utils";
import type { V2, V3 } from "./types";

/* Orthographic/perspective camera for the SVG viewport.
 * `bearing` is the compass bearing of the camera as seen from the target
 * (225° = south-west), `pitch` is its elevation above the horizon. */

export interface Camera {
  bearing: number;
  pitch: number;
  zoom: number;
  panX: number;
  panY: number;
  perspective: boolean;
}

export interface Basis {
  r: V3; // screen right
  u: V3; // screen up
  f: V3; // forward (into the screen)
  /** unit vector from target towards the camera */
  d: V3;
}

export function basis(bearing: number, pitch: number): Basis {
  const b = rad(bearing);
  const p = rad(pitch);
  const sb = Math.sin(b);
  const cb = Math.cos(b);
  const sp = Math.sin(p);
  const cp = Math.cos(p);
  return {
    r: [-cb, sb, 0],
    u: [-sb * sp, -cb * sp, cp],
    f: [-sb * cp, -cb * cp, -sp],
    d: [sb * cp, cb * cp, sp],
  };
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export interface Projector {
  project: (p: V3) => { x: number; y: number; depth: number };
  basis: Basis;
  /** pixels per foot */
  scale: number;
  /** screen px → world point on the horizontal plane at height z (null when edge-on) */
  unproject: (sx: number, sy: number, z: number) => V2 | null;
}

export interface Viewport {
  w: number;
  h: number;
}

/** Perspective focal distance in feet; larger = flatter. */
const FOCAL = 260;

export function makeProjector(cam: Camera, vp: Viewport, target: V3, radius: number): Projector {
  const bs = basis(cam.bearing, cam.pitch);
  const fit = (Math.min(vp.w, vp.h) * 0.46) / Math.max(radius, 1);
  const scale = fit * cam.zoom;
  const cx = vp.w / 2 + cam.panX;
  const cy = vp.h / 2 + cam.panY;

  const project = (p: V3) => {
    const q: V3 = [p[0] - target[0], p[1] - target[1], p[2] - target[2]];
    const depth = dot(q, bs.f);
    let k = 1;
    if (cam.perspective) k = FOCAL / Math.max(FOCAL + depth, 30);
    return { x: cx + dot(q, bs.r) * scale * k, y: cy - dot(q, bs.u) * scale * k, depth };
  };

  const unproject = (sx: number, sy: number, z: number): V2 | null => {
    const a = (sx - cx) / scale;
    const b = -(sy - cy) / scale;
    const dz = z - target[2];
    // solve  r.x*X + r.y*Y = a ;  u.x*X + u.y*Y = b - u.z*dz
    const { r, u } = bs;
    const rhs2 = b - u[2] * dz;
    const det = r[0] * u[1] - r[1] * u[0];
    if (Math.abs(det) < 1e-4) return null;
    const X = (a * u[1] - r[1] * rhs2) / det;
    const Y = (r[0] * rhs2 - u[0] * a) / det;
    return [X + target[0], Y + target[1]];
  };

  return { project, basis: bs, scale, unproject };
}

/* ── named views ──────────────────────────────────────────────────────── */
export interface NamedView {
  name: string;
  bearing: number;
  pitch: number;
  /** plan-style (top-down) view */
  plan?: boolean;
}

export const ISO_PITCH = deg(Math.atan(1 / Math.SQRT2)); // 35.264°

export const NAMED_VIEWS: Record<string, NamedView> = {
  "SW Isometric": { name: "SW Isometric", bearing: 225, pitch: ISO_PITCH },
  "SE Isometric": { name: "SE Isometric", bearing: 135, pitch: ISO_PITCH },
  "NE Isometric": { name: "NE Isometric", bearing: 45, pitch: ISO_PITCH },
  "NW Isometric": { name: "NW Isometric", bearing: 315, pitch: ISO_PITCH },
  Top: { name: "Top", bearing: 180, pitch: 90, plan: true },
  Bottom: { name: "Bottom", bearing: 180, pitch: -90 },
  Front: { name: "Front", bearing: 180, pitch: 0 },
  Back: { name: "Back", bearing: 0, pitch: 0 },
  Left: { name: "Left", bearing: 270, pitch: 0 },
  Right: { name: "Right", bearing: 90, pitch: 0 },
  "Floor Plan": { name: "Floor Plan", bearing: 180, pitch: 90, plan: true },
  Elevation: { name: "Elevation", bearing: 180, pitch: 0 },
};

export const ISO_VIEW_ORDER = ["SW Isometric", "SE Isometric", "NE Isometric", "NW Isometric"] as const;

export const HOME_CAMERA: Camera = {
  bearing: 225,
  pitch: ISO_PITCH,
  zoom: 1,
  panX: 0,
  panY: 0,
  perspective: false,
};

export function normBearing(b: number): number {
  return ((b % 360) + 360) % 360;
}

/** Name of the closest named view for the on-screen label. */
export function describeView(cam: Camera): string {
  let best = "Custom";
  let bestErr = 9;
  for (const v of Object.values(NAMED_VIEWS)) {
    const db = Math.abs(((normBearing(cam.bearing) - v.bearing + 540) % 360) - 180);
    const dp = Math.abs(cam.pitch - v.pitch);
    const err = (v.pitch >= 89 || v.pitch <= -89 ? 0 : db) + dp;
    if (err < bestErr) {
      best = v.name;
      bestErr = err;
    }
  }
  return best;
}

export function orbit(cam: Camera, dxPx: number, dyPx: number): Camera {
  return {
    ...cam,
    bearing: normBearing(cam.bearing - dxPx * 0.45),
    pitch: clamp(cam.pitch + dyPx * 0.35, -89, 89),
  };
}
