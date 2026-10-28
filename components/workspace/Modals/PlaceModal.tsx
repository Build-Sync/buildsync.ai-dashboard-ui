/**
 * components/workspace/Modals/PlaceModal.tsx
 *
 * WHAT   Place by Measurement (Insert → Site Objects → Place by Measure, command PLACE): put a shed, a pool, a tree,
 *        a bush, boulders, a flower bed, a septic tank or a concrete pad on the plan by typing its size and how far it
 *        is from a corner of the building (or its centre, or the site origin), with a rotation. A small top view shows the building,
 *        the property line and where the object will go before it is placed.
 * FOR    "I want a 10 × 12 shed 15 ft behind the house": no clicking needed. The object is an ordinary drawn item
 *        (lib/draw/compose.ts builds it), so it can be moved, copied, measured and deleted like any other, and
 *        Undo removes it.
 * DEBUG  - The object lands in the wrong place: distances are measured to its centre, east (+X) and north (+Y)
 *          from the chosen reference point; negative numbers go west or south.
 *        - The septic warning: the tank should stay at least 5 ft from the building (about 8 ft to its centre).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useState } from "react";
import { Icon, type IconKey } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import { applyChange } from "@/lib/draw/change";
import { boxPoly } from "@/lib/draw/compose";
import { POOL_SHAPES, poolOutline, type PoolShape } from "@/lib/draw/site";
import { sceneOf } from "@/lib/draw/scene-of";
import type { DrawnItem, ItemKind } from "@/lib/draw/types";
import type { V2 } from "@/lib/scene/types";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn, fmtLength, uid } from "@/lib/utils";

type Obj = "shed" | "pool" | "tree" | "bush" | "rock" | "flowers" | "septic" | "pad";
type Ref = "sw" | "se" | "nw" | "ne" | "centre" | "origin";

const OBJECTS: { id: Obj; label: string; icon: IconKey }[] = [
  { id: "shed", label: "Shed", icon: "shed" },
  { id: "pool", label: "Pool", icon: "pool" },
  { id: "tree", label: "Tree", icon: "tree" },
  { id: "bush", label: "Bush", icon: "shrub" },
  { id: "rock", label: "Boulders", icon: "rock" },
  { id: "flowers", label: "Flower bed", icon: "flower" },
  { id: "septic", label: "Septic tank", icon: "septic" },
  { id: "pad", label: "Concrete pad", icon: "slab" },
];
const REFS: { id: Ref; label: string }[] = [
  { id: "sw", label: "the building's south-west corner" },
  { id: "se", label: "the building's south-east corner" },
  { id: "nw", label: "the building's north-west corner" },
  { id: "ne", label: "the building's north-east corner" },
  { id: "centre", label: "the middle of the building" },
  { id: "origin", label: "the site origin (0, 0)" },
];
const POOL_LABEL: Record<PoolShape, string> = { rectangle: "Rectangle", oval: "Oval", freeform: "Freeform (kidney)", lshape: "L-shape" };
/** Starting sizes of each object: width, depth, height (a tree: height and canopy radius; a pool: length, width
 *  and depth; boulders: the size of one). */
const SIZES: Record<Obj, { w: number; d: number; h: number }> = {
  shed: { w: 10, d: 12, h: 7.5 },
  pool: { w: 32, d: 16, h: 6 },
  rock: { w: 3, d: 3, h: 2 },
  tree: { w: 16, d: 16, h: 22 },
  bush: { w: 5, d: 5, h: 3.5 },
  flowers: { w: 12, d: 4, h: 0.7 },
  septic: { w: 9, d: 5.5, h: 5 },
  pad: { w: 12, d: 12, h: 0.33 },
};

/** The Place by Measurement dialog. */
export function PlaceModal() {
  const ws = useWsApi();
  const app = useAppApi();
  const units = useApp((s) => s.settings.units);
  const boundary = useWs((s) => s.project.site?.boundary);
  const scene = sceneOf(ws.getState());
  const f = scene.footprint;
  const [obj, setObj] = useState<Obj>("shed");
  const [ref, setRef] = useState<Ref>("nw");
  const [size, setSize] = useState(SIZES.shed);
  const [east, setEast] = useState(6);
  const [north, setNorth] = useState(15);
  const [rot, setRot] = useState(0);
  const [roof, setRoof] = useState("gable");
  const [gal, setGal] = useState(1000);
  const [rows, setRows] = useState(3);
  const [shape, setShape] = useState<PoolShape>("rectangle");
  const [deck, setDeck] = useState(4);
  const [rocks, setRocks] = useState(1);
  const close = () => ws.getState().closeModal();
  const fmt = (ft: number) => fmtLength(ft, units.system, units.precision);

  const origin: V2 = ref === "sw" ? [f.x0, f.y0] : ref === "se" ? [f.x1, f.y0] : ref === "nw" ? [f.x0, f.y1] : ref === "ne" ? [f.x1, f.y1] : ref === "centre" ? [(f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2] : [0, 0];
  const at: V2 = [origin[0] + east, origin[1] + north];
  const round = obj === "tree" || obj === "bush" || obj === "rock";
  const outline = round ? circle(at, obj === "rock" ? size.w / 2 + (rocks > 1 ? size.w * 0.6 : 0) : size.w / 2) : obj === "pool" ? turned(poolOutline(shape, size.w, size.d), rot, at) : boxPoly(at, size.w, size.d, rot);
  const gap = Math.max(f.x0 - at[0], at[0] - f.x1, f.y0 - at[1], at[1] - f.y1);
  const overlaps = !round && obj !== "flowers" && gap < Math.max(size.w, size.d) / 2 + (obj === "pool" ? deck : 0);

  const pick = (o: Obj) => {
    setObj(o);
    setSize(SIZES[o]);
  };

  const place = () => {
    const s = ws.getState();
    const n = (k: ItemKind) => s.drawn.filter((i) => i.kind === k).length + 1;
    const base = { id: uid("U"), level: "site" as const, z: scene.grade };
    let item: DrawnItem;
    if (obj === "shed") item = { ...base, kind: "shed", name: `Shed ${n("shed")}`, pts: [at], p: { w: size.w, d: size.d, h: size.h, rot, roof } };
    else if (obj === "pool") item = { ...base, kind: "pool", name: `Pool ${n("pool")}`, pts: [at], p: { shape, l: size.w, w: size.d, depth: size.h, deck, rot } };
    else if (obj === "rock") item = { ...base, kind: "rock", name: `Boulder ${n("rock")}`, pts: [at], p: { size: size.w, count: rocks } };
    else if (obj === "tree" || obj === "bush") item = { ...base, kind: "tree", name: `${obj === "bush" ? "Bush" : "Tree"} ${n("tree")}`, pts: [at], p: { species: obj === "bush" ? "shrub" : "shade", h: size.h, r: size.w / 2 } };
    else if (obj === "flowers") item = { ...base, kind: "flowers", name: `Flower Bed ${n("flowers")}`, pts: boxPoly(at, size.w, size.d, rot), closed: true, p: { h: size.h } };
    else if (obj === "septic") item = { ...base, kind: "septic", name: `Septic System ${n("septic")} (${gal.toLocaleString("en-US")} gal)`, pts: [at], p: { gal, rows, len: 36, dist: 10, rot } };
    else item = { ...base, z: scene.grade + size.h, kind: "slab", name: `Concrete Pad ${n("slab")}`, pts: boxPoly(at, size.w, size.d, rot), closed: true, p: { thick: size.h, type: "Concrete pad", material: '4" concrete pad, broom finish' } };
    // the layer the object lives on comes back on if it was hidden
    const layer = obj === "septic" ? "utilities" : obj === "flowers" || obj === "pad" || obj === "pool" || obj === "rock" ? "landscape" : "site";
    s.edit(`Place ${item.name}`, (st) => ({
      ...applyChange(st, { add: [item] }),
      project: { ...st.project, layers: st.project.layers.map((l) => (l.id === layer ? { ...l, visible: true } : l)) },
    }));
    s.select([item.id]);
    app.getState().log("ok", `✓ ${item.name} placed: centre ${fmt(at[0])}, ${fmt(at[1])} (${fmt(east)} east and ${fmt(north)} north of ${REFS.find((r) => r.id === ref)!.label})`);
    if (obj === "septic" && gap < 8) app.getState().toast("The septic tank is closer than 5 ft to the building. Most codes ask for at least 5 ft.", "warn");
    close();
  };

  // the little top view: the building, the property line and the object, framed together
  const pts: V2[] = [[f.x0, f.y0], [f.x1, f.y1], ...outline, ...(boundary ?? []), origin];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const pad = 6;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;
  const W = 260;
  const H = 200;
  const k = Math.min(W / (maxX - minX), H / (maxY - minY));
  const X = (x: number) => (x - minX) * k + (W - (maxX - minX) * k) / 2;
  const Y = (y: number) => H - ((y - minY) * k + (H - (maxY - minY) * k) / 2);
  const poly = (p: V2[]) => p.map((q) => `${X(q[0]).toFixed(1)},${Y(q[1]).toFixed(1)}`).join(" ");

  const num = (label: string, v: number, set: (n: number) => void, testid: string, step = 0.5) => (
    <label className="flex items-center justify-between gap-2 text-[0.75rem] text-t2">
      {label}
      <input type="number" step={step} className="input mono !h-7 !w-24 text-right" value={v} onChange={(e) => set(Number(e.target.value) || 0)} aria-label={label} data-testid={testid} />
    </label>
  );

  return (
    <Modal
      title="Place by Measurement"
      subtitle="Type the size and how far it is from the building; it goes exactly there."
      onClose={close}
      width="44rem"
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={place} data-testid="place-insert">
            Place {OBJECTS.find((o) => o.id === obj)!.label.toLowerCase()}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-[1fr_17rem] gap-4" data-testid="place-modal">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Object">
            {OBJECTS.map((o) => (
              <button key={o.id} role="radio" aria-checked={obj === o.id} onClick={() => pick(o.id)} data-testid={`place-${o.id}`} className={cn("flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[0.75rem]", obj === o.id ? "border-accent bg-accent/10 text-t1" : "border-line text-t2 hover:border-t3")}>
                <Icon name={o.icon} size={15} /> {o.label}
              </button>
            ))}
          </div>
          <fieldset className="space-y-1.5">
            <legend className="label-xs mb-1">Size</legend>
            {obj === "tree" || obj === "bush" ? (
              <>
                {num("Canopy width (ft)", size.w, (w) => setSize({ ...size, w, d: w }), "place-w")}
                {num("Height (ft)", size.h, (h) => setSize({ ...size, h }), "place-h")}
              </>
            ) : obj === "rock" ? (
              <>
                {num("Size of a boulder (ft)", size.w, (w) => setSize({ ...size, w, d: w }), "place-w")}
                {num("How many", rocks, (r) => setRocks(Math.max(1, Math.min(7, Math.round(r)))), "place-count", 1)}
              </>
            ) : obj === "pool" ? (
              <>
                <label className="flex items-center justify-between gap-2 text-[0.75rem] text-t2">
                  Shape
                  <select className="input !h-7 !w-40" value={shape} onChange={(e) => setShape(e.target.value as PoolShape)} aria-label="Pool Shape" data-testid="place-shape">
                    {POOL_SHAPES.map((sh) => (
                      <option key={sh} value={sh}>
                        {POOL_LABEL[sh]}
                      </option>
                    ))}
                  </select>
                </label>
                {num("Length, east–west (ft)", size.w, (w) => setSize({ ...size, w }), "place-w")}
                {num("Width, north–south (ft)", size.d, (d) => setSize({ ...size, d }), "place-d")}
                {num("Depth (ft)", size.h, (h) => setSize({ ...size, h }), "place-h")}
                {num("Deck around it (ft)", deck, (v) => setDeck(Math.max(0, v)), "place-deck")}
              </>
            ) : obj === "septic" ? (
              <>
                <label className="flex items-center justify-between gap-2 text-[0.75rem] text-t2">
                  Tank
                  <select className="input !h-7 !w-40" value={gal} onChange={(e) => setGal(Number(e.target.value))} aria-label="Tank Size">
                    <option value={1000}>1,000 gal (2–3 bed)</option>
                    <option value={1250}>1,250 gal (4 bed)</option>
                    <option value={1500}>1,500 gal (5+ bed)</option>
                  </select>
                </label>
                {num("Drain-field trenches", rows, (r) => setRows(Math.max(0, Math.min(8, Math.round(r)))), "place-rows", 1)}
              </>
            ) : (
              <>
                {num("Width, east–west (ft)", size.w, (w) => setSize({ ...size, w }), "place-w")}
                {num("Depth, north–south (ft)", size.d, (d) => setSize({ ...size, d }), "place-d")}
                {obj !== "flowers" && num(obj === "pad" ? "Thickness (ft)" : "Wall height (ft)", size.h, (h) => setSize({ ...size, h }), "place-h", obj === "pad" ? 0.05 : 0.5)}
                {obj === "shed" && (
                  <label className="flex items-center justify-between gap-2 text-[0.75rem] text-t2">
                    Roof
                    <select className="input !h-7 !w-28" value={roof} onChange={(e) => setRoof(e.target.value)} aria-label="Roof">
                      <option value="gable">Gable</option>
                      <option value="lean">Lean-to</option>
                      <option value="flat">Flat</option>
                    </select>
                  </label>
                )}
              </>
            )}
          </fieldset>
          <fieldset className="space-y-1.5">
            <legend className="label-xs mb-1">Where (to its centre)</legend>
            <label className="flex items-center justify-between gap-2 text-[0.75rem] text-t2">
              Measured from
              <select className="input !h-7 !w-56" value={ref} onChange={(e) => setRef(e.target.value as Ref)} aria-label="Measured From" data-testid="place-ref">
                {REFS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            {num("East of it, ft (− = west)", east, setEast, "place-east")}
            {num("North of it, ft (− = south)", north, setNorth, "place-north")}
            {!round && num("Rotation (°)", rot, setRot, "place-rot", 15)}
          </fieldset>
        </div>
        <div>
          <svg width={W} height={H} className="rounded-lg border border-line bg-[var(--bg-viewport)]" role="img" aria-label="Where it goes" data-testid="place-preview">
            {boundary && <polygon points={poly(boundary)} fill="none" stroke="#e3a72f" strokeWidth={1.2} strokeDasharray="8 3 2 3" />}
            <rect x={X(f.x0)} y={Y(f.y1)} width={(f.x1 - f.x0) * k} height={(f.y1 - f.y0) * k} fill="var(--vp-ink)" fillOpacity={0.12} stroke="var(--vp-ink)" strokeWidth={1.2} />
            <text x={X((f.x0 + f.x1) / 2)} y={Y((f.y0 + f.y1) / 2) + 3} fontSize={9} textAnchor="middle" fill="var(--vp-ink-dim)">
              BUILDING
            </text>
            <line x1={X(origin[0])} y1={Y(origin[1])} x2={X(at[0])} y2={Y(origin[1])} stroke="#3ecf8e" strokeDasharray="3 2" />
            <line x1={X(at[0])} y1={Y(origin[1])} x2={X(at[0])} y2={Y(at[1])} stroke="#3ecf8e" strokeDasharray="3 2" />
            <circle cx={X(origin[0])} cy={Y(origin[1])} r={3} fill="#3ecf8e" />
            <polygon points={poly(outline)} fill="var(--accent)" fillOpacity={0.3} stroke="var(--accent)" strokeWidth={1.4} />
            <text x={6} y={14} fontSize={9} fill="var(--vp-ink-dim)">
              N ↑
            </text>
          </svg>
          <p className="mt-2 text-[0.75rem] text-t2" data-testid="place-summary">
            Centre at {fmt(at[0])}, {fmt(at[1])}. {fmt(Math.abs(east))} {east >= 0 ? "east" : "west"} and {fmt(Math.abs(north))} {north >= 0 ? "north" : "south"} of {REFS.find((r) => r.id === ref)!.label}.
          </p>
          {overlaps && <p className="mt-1 text-[0.75rem] text-warn">It overlaps the building: move it further out.</p>}
          {obj === "septic" && gap < 8 && !overlaps && <p className="mt-1 text-[0.75rem] text-warn">Closer than 5 ft to the building.</p>}
        </div>
      </div>
    </Modal>
  );
}

/** An outline centred on the origin, turned by deg degrees and moved to c (a pool, for the preview). */
function turned(pts: V2[], deg: number, c: V2): V2[] {
  const r = (deg * Math.PI) / 180;
  return pts.map(([x, y]) => [c[0] + x * Math.cos(r) - y * Math.sin(r), c[1] + x * Math.sin(r) + y * Math.cos(r)] as V2);
}

/** A circle as a polygon (for the preview). */
function circle(c: V2, r: number): V2[] {
  return Array.from({ length: 20 }, (_, i) => [c[0] + r * Math.cos((i / 20) * Math.PI * 2), c[1] + r * Math.sin((i / 20) * Math.PI * 2)] as V2);
}
