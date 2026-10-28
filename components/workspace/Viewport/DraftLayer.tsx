/**
 * components/workspace/Viewport/DraftLayer.tsx
 *
 * WHAT   The SVG layer for everything flat that the user draws or a tool is about to draw: lines, polylines,
 *        splines, arcs, rectangles, circles, hatches, rooms (fill + name + area), text, notes, pins, place labels
 *        (a name on a stem that stands up in 3D), tags, leaders,
 *        spot elevation marks, elevation lines at any angle and circular elevations (with their number and the way they
 *        look; dragging their grips re-shapes their sheet), detail callouts, section marks, grid lines, markups, images
 *        and dimensions; the dashed
 *        plan outline of below-grade foundations; the grips of selected drawn items (data-grip="id:index": drag one to
 *        move that point; ModelViewport handles the drag); the rubber-band preview of the
 *        running tool; the snap marker in AutoCAD's shapes (square end point, triangle midpoint, circle centre, X
 *        intersection, ⊥ perpendicular, hourglass nearest) with its name, and the dotted tracking / ortho / polar
 *        guide lines; and the last measurement.
 * FOR    ModelViewport renders it above the model. Each mark carries data-el so a click selects it (a wide
 *        invisible stroke makes thin lines easy to hit). Positions go through the same projector as the model, so
 *        marks lie on their level in 3D and in the plan.
 * DEBUG  - A mark is missing: its layer is off (Drafting / Annotations), it is hidden or isolated away, or it is on
 *          another level than the plan shows (plan view only draws the active level's marks).
 *        - A mark cannot be clicked: only strokes (and, for rooms and hatches, the fill) take clicks.
 *        - Text sizes are in screen pixels on purpose: they do not grow with zoom.
 *        - Room names and place labels are gone: the Labels switch (View tab, or the viewport's Labels chip) is off.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { memo } from "react";
import { arcFrom3, arcPts, circlePts, dist2, perp2, polyArea, polyCentroid, splinePts, sub2, unit2 } from "@/lib/draw/geom";
import type { DrawnItem, MeasureResult, Preview } from "@/lib/draw/types";
import type { Projector } from "@/lib/scene/camera";
import type { LevelKey, Scene, V2 } from "@/lib/scene/types";
import type { LayerId } from "@/lib/types";
import { fmtLength, type MeasureSystem } from "@/lib/utils";

const f1 = (n: number) => Math.round(n * 10) / 10;

/** The marks that are drawn flat by this layer. */
export interface DraftProps {
  scene: Scene;
  proj: Projector;
  /** plan view: only marks of these levels; null in 3D (all marks) */
  levels: LevelKey[] | null;
  layerVis: Partial<Record<LayerId, boolean>>;
  hidden: ReadonlySet<string>;
  isolated: ReadonlySet<string> | null;
  selection: string[];
  hover: string | null;
  preview: Preview | null;
  snap: { pt: V2; kind: string; guides?: [V2, V2][] } | null;
  /** show place labels (the Labels switch) */
  labels?: boolean;
  /** show the names and areas of drawn rooms (the Room Names switch) */
  rooms?: boolean;
  measure: MeasureResult | null;
  units: { system: MeasureSystem; precision: number };
}

const INK = "var(--vp-ink)";
const DIM = "var(--vp-ink-dim)";
const ACCENT = "var(--accent)";

/** The mark layer of the viewport. */
export const DraftLayer = memo(function DraftLayer(p: DraftProps) {
  const { scene, proj, levels, layerVis, hidden, isolated, selection, hover, preview, snap, measure, units } = p;
  const labelsOn = p.labels !== false;
  const roomsOn = p.rooms !== false;
  const P = (pt: V2, z: number) => proj.project([pt[0], pt[1], z]);
  const path = (pts: V2[], z: number, closed: boolean) => {
    let d = "";
    pts.forEach((q, i) => {
      const s = P(q, z);
      d += `${i ? "L" : "M"}${f1(s.x)},${f1(s.y)}`;
    });
    return closed ? `${d}Z` : d;
  };
  const sel = new Set(selection);
  const items = (scene.drafts ?? []).filter((it) => {
    if (layerVis[META_LAYER[it.kind] ?? "drafting"] === false) return false;
    if (it.kind === "label" && !labelsOn) return false;
    if (hidden.has(it.id)) return false;
    if (isolated && !isolated.has(it.id)) return false;
    if (levels && !levels.includes(it.level)) return false;
    return true;
  });
  const fmt = (ft: number) => fmtLength(ft, units.system, units.precision);

  const mark = (it: DrawnItem) => {
    const z = it.z;
    const on = sel.has(it.id);
    const hot = hover === it.id && !on;
    const stroke = on ? ACCENT : it.kind === "markup" ? "#ef5b5b" : INK;
    const w = on ? 1.8 : hot ? 1.6 : 1.1;
    const common = { "data-el": it.id } as const;
    const hit = (d: string) => <path {...common} d={d} fill="none" stroke="#000" strokeOpacity={0} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />;
    const line = (d: string, extra: Record<string, unknown> = {}) => (
      <>
        <path d={d} fill="none" stroke={stroke} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" {...extra} />
        {hit(d)}
      </>
    );
    const text = (pt: V2, s: string, o: { size?: number; dx?: number; dy?: number; anchor?: "start" | "middle" | "end"; fill?: string; weight?: number } = {}) => {
      const q = P(pt, z);
      return (
        <text x={f1(q.x + (o.dx ?? 0))} y={f1(q.y + (o.dy ?? 0))} fontSize={o.size ?? 11} textAnchor={o.anchor ?? "start"} fill={o.fill ?? (on ? ACCENT : INK)} fontFamily="var(--font-ui)" fontWeight={o.weight ?? 500} stroke="var(--bg-viewport)" strokeWidth={3} paintOrder="stroke">
          {s}
        </text>
      );
    };
    const label = (s: string) => (s.length > 60 ? `${s.slice(0, 58)}…` : s);
    const T = (k: string, d: string) => (typeof it.p[k] === "string" ? (it.p[k] as string) : d);
    switch (it.kind) {
      case "line":
      case "polyline":
      case "markup": {
        const d = path(it.pts, z, !!it.closed);
        return (
          <g key={it.id}>
            {line(d)}
            {it.kind === "markup" && T("text", "") && text(it.pts[0], label(T("text", "")), { dy: -6, fill: "#ef5b5b" })}
          </g>
        );
      }
      case "spline":
        return <g key={it.id}>{line(path(splinePts(it.pts, 10), z, false))}</g>;
      case "arc": {
        const a = it.pts.length > 2 ? arcFrom3(it.pts[0], it.pts[1], it.pts[2]) : null;
        return <g key={it.id}>{line(path(a ? arcPts(a, 40) : it.pts, z, false))}</g>;
      }
      case "rect":
        return <g key={it.id}>{line(path(it.pts, z, true))}</g>;
      case "circle":
        return <g key={it.id}>{line(path(circlePts(it.pts[0], dist2(it.pts[0], it.pts[1]), 64), z, true))}</g>;
      case "hatch": {
        const d = path(it.pts, z, true);
        const pat = T("pattern", "diag");
        return (
          <g key={it.id}>
            <path {...common} d={d} fill={pat === "solid" ? INK : `url(#bs-hatch-${pat})`} fillOpacity={pat === "solid" ? 0.22 : 1} stroke={on ? ACCENT : DIM} strokeWidth={on ? 1.6 : 0.8} />
          </g>
        );
      }
      case "room": {
        const c = polyCentroid(it.pts);
        const area = Math.abs(polyArea(it.pts));
        return (
          <g key={it.id}>
            <path {...common} d={path(it.pts, z, true)} fill={INK} fillOpacity={on ? 0.16 : hot ? 0.12 : 0.06} stroke={on ? ACCENT : DIM} strokeWidth={on ? 1.6 : 0.8} strokeDasharray="5 3" />
            {roomsOn && text(c, it.name, { anchor: "middle", dy: -2, weight: 600 })}
            {roomsOn && text(c, units.system === "imperial" ? `${area.toFixed(1)} sf` : `${(area * 0.092903).toFixed(2)} m²`, { anchor: "middle", dy: 11, size: 9.5, fill: DIM })}
          </g>
        );
      }
      case "text":
        return (
          <g key={it.id} {...common}>
            {text(it.pts[0], label(T("text", "Text")), { size: 13 })}
            <rect x={P(it.pts[0], z).x - 2} y={P(it.pts[0], z).y - 14} width={Math.max(24, T("text", "Text").length * 7.2)} height={18} fill="#000" fillOpacity={0} />
          </g>
        );
      case "note": {
        const q = P(it.pts[0], z);
        const s = label(T("text", "Note"));
        const bw = Math.max(40, s.length * 6.4 + 12);
        return (
          <g key={it.id} {...common}>
            <rect x={f1(q.x)} y={f1(q.y - 16)} width={bw} height={20} rx={3} fill="#f0c63c" fillOpacity={0.9} stroke={on ? ACCENT : "#9a7b12"} strokeWidth={on ? 1.8 : 0.8} />
            <text x={f1(q.x + 6)} y={f1(q.y - 2)} fontSize={11} fill="#1b1500" fontFamily="var(--font-ui)">
              {s}
            </text>
          </g>
        );
      }
      case "pin": {
        const q = P(it.pts[0], z);
        return (
          <g key={it.id} {...common}>
            <path d={`M${f1(q.x)},${f1(q.y)}l-5,-12a6,6 0 1 1 10,0z`} fill="#ef5b5b" stroke={on ? ACCENT : "#fff"} strokeWidth={on ? 1.8 : 1} />
            <circle cx={f1(q.x)} cy={f1(q.y - 15)} r={2} fill="#fff" />
            {text(it.pts[0], label(T("text", "Pin")), { dx: 9, dy: -12 })}
          </g>
        );
      }
      case "label": {
        // a place name: a dot on the spot and the name in a pill; in 3D the pill stands on a stem above the spot
        const q = P(it.pts[0], z);
        const s = label(T("text", "Place"));
        const bw = Math.max(38, s.length * 6.6 + 18);
        const rise = levels ? 0 : 34;
        const top = q.y - rise;
        return (
          <g key={it.id} {...common} data-testid="place-label">
            {rise > 0 && <path d={`M${f1(q.x)},${f1(q.y)}V${f1(top)}`} stroke={on ? ACCENT : "#2f6fd6"} strokeWidth={1.2} />}
            <circle cx={f1(q.x)} cy={f1(q.y)} r={3} fill={on ? ACCENT : "#2f6fd6"} stroke="#fff" strokeWidth={1} />
            <rect x={f1(q.x - bw / 2)} y={f1(top - 24)} width={bw} height={18} rx={9} fill="#2f6fd6" stroke={on ? "#fff" : "#1d4c99"} strokeWidth={on ? 1.8 : 0.8} />
            <text x={f1(q.x)} y={f1(top - 11.5)} fontSize={10.5} fontWeight={600} textAnchor="middle" fill="#fff" fontFamily="var(--font-ui)">
              {s}
            </text>
          </g>
        );
      }
      case "tag": {
        const q = P(it.pts[0], z);
        const target = typeof it.p.tx === "number" ? P([it.p.tx as number, it.p.ty as number], z) : null;
        const s = label(T("text", "Tag"));
        const bw = Math.max(34, s.length * 6 + 12);
        return (
          <g key={it.id} {...common}>
            {target && <path d={`M${f1(q.x)},${f1(q.y)}L${f1(target.x)},${f1(target.y)}`} stroke={on ? ACCENT : INK} strokeWidth={0.9} />}
            {target && <circle cx={f1(target.x)} cy={f1(target.y)} r={2.4} fill={on ? ACCENT : INK} />}
            <rect x={f1(q.x - bw / 2)} y={f1(q.y - 10)} width={bw} height={18} rx={9} fill="var(--bg-chrome)" stroke={on ? ACCENT : INK} strokeWidth={on ? 1.8 : 1} />
            <text x={f1(q.x)} y={f1(q.y + 3)} fontSize={10} textAnchor="middle" fill={INK} fontFamily="var(--font-ui)">
              {s}
            </text>
          </g>
        );
      }
      case "leader": {
        const [a, b] = it.pts;
        if (!b) return null;
        const d = path([a, b], z, false);
        return (
          <g key={it.id}>
            {line(d, { markerStart: "url(#bs-arrow)" })}
            {text(b, label(T("text", "Note")), { dx: 4, dy: -4 })}
          </g>
        );
      }
      case "elevmark": {
        const q = P(it.pts[0], z);
        return (
          <g key={it.id} {...common}>
            <path d={`M${f1(q.x)},${f1(q.y)}l-6,-10h12z`} fill={on ? ACCENT : INK} />
            <path d={`M${f1(q.x - 6)},${f1(q.y - 10)}h${40}`} stroke={on ? ACCENT : INK} strokeWidth={0.9} />
            {text(it.pts[0], T("text", "EL"), { dx: 9, dy: -13, size: 10 })}
          </g>
        );
      }
      case "detail": {
        const c = it.pts[0];
        const r = dist2(it.pts[0], it.pts[1] ?? it.pts[0]);
        const q = P(c, z);
        return (
          <g key={it.id}>
            {line(path(circlePts(c, r, 48), z, true), { strokeDasharray: "7 4" })}
            <circle cx={f1(q.x)} cy={f1(q.y)} r={9} fill="var(--bg-chrome)" stroke={on ? ACCENT : INK} />
            <text x={f1(q.x)} y={f1(q.y + 3.5)} fontSize={9.5} textAnchor="middle" fill={INK} fontFamily="var(--font-ui)" fontWeight={600}>
              {T("text", "D1")}
            </text>
          </g>
        );
      }
      case "elevline": {
        // an elevation along any line: the line, and at its middle a bubble with the number and an arrow the way it looks
        const [a, b] = it.pts;
        if (!b) return null;
        const A = P(a, z);
        const B = P(b, z);
        const look = it.p.look === -1 ? -1 : 1;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const L = Math.hypot(dx, dy) || 1;
        const m: V2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const M = P(m, z);
        const T2 = P([m[0] + (-dy / L) * look * 3, m[1] + (dx / L) * look * 3], z);
        const ux = T2.x - M.x;
        const uy = T2.y - M.y;
        const ul = Math.hypot(ux, uy) || 1;
        const nx = ux / ul;
        const ny = uy / ul;
        const tip = { x: M.x + nx * 22, y: M.y + ny * 22 };
        return (
          <g key={it.id} data-testid="elev-mark">
            {line(`M${f1(A.x)},${f1(A.y)}L${f1(B.x)},${f1(B.y)}`, { strokeDasharray: "9 3 2 3", strokeWidth: w + 0.4 })}
            <path {...common} d={`M${f1(tip.x)},${f1(tip.y)}L${f1(M.x - ny * 9)},${f1(M.y + nx * 9)}L${f1(M.x + ny * 9)},${f1(M.y - nx * 9)}Z`} fill={on ? ACCENT : INK} />
            <circle {...common} cx={f1(M.x)} cy={f1(M.y)} r={9} fill="var(--bg-chrome)" stroke={on ? ACCENT : INK} strokeWidth={1.4} />
            <text x={f1(M.x)} y={f1(M.y + 3.5)} fontSize={10} textAnchor="middle" fill={INK} fontFamily="var(--font-ui)" fontWeight={700} pointerEvents="none">
              {T("text", "1")}
            </text>
          </g>
        );
      }
      case "elevarc": {
        // a circular elevation: the circle (or the swept arc), arrows looking in, and the number on the radius point
        const c = it.pts[0];
        const rp = it.pts[1] ?? c;
        const r = dist2(c, rp);
        const sweep = typeof it.p.sweep === "number" ? (it.p.sweep as number) : 360;
        const start = Math.atan2(rp[1] - c[1], rp[0] - c[0]);
        const arc: V2[] = [];
        for (let i = 0; i <= 64; i++) {
          const t = start + ((sweep * Math.PI) / 180) * (i / 64);
          arc.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]);
        }
        const arrows = [0.125, 0.375, 0.625, 0.875].map((k) => {
          const t = start + ((sweep * Math.PI) / 180) * k;
          const at = P([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)], z);
          const inn = P([c[0] + (r - 2) * Math.cos(t), c[1] + (r - 2) * Math.sin(t)], z);
          const ux = inn.x - at.x;
          const uy = inn.y - at.y;
          const ul = Math.hypot(ux, uy) || 1;
          const nx = ux / ul;
          const ny = uy / ul;
          return <path key={k} d={`M${f1(at.x + nx * 12)},${f1(at.y + ny * 12)}L${f1(at.x - ny * 5)},${f1(at.y + nx * 5)}L${f1(at.x + ny * 5)},${f1(at.y - nx * 5)}Z`} fill={on ? ACCENT : INK} />;
        });
        const R = P(rp, z);
        const C = P(c, z);
        return (
          <g key={it.id} data-testid="elev-mark">
            {line(path(arc, z, sweep >= 360), { strokeDasharray: "9 3 2 3" })}
            {line(`M${f1(C.x)},${f1(C.y)}L${f1(R.x)},${f1(R.y)}`, { strokeDasharray: "2 3", strokeWidth: 0.8 })}
            {arrows}
            <circle cx={f1(C.x)} cy={f1(C.y)} r={2.5} fill={on ? ACCENT : INK} />
            <circle {...common} cx={f1(R.x)} cy={f1(R.y)} r={9} fill="var(--bg-chrome)" stroke={on ? ACCENT : INK} strokeWidth={1.4} />
            <text x={f1(R.x)} y={f1(R.y + 3.5)} fontSize={10} textAnchor="middle" fill={INK} fontFamily="var(--font-ui)" fontWeight={700} pointerEvents="none">
              {T("text", "1")}
            </text>
          </g>
        );
      }
      case "secmark":
      case "gridline": {
        const [a, b] = it.pts;
        if (!b) return null;
        const A = P(a, z);
        const B = P(b, z);
        const s = T("text", "A");
        const dash = it.kind === "gridline" ? "14 4 2 4" : "10 4";
        const bubble = (q: { x: number; y: number }, o: { x: number; y: number }) => {
          const l = Math.hypot(q.x - o.x, q.y - o.y) || 1;
          const cx = q.x + ((q.x - o.x) / l) * 11;
          const cy = q.y + ((q.y - o.y) / l) * 11;
          return (
            <g>
              <circle cx={f1(cx)} cy={f1(cy)} r={9} fill="var(--bg-chrome)" stroke={on ? ACCENT : INK} strokeWidth={it.kind === "secmark" ? 1.6 : 1} />
              <text x={f1(cx)} y={f1(cy + 3.5)} fontSize={10} textAnchor="middle" fill={INK} fontFamily="var(--font-ui)" fontWeight={600}>
                {s}
              </text>
            </g>
          );
        };
        // a section made by the Section View tool shows which way it looks: a filled arrow at each end
        const look = it.kind === "secmark" && typeof it.p.lx === "number" ? P([a[0] + (it.p.lx as number) * 2.5, a[1] + (it.p.ly as number) * 2.5], z) : null;
        const arrow = (q: { x: number; y: number }) => {
          if (!look) return null;
          const dx = look.x - A.x;
          const dy = look.y - A.y;
          const l = Math.hypot(dx, dy) || 1;
          const ux = dx / l;
          const uy = dy / l;
          return <path d={`M${f1(q.x + ux * 16)},${f1(q.y + uy * 16)}L${f1(q.x - uy * 6)},${f1(q.y + ux * 6)}L${f1(q.x + uy * 6)},${f1(q.y - ux * 6)}Z`} fill={on ? ACCENT : INK} />;
        };
        return (
          <g key={it.id}>
            {line(`M${f1(A.x)},${f1(A.y)}L${f1(B.x)},${f1(B.y)}`, { strokeDasharray: dash, strokeWidth: it.kind === "secmark" ? w + 0.8 : w })}
            {arrow(A)}
            {arrow(B)}
            {bubble(A, B)}
            {bubble(B, A)}
          </g>
        );
      }
      case "dim": {
        const [a, b] = it.pts;
        if (!b) return null;
        const off = typeof it.p.off === "number" ? (it.p.off as number) : 2;
        const n = perp2(unit2(sub2(b, a)));
        const a2: V2 = [a[0] + n[0] * off, a[1] + n[1] * off];
        const b2: V2 = [b[0] + n[0] * off, b[1] + n[1] * off];
        const A = P(a, z);
        const B = P(b, z);
        const A2 = P(a2, z);
        const B2 = P(b2, z);
        const mx = (A2.x + B2.x) / 2;
        const my = (A2.y + B2.y) / 2;
        const s = typeof it.p.text === "string" && it.p.text ? (it.p.text as string) : fmt(dist2(a, b));
        const tw = s.length * 6 + 10;
        const d = `M${f1(A.x)},${f1(A.y)}L${f1(A2.x)},${f1(A2.y)}M${f1(B.x)},${f1(B.y)}L${f1(B2.x)},${f1(B2.y)}M${f1(A2.x)},${f1(A2.y)}L${f1(B2.x)},${f1(B2.y)}`;
        return (
          <g key={it.id}>
            {line(d, { strokeWidth: on ? 1.6 : 0.9 })}
            <circle cx={f1(A2.x)} cy={f1(A2.y)} r={2.2} fill={on ? ACCENT : INK} />
            <circle cx={f1(B2.x)} cy={f1(B2.y)} r={2.2} fill={on ? ACCENT : INK} />
            <rect x={f1(mx - tw / 2)} y={f1(my - 8)} width={tw} height={14} rx={2} fill="var(--bg-viewport)" fillOpacity={0.9} />
            <text x={f1(mx)} y={f1(my + 3)} fontSize={10} textAnchor="middle" fill={on ? ACCENT : INK} fontFamily="var(--font-data)">
              {s}
            </text>
          </g>
        );
      }
      case "image": {
        const q = P(it.pts[0], z);
        const w = (typeof it.p.w === "number" ? (it.p.w as number) : 4) * proj.scale;
        const h = (typeof it.p.h === "number" ? (it.p.h as number) : 3) * proj.scale;
        // a photo made of map tiles (Site from the Map): each tile at its own place, relative to the first point
        const tiles = typeof it.p.tiles === "string" ? (JSON.parse(it.p.tiles as string) as [string, number, number, number, number][]) : null;
        // the photo lies flat on the plan: it is not drawn in the 3D view
        if (tiles && !levels) return null;
        return (
          <g key={it.id} {...common} data-testid={tiles ? "aerial-photo" : undefined}>
            {typeof it.p.src === "string" && <image href={it.p.src as string} x={f1(q.x)} y={f1(q.y - h)} width={f1(w)} height={f1(h)} preserveAspectRatio="none" />}
            {tiles?.map(([url, tx, ty, tw, th]) => {
              const t = P([it.pts[0][0] + tx, it.pts[0][1] + ty], z);
              return <image key={url} href={url} x={f1(t.x)} y={f1(t.y - th * proj.scale)} width={f1(tw * proj.scale + 0.6)} height={f1(th * proj.scale + 0.6)} preserveAspectRatio="none" opacity={0.85} />;
            })}
            {(it.p.frame !== false || on) && <rect x={f1(q.x)} y={f1(q.y - h)} width={f1(w)} height={f1(h)} fill={tiles ? "#000" : "none"} fillOpacity={0} stroke={on ? ACCENT : DIM} strokeWidth={on ? 1.8 : 0.8} />}
          </g>
        );
      }
      default:
        return null;
    }
  };

  const order = (it: DrawnItem) => (it.kind === "hatch" ? 0 : it.kind === "room" ? 1 : it.kind === "image" ? 2 : 3);
  // grips: every point of every selected drawn item (wall ends, corners, line ends …) can be dragged
  const grips = selection
    .map((id) => scene.items?.[id])
    .filter((it): it is DrawnItem => !!it && it.pts.length > 0 && it.kind !== "framing" && it.kind !== "truss" && it.kind !== "clone" && !hidden.has(it.id) && (!levels || levels.includes(it.level)));
  const foundations = levels ? Object.values(scene.items ?? {}).filter((it) => it.kind === "foundation" && it.pts.length > 2 && !hidden.has(it.id) && layerVis.foundation !== false) : [];

  return (
    <g fontFamily="var(--font-ui)" data-testid="draft-layer">
      <defs>
        <pattern id="bs-hatch-diag" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--vp-ink)" strokeWidth="0.9" strokeOpacity="0.7" />
        </pattern>
        <pattern id="bs-hatch-cross" width="7" height="7" patternUnits="userSpaceOnUse">
          <path d="M0,0H7M0,0V7" stroke="var(--vp-ink)" strokeWidth="0.7" strokeOpacity="0.7" fill="none" />
        </pattern>
        <pattern id="bs-hatch-dots" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="0.9" fill="var(--vp-ink)" fillOpacity="0.8" />
        </pattern>
      </defs>

      {foundations.map((it) => (
        <path key={`fd-${it.id}`} d={path(it.pts, it.z, true)} fill="none" stroke={DIM} strokeWidth={1} strokeDasharray="6 3" pointerEvents="none" />
      ))}

      {[...items].sort((a, b) => order(a) - order(b)).map(mark)}

      {grips.map((it) => (
        <g key={`g-${it.id}`}>
          {it.pts.map((q, i) => {
            const s = P(q, it.z);
            return <rect key={i} data-grip={`${it.id}:${i}`} data-testid="grip" x={f1(s.x - 4)} y={f1(s.y - 4)} width={8} height={8} fill={ACCENT} stroke="#fff" strokeWidth={1} style={{ cursor: "move" }} />;
          })}
        </g>
      ))}

      {measure && (
        <g pointerEvents="none">
          {measure.pts.length > 1 && <path d={path(measure.pts, 0, !!measure.closed)} fill={measure.closed ? "#3ecf8e" : "none"} fillOpacity={0.12} stroke="#3ecf8e" strokeWidth={1.6} strokeDasharray="6 3" />}
          {measure.pts.map((q, i) => {
            const s = P(q, 0);
            return <circle key={i} cx={f1(s.x)} cy={f1(s.y)} r={3.2} fill="#3ecf8e" stroke="#fff" strokeWidth={1} />;
          })}
          {(() => {
            const last = measure.pts[measure.pts.length - 1] ?? [0, 0];
            const s = P(measure.closed ? polyCentroid(measure.pts) : last, 0);
            const text = `${measure.title}: ${measure.text}`;
            const tw = Math.min(520, text.length * 6.1 + 14);
            return (
              <g>
                <rect x={f1(s.x + 8)} y={f1(s.y - 24)} width={tw} height={20} rx={4} fill="#10141b" fillOpacity={0.92} stroke="#3ecf8e" strokeWidth={0.9} />
                <text x={f1(s.x + 14)} y={f1(s.y - 10)} fontSize={10.5} fill="#e7eaef" fontFamily="var(--font-data)">
                  {text.length > 85 ? `${text.slice(0, 83)}…` : text}
                </text>
              </g>
            );
          })()}
        </g>
      )}

      {preview && (
        <g pointerEvents="none">
          {preview.shapes.map((sh, i) => {
            if (sh.pts.length < 2) return null;
            const col = sh.tone === "measure" ? "#3ecf8e" : sh.tone === "ghost" ? ACCENT : INK;
            return <path key={i} d={path(sh.pts, 0, !!sh.closed)} fill={sh.fill ? ACCENT : "none"} fillOpacity={0.12} stroke={col} strokeWidth={1.4} strokeDasharray={sh.dashed || sh.tone === "ghost" ? "5 3" : undefined} strokeLinejoin="round" />;
          })}
          {preview.labels.map((l, i) => {
            const s = P(l.at, 0);
            const tw = l.text.length * 6.2 + 10;
            return (
              <g key={i}>
                <rect x={f1(s.x - tw / 2)} y={f1(s.y - 22)} width={tw} height={16} rx={3} fill="#10141b" fillOpacity={0.88} />
                <text x={f1(s.x)} y={f1(s.y - 10)} fontSize={10} textAnchor="middle" fill="#e7eaef" fontFamily="var(--font-data)">
                  {l.text}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {snap && snap.kind !== "none" && snap.kind !== "grid" && <SnapMarker P={P} snap={snap} fmt={fmt} />}
    </g>
  );
});

const SNAP_LABEL: Record<string, string> = {
  endpoint: "Endpoint",
  midpoint: "Midpoint",
  center: "Center",
  intersection: "Intersection",
  perpendicular: "Perpendicular",
  nearest: "Nearest",
  track: "Tracking",
  ortho: "Ortho",
  polar: "Polar",
};

/** The AutoCAD snap marker at the snapped point, its name, and the dotted guide lines it follows. */
function SnapMarker({ P, snap, fmt }: { P: (pt: V2, z: number) => { x: number; y: number }; snap: NonNullable<DraftProps["snap"]>; fmt: (ft: number) => string }) {
  const s = P(snap.pt, 0);
  const x = f1(s.x);
  const y = f1(s.y);
  const k = snap.kind;
  const glyph =
    k === "endpoint" ? <rect x={x - 5} y={y - 5} width={10} height={10} />
    : k === "midpoint" ? <path d={`M${x - 6},${y + 4.5}h12l-6,-10.5z`} />
    : k === "center" ? <circle cx={x} cy={y} r={5.5} />
    : k === "intersection" ? <path d={`M${x - 5},${y - 5}l10,10M${x + 5},${y - 5}l-10,10`} strokeWidth={2} />
    : k === "perpendicular" ? <path d={`M${x - 6},${y + 6}h12M${x - 6},${y + 6}v-12M${x - 6},${y}h6v6`} />
    : k === "nearest" ? <path d={`M${x - 5},${y - 5}h10l-10,10h10z`} />
    : <path d={`M${x - 4},${y}h8M${x},${y - 4}v8`} strokeWidth={1.4} />;
  let name = SNAP_LABEL[k] ?? k;
  const g = snap.guides?.[0];
  if ((k === "ortho" || k === "polar" || k === "track") && g) {
    const dx = g[1][0] - g[0][0];
    const dy = g[1][1] - g[0][1];
    const a = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360);
    name = `${name}: ${fmt(Math.hypot(dx, dy))} < ${a}°`;
  }
  const tw = name.length * 6.1 + 12;
  return (
    <g pointerEvents="none" data-testid="snap-marker" data-kind={k}>
      {snap.guides?.map(([a, b], i) => {
        const A = P(a, 0);
        const B = P(b, 0);
        // run the guide on past the cursor, the way AutoCAD's tracking line does
        const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
        const ex = B.x + ((B.x - A.x) / len) * 60;
        const ey = B.y + ((B.y - A.y) / len) * 60;
        return <path key={i} d={`M${f1(A.x)},${f1(A.y)}L${f1(ex)},${f1(ey)}`} stroke="#3ecf8e" strokeWidth={1} strokeDasharray="2 4" fill="none" />;
      })}
      {snap.guides?.map(([a], i) => {
        const A = P(a, 0);
        return <path key={`t${i}`} d={`M${f1(A.x - 3)},${f1(A.y)}h6M${f1(A.x)},${f1(A.y - 3)}v6`} stroke="#3ecf8e" strokeWidth={1.2} />;
      })}
      <g stroke="#f0c63c" strokeWidth={1.6} fill="none">
        {glyph}
      </g>
      <rect x={x + 10} y={y - 28} width={tw} height={16} rx={3} fill="#10141b" fillOpacity={0.9} stroke="#f0c63c" strokeOpacity={0.6} strokeWidth={0.8} />
      <text x={x + 16} y={y - 16.5} fontSize={10} fill="#f0c63c" fontFamily="var(--font-data)" data-testid="snap-name">
        {name}
      </text>
    </g>
  );
}

/** The layer each flat kind lives on (used to hide marks with their layer). */
const META_LAYER: Partial<Record<DrawnItem["kind"], LayerId>> = {
  line: "drafting", polyline: "drafting", spline: "drafting", arc: "drafting", rect: "drafting", circle: "drafting", hatch: "drafting", room: "drafting",
  text: "annotation", note: "annotation", dim: "annotation", leader: "annotation", tag: "annotation", secmark: "annotation", elevmark: "annotation",
  detail: "annotation", gridline: "annotation", markup: "annotation", pin: "annotation", label: "annotation", image: "annotation",
  elevline: "annotation", elevarc: "annotation",
};
