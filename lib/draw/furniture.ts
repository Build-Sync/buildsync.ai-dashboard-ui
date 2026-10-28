/**
 * lib/draw/furniture.ts
 *
 * WHAT   The furniture catalogue: about thirty pieces in seven groups (living, bedroom, dining, kitchen, office,
 *        laundry, outdoor), each built from parts (legs, a frame, cushions, a mattress and pillows, doors, a
 *        screen …) that are boxes or discs with a bottom, a top and a look (wood, fabric, linen, appliance steel …).
 *        Seen from above the parts draw the plan symbol (a sofa's arms and cushions, a bed's pillows and the
 *        fold of the duvet, a table with its chairs); in 3D they are the piece itself.
 *        - placedParts (from lib/draw/parts.ts, like the building blocks): the parts of a piece at a point, turned
 *          and stretched to the size asked;
 *        - planShapes: the outlines of the parts seen from above (tool ghosts, library thumbnails);
 *        - pieceOf: the piece for a type id, including the plain boxes drawn before the catalogue (sofa,
 *          table, bed, chair, desk), which keep their footprint.
 * FOR    The FURN tool (lib/draw/tools.ts), the composer (lib/draw/compose.ts turns a furniture item into these
 *        prisms) and the Library tab (components/workspace/ModelExplorer/Library.tsx).
 * DEBUG  - A piece looks inside out in 3D: a part's z1 must be above its z0, and its outline must not be empty.
 *        - A piece faces the wrong way: pieces face -y (the front, towards the bottom of the plan) at turn 0;
 *          chairs at a table face the table.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { box, disc, fitPiece, legs, piece as makePiece, place, placedParts, planShapes, type Look, type Part, type Piece as AnyPiece } from "./parts";

export { fitPiece, placedParts, planShapes };
export type { Look, Part };

/** The groups the catalogue is shown in. */
export const FURNITURE_GROUPS = ["Living", "Bedroom", "Dining", "Kitchen", "Office", "Laundry", "Outdoor"] as const;
/** One group of the catalogue. */
export type FurnitureGroup = (typeof FURNITURE_GROUPS)[number];

/** A piece of furniture: its name, group, overall size (width side to side, depth front to back, height) and parts. */
export type Piece = AnyPiece<FurnitureGroup>;

/** A dining chair facing -y (its back on the +y side), seat 1.4 ft square. */
const chair = (): Part[] => [...legs(1.4, 1.4, 0.04, 0.12, 1.45), box(-0.7, -0.7, 0.7, 0.7, 1.45, 1.6, "wood"), box(-0.7, 0.56, 0.7, 0.7, 1.6, 3.05, "wood")];

/** A sofa `w` wide with `seats` seat cushions. */
const sofa = (w: number, seats: number): Part[] => {
  const parts: Part[] = [...legs(w, 3, 0.15, 0.22, 0.35), box(-w / 2, -1.5, w / 2, 0.9, 0.35, 1.3, "fabric"), box(-w / 2, 0.9, w / 2, 1.5, 0.35, 2.75, "fabric")];
  parts.push(box(-w / 2, -1.5, -w / 2 + 0.5, 0.9, 1.3, 2.05, "fabric"), box(w / 2 - 0.5, -1.5, w / 2, 0.9, 1.3, 2.05, "fabric"));
  const inner = w - 1;
  const cw = (inner - (seats - 1) * 0.06) / seats;
  for (let i = 0; i < seats; i++) {
    const x = -inner / 2 + i * (cw + 0.06);
    parts.push(box(x, -1.45, x + cw, 0.9, 1.3, 1.72, "cushion"), box(x, 0.5, x + cw, 0.92, 1.72, 2.6, "cushion"));
  }
  return parts;
};

/** A bed w × d (mattress size plus the frame) with `pillows` pillows. */
const bed = (w: number, d: number, pillows: number): Part[] => {
  const parts: Part[] = [
    ...legs(w, d - 0.25, 0.1, 0.25, 0.35),
    box(-w / 2, -d / 2, w / 2, d / 2 - 0.25, 0.35, 1.1, "wood"),
    box(-w / 2 - 0.05, d / 2 - 0.25, w / 2 + 0.05, d / 2, 0, 3.6, "darkwood"),
    box(-w / 2 + 0.08, -d / 2 + 0.08, w / 2 - 0.08, d / 2 - 0.3, 1.1, 1.95, "linen"),
    // the duvet, folded back below the pillows (the fold line shows on the plan)
    box(-w / 2 + 0.03, -d / 2 + 0.03, w / 2 - 0.03, d / 2 - 2.1, 1.95, 2.03, "fabric"),
  ];
  const pw = (w - 0.4 - (pillows - 1) * 0.2) / pillows;
  for (let i = 0; i < pillows; i++) {
    const x = -w / 2 + 0.2 + i * (pw + 0.2);
    parts.push(box(x, d / 2 - 1.75, x + pw, d / 2 - 0.5, 1.95, 2.3, "linen"));
  }
  return parts;
};

/** A table top w × d at height h on four legs. */
const table = (w: number, d: number, h: number, top: Look = "wood"): Part[] => [...legs(w, d, 0.15, 0.25, h - 0.15), box(-w / 2, -d / 2, w / 2, d / 2, h - 0.15, h, top)];

/** A rectangular dining table with `perSide` chairs along each long side. */
const diningSet = (w: number, d: number, perSide: number): Part[] => {
  const parts = table(w, d, 2.5);
  const step = w / perSide;
  for (let i = 0; i < perSide; i++) {
    const x = -w / 2 + step * (i + 0.5);
    parts.push(...place(chair(), 180, x, -d / 2 - 0.35), ...place(chair(), 0, x, d / 2 + 0.35));
  }
  return parts;
};

/** A round table (radius r) on a pedestal with `chairs` chairs around it. */
const roundSet = (r: number, chairs: number): Part[] => {
  const parts: Part[] = [disc(0, 0, 0.9, 0, 0.15, "darkwood"), box(-0.3, -0.3, 0.3, 0.3, 0.15, 2.35, "darkwood"), disc(0, 0, r, 2.35, 2.5, "wood", 20)];
  for (let i = 0; i < chairs; i++) parts.push(...place(place(chair(), 180, 0, -r - 0.3), (360 * i) / chairs));
  return parts;
};

/** A cabinet run w × d: toe kick, the boxes, a counter top; with wall cabinets above when `upper`. */
const counter = (w: number, d: number, upper: boolean): Part[] => {
  const parts = [box(-w / 2, -d / 2 + 0.3, w / 2, d / 2, 0, 0.35, "darkwood"), box(-w / 2, -d / 2 + 0.1, w / 2, d / 2, 0.35, 2.92, "wood"), box(-w / 2, -d / 2, w / 2, d / 2, 2.92, 3.05, "stone")];
  if (upper) parts.push(box(-w / 2, d / 2 - 1.1, w / 2, d / 2, 4.5, 7, "wood"));
  return parts;
};

const piece = (id: string, label: string, group: FurnitureGroup, parts: Part[]): Piece => makePiece(id, label, group, parts);

/* ── the catalogue ────────────────────────────────────────────────────── */
const LIST: Piece[] = [
  // living
  piece("sofa", "Sofa, 3 seats (7 ft)", "Living", sofa(7, 3)),
  piece("loveseat", "Loveseat (5 ft)", "Living", sofa(5, 2)),
  piece("armchair", "Armchair", "Living", sofa(3, 1)),
  piece("coffeetable", "Coffee table", "Living", [...table(4, 2, 1.5), box(-1.85, -0.85, 1.85, 0.85, 0.4, 0.48, "wood")]),
  piece("sidetable", "Side table", "Living", table(1.8, 1.8, 2)),
  piece("tv", "TV and media unit", "Living", [box(-2.75, -0.8, 2.75, 0.8, 0, 1.7, "darkwood"), box(-0.5, -0.25, 0.5, 0.35, 1.7, 1.85, "screen"), box(-2.3, 0, 2.3, 0.18, 1.85, 4.6, "screen")]),
  piece("bookshelf", "Bookshelf", "Living", [
    box(-1.5, -0.5, -1.42, 0.5, 0, 6, "wood"),
    box(1.42, -0.5, 1.5, 0.5, 0, 6, "wood"),
    box(-1.42, 0.42, 1.42, 0.5, 0, 6, "wood"),
    box(-1.42, -0.5, 1.42, 0.42, 0, 0.3, "darkwood"),
    ...[1.2, 2.4, 3.6, 4.8, 5.92].map((z) => box(-1.42, -0.5, 1.42, 0.42, z, z + 0.08, "wood")),
  ]),
  piece("rug", "Area rug (8 × 5)", "Living", [box(-4, -2.5, 4, 2.5, 0, 0.04, "fabric")]),
  piece("floorlamp", "Floor lamp", "Living", [disc(0, 0, 0.6, 0, 0.1, "metal"), box(-0.05, -0.05, 0.05, 0.05, 0.1, 4.6, "metal"), disc(0, 0, 0.7, 4.6, 5.5, "linen")]),
  // bedroom
  piece("bed-twin", "Bed, twin", "Bedroom", bed(3.25, 6.6, 1)),
  piece("bed-full", "Bed, full", "Bedroom", bed(4.5, 6.6, 2)),
  piece("bed-queen", "Bed, queen", "Bedroom", bed(5, 6.9, 2)),
  piece("bed-king", "Bed, king", "Bedroom", bed(6.6, 6.9, 2)),
  piece("nightstand", "Nightstand with lamp", "Bedroom", [
    box(-0.8, -0.65, 0.8, 0.65, 0, 0.25, "darkwood"),
    box(-0.9, -0.75, 0.9, 0.75, 0.25, 2, "wood"),
    box(-0.95, -0.8, 0.95, 0.8, 2, 2.1, "darkwood"),
    disc(0.3, 0.2, 0.25, 2.1, 2.2, "metal", 10),
    box(0.25, 0.15, 0.35, 0.25, 2.2, 2.6, "metal"),
    disc(0.3, 0.2, 0.45, 2.6, 3.3, "linen", 12),
  ]),
  piece("dresser", "Dresser", "Bedroom", [
    box(-2.4, -0.75, 2.4, 0.85, 0, 0.25, "darkwood"),
    box(-2.5, -0.85, 2.5, 0.85, 0.25, 2.7, "wood"),
    box(-2.55, -0.9, 2.55, 0.9, 2.7, 2.8, "darkwood"),
    ...[1.05, 1.9].map((z) => box(-2.4, -0.89, 2.4, -0.85, z, z + 0.05, "darkwood")),
  ]),
  piece("wardrobe", "Wardrobe", "Bedroom", [box(-2, -1, 2, 1, 0, 7, "wood"), box(-0.03, -1.04, 0.03, -1, 0.3, 6.8, "darkwood")]),
  // dining
  piece("dining4", "Dining table, 4 chairs", "Dining", diningSet(4, 3, 2)),
  piece("dining6", "Dining table, 6 chairs", "Dining", diningSet(6, 3.5, 3)),
  piece("round4", "Round table, 4 chairs", "Dining", roundSet(2, 4)),
  piece("table", "Dining table (5 × 3)", "Dining", table(5, 3, 2.5)),
  piece("chair", "Dining chair", "Dining", chair()),
  piece("stool", "Bar stool", "Dining", [disc(0, 0, 0.6, 0, 0.12, "metal", 12), box(-0.08, -0.08, 0.08, 0.08, 0.12, 2.45, "metal"), disc(0, 0, 0.65, 2.45, 2.6, "wood", 12)]),
  // kitchen
  piece("fridge", "Refrigerator", "Kitchen", [
    box(-1.5, -1.3, 1.5, 1.3, 0, 5.9, "appliance"),
    box(-1.5, -1.33, 1.5, -1.3, 3.95, 4, "screen"),
    box(1.1, -1.42, 1.18, -1.33, 1.2, 3.7, "screen"),
    box(1.1, -1.42, 1.18, -1.33, 4.2, 5.6, "screen"),
  ]),
  piece("range", "Range (stove and oven)", "Kitchen", [
    box(-1.25, -1.15, 1.25, 1, 0, 2.95, "appliance"),
    box(-1.25, -1.15, 1.25, 1, 2.95, 3, "screen"),
    ...[[-0.55, -0.6], [0.55, -0.6], [-0.55, 0.45], [0.55, 0.45]].map(([x, y]) => disc(x, y, 0.33, 3, 3.03, "metal", 12)),
    box(-1.25, 1, 1.25, 1.15, 0, 3.7, "appliance"),
    box(-0.8, -1.18, 0.8, -1.15, 0.9, 2, "screen"),
  ]),
  piece("dishwasher", "Dishwasher", "Kitchen", [box(-1, -1, 1, 1, 0, 2.85, "appliance"), box(-1, -1.03, 1, -1, 2.55, 2.75, "screen")]),
  piece("island", "Kitchen island", "Kitchen", [box(-2.75, -1.3, 2.75, 1, 0, 0.35, "darkwood"), box(-2.9, -1.45, 2.9, 1, 0.35, 2.92, "wood"), box(-3, -1.65, 3, 1.65, 2.92, 3.05, "stone")]),
  piece("counter", "Cabinets and counter (8 ft, with wall cabinets)", "Kitchen", counter(8, 2, true)),
  // office
  piece("desk", "Desk with monitor", "Office", [
    box(-2.5, -1.25, 2.5, 1.25, 2.38, 2.5, "wood"),
    box(-2.45, -1.2, -1, 1.2, 0, 2.38, "wood"),
    box(2.3, -1.2, 2.45, 1.2, 0, 2.38, "wood"),
    box(-1, 1, 2.3, 1.15, 1, 2.38, "wood"),
    box(-0.15, 0.6, 0.15, 0.9, 2.5, 2.9, "metal"),
    box(-0.9, 0.6, 0.9, 0.7, 2.9, 4, "screen"),
  ]),
  piece("officechair", "Office chair", "Office", [disc(0, 0, 1, 0.15, 0.3, "metal", 5), box(-0.1, -0.1, 0.1, 0.1, 0.3, 1.45, "metal"), disc(0, 0, 0.9, 1.45, 1.75, "fabric", 12), box(-0.8, 0.62, 0.8, 0.82, 1.9, 3.5, "fabric")]),
  piece("filing", "Filing cabinet", "Office", [box(-0.65, -1, 0.65, 1, 0, 2.4, "metal"), box(-0.65, -1.03, 0.65, -1, 1.18, 1.22, "screen")]),
  // laundry
  piece("washer", "Washing machine", "Laundry", [box(-1.15, -1.2, 1.15, 1.2, 0, 3.2, "appliance"), box(-1.15, 0.85, 1.15, 1.2, 3.2, 3.7, "appliance"), box(-0.9, -1, 0.9, 0.7, 3.2, 3.23, "metal")]),
  piece("dryer", "Clothes dryer", "Laundry", [box(-1.15, -1.2, 1.15, 1.2, 0, 3.2, "appliance"), box(-1.15, 0.85, 1.15, 1.2, 3.2, 3.7, "appliance"), box(-0.6, -1.23, 0.6, -1.2, 1, 2.4, "screen")]),
  // outdoor
  piece("lounger", "Patio lounge chair", "Outdoor", [...legs(2.3, 6.3, 0.1, 0.2, 0.6, "metal"), box(-1.15, -3.15, 1.15, 3.15, 0.6, 0.85, "wood"), box(-1.1, -3.1, 1.1, 1.6, 0.85, 1.05, "cushion"), box(-1.1, 1.6, 1.1, 3.1, 0.85, 2.6, "cushion")]),
  piece("patioset", "Patio table, 4 chairs", "Outdoor", roundSet(1.75, 4)),
];

/** Every piece by id. */
export const FURNITURE: Record<string, Piece> = Object.fromEntries(LIST.map((p) => [p.id, p]));
/** Piece ids in catalogue order. */
export const FURNITURE_IDS: string[] = LIST.map((p) => p.id);

/** Furniture drawn before the catalogue was a plain box with these type ids; they map onto a piece. */
const LEGACY: Record<string, string> = { bed: "bed-queen" };

/** The piece for a type id (catalogue or older box type), or null for a type that is not furniture. */
export function pieceOf(type: string): Piece | null {
  return FURNITURE[type] ?? FURNITURE[LEGACY[type] ?? ""] ?? null;
}
