/**
 * components/workspace/Palettes/SiteMap.tsx
 *
 * WHAT   A live map of the site and the land around it: satellite imagery with road and place names (Esri World
 *        Imagery) or streets (OpenStreetMap), with the property line, the building footprint, the base point and
 *        a circle of the chosen radius (¼, ½, 1 or 2 miles) drawn over it at their true position, and a scale bar.
 *        Drag to pan, scroll or the +/− buttons to zoom, the target button re-centres on the site.
 * FOR    The Site palette (Site.tsx), so an engineer sees the surroundings without leaving the project. It draws
 *        map tiles itself (Web Mercator, lib/geo.ts), so no map library or key is needed.
 * OS     Tiles come from the internet. Offline (or in the desktop app without a connection) the map shows the
 *        overlays on a plain grid with a note; the links in the palette open the same place in Google Maps later.
 * DEBUG  - The property line is shifted from the imagery: the base point latitude / longitude or the north angle
 *          is off (Site palette), or the imagery itself is offset a few metres (common for satellite tiles).
 *        - Blank tiles: the tile server refused or the network is down; check the browser console for 403 / net
 *          errors.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { tip } from "@/components/ui/Tooltip";
import { circleLatLon, latOfY, lonOfX, mercX, mercY, metresPerPixel, MILE_M, siteCentre, TILE, toLatLon, zoomForRadius, type SiteGeo } from "@/lib/geo";
import { cn } from "@/lib/utils";

/** The two backgrounds of the map. */
export type Basemap = "satellite" | "streets";

const TILES: Record<Basemap, { url: (z: number, x: number, y: number) => string; over?: (z: number, x: number, y: number) => string; credit: string; max: number }> = {
  satellite: {
    url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    over: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`,
    credit: "Imagery © Esri, Maxar, Earthstar Geographics",
    max: 19,
  },
  streets: {
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    credit: "© OpenStreetMap contributors",
    max: 19,
  },
};

const NICE = [50, 100, 200, 500, 1000, 2000, 5280, 10560];
const f1 = (n: number) => Math.round(n * 10) / 10;

/** The map of the site with its property line and a radius around it. */
export function SiteMap({ site, radiusMiles, basemap, footprint, height = 260 }: { site: SiteGeo; radiusMiles: number; basemap: Basemap; footprint?: [number, number][]; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(300);
  const centre = useMemo(() => siteCentre(site), [site]);
  const fit = useMemo(() => Math.min(18, Math.max(3, zoomForRadius(centre.lat, radiusMiles * MILE_M, Math.min(w, height)))), [centre.lat, radiusMiles, w, height]);
  // the map follows the site and the radius until the user pans or zooms (a pan belongs to one site + radius)
  const key = `${centre.lat},${centre.lon},${radiusMiles}`;
  const [moved, setMoved] = useState<{ key: string; lat: number; lon: number; zoom: number } | null>(null);
  const v = moved && moved.key === key ? moved : { lat: centre.lat, lon: centre.lon, zoom: fit };
  const setView = (to: { lat: number; lon: number; zoom: number } | null) => setMoved(to ? { ...to, key } : null);
  const [fails, setFails] = useState(0);
  const [loads, setLoads] = useState(0);
  const [grabbing, setGrabbing] = useState(false);
  const drag = useRef<{ x: number; y: number; lat: number; lon: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const t = TILES[basemap];
  const z = Math.max(0, Math.min(t.max, Math.floor(v.zoom)));
  const k = 2 ** (v.zoom - z);
  const cx = mercX(v.lon, z) * TILE;
  const cy = mercY(v.lat, z) * TILE;
  /** screen position of a latitude / longitude */
  const S = (lat: number, lon: number) => ({ x: (mercX(lon, z) * TILE - cx) * k + w / 2, y: (mercY(lat, z) * TILE - cy) * k + height / 2 });

  const tiles: { x: number; y: number; sx: number; sy: number; id: string }[] = [];
  const n = 2 ** z;
  const tx0 = Math.floor((cx - w / 2 / k) / TILE);
  const tx1 = Math.floor((cx + w / 2 / k) / TILE);
  const ty0 = Math.max(0, Math.floor((cy - height / 2 / k) / TILE));
  const ty1 = Math.min(n - 1, Math.floor((cy + height / 2 / k) / TILE));
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) tiles.push({ x: ((tx % n) + n) % n, y: ty, sx: (tx * TILE - cx) * k + w / 2, sy: (ty * TILE - cy) * k + height / 2, id: `${z}/${tx}/${ty}` });

  // wheel zoom about the cursor (non-passive so the panel does not scroll); the listener reads the view from refs
  const vRef = useRef(v);
  const keyRef = useRef(key);
  useEffect(() => {
    vRef.current = v;
    keyRef.current = key;
  });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cur = vRef.current;
      const r = el.getBoundingClientRect();
      const zoom = Math.max(3, Math.min(19, cur.zoom - Math.sign(e.deltaY) * 0.5));
      // keep the point under the cursor where it is
      const zz = Math.floor(cur.zoom);
      const kk = 2 ** (cur.zoom - zz);
      const px = mercX(cur.lon, zz) * TILE + (e.clientX - r.left - r.width / 2) / kk;
      const py = mercY(cur.lat, zz) * TILE + (e.clientY - r.top - r.height / 2) / kk;
      const k2 = 2 ** (zoom - zz);
      const nx = px - (e.clientX - r.left - r.width / 2) / k2;
      const ny = py - (e.clientY - r.top - r.height / 2) / k2;
      setMoved({ lat: latOfY(ny / TILE, zz), lon: lonOfX(nx / TILE, zz), zoom, key: keyRef.current });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const ring = circleLatLon(centre.lat, centre.lon, radiusMiles * MILE_M, 96).map(([la, lo]) => S(la, lo));
  const lot = site.boundary?.map((p) => {
    const g = toLatLon(site, p);
    return S(g.lat, g.lon);
  });
  const house = footprint?.map((p) => {
    const g = toLatLon(site, p);
    return S(g.lat, g.lon);
  });
  const base = S(site.lat, site.lon);
  const path = (pts: { x: number; y: number }[], close = true) => pts.map((q, i) => `${i ? "L" : "M"}${f1(q.x)},${f1(q.y)}`).join("") + (close ? "Z" : "");

  // scale bar: the longest nice length (ft) that fits in 90 px
  const ftPerPx = metresPerPixel(v.lat, v.zoom) / 0.3048;
  const barFt = [...NICE].reverse().find((ft) => ft / ftPerPx <= 90) ?? NICE[0];
  const barPx = barFt / ftPerPx;
  const barText = barFt >= 5280 ? `${barFt / 5280} mi` : `${barFt} ft`;
  const offline = fails > 0 && loads === 0;

  return (
    <div
      ref={box}
      className="relative select-none overflow-hidden rounded-lg border border-line bg-[#1c2430]"
      style={{ height, touchAction: "none", cursor: grabbing ? "grabbing" : "grab" }}
      data-testid="site-map"
      data-zoom={v.zoom.toFixed(2)}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, lat: v.lat, lon: v.lon };
        setGrabbing(true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const zz = Math.floor(v.zoom);
        const kk = 2 ** (v.zoom - zz);
        const px = mercX(d.lon, zz) * TILE - (e.clientX - d.x) / kk;
        const py = mercY(d.lat, zz) * TILE - (e.clientY - d.y) / kk;
        setView({ lat: latOfY(py / TILE, zz), lon: lonOfX(px / TILE, zz), zoom: v.zoom });
      }}
      onPointerUp={() => {
        drag.current = null;
        setGrabbing(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setGrabbing(false);
      }}
    >
      <svg width={w} height={height} className="absolute inset-0" role="img" aria-label={`Map of the site, ${radiusMiles} mile radius`}>
        <defs>
          <pattern id="map-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M32 0H0V32" fill="none" stroke="#2b3544" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={w} height={height} fill="url(#map-grid)" />
        {tiles.map((tl) => (
          <image
            key={`${basemap}-${tl.id}`}
            href={t.url(z, tl.x, tl.y)}
            x={f1(tl.sx)}
            y={f1(tl.sy)}
            width={f1(TILE * k + 0.6)}
            height={f1(TILE * k + 0.6)}
            preserveAspectRatio="none"
            onLoad={() => setLoads((c) => c + 1)}
            onError={() => setFails((c) => c + 1)}
          />
        ))}
        {t.over &&
          tiles.map((tl) => (
            <image key={`o-${tl.id}`} href={t.over!(z, tl.x, tl.y)} x={f1(tl.sx)} y={f1(tl.sy)} width={f1(TILE * k + 0.6)} height={f1(TILE * k + 0.6)} preserveAspectRatio="none" />
          ))}
        <path d={path(ring)} fill="#4c8dff" fillOpacity={0.06} stroke="#4c8dff" strokeWidth={2} strokeDasharray="8 5" data-testid="map-radius" />
        {lot && lot.length > 2 && <path d={path(lot)} fill="#f0c63c" fillOpacity={0.18} stroke="#f0c63c" strokeWidth={2.2} data-testid="map-lot" />}
        {house && house.length > 2 && <path d={path(house)} fill="#ef5b5b" fillOpacity={0.55} stroke="#fff" strokeWidth={1} />}
        <g transform={`translate(${f1(base.x)} ${f1(base.y)})`}>
          <path d="M0 0c-6-9-9-12-9-17a9 9 0 0 1 18 0c0 5-3 8-9 17z" fill="#ef5b5b" stroke="#fff" strokeWidth={1.2} />
          <circle cy={-17} r={3.2} fill="#fff" />
        </g>
        <g transform={`translate(10 ${height - 16})`}>
          <rect x={-4} y={-14} width={barPx + 8} height={22} rx={3} fill="#10141b" fillOpacity={0.7} />
          <path d={`M0 0h${f1(barPx)}M0 -4v8M${f1(barPx)} -4v8`} stroke="#fff" strokeWidth={1.4} />
          <text x={f1(barPx / 2)} y={-4} fontSize={9.5} textAnchor="middle" fill="#fff" fontFamily="var(--font-data)">
            {barText}
          </text>
        </g>
        <text x={w - 6} y={height - 5} fontSize={8.5} textAnchor="end" fill="#fff" stroke="#000" strokeOpacity={0.6} strokeWidth={2.5} paintOrder="stroke">
          {t.credit}
        </text>
        <text x={w - 8} y={16} fontSize={10} fontWeight={700} textAnchor="end" fill="#fff" stroke="#000" strokeOpacity={0.6} strokeWidth={2.5} paintOrder="stroke">
          N ↑
        </text>
      </svg>
      {offline && (
        <p className="absolute inset-x-3 top-3 rounded bg-black/70 px-2 py-1 text-[0.6875rem] text-white" data-testid="map-offline">
          The map needs an internet connection. The property line and radius are drawn at their true position; the links below open the site in Google Maps.
        </p>
      )}
      <div className="absolute right-1.5 top-6 flex flex-col gap-1" onPointerDown={(e) => e.stopPropagation()}>
        {(
          [
            ["zoomIn", "Zoom In", () => setView({ ...v, zoom: Math.min(19, v.zoom + 1) })],
            ["zoomOut", "Zoom Out", () => setView({ ...v, zoom: Math.max(3, v.zoom - 1) })],
            ["target", "Fit the Radius", () => setView(null)],
          ] as const
        ).map(([icon, label, on]) => (
          <button key={label} onClick={on} aria-label={label} className={cn("grid size-6 place-items-center rounded bg-black/60 text-white hover:bg-black/80")} {...tip(label)}>
            <Icon name={icon} size={13} />
          </button>
        ))}
      </div>
    </div>
  );
}
