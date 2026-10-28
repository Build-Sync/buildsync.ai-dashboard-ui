/**
 * components/workspace/Viewport/PropertyLine.tsx
 *
 * WHAT   The property line of the site (project.site.boundary, lib/geo.ts) drawn the way a survey shows it: a
 *        heavy long-dash / double-short-dash line, the corners numbered P1, P2 …, each side labelled with its
 *        bearing and length along the line, and the lot area in the middle. On a sheet it also lists each corner's
 *        latitude and longitude when the site is placed on the map. The area sits just inside the first side.
 *        LotLines draws the lots of linked and merged projects on the same parcel (thin, with each project's name).
 * FOR    ModelViewport (2D plan and 3D, on the ground at finished grade) and SheetView (the site plan and the
 *        topography sheets). The Property Line tool (PROPLINE) and the Site palette set the boundary.
 * DEBUG  - Nothing is drawn: there is no boundary yet (Insert → Property Line), or the Site / Trees layer is off.
 *        - Bearings read 90° off: the site's north angle (Site palette) turns true north away from up-on-the-plan.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { memo } from "react";
import { boundaryInfo, fmtDms, fmtSiteArea, isPlaced, toLatLon, type SiteGeo } from "@/lib/geo";
import type { Projector } from "@/lib/scene/camera";
import type { V2 } from "@/lib/scene/types";

const f1 = (n: number) => Math.round(n * 10) / 10;

/** The property line on a projector: line, corners, courses and area. */
export const PropertyLine = memo(function PropertyLine({
  site,
  proj,
  z,
  plan,
  fmt,
  metric,
  paper = false,
  labels = true,
}: {
  site: SiteGeo;
  proj: Projector;
  /** height to draw it at (finished grade) */
  z: number;
  /** a plan (top-down): course labels run along the sides */
  plan: boolean;
  fmt: (ft: number) => string;
  metric: boolean;
  /** on a sheet: dark ink on white and a corner coordinate table */
  paper?: boolean;
  labels?: boolean;
}) {
  const pts = site.boundary;
  if (!pts || pts.length < 3) return null;
  const P = (p: V2) => proj.project([p[0], p[1], z]);
  const scr = pts.map(P);
  const info = boundaryInfo(site, pts);
  const ink = paper ? "#1b2330" : "#e3a72f";
  const halo = paper ? "#fff" : "var(--bg-viewport)";
  const d = scr.map((q, i) => `${i ? "L" : "M"}${f1(q.x)},${f1(q.y)}`).join("") + "Z";
  const cx = scr.reduce((a, q) => a + q.x, 0) / scr.length;
  const cy = scr.reduce((a, q) => a + q.y, 0) / scr.length;
  // the lot area sits just inside the first side (the front, usually), not over the building in the middle
  const m0 = { x: (scr[0].x + scr[1].x) / 2, y: (scr[0].y + scr[1].y) / 2 };
  const toC = Math.hypot(cx - m0.x, cy - m0.y) || 1;
  const areaAt = { x: m0.x + ((cx - m0.x) / toC) * Math.min(26, toC / 2), y: m0.y + ((cy - m0.y) / toC) * Math.min(26, toC / 2) };
  const placed = isPlaced(site);
  return (
    <g pointerEvents="none" data-testid="property-line" fontFamily="var(--font-data)">
      <path d={d} fill={ink} fillOpacity={paper ? 0 : 0.04} stroke={ink} strokeWidth={paper ? 1.4 : 1.8} strokeDasharray="18 4 4 4 4 4" strokeLinejoin="round" />
      {labels &&
        info.courses.map((c) => {
          const a = scr[c.from];
          const b = scr[c.to];
          if (Math.hypot(b.x - a.x, b.y - a.y) < 70) return null;
          let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
          if (ang > 90) ang -= 180;
          if (ang < -90) ang += 180;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          // the label sits outside the lot: push it away from the centre
          const nx = -(b.y - a.y);
          const ny = b.x - a.x;
          const nl = Math.hypot(nx, ny) || 1;
          const side = (mx - cx) * nx + (my - cy) * ny >= 0 ? 1 : -1;
          const ox = (nx / nl) * 9 * side;
          const oy = (ny / nl) * 9 * side;
          const text = `${c.bearing}  ${fmt(c.length)}`;
          return (
            <text
              key={c.from}
              x={f1(mx + ox)}
              y={f1(my + oy)}
              fontSize={plan ? 9.5 : 9}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={ink}
              stroke={halo}
              strokeWidth={3}
              paintOrder="stroke"
              transform={plan ? `rotate(${f1(ang)} ${f1(mx + ox)} ${f1(my + oy)})` : undefined}
              data-testid="course-label"
            >
              {text}
            </text>
          );
        })}
      {scr.map((q, i) => (
        <g key={i}>
          <circle cx={f1(q.x)} cy={f1(q.y)} r={3.4} fill={halo} stroke={ink} strokeWidth={1.3} />
          {labels && (
            <text x={f1(q.x + 6)} y={f1(q.y - 6)} fontSize={9.5} fontWeight={700} fill={ink} stroke={halo} strokeWidth={3} paintOrder="stroke">
              P{i + 1}
            </text>
          )}
        </g>
      ))}
      {labels && (
        <text x={f1(areaAt.x)} y={f1(areaAt.y)} fontSize={9.5} textAnchor="middle" dominantBaseline="middle" fill={ink} stroke={halo} strokeWidth={3} paintOrder="stroke" data-testid="lot-area">
          LOT {fmtSiteArea(info.area, metric)}
        </text>
      )}
      {paper && placed && (
        <g data-testid="corner-table">
          <text x={10} y={18} fontSize={9} fontWeight={700} fill="#1b2330">
            PROPERTY CORNERS (WGS 84)
          </text>
          {pts.map((p, i) => {
            const g = toLatLon(site, p);
            return (
              <text key={i} x={10} y={31 + i * 11} fontSize={8.5} fill="#1b2330">
                P{i + 1}  {fmtDms(g.lat, "lat")}  {fmtDms(g.lon, "lon")}
              </text>
            );
          })}
        </g>
      )}
    </g>
  );
});

/** The lots of linked and merged projects on this parcel (scene.lots, lib/links.ts): a thin dashed line and the name. */
export const LotLines = memo(function LotLines({ lots, proj, z, paper = false }: { lots: { id: string; name: string; pts: V2[]; linked: boolean }[]; proj: Projector; z: number; paper?: boolean }) {
  if (!lots.length) return null;
  const ink = paper ? "#5a6578" : "#8fb3e8";
  const halo = paper ? "#fff" : "var(--bg-viewport)";
  return (
    <g pointerEvents="none" data-testid="lot-lines" fontFamily="var(--font-ui)">
      {lots.map((l) => {
        const scr = l.pts.map((q) => proj.project([q[0], q[1], z]));
        const d = scr.map((q, i) => `${i ? "L" : "M"}${f1(q.x)},${f1(q.y)}`).join("") + "Z";
        // the name sits inside the lot, near its first corner
        const c = { x: scr.reduce((a, q) => a + q.x, 0) / scr.length, y: scr.reduce((a, q) => a + q.y, 0) / scr.length };
        const at = { x: scr[0].x + (c.x - scr[0].x) * 0.18, y: scr[0].y + (c.y - scr[0].y) * 0.18 };
        return (
          <g key={l.id}>
            <path d={d} fill="none" stroke={ink} strokeWidth={1.1} strokeDasharray="10 3 2 3" />
            <text x={f1(at.x)} y={f1(at.y)} fontSize={9.5} fontWeight={600} fill={ink} stroke={halo} strokeWidth={3} paintOrder="stroke" data-testid="lot-name">
              {l.name}
              {l.linked ? " · linked" : " · merged"}
            </text>
          </g>
        );
      })}
    </g>
  );
});
