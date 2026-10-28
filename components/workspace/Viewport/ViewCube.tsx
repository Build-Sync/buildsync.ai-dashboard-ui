/**
 * components/workspace/Viewport/ViewCube.tsx
 *
 * WHAT   The AutoCAD-style ViewCube in the corner of the canvas. In 3D it is a real projected cube: clicking a
 *        face jumps to that named view (TOP switches to the 2D plan), the compass ring rotates the model 90°,
 *        and the house button resets to SW Isometric. In 2D it shows a compass ring (click to rotate the plan
 *        90°) and the centre square switches back to 3D.
 * FOR    Quick orientation and view changes. It reads the camera (3D) or the plan rotation (2D) from the
 *        workspace store, projects the cube with the same basis as the model (lib/scene/camera.ts) and calls
 *        named-view actions in the store. Hidden by Settings → Display → Show ViewCube.
 * DEBUG  - The cube shows the wrong face: FACES lists each face's normal and corner points; basis() in
 *          lib/scene/camera.ts supplies the right / up / forward vectors.
 *        - The compass is wrong in 2D: the 2D bearing is 180 + the plan rotation.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Icon } from "@/components/icons";
import { tip } from "@/components/ui/Tooltip";
import { basis, describeView, normBearing } from "@/lib/scene/camera";
import { levelLabel } from "@/lib/scene";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";

/* AutoCAD-style ViewCube (spec §10.7).
 * 3D: a real projected cube. Faces jump to named views; the TOP face switches to the 2D plan;
 *     the compass ring rotates the model 90°; ⌂ resets to SW Isometric.
 * 2D: compass ring N/E/S/W (click to rotate the plan 90°); the centre square switches back to 3D. */

type V3 = [number, number, number];
const S = 21; // px per cube unit

const FACES: { name: string; label: string; n: V3; pts: V3[]; view: string }[] = [
  { name: "top", label: "TOP", n: [0, 0, 1], pts: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], view: "Top" },
  { name: "bottom", label: "BOTTOM", n: [0, 0, -1], pts: [[-1, 1, -1], [1, 1, -1], [1, -1, -1], [-1, -1, -1]], view: "Bottom" },
  { name: "front", label: "FRONT", n: [0, -1, 0], pts: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], view: "Front" },
  { name: "right", label: "RIGHT", n: [1, 0, 0], pts: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]], view: "Right" },
  { name: "back", label: "BACK", n: [0, 1, 0], pts: [[1, 1, -1], [-1, 1, -1], [-1, 1, 1], [1, 1, 1]], view: "Back" },
  { name: "left", label: "LEFT", n: [-1, 0, 0], pts: [[-1, 1, -1], [-1, -1, -1], [-1, -1, 1], [-1, 1, 1]], view: "Left" },
];

/** The interactive orientation cube and compass ring. */
export function ViewCube() {
  const ws = useWsApi();
  const view = useWs((s) => s.view);
  const camera = useWs((s) => s.camera);
  const rotation = useWs((s) => s.plan.rotation);
  const planLevel = useWs((s) => s.plan.level);

  const is2d = view === "2d";
  const bearing = is2d ? normBearing(180 + rotation) : camera.bearing;
  const pitch = is2d ? 90 : camera.pitch;
  const b = basis(bearing, pitch);
  const proj = (p: V3) => ({
    x: (p[0] * b.r[0] + p[1] * b.r[1] + p[2] * b.r[2]) * S,
    y: -(p[0] * b.u[0] + p[1] * b.u[1] + p[2] * b.u[2]) * S,
    d: p[0] * b.f[0] + p[1] * b.f[1] + p[2] * b.f[2],
  });

  const label = is2d ? `2D · ${levelLabel(planLevel)}` : describeView(camera);

  /* compass ring points */
  const ringR = 1.95;
  const ringPts = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    const q = proj([Math.cos(a) * ringR, Math.sin(a) * ringR, is2d ? 0 : -1]);
    return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
  }).join(" ");
  const compass: { l: string; v: V3 }[] = [
    { l: "N", v: [0, 1, 0] },
    { l: "E", v: [1, 0, 0] },
    { l: "S", v: [0, -1, 0] },
    { l: "W", v: [-1, 0, 0] },
  ];

  return (
    <div className="pointer-events-none absolute right-12 top-2 z-10 flex w-[6.75rem] flex-col items-center">
      <div className="pointer-events-auto relative">
        <svg width={108} height={108} viewBox="-54 -54 108 108" className="overflow-visible" aria-label="ViewCube">
          {/* compass ring: click to rotate */}
          <polygon
            points={ringPts}
            fill="var(--bg-chrome)"
            fillOpacity={0.55}
            stroke="var(--line)"
            strokeWidth={1.2}
            className="cursor-pointer"
            onClick={() => (is2d ? ws.getState().rotatePlan() : ws.getState().rotateIso(1))}
            {...tip("Compass Ring", is2d ? "Click to rotate the plan 90°" : "Click to rotate the model 90°", "3DORBIT")}
          />
          {compass.map((c) => {
            const q = proj([c.v[0] * (ringR + 0.55), c.v[1] * (ringR + 0.55), is2d ? 0 : -1]);
            return (
              <text key={c.l} x={q.x} y={q.y + 3.5} textAnchor="middle" fontSize={c.l === "N" ? 11 : 9.5} fontWeight={700} fill={c.l === "N" ? "var(--accent)" : "var(--t2)"} className="pointer-events-none" fontFamily="var(--font-data)">
                {c.l}
              </text>
            );
          })}

          {is2d ? (
            <g
              className="cursor-pointer"
              onClick={() => ws.getState().setView("3d")}
              {...tip("Switch to 3D", "Click the centre face to toggle 2D ⇄ 3D", "3DVIEW")}
            >
              <rect x={-17} y={-17} width={34} height={34} rx={3} fill="var(--bg-panel-alt)" stroke="var(--accent)" strokeWidth={1.4} />
              <text y={4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--accent)" fontFamily="var(--font-data)">
                3D
              </text>
            </g>
          ) : (
            [...FACES]
              .map((f) => ({ ...f, facing: f.n[0] * b.d[0] + f.n[1] * b.d[1] + f.n[2] * b.d[2], pts2: f.pts.map(proj) }))
              .filter((f) => f.facing > 0.03)
              .sort((a, c) => c.pts2.reduce((s, p) => s + p.d, 0) - a.pts2.reduce((s, p) => s + p.d, 0))
              .map((f) => {
                const cx = f.pts2.reduce((s, p) => s + p.x, 0) / 4;
                const cy = f.pts2.reduce((s, p) => s + p.y, 0) / 4;
                const isTop = f.name === "top";
                return (
                  <g
                    key={f.name}
                    className="group cursor-pointer"
                    onClick={() => (isTop ? ws.getState().setView("2d") : ws.getState().goToNamedView(f.view))}
                    {...tip(isTop ? "Top / 2D Plan" : `${f.label[0]}${f.label.slice(1).toLowerCase()} View`, isTop ? "Click to switch to the 2D plan" : "Click to look at this face", isTop ? "PLAN" : `-VIEW ${f.label}`)}
                  >
                    <polygon
                      points={f.pts2.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                      fill="var(--bg-panel-alt)"
                      stroke="var(--t3)"
                      strokeWidth={1}
                      strokeLinejoin="round"
                      className="transition-colors group-hover:fill-[var(--accent)]"
                      fillOpacity={0.35 + Math.min(0.6, f.facing * 0.6)}
                    />
                    <text x={cx} y={cy + 2.8} textAnchor="middle" fontSize={7.5} fontWeight={700} fill="var(--t1)" className="pointer-events-none" fontFamily="var(--font-data)" letterSpacing="0.04em">
                      {f.label}
                    </text>
                  </g>
                );
              })
          )}
        </svg>
        <button
          onClick={() => ws.getState().homeView()}
          className="absolute -left-1 top-0 grid size-5 place-items-center rounded border border-line bg-chrome text-t2 hover:text-t1"
          aria-label="Home View"
          {...tip("Home", "Reset to SW Isometric", "-VIEW HOME")}
        >
          <Icon name="roof" size={12} />
        </button>
        {!is2d && (
          <>
            <button
              onClick={() => ws.getState().rotateIso(-1)}
              className="absolute -left-1 bottom-0 grid size-5 place-items-center rounded border border-line bg-chrome text-t2 hover:text-t1"
              aria-label="Rotate Left"
              {...tip("Rotate Left", "Rotate the model 90° counter-clockwise", "3DORBIT")}
            >
              <Icon name="chevRight" size={12} className="rotate-180" />
            </button>
            <button
              onClick={() => ws.getState().rotateIso(1)}
              className="absolute -right-1 bottom-0 grid size-5 place-items-center rounded border border-line bg-chrome text-t2 hover:text-t1"
              aria-label="Rotate Right"
              {...tip("Rotate Right", "Rotate the model 90° clockwise", "3DORBIT")}
            >
              <Icon name="chevRight" size={12} />
            </button>
          </>
        )}
      </div>
      <span className={cn("mono mt-0.5 rounded bg-chrome/80 px-1.5 py-px text-[0.625rem] text-t2")} data-testid="view-label">
        {label}
      </span>
    </div>
  );
}
