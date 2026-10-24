"use client";

import { memo } from "react";
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
export const SelectionOverlay = memo(function SelectionOverlay({ scene, proj, selection, hover }: { scene: Scene; proj: Projector; selection: string[]; hover: string | null }) {
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
              {o.grips.map((g, i) => (
                <rect key={i} x={g[0] - 2.8} y={g[1] - 2.8} width={5.6} height={5.6} fill="var(--accent)" stroke="#fff" strokeWidth={0.8} />
              ))}
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
export const PlanAnnotations = memo(function PlanAnnotations({ scene, proj, level, showGrid }: { scene: Scene; proj: Projector; level: LevelKey; showGrid: boolean }) {
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
        .filter((r) => r.level === level)
        .map((r) => {
          const q = P(r.at[0], r.at[1]);
          return (
            <g key={r.id} textAnchor="middle" fill={ink}>
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
    <svg className="pointer-events-none absolute bottom-3 left-3 z-10 overflow-visible" width={64} height={64} viewBox="-22 -46 64 64" aria-label="UCS icon">
      {axis([1.6, 0, 0], "#ef5b5b", "X")}
      {axis([0, 1.6, 0], "#3ecf8e", "Y")}
      {axis([0, 0, 1.6], "#4c8dff", "Z")}
    </svg>
  );
}
