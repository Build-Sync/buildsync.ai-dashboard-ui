/**
 * components/workspace/Viewport/Overlays.tsx
 *
 * WHAT   The SVG layers drawn on top of the model: shared defs (hatch, arrow marker, stress gradient),
 *        selection and hover outlines with grips, stress heat spots and legend, simulation vectors, the solar
 *        path, section callouts, 2D plan annotations (door swings, dimensions, grid bubbles, room labels), buried
 *        utilities (the septic tank and drain field, dashed with their names), room
 *        names standing up in the 3D view (RoomLabels3D, with the Labels switch), the markers of the other rooms in
 *        a room view (RoomMarkers), furniture names (FurnitureLabels), the north arrow and the UCS icon.
 * FOR    ModelViewport and SheetView render these inside their SVG. Most receive the scene and the projector, so
 *        they follow the camera; they handle no input themselves (pointer-events are off), except that room names
 *        and room markers carry data-room, which ModelViewport reads on a click or double-click to go into a room.
 * DEBUG  - An overlay is missing: each is switched on by its workspace state (stressOverlay, simVectors, solar,
 *          section …) in ModelViewport.
 *        - Overlay colours look wrong on a sheet: they read --vp-ink / --vp-ink-dim set by the sheet or the
 *          theme.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { memo } from "react";
import { OWN_BUILDING } from "@/lib/draw/interior";
import type { Projector } from "@/lib/scene/camera";
import { elementOutline, stressColor, STRESS_GRADIENT, STRESS_MAX } from "@/lib/scene/render";
import { sunAltAz } from "@/lib/scene/sun";
import type { Callout, LevelKey, Scene, V2, V3 } from "@/lib/scene/types";
import type { SimResult, StressResult } from "@/lib/services/analysis";
import { clamp, rad } from "@/lib/utils";

const f1 = (n: number) => Math.round(n * 10) / 10;

/* ── shared SVG defs ──────────────────────────────────────────────────── */
export function ViewportDefs() {
  return (
    <defs>
      <pattern id="bs-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: "var(--vp-ink)" }} strokeWidth="0.8" strokeOpacity="0.6" />
      </pattern>
      {/* the glow of a lit light, and the shading of tree and bush foliage (lib/scene/render.ts) */}
      <radialGradient id="bs-glow">
        <stop offset="0" stopColor="#fff3c4" stopOpacity="0.75" />
        <stop offset="0.35" stopColor="#ffd77a" stopOpacity="0.35" />
        <stop offset="1" stopColor="#ffd77a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="bs-leaf" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stopColor="#6fb35f" />
        <stop offset="0.55" stopColor="#3f8a4e" />
        <stop offset="1" stopColor="#245a33" />
      </radialGradient>
      <radialGradient id="bs-leaf-dark" cx="0.35" cy="0.3" r="0.85">
        <stop offset="0" stopColor="#4f9a54" />
        <stop offset="1" stopColor="#1d4a2a" />
      </radialGradient>
      <radialGradient id="bs-pine" cx="0.4" cy="0.25" r="0.9">
        <stop offset="0" stopColor="#3f7d4a" />
        <stop offset="1" stopColor="#173f26" />
      </radialGradient>
      <radialGradient id="bs-bush" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stopColor="#7cbf62" />
        <stop offset="0.6" stopColor="#4a9248" />
        <stop offset="1" stopColor="#2a6233" />
      </radialGradient>
      {/* the ground's textures (lib/ground.ts GroundPattern), drawn over its surface colour */}
      <pattern id="bs-ground-grass" width="12" height="12" patternUnits="userSpaceOnUse">
        <path d="M2 10l1-4M5 11l-.6-4.4M9 9.5l1.4-3.6M7 4l.8-3M11 3.5l-.7-2.6" stroke="#1d3a22" strokeOpacity="0.55" strokeWidth="0.7" strokeLinecap="round" />
        <path d="M3.5 10.5l-.4-3M10 10l.3-2.8" stroke="#9fd38a" strokeOpacity="0.35" strokeWidth="0.6" strokeLinecap="round" />
      </pattern>
      <pattern id="bs-ground-speckle" width="10" height="10" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="3" r="0.7" fill="#3b2a1b" fillOpacity="0.6" />
        <circle cx="7" cy="7.5" r="0.9" fill="#3b2a1b" fillOpacity="0.45" />
        <circle cx="8" cy="2" r="0.5" fill="#e9d7b8" fillOpacity="0.5" />
        <circle cx="3.5" cy="8" r="0.45" fill="#e9d7b8" fillOpacity="0.45" />
      </pattern>
      <pattern id="bs-ground-clods" width="14" height="14" patternUnits="userSpaceOnUse">
        <path d="M1 4c2 1.2 3.4-.8 5.5.4M8 10c1.6-1 3 .9 5 .1M3 12.5c.8-1.4 2.2-.9 3-2" stroke="#4a2914" strokeOpacity="0.55" strokeWidth="0.75" fill="none" strokeLinecap="round" />
        <ellipse cx="10" cy="4" rx="1.6" ry="1" fill="#5b3420" fillOpacity="0.35" />
      </pattern>
      <pattern id="bs-ground-loam" width="9" height="9" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="2" r="0.6" fill="#1f150c" fillOpacity="0.6" />
        <circle cx="6" cy="5.5" r="0.75" fill="#1f150c" fillOpacity="0.5" />
        <circle cx="4" cy="8" r="0.4" fill="#c9a77d" fillOpacity="0.55" />
        <path d="M6.5 1.5l1.4.6" stroke="#c9a77d" strokeOpacity="0.4" strokeWidth="0.5" />
      </pattern>
      <pattern id="bs-ground-sand" width="6" height="6" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1.5" r="0.35" fill="#6d5634" fillOpacity="0.55" />
        <circle cx="4" cy="3" r="0.3" fill="#6d5634" fillOpacity="0.45" />
        <circle cx="2.5" cy="5" r="0.35" fill="#fff4dc" fillOpacity="0.6" />
        <circle cx="5.2" cy="5.4" r="0.25" fill="#6d5634" fillOpacity="0.4" />
      </pattern>
      <pattern id="bs-ground-gravel" width="12" height="12" patternUnits="userSpaceOnUse">
        <ellipse cx="3" cy="3" rx="1.8" ry="1.3" fill="#d8d3cc" fillOpacity="0.45" stroke="#4d4740" strokeOpacity="0.5" strokeWidth="0.5" />
        <ellipse cx="9" cy="8" rx="1.5" ry="1.1" fill="#d8d3cc" fillOpacity="0.4" stroke="#4d4740" strokeOpacity="0.5" strokeWidth="0.5" />
        <ellipse cx="4" cy="9.5" rx="1" ry="0.8" fill="#4d4740" fillOpacity="0.35" />
      </pattern>
      <pattern id="bs-ground-rock" width="18" height="18" patternUnits="userSpaceOnUse">
        <path d="M0 6l5 1.5 4-2.5 5 1 4-1M3 18l2-5 6-2 3 3 4-1M9 5l1 6" stroke="#4f4a41" strokeOpacity="0.5" strokeWidth="0.7" fill="none" strokeLinejoin="round" />
      </pattern>
      <marker id="bs-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0 0 10 5 0 10z" fill="context-stroke" />
      </marker>
      <linearGradient id="bs-stress-grad" x1="0" y1="1" x2="0" y2="0">
        {STRESS_GRADIENT.map(([o, c]) => (
          <stop key={o} offset={o} stopColor={c} />
        ))}
      </linearGradient>
    </defs>
  );
}

/* ── selection / hover outlines + grips ───────────────────────────────── */
export const SelectionOverlay = memo(function SelectionOverlay({ scene, proj, selection, hover, noGrips }: { scene: Scene; proj: Projector; selection: string[]; hover: string | null; noGrips?: Record<string, unknown> }) {
  const many = selection.length > 12;
  return (
    <g pointerEvents="none">
      {hover && !selection.includes(hover) && scene.elementById[hover] && (
        <polygon
          points={elementOutline(scene.elementById[hover], proj).hull.map((p) => `${f1(p[0])},${f1(p[1])}`).join(" ")}
          fill="var(--accent)"
          fillOpacity={0.08}
          stroke="var(--accent)"
          strokeOpacity={0.75}
          strokeWidth={1}
        />
      )}
      {!many &&
        selection.map((id) => {
          const el = scene.elementById[id];
          if (!el) return null;
          const o = elementOutline(el, proj);
          return (
            <g key={id}>
              <polygon points={o.hull.map((p) => `${f1(p[0])},${f1(p[1])}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth={1.4} strokeDasharray="5 3" className="anim-march" />
              {/* drawn elements show their own point grips instead (DraftLayer) */}
              {!noGrips?.[id] &&
                o.grips.map((g, i) => <rect key={i} x={g[0] - 2.8} y={g[1] - 2.8} width={5.6} height={5.6} fill="var(--accent)" stroke="#fff" strokeWidth={0.8} />)}
            </g>
          );
        })}
    </g>
  );
});

/* ── stress heat-spots ────────────────────────────────────────────────── */
export const StressSpots = memo(function StressSpots({ scene, proj, result, sectionY }: { scene: Scene; proj: Projector; result: StressResult; sectionY: number | null }) {
  const r = clamp(proj.scale * 3.4, 12, 42);
  return (
    <g pointerEvents="none">
      <defs>
        {scene.stress.map((sp) => {
          const c = stressColor(result.points[sp.id] ?? sp.ksi);
          return (
            <radialGradient key={sp.id} id={`sg-${sp.id}`}>
              <stop offset="0" stopColor={c} stopOpacity="0.95" />
              <stop offset="0.45" stopColor={c} stopOpacity="0.5" />
              <stop offset="1" stopColor={c} stopOpacity="0" />
            </radialGradient>
          );
        })}
      </defs>
      {scene.stress.map((sp) => {
        if (sectionY !== null && sp.at[1] < sectionY) return null;
        const q = proj.project(sp.at);
        const ksi = result.points[sp.id] ?? sp.ksi;
        const focus = result.setup.elementId === "all" || sp.elementId === result.setup.elementId;
        return (
          <g key={sp.id} opacity={focus ? 1 : 0.55}>
            <circle cx={q.x} cy={q.y} r={r} fill={`url(#sg-${sp.id})`} style={{ mixBlendMode: "screen" }} />
            {ksi > 3.4 && (
              <g>
                <rect x={q.x + 8} y={q.y - 20} width={46} height={14} rx={3} fill="#10141b" fillOpacity={0.88} stroke={stressColor(ksi)} strokeWidth={0.8} />
                <text x={q.x + 31} y={q.y - 10} textAnchor="middle" fontSize={9} fontFamily="var(--font-data)" fill="#fff">
                  {ksi.toFixed(1)} ksi
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
});

/** Colour scale for the stress overlay, in ksi. */
export function StressLegend() {
  return (
    <div className="pointer-events-none absolute bottom-16 left-3 z-10 flex items-stretch gap-1.5 rounded-md border border-line bg-chrome/90 px-2 py-1.5 backdrop-blur">
      <div className="w-2.5 rounded-sm" style={{ background: "linear-gradient(to top,#2f6bff,#21c5d6,#3ecf8e,#f0c63c,#ef4a4a)", height: "7rem" }} />
      <div className="mono flex flex-col justify-between text-[0.5625rem] text-t2">
        <span>{STRESS_MAX.toFixed(1)} ksi</span>
        <span>3.6</span>
        <span>2.4</span>
        <span>1.2</span>
        <span>0</span>
      </div>
      <span className="label-xs self-end [writing-mode:vertical-rl]">Stress</span>
    </div>
  );
}

/* ── simulation vectors ───────────────────────────────────────────────── */
export const SimVectors = memo(function SimVectors({ scene, proj, result }: { scene: Scene; proj: Projector; result: SimResult }) {
  const { type, direction, intensity } = result.setup;
  const f = scene.footprint;
  const cx = (f.x0 + f.x1) / 2;
  const cy = (f.y0 + f.y1) / 2;
  const els: React.ReactNode[] = [];

  if (type === "hurricane") {
    // wind blows FROM `direction`, so it travels towards direction+180
    const b = rad(direction);
    const dx = -Math.sin(b);
    const dy = -Math.cos(b);
    const px = -dy;
    const py = dx;
    let n = 0;
    for (let row = -4; row <= 4; row++) {
      for (const z of [3, 11, 20, 27]) {
        const off = row * 8;
        const start: V3 = [cx - dx * 46 + px * off, cy - dy * 46 + py * off, z];
        const end: V3 = [start[0] + dx * 22, start[1] + dy * 22, z];
        const a = proj.project(start);
        const e = proj.project(end);
        els.push(
          <path key={n++} d={`M${f1(a.x)},${f1(a.y)}L${f1(e.x)},${f1(e.y)}`} stroke="#5ec8ff" strokeWidth={1.4} strokeOpacity={0.75} markerEnd="url(#bs-arrow)" strokeDasharray="6 4" className="anim-march" />,
        );
      }
    }
    if (result.roofUplift) {
      // uplift arrows along the windward eave
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const wx = direction >= 180 ? f.x0 - 1.5 : f.x1 + 1.5;
        const p0 = proj.project([wx, f.y0 + t * (f.y1 - f.y0), 19.8]);
        const p1 = proj.project([wx, f.y0 + t * (f.y1 - f.y0), 19.8 + 4 + (result.breachRisk / 100) * 5]);
        els.push(<path key={`u${i}`} d={`M${f1(p0.x)},${f1(p0.y)}L${f1(p1.x)},${f1(p1.y)}`} stroke={result.breachRisk > 40 ? "#ef5b5b" : "#f0a940"} strokeWidth={2} markerEnd="url(#bs-arrow)" />);
      }
    }
  } else if (type === "flood") {
    const depth = intensity;
    const poly = [[-26, -30], [50, -30], [50, 62], [-26, 62]].map(([x, y]) => proj.project([x, y, scene.grade + depth]));
    els.push(<polygon key="w" points={poly.map((p) => `${f1(p.x)},${f1(p.y)}`).join(" ")} fill="#3aa0ff" fillOpacity={0.28} stroke="#7fc4ff" strokeOpacity={0.7} strokeWidth={1} />);
    for (let i = 0; i < 6; i++) {
      const y = -20 + i * 14;
      const a = proj.project([-20, y, scene.grade + depth + 0.05]);
      const b2 = proj.project([44, y, scene.grade + depth + 0.05]);
      els.push(<path key={`wl${i}`} d={`M${f1(a.x)},${f1(a.y)}L${f1(b2.x)},${f1(b2.y)}`} stroke="#bfe3ff" strokeOpacity={0.35} strokeDasharray="10 8" className="anim-march" />);
    }
  } else if (type === "seismic") {
    for (let i = 1; i <= 4; i++) {
      const pts: string[] = [];
      for (let k = 0; k <= 40; k++) {
        const a = (k / 40) * Math.PI * 2;
        const q = proj.project([cx + Math.cos(a) * (14 + i * 8), cy + Math.sin(a) * (16 + i * 8), scene.grade + 0.05]);
        pts.push(`${f1(q.x)},${f1(q.y)}`);
      }
      els.push(<polyline key={i} points={pts.join(" ")} fill="none" stroke="#f0a940" strokeOpacity={0.6 - i * 0.1} strokeWidth={1.4} strokeDasharray="4 4" className="anim-march" />);
    }
  } else if (type === "fire") {
    const q = proj.project([19.5, 27, 5]);
    for (let i = 0; i < 3; i++) els.push(<circle key={i} cx={q.x} cy={q.y} r={14 + i * 10} fill="#ff7a2f" fillOpacity={0.22 - i * 0.05} className="anim-pulse" />);
  }
  return <g pointerEvents="none">{els}</g>;
});

/* ── solar path ───────────────────────────────────────────────────────── */
export const SolarPath = memo(function SolarPath({ scene, proj, hour }: { scene: Scene; proj: Projector; hour: number }) {
  const f = scene.footprint;
  const c: V2 = [(f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2];
  const R = 58;
  const pt = (h: number): V3 => {
    const { alt, az } = sunAltAz(h);
    return [c[0] + Math.sin(rad(az)) * Math.cos(rad(alt)) * R, c[1] + Math.cos(rad(az)) * Math.cos(rad(alt)) * R, 6 + Math.sin(rad(alt)) * R * 0.75];
  };
  const hours = Array.from({ length: 13 }, (_, i) => 6 + i);
  const path = hours.map((h, i) => {
    const q = proj.project(pt(h));
    return `${i ? "L" : "M"}${f1(q.x)},${f1(q.y)}`;
  });
  const now = proj.project(pt(hour));
  return (
    <g pointerEvents="none">
      <path d={path.join("")} fill="none" stroke="#ffd34d" strokeWidth={1.4} strokeDasharray="5 4" strokeOpacity={0.85} />
      {hours.map((h) => {
        const q = proj.project(pt(h));
        return (
          <g key={h}>
            <circle cx={q.x} cy={q.y} r={2.2} fill="#ffd34d" />
            {h % 3 === 0 && (
              <text x={q.x + 5} y={q.y - 5} fontSize={9} fill="#ffd34d" fontFamily="var(--font-data)">
                {h}:00
              </text>
            )}
          </g>
        );
      })}
      <circle cx={now.x} cy={now.y} r={7} fill="#ffd34d" stroke="#fff" strokeWidth={1.2} />
    </g>
  );
});

/* ── callouts (section view) ──────────────────────────────────────────── */
export const Callouts = memo(function Callouts({ callouts, proj, sectionY }: { callouts: Callout[]; proj: Projector; sectionY: number | null }) {
  return (
    <g pointerEvents="none">
      {callouts.map((c) => {
        if (sectionY !== null && c.at[1] < sectionY - 0.5) return null;
        const a = proj.project(c.at);
        const x = a.x + c.dx;
        const y = a.y + c.dy;
        const w = Math.max(c.text.length * 5.7, (c.sub?.length ?? 0) * 5.1) + 12;
        const left = c.dx < 0;
        const bx = left ? x - w : x;
        return (
          <g key={c.id}>
            <path d={`M${f1(a.x)},${f1(a.y)}L${f1(x)},${f1(y)}`} stroke="#e7eaef" strokeWidth={0.9} strokeOpacity={0.85} fill="none" />
            <circle cx={a.x} cy={a.y} r={2.6} fill="#e7eaef" stroke="#10141b" strokeWidth={0.8} />
            <rect x={bx} y={y - 12} width={w} height={c.sub ? 27 : 17} rx={3} fill="#10141b" fillOpacity={0.9} stroke="#8a93a3" strokeWidth={0.7} />
            <text x={bx + 6} y={y} fontSize={10} fill="#e7eaef" fontFamily="var(--font-ui)" fontWeight={600}>
              {c.text}
            </text>
            {c.sub && (
              <text x={bx + 6} y={y + 11} fontSize={9} fill="#9aa3b2" fontFamily="var(--font-data)">
                {c.sub}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
});

/* ── plan annotations (2D) ────────────────────────────────────────────── */
export const PlanAnnotations = memo(function PlanAnnotations({ scene, proj, level, showGrid, rooms = true }: { scene: Scene; proj: Projector; level: LevelKey; showGrid: boolean; rooms?: boolean }) {
  const z = 0;
  const P = (x: number, y: number) => proj.project([x, y, z]);
  const ink = "var(--vp-ink)";
  const dim = "var(--vp-ink-dim)";
  return (
    <g pointerEvents="none" fontFamily="var(--font-ui)">
      {/* door swings */}
      {scene.swings
        .filter((s) => s.level === level)
        .map((s) => {
          const pts: string[] = [];
          for (let i = 0; i <= 14; i++) {
            const a = rad(s.a0 + ((s.a1 - s.a0) * i) / 14);
            const q = P(s.hinge[0] + Math.cos(a) * s.radius, s.hinge[1] + Math.sin(a) * s.radius);
            pts.push(`${f1(q.x)},${f1(q.y)}`);
          }
          const h = P(s.hinge[0], s.hinge[1]);
          const a1 = rad(s.a1);
          const a0 = rad(s.a0);
          const end = P(s.hinge[0] + Math.cos(a1) * s.radius, s.hinge[1] + Math.sin(a1) * s.radius);
          const start = P(s.hinge[0] + Math.cos(a0) * s.radius, s.hinge[1] + Math.sin(a0) * s.radius);
          return (
            <g key={s.id} stroke={dim} fill="none" strokeWidth={0.8}>
              <polyline points={pts.join(" ")} strokeDasharray="3 2" />
              <path d={`M${f1(h.x)},${f1(h.y)}L${f1(end.x)},${f1(end.y)}M${f1(h.x)},${f1(h.y)}L${f1(start.x)},${f1(start.y)}`} stroke={ink} strokeWidth={1} strokeOpacity={0.8} />
            </g>
          );
        })}

      {/* dimension strings */}
      {scene.dims
        .filter((d) => d.level === level)
        .map((d) => {
          const dx = d.to[0] - d.from[0];
          const dy = d.to[1] - d.from[1];
          const len = Math.hypot(dx, dy) || 1;
          const nx = (-dy / len) * d.offset;
          const ny = (dx / len) * d.offset;
          const a = P(d.from[0] + nx, d.from[1] + ny);
          const b = P(d.to[0] + nx, d.to[1] + ny);
          const a0 = P(d.from[0], d.from[1]);
          const b0 = P(d.to[0], d.to[1]);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const tw = d.text.length * 5.4 + 8;
          const tick = (p: { x: number; y: number }, q: { x: number; y: number }) => {
            const ux = (q.x - p.x) / (Math.hypot(q.x - p.x, q.y - p.y) || 1);
            const uy = (q.y - p.y) / (Math.hypot(q.x - p.x, q.y - p.y) || 1);
            return `M${f1(p.x - uy * 4 - ux * 3)},${f1(p.y + ux * 4 - uy * 3)}L${f1(p.x + uy * 4 + ux * 3)},${f1(p.y - ux * 4 + uy * 3)}`;
          };
          return (
            <g key={d.id} stroke={ink} strokeOpacity={0.75} strokeWidth={0.8} fill="none">
              <path d={`M${f1(a0.x)},${f1(a0.y)}L${f1(a.x)},${f1(a.y)}M${f1(b0.x)},${f1(b0.y)}L${f1(b.x)},${f1(b.y)}M${f1(a.x)},${f1(a.y)}L${f1(b.x)},${f1(b.y)}${tick(a, b)}${tick(b, a)}`} />
              <rect x={mx - tw / 2} y={my - 7} width={tw} height={13} rx={2} fill="var(--bg-viewport)" fillOpacity={0.85} stroke="none" />
              <text x={mx} y={my + 3} textAnchor="middle" fontSize={9.5} fill={ink} stroke="none" fontFamily="var(--font-data)">
                {d.text}
              </text>
            </g>
          );
        })}

      {/* structural grid bubbles */}
      {showGrid &&
        scene.grid.map((g) => {
          const q = P(g.at[0], g.at[1]);
          const vertical = /[A-Z]/.test(g.label);
          const f = scene.footprint;
          const far = vertical ? P(g.at[0], f.y1 + 4) : P(f.x1 + 4, g.at[1]);
          return (
            <g key={g.id}>
              <path d={`M${f1(q.x)},${f1(q.y)}L${f1(far.x)},${f1(far.y)}`} stroke={dim} strokeWidth={0.6} strokeDasharray="10 4 2 4" strokeOpacity={0.7} />
              <circle cx={q.x} cy={q.y} r={9} fill="var(--bg-viewport)" stroke={ink} strokeWidth={1} />
              <text x={q.x} y={q.y + 3.5} textAnchor="middle" fontSize={10} fontWeight={600} fill={ink} fontFamily="var(--font-data)">
                {g.label}
              </text>
            </g>
          );
        })}

      {/* room labels */}
      {scene.rooms
        .filter((r) => rooms && r.level === level)
        .map((r) => {
          const q = P(r.at[0], r.at[1]);
          return (
            <g key={r.id} textAnchor="middle" fill={ink} pointerEvents="visiblePainted" cursor="pointer" data-room={r.id} data-testid="room-label-2d">
              <title>{`${r.name}: double-click to stand inside it`}</title>
              <text x={q.x} y={q.y} fontSize={9.5} fontWeight={600} letterSpacing="0.06em">
                {r.name}
              </text>
              <text x={q.x} y={q.y + 11} fontSize={8.5} fill={dim} fontFamily="var(--font-data)">
                {r.area} sf
              </text>
            </g>
          );
        })}
    </g>
  );
});

/**
 * What lies buried on the site (the septic tank, the drain field trenches, the distribution box), drawn as dashed
 * outlines with their names, as site and floor plans show them. `outlines` false keeps only the names (the foundation
 * plan already draws the outlines).
 */
export const UtilityMarks = memo(function UtilityMarks({ scene, proj, outlines = true, paper = false }: { scene: Scene; proj: Projector; outlines?: boolean; paper?: boolean }) {
  const ink = paper ? "#6b5742" : "#c9b27c";
  const halo = paper ? "#fff" : "var(--bg-viewport)";
  const buried = scene.prisms.filter((p) => p.layer === "utilities" && p.underground && p.axis === "z");
  if (!buried.length) return null;
  const named = scene.elements.filter((e) => e.layer === "utilities" && e.min[2] < scene.grade - 0.3 && Math.max(e.max[0] - e.min[0], e.max[1] - e.min[1]) > 3);
  return (
    <g pointerEvents="none" data-testid="utility-marks">
      {outlines &&
        buried.map((p) => (
          <polygon key={p.key} points={p.poly.map(([x, y]) => proj.project([x, y, 0])).map((q) => `${f1(q.x)},${f1(q.y)}`).join(" ")} fill={ink} fillOpacity={0.07} stroke={ink} strokeWidth={1} strokeDasharray="5 3" />
        ))}
      {named.map((e) => {
        const q = proj.project([(e.min[0] + e.max[0]) / 2, (e.min[1] + e.max[1]) / 2, 0]);
        return (
          <text key={e.id} x={f1(q.x)} y={f1(q.y + 3)} textAnchor="middle" fontSize={8.5} fontWeight={600} letterSpacing="0.04em" fill={ink} stroke={halo} strokeWidth={2.5} paintOrder="stroke" fontFamily="var(--font-ui)" data-testid="utility-label">
            {e.name.split(" · ")[0].toUpperCase()}
          </text>
        );
      })}
    </g>
  );
});

/**
 * Room names in the 3D view: each name on a stem above its floor, nearer ones drawn last and stronger. A double-click on
 * a name stands you inside that room (the room view). Names that would
 * overlap climb their stem (nearest rooms first); one with no free spot is left out until the view turns. Rooms on the
 * removed side of a section cut, and on levels the plan levels leave out, are skipped.
 */
export const RoomLabels3D = memo(function RoomLabels3D({ scene, proj, cutY, levels }: { scene: Scene; proj: Projector; cutY: number | null; levels?: ReadonlySet<LevelKey> }) {
  const rows = scene.rooms
    .filter((r) => (cutY === null || r.at[1] >= cutY) && (!levels || levels.has(r.level)))
    .map((r) => {
      const z = scene.levelZ[r.level] ?? 0;
      const foot = proj.project([r.at[0], r.at[1], z + 0.2]);
      return { r, foot, depth: foot.depth };
    })
    .filter(({ depth }) => depth > proj.near)
    .sort((a, b) => b.depth - a.depth);
  if (!rows.length) return null;
  const d0 = rows[rows.length - 1].depth;
  const d1 = rows[0].depth;
  // nearest first: each label takes the lowest free spot on its stem; one that finds none is left out
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const spot = new Map<string, number>();
  for (const { r, foot } of [...rows].reverse()) {
    const w = Math.max(44, r.name.length * 6.2 + 16);
    for (const rise of [26, 46, 66, 86]) {
      const box = { x0: foot.x - w / 2 - 2, x1: foot.x + w / 2 + 2, y0: foot.y - rise - 19, y1: foot.y - rise + 1 };
      if (placed.some((p) => p.x0 < box.x1 && box.x0 < p.x1 && p.y0 < box.y1 && box.y0 < p.y1)) continue;
      placed.push(box);
      spot.set(r.id, rise);
      break;
    }
  }
  return (
    <g pointerEvents="none" fontFamily="var(--font-ui)" data-testid="room-labels-3d">
      {rows.map(({ r, foot, depth }) => {
        const rise = spot.get(r.id);
        if (rise === undefined) return null;
        const far = d1 > d0 ? (depth - d0) / (d1 - d0) : 0;
        const op = 1 - far * 0.45;
        const top = foot.y - rise;
        const w = Math.max(44, r.name.length * 6.2 + 16);
        return (
          <g key={r.id} opacity={op} data-testid="room-label-3d">
            <path d={`M${foot.x.toFixed(1)},${foot.y.toFixed(1)}V${top.toFixed(1)}`} stroke="var(--vp-ink-dim)" strokeWidth={1} />
            <circle cx={foot.x} cy={foot.y} r={2} fill="var(--vp-ink-dim)" />
            <rect x={foot.x - w / 2} y={top - 17} width={w} height={17} rx={3} fill="var(--bg-chrome)" fillOpacity={0.9} stroke="var(--line)" pointerEvents="visiblePainted" cursor="pointer" data-room={r.id}>
              <title>{`${r.name}: double-click to stand inside it`}</title>
            </rect>
            <text x={foot.x} y={top - 5} fontSize={9.5} fontWeight={600} textAnchor="middle" fill="var(--vp-ink)" letterSpacing="0.04em" pointerEvents="visiblePainted" cursor="pointer" data-room={r.id}>
              {r.name}
            </text>
          </g>
        );
      })}
    </g>
  );
});

/**
 * In a room view: the other rooms of the storey of the building you are in, as markers to walk to, like the arrows of
 * Street View (the other buildings are in the room bar's building picker). A click on one goes there; nearer ones are
 * larger. Rooms behind the eye are left out.
 */
export const RoomMarkers = memo(function RoomMarkers({ scene, proj, level, here, building }: { scene: Scene; proj: Projector; level: LevelKey; here: string | null; building: string }) {
  const z = (scene.levelZ[level] ?? 0) + 3.2;
  const rows = scene.rooms
    .filter((r) => r.level === level && r.id !== here && (r.building?.id ?? OWN_BUILDING) === building)
    .map((r) => ({ r, q: proj.project([r.at[0], r.at[1], z]) }))
    .filter(({ q }) => q.depth > 1.5)
    .sort((a, b) => b.q.depth - a.q.depth);
  // nearest first: a marker that would cover another moves down below it
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const spots = new Map<string, { x: number; y: number; k: number; w: number; h: number }>();
  for (const { r, q } of [...rows].reverse()) {
    const k = clamp(14 / q.depth, 0.75, 1.25);
    const w = (r.name.length * 6.4 + 30) * k;
    const h = 22 * k;
    let y = q.y;
    for (let i = 0; i < 6 && placed.some((p) => p.x0 < q.x + w / 2 && q.x - w / 2 < p.x1 && p.y0 < y + h / 2 && y - h / 2 < p.y1); i++) y += h + 4;
    placed.push({ x0: q.x - w / 2, x1: q.x + w / 2, y0: y - h / 2, y1: y + h / 2 });
    spots.set(r.id, { x: q.x, y, k, w, h });
  }
  return (
    <g fontFamily="var(--font-ui)" data-testid="room-markers">
      {rows.map(({ r }) => {
        const { x, y, k, w, h } = spots.get(r.id)!;
        return (
          <g key={r.id} transform={`translate(${f1(x)},${f1(y)})`} cursor="pointer" data-room={r.id} data-testid="room-marker">
            <title>{`Go to ${r.name}`}</title>
            <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill="var(--bg-chrome)" fillOpacity={0.88} stroke="var(--accent)" strokeWidth={1.2} />
            <circle cx={-w / 2 + h / 2} cy={0} r={h * 0.32} fill="var(--accent)" />
            <path d={`M${f1(-w / 2 + h * 0.4)},${f1(-h * 0.14)}l${f1(h * 0.14)},${f1(h * 0.14)}l${f1(-h * 0.14)},${f1(h * 0.14)}`} stroke="#fff" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <text x={h * 0.35} y={4 * k} fontSize={10.5 * k} fontWeight={600} textAnchor="middle" fill="var(--vp-ink)" letterSpacing="0.04em">
              {r.name}
            </text>
          </g>
        );
      })}
    </g>
  );
});

/**
 * Furniture names (the Furniture Names switch): on the plan, small and centred on each piece of the storey; in 3D,
 * just above each piece, nearer ones first, leaving out names that would overlap. Behind the eye of a room view, none.
 */
export const FurnitureLabels = memo(function FurnitureLabels({ scene, proj, level }: { scene: Scene; proj: Projector; level: LevelKey | null }) {
  const pieces = scene.elements.filter((e) => e.category === "Furniture" && (!level || e.level === level));
  const rows = pieces
    .map((e) => {
      const at: V3 = [(e.min[0] + e.max[0]) / 2, (e.min[1] + e.max[1]) / 2, level ? 0 : e.max[2] + 0.35];
      return { e, q: proj.project(at) };
    })
    .filter(({ q }) => !proj.eye || (q.depth > 1 && q.depth < 45))
    .sort((a, b) => a.q.depth - b.q.depth);
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const shown = rows.filter(({ e, q }) => {
    const w = e.name.length * 5 + 8;
    const box = { x0: q.x - w / 2, x1: q.x + w / 2, y0: q.y - 8, y1: q.y + 4 };
    if (placed.some((p) => p.x0 < box.x1 && box.x0 < p.x1 && p.y0 < box.y1 && box.y0 < p.y1)) return false;
    placed.push(box);
    return true;
  });
  return (
    <g pointerEvents="none" fontFamily="var(--font-ui)" data-testid="furniture-labels">
      {shown.map(({ e, q }) => (
        <text key={e.id} x={f1(q.x)} y={f1(q.y + 3)} textAnchor="middle" fontSize={8} fill="var(--vp-ink)" fillOpacity={0.85} stroke="var(--bg-viewport)" strokeWidth={2.4} strokeOpacity={0.8} paintOrder="stroke" data-testid="furniture-label">
          {e.name}
        </text>
      ))}
    </g>
  );
});

/** North arrow + scale text, drawn in screen space. */
export function NorthArrow({ proj, x, y }: { proj: Projector; x: number; y: number }) {
  const n = proj.project([0, 1, 0]);
  const o = proj.project([0, 0, 0]);
  const ang = (Math.atan2(n.y - o.y, n.x - o.x) * 180) / Math.PI + 90;
  return (
    <g transform={`translate(${x} ${y}) rotate(${f1(ang)})`} pointerEvents="none">
      <circle r={14} fill="none" stroke="var(--vp-ink-dim)" strokeWidth={0.8} />
      <path d="M0 -12 4 5 0 2 -4 5z" fill="var(--vp-ink)" fillOpacity={0.9} />
      <text y={-17} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--vp-ink)" fontFamily="var(--font-data)">
        N
      </text>
    </g>
  );
}

/* ── UCS icon (X red / Y green / Z blue) ──────────────────────────────── */
export function UcsIcon({ proj }: { proj: Projector }) {
  const o = proj.project([0, 0, 0]);
  const axis = (v: V3, color: string, label: string) => {
    const q = proj.project(v);
    const dx = q.x - o.x;
    const dy = q.y - o.y;
    const len = Math.hypot(dx, dy) || 1;
    const L = 26;
    const ex = (dx / len) * L * clamp(len / (proj.scale * 1.6), 0.25, 1);
    const ey = (dy / len) * L * clamp(len / (proj.scale * 1.6), 0.25, 1);
    return (
      <g key={label}>
        <path d={`M0,0L${f1(ex)},${f1(ey)}`} stroke={color} strokeWidth={1.8} strokeLinecap="round" markerEnd="url(#bs-arrow)" />
        <text x={ex * 1.28 + (ex >= 0 ? 2 : -9)} y={ey * 1.28 + 3} fontSize={10} fontWeight={700} fill={color} fontFamily="var(--font-data)">
          {label}
        </text>
      </g>
    );
  };
  return (
    <svg className="pointer-events-none absolute bottom-3 left-3 z-10 overflow-visible" width={64} height={64} viewBox="-22 -46 64 64" aria-label="UCS Icon">
      {axis([1.6, 0, 0], "#ef5b5b", "X")}
      {axis([0, 1.6, 0], "#3ecf8e", "Y")}
      {axis([0, 0, 1.6], "#4c8dff", "Z")}
    </svg>
  );
}
