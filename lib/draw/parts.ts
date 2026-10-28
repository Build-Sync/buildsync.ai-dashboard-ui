/**
 * lib/draw/parts.ts
 *
 * WHAT   The building blocks of every catalogue piece (furniture, MEP fixtures, site objects): a part is an outline
 *        between two heights, with a look (wood, fabric, porcelain, chrome, water …) that picks its colour.
 *        - box, disc, ring, legs: the usual parts; place turns and moves a set of parts; measure sizes them;
 *        - Piece: an object made of parts (its id, label, group and size); placedParts / planShapes / fitPiece place
 *          one in the model, draw its outline seen from above and fit it to a size;
 *        - LOOK_COLOR: the colour slot of each look (lib/scene/types.ts FixedColor); a part can also be buried
 *          (under), see-through (glass) or carry a texture on its top (pattern).
 * FOR    lib/draw/furniture.ts, lib/draw/fixtures.ts and lib/draw/site.ts build their catalogues from these, and
 *        lib/draw/compose.ts turns placed pieces into prisms.
 * DEBUG  - A part does not show: its z1 must be above its z0 and its outline needs 3 points or more.
 *        - A part has the wrong colour: its look's slot in LOOK_COLOR, and that slot's colour in FIXED_COLORS.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { ColorKey, V2 } from "../scene/types";

/** The colour slot of each look a part can have (wood, fabric, porcelain, water, asphalt …). */
export const LOOK_COLOR = {
  wood: "furniture", darkwood: "darkwood", fabric: "fabric", cushion: "cushion", linen: "linen", appliance: "appliance", screen: "screen",
  stone: "stone", metal: "metal", porcelain: "porcelain", chrome: "chrome", glass: "glass", water: "water", solar: "solar", plastic: "plastic",
  lamp: "lamp", concrete: "concrete", fan: "darkwood",
  asphalt: "asphalt", stripeYellow: "stripeYellow", stripeWhite: "stripeWhite", rock: "rock", mulch: "mulch", flowerRed: "flowerRed",
  flowerYellow: "flowerYellow", flowerPurple: "flowerPurple", flowerWhite: "flowerWhite", foliage: "foliage", signRed: "signRed",
  signGreen: "signGreen", signWhite: "signWhite", signYellow: "signYellow", lampRed: "lampRed", lampAmber: "lampAmber", lampGreen: "lampGreen",
  deck: "deck", gutter: "gutter", paving: "paving",
} as const satisfies Record<string, ColorKey>;

/** What a part is made of (each look is a colour slot). */
export type Look = keyof typeof LOOK_COLOR;

/** One part of a piece: an outline (feet, from the piece's centre) between two heights above where it stands. */
export interface Part {
  poly: V2[];
  z0: number;
  z1: number;
  look: Look;
  /** below the ground: shows in sections, X-ray and Below Grade (a pool's shell, a catch basin) */
  under?: boolean;
  /** see-through (glass, a shower screen) */
  glass?: boolean;
  /** a texture drawn on its top (an SVG pattern of components/workspace/Viewport/Overlays.tsx: gravel, loam …) */
  pattern?: string;
}

/** An object made of parts: its name, group, overall size (width side to side, depth front to back, height) and parts. */
export interface Piece<G extends string = string> {
  id: string;
  label: string;
  group: G;
  w: number;
  d: number;
  h: number;
  parts: Part[];
}

/** A rectangle's corners. */
export const rect = (x0: number, y0: number, x1: number, y1: number): V2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** A box part from its plan corners and its heights. */
export const box = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, look: Look): Part => ({ poly: rect(x0, y0, x1, y1), z0, z1, look });
/** A round part (an n-sided polygon). */
export const disc = (cx: number, cy: number, r: number, z0: number, z1: number, look: Look, n = 16): Part => ({
  poly: Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)] as V2),
  z0,
  z1,
  look,
});
/** An oval part (rx × ry). */
export const oval = (cx: number, cy: number, rx: number, ry: number, z0: number, z1: number, look: Look, n = 20): Part => ({
  poly: Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((2 * Math.PI * i) / n), cy + ry * Math.sin((2 * Math.PI * i) / n)] as V2),
  z0,
  z1,
  look,
});
/** A band between two outlines with the same number of corners (a pool's coping, a deck): one part per side. */
export const ring = (inner: V2[], outer: V2[], z0: number, z1: number, look: Look): Part[] =>
  inner.map((a, i) => {
    const b = inner[(i + 1) % inner.length];
    return { poly: [a, b, outer[(i + 1) % outer.length], outer[i]], z0, z1, look };
  });
/** Four legs, `inset` from the edges of a w × d top, `s` square, up to height h. */
export const legs = (w: number, d: number, inset: number, s: number, h: number, look: Look = "darkwood"): Part[] =>
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const cx = sx * (w / 2 - inset - s / 2);
    const cy = sy * (d / 2 - inset - s / 2);
    return box(cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2, 0, h, look);
  });
/** Parts turned by `deg` about the origin, then moved by (dx, dy). */
export const place = (parts: Part[], deg: number, dx = 0, dy = 0): Part[] => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return parts.map((p) => ({ ...p, poly: p.poly.map(([x, y]) => [x * c - y * s + dx, x * s + y * c + dy] as V2) }));
};
/** Parts raised by dz. */
export const lift = (parts: Part[], dz: number): Part[] => parts.map((p) => ({ ...p, z0: p.z0 + dz, z1: p.z1 + dz }));

/** Size of the parts' footprint and height. */
export function measure(parts: Part[]): { w: number; d: number; h: number } {
  const xs = parts.flatMap((p) => p.poly.map((q) => q[0]));
  const ys = parts.flatMap((p) => p.poly.map((q) => q[1]));
  const r = (n: number) => Math.round(n * 100) / 100;
  return { w: r(Math.max(...xs) - Math.min(...xs)), d: r(Math.max(...ys) - Math.min(...ys)), h: r(Math.max(...parts.map((p) => p.z1))) };
}

/** A piece measured from its parts. */
export const piece = <G extends string>(id: string, label: string, group: G, parts: Part[]): Piece<G> => ({ id, label, group, ...measure(parts), parts });

/**
 * How to fit a piece to the size an item asks for: the scale along its width and depth and the turn. A size whose
 * width and depth are the piece's swapped (an older bed drawn 6.5 × 5) turns the piece 90° instead of squashing it.
 */
export function fitPiece(pc: Piece, w: number, d: number, rot: number): { sx: number; sy: number; rot: number } {
  const straight = Math.abs(Math.log(w / pc.w)) + Math.abs(Math.log(d / pc.d));
  const swapped = Math.abs(Math.log(w / pc.d)) + Math.abs(Math.log(d / pc.w));
  if (swapped + 0.05 < straight) return { sx: d / pc.w, sy: w / pc.d, rot: rot + 90 };
  return { sx: w / pc.w, sy: d / pc.d, rot };
}

/** The parts of a piece placed at `c` (feet), stretched by sx, sy and turned `rot` degrees. Heights are above the floor. */
export function placedParts(pc: Piece, c: V2, rot: number, sx = 1, sy = 1): Part[] {
  return place(pc.parts.map((p) => ({ ...p, poly: p.poly.map(([x, y]) => [x * sx, y * sy] as V2) })), rot, c[0], c[1]);
}

/** The outlines of a piece seen from above, lowest first (ghosts and thumbnails). */
export function planShapes(pc: Piece, c: V2, rot: number): V2[][] {
  return placedParts(pc, c, rot)
    .slice()
    .sort((a, b) => a.z1 - b.z1)
    .map((p) => p.poly);
}
