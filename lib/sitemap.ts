/**
 * lib/sitemap.ts
 *
 * WHAT   A site plan from the map, using the site's coordinates (project.site, lib/geo.ts):
 *        - groundFromMap: the ground around the lot from public elevation data (AWS Terrain Tiles, built from
 *          USGS 3DEP / SRTM: about 10–30 m apart): elevation tiles are read pixel by pixel, sampled on a grid over the
 *          lot and a margin around it, and turned into a ground surface with contours (lib/importers.ts terrainFrom),
 *          with the ground at the building set to the finished grade; the height above sea level is kept;
 *        - aerialTiles: the satellite photo (Esri World Imagery) as tiles placed under the plan at their true size and
 *          position, to trace driveways, trees and neighbours from.
 *        Both only work when the site is on the map and the plan's north is up (north angle 0) for the photo.
 * FOR    Site palette → Site from the Map, and the SITEFROMMAP command. Public elevation data is approximate: it
 *        shows the lie of the land, not a survey; the dialog and the topography sheet say so.
 * DEBUG  - "Couldn't read the elevation tiles": no internet, or the browser blocked the tile server.
 *        - The photo is shifted: the site's latitude / longitude is the base point (0, 0) of the plan; check it in
 *          the Site palette.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { FT, fromLatLon, latOfY, lonOfX, mercX, mercY, toLatLon, type SiteGeo } from "./geo";
import { terrainFrom } from "./importers";
import type { V2, V3 } from "./scene/types";
import type { DrawnItem } from "./draw/types";
import type { ProjectTerrain } from "./types";

/** An elevation tile (Terrarium encoding: height = R × 256 + G + B / 256 − 32768 metres). */
export const terrainTileUrl = (z: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
/** A satellite photo tile. */
export const aerialTileUrl = (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
/** Who to credit for the photo. */
export const AERIAL_CREDIT = "Imagery: Esri, Maxar, Earthstar Geographics";

/** Height in metres of one Terrarium pixel. */
export const terrarium = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768;

/** The box (project feet) to cover: the lot (or the building) with `margin` feet around it. */
export function areaAround(site: SiteGeo, footprint: { x0: number; y0: number; x1: number; y1: number }, margin: number): { x0: number; y0: number; x1: number; y1: number } {
  const pts: V2[] = site.boundary?.length ? site.boundary : [[footprint.x0, footprint.y0], [footprint.x1, footprint.y1]];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs, footprint.x0) - margin, y0: Math.min(...ys, footprint.y0) - margin, x1: Math.max(...xs, footprint.x1) + margin, y1: Math.max(...ys, footprint.y1) + margin };
}

/** Load a tile image's pixels (the tile server must allow cross-origin reads). */
async function tilePixels(url: string): Promise<ImageData> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((ok, bad) => {
    img.onload = () => ok();
    img.onerror = () => bad(new Error("tile"));
    img.src = url;
  });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || 256;
  c.height = img.naturalHeight || 256;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

/** The ground around the lot from public elevation data, as a project terrain (feet, relative to Level 1). */
export async function groundFromMap(site: SiteGeo, area: { x0: number; y0: number; x1: number; y1: number }, centre: V2, grade: number, interval: number, n = 36): Promise<{ terrain: ProjectTerrain; seaLevel: number }> {
  // zoom 15 tiles: about 4 m per pixel at mid latitudes, finer than the data underneath
  const z = 15;
  const samples: { p: V2; tx: number; ty: number; px: number; py: number }[] = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const p: V2 = [area.x0 + ((area.x1 - area.x0) * i) / n, area.y0 + ((area.y1 - area.y0) * j) / n];
      const g = toLatLon(site, p);
      const X = mercX(g.lon, z);
      const Y = mercY(g.lat, z);
      samples.push({ p, tx: Math.floor(X), ty: Math.floor(Y), px: (X - Math.floor(X)) * 256, py: (Y - Math.floor(Y)) * 256 });
    }
  }
  const keys = [...new Set(samples.map((s) => `${s.tx},${s.ty}`))];
  if (keys.length > 16) throw new Error("That area is too large to fetch at once.");
  const tiles = new Map<string, ImageData>();
  await Promise.all(
    keys.map(async (k) => {
      const [x, y] = k.split(",").map(Number);
      tiles.set(k, await tilePixels(terrainTileUrl(z, x, y)));
    }),
  );
  const heightAt = (d: ImageData, x: number, y: number) => {
    const xi = Math.max(0, Math.min(d.width - 1, Math.round(x)));
    const yi = Math.max(0, Math.min(d.height - 1, Math.round(y)));
    const o = (yi * d.width + xi) * 4;
    return terrarium(d.data[o], d.data[o + 1], d.data[o + 2]);
  };
  const metres = samples.map((s) => heightAt(tiles.get(`${s.tx},${s.ty}`)!, (s.px * tiles.get(`${s.tx},${s.ty}`)!.width) / 256, (s.py * tiles.get(`${s.tx},${s.ty}`)!.height) / 256));
  // the height above sea level at the building becomes the finished grade of the project
  let best = 0;
  let bestD = Infinity;
  samples.forEach((s, i) => {
    const d = Math.hypot(s.p[0] - centre[0], s.p[1] - centre[1]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  const seaLevel = metres[best] / FT;
  const pts: V3[] = samples.map((s, i) => [s.p[0], s.p[1], metres[i] / FT - seaLevel + grade]);
  const t = terrainFrom(pts, interval, n);
  return {
    terrain: { source: `Public elevation data (AWS Terrain Tiles) around ${site.lat.toFixed(5)}, ${site.lon.toFixed(5)}`, points: pts.length, interval, grid: t.grid, contours: t.contours, seaLevel },
    seaLevel,
  };
}

/** The satellite photo over an area: tiles at their true size and place (project feet, north up). */
export function aerialTiles(site: SiteGeo, area: { x0: number; y0: number; x1: number; y1: number }, z = 19): { url: string; x: number; y: number; w: number; h: number }[] {
  const a = toLatLon(site, [area.x0, area.y1]);
  const b = toLatLon(site, [area.x1, area.y0]);
  const tx0 = Math.floor(mercX(a.lon, z));
  const tx1 = Math.floor(mercX(b.lon, z));
  const ty0 = Math.floor(mercY(a.lat, z));
  const ty1 = Math.floor(mercY(b.lat, z));
  const out: { url: string; x: number; y: number; w: number; h: number }[] = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      // the tile's lower-left and upper-right corners in project feet
      const ll = fromLatLon(site, latOfY(ty + 1, z), lonOfX(tx, z));
      const ur = fromLatLon(site, latOfY(ty, z), lonOfX(tx + 1, z));
      out.push({ url: aerialTileUrl(z, tx, ty), x: ll[0], y: ll[1], w: ur[0] - ll[0], h: ur[1] - ll[1] });
    }
  }
  return out.length <= 64 ? out : [];
}

/** The aerial photo as one drawn image made of tiles (north up); null when the plan is not north-up or the area is too large. */
export function aerialItem(site: SiteGeo, area: { x0: number; y0: number; x1: number; y1: number }, grade: number, id: string): DrawnItem | null {
  if (Math.abs(site.north) > 0.01) return null;
  const tiles = aerialTiles(site, area);
  if (!tiles.length) return null;
  const x0 = Math.min(...tiles.map((t) => t.x));
  const y0 = Math.min(...tiles.map((t) => t.y));
  const w = Math.max(...tiles.map((t) => t.x + t.w)) - x0;
  const h = Math.max(...tiles.map((t) => t.y + t.h)) - y0;
  return {
    id,
    kind: "image",
    name: "Aerial Photo",
    level: "site",
    z: grade,
    pts: [[x0, y0]],
    p: { w, h, file: AERIAL_CREDIT, tiles: JSON.stringify(tiles.map((t) => [t.url, t.x - x0, t.y - y0, t.w, t.h])), frame: false },
  };
}
