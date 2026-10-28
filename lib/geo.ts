/**
 * lib/geo.ts
 *
 * WHAT   Where the project is on the earth. A project's SiteGeo pins the model's base point (0, 0) to a
 *        latitude and longitude and says which way true north is; from that this file turns model points (feet)
 *        into true east / north offsets and into latitude / longitude and back, writes surveyor bearings
 *        ("N 45°30'15\" E") and reads them, measures the property line (area, perimeter, each course), and
 *        builds the links an engineer opens the site with (Google Maps, satellite, Google Earth, OpenStreetMap)
 *        and a KML file of the property line and a radius around it. Also the Web Mercator tile maths of the
 *        site map (the same projection as Google Maps and OpenStreetMap).
 * FOR    The Site palette (components/workspace/Palettes/Site.tsx and its map), the property line drawn on the
 *        plan, the 3D view and the site sheet, typed bearings in the drawing tools (lib/draw/snap.ts), and the
 *        Property Line tool (lib/draw/tools.ts).
 * DEBUG  - Coordinates are off by a few metres: the local conversion treats the site as flat (a tangent plane
 *          at the base point), which is good to centimetres within a mile; check the base point instead.
 *        - The property line looks rotated on the map: `north` is the angle from up-on-the-plan (model +Y) to
 *          true north, clockwise. A plan drawn with north up has north = 0.
 *        - Bearings read as true bearings; a typed bearing is turned into a model direction with `north`.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */

type V2 = [number, number];

/** Where the project sits on the earth: its base point, true north, and the property line. */
export interface SiteGeo {
  /** latitude of the project base point (model 0, 0), degrees north (WGS 84) */
  lat: number;
  /** longitude of the project base point, degrees east (west is negative) */
  lon: number;
  /** degrees from up-on-the-plan (model +Y) to true north, clockwise */
  north: number;
  /** the property line: its corners in model feet, in order */
  boundary?: V2[];
  /**
   * how the location was set: a sample's approximate spot, an address search, typed, or the device's position.
   * Missing while the site is not placed on the map yet (a property line drawn first): lat / lon are then 0.
   */
  source?: "sample" | "search" | "typed" | "device";
}

/** Is the site placed on the map (so its latitude and longitude mean something)? */
export const isPlaced = (site: SiteGeo | undefined): site is SiteGeo => !!site?.source;

/** A site that is not on the map yet: only true north and, later, a property line. */
export const UNPLACED: SiteGeo = { lat: 0, lon: 0, north: 0 };

/** Feet to metres. */
export const FT = 0.3048;
/** One statute mile in metres. */
export const MILE_M = 1609.344;
/** Square feet in an acre. */
export const ACRE_SF = 43560;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
/** An angle in [0, 360). */
export const norm360 = (a: number) => ((a % 360) + 360) % 360;

/** Metres in one degree of latitude and of longitude at a latitude (WGS 84 series, good to a centimetre per km). */
export function metresPerDegree(lat: number): { lat: number; lon: number } {
  const p = rad(lat);
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p) - 0.0023 * Math.cos(6 * p),
    lon: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p),
  };
}

/** True east and north offsets (feet) of a model point from the base point. */
export function toEN(geo: Pick<SiteGeo, "north">, pt: V2): V2 {
  const t = rad(geo.north);
  return [pt[0] * Math.cos(t) - pt[1] * Math.sin(t), pt[0] * Math.sin(t) + pt[1] * Math.cos(t)];
}

/** The model point (feet) at true east / north offsets from the base point. */
export function fromEN(geo: Pick<SiteGeo, "north">, en: V2): V2 {
  const t = rad(geo.north);
  return [en[0] * Math.cos(t) + en[1] * Math.sin(t), -en[0] * Math.sin(t) + en[1] * Math.cos(t)];
}

/** Latitude and longitude of a model point. */
export function toLatLon(geo: SiteGeo, pt: V2): { lat: number; lon: number } {
  const [e, n] = toEN(geo, pt);
  const m = metresPerDegree(geo.lat);
  return { lat: geo.lat + (n * FT) / m.lat, lon: geo.lon + (e * FT) / m.lon };
}

/** The model point (feet) at a latitude and longitude. */
export function fromLatLon(geo: SiteGeo, lat: number, lon: number): V2 {
  const m = metresPerDegree(geo.lat);
  return fromEN(geo, [((lon - geo.lon) * m.lon) / FT, ((lat - geo.lat) * m.lat) / FT]);
}

/** True azimuth (degrees clockwise from true north) of the line from a to b. */
export function azimuth(geo: Pick<SiteGeo, "north">, a: V2, b: V2): number {
  const [e, n] = toEN(geo, [b[0] - a[0], b[1] - a[1]]);
  return norm360(deg(Math.atan2(e, n)));
}

/** The model direction (unit vector) of a true azimuth. */
export function dirOfAzimuth(geo: Pick<SiteGeo, "north">, az: number): V2 {
  return fromEN(geo, [Math.sin(rad(az)), Math.cos(rad(az))]);
}

/** Degrees, minutes and seconds of an angle, the seconds rounded. */
function dmsParts(a: number, secDigits = 0): [number, number, number] {
  const f = 10 ** secDigits;
  let s = Math.round(Math.abs(a) * 3600 * f) / f;
  const d = Math.floor(s / 3600);
  s -= d * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  return [d, m, Number(s.toFixed(secDigits))];
}

/** A surveyor's quadrant bearing of a true azimuth: N 45°30'15" E. */
export function bearingText(az: number): string {
  const a = norm360(az);
  const [ns, ew, q] = a <= 90 ? ["N", "E", a] : a <= 180 ? ["S", "E", 180 - a] : a <= 270 ? ["S", "W", a - 180] : ["N", "W", 360 - a];
  const [d, m, s] = dmsParts(q);
  return `${ns} ${d}°${String(m).padStart(2, "0")}'${String(s).padStart(2, "0")}" ${ew}`;
}

const BEARING = /^([NS])\s*(\d+(?:\.\d+)?)\s*(?:[°d]\s*(?:(\d+(?:\.\d+)?)\s*['m′]\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|''|″|s)\s*)?)?\s*([EW])$/i;

/** The true azimuth of a typed bearing ("N45°30'E", "S 12d30m15s W", "N12.5E"); null when it is not one. */
export function parseBearing(text: string): number | null {
  const m = BEARING.exec(text.trim());
  if (!m) return null;
  const q = Number(m[2]) + (m[3] ? Number(m[3]) / 60 : 0) + (m[4] ? Number(m[4]) / 3600 : 0);
  if (q > 90) return null;
  const ns = m[1].toUpperCase();
  const ew = m[5].toUpperCase();
  if (ns === "N" && ew === "E") return q;
  if (ns === "S" && ew === "E") return 180 - q;
  if (ns === "S" && ew === "W") return 180 + q;
  return norm360(360 - q);
}

/** "25.759300° N" / "80.237800° W". */
export function fmtLat(lat: number, digits = 6): string {
  return `${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? "N" : "S"}`;
}
/** Longitude with a hemisphere letter. */
export function fmtLon(lon: number, digits = 6): string {
  return `${Math.abs(lon).toFixed(digits)}° ${lon >= 0 ? "E" : "W"}`;
}
/** Degrees, minutes and seconds with a hemisphere letter: 25°45'33.5" N. */
export function fmtDms(v: number, axis: "lat" | "lon"): string {
  const [d, m, s] = dmsParts(v, 1);
  const h = axis === "lat" ? (v >= 0 ? "N" : "S") : v >= 0 ? "E" : "W";
  return `${d}°${String(m).padStart(2, "0")}'${s.toFixed(1).padStart(4, "0")}" ${h}`;
}

const DMS = /^(\d+(?:\.\d+)?)\s*[°d\s]\s*(?:(\d+(?:\.\d+)?)\s*['m′]?\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|''|″|s)?\s*)?([NSEW])$/i;

/** One coordinate typed as decimal degrees (-80.2378) or degrees, minutes, seconds (80°14'16"W). */
export function parseCoord(text: string): number | null {
  const t = text.trim();
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return Number(t);
  const m = DMS.exec(t);
  if (!m) return null;
  const v = Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0) + (m[3] ? Number(m[3]) / 3600 : 0);
  return /[SW]/i.test(m[4]) ? -v : v;
}

/** A latitude, longitude pair typed or pasted ("25.7593, -80.2378", "25°45'33\"N 80°14'16\"W"). */
export function parseLatLon(text: string): { lat: number; lon: number } | null {
  const t = text.trim();
  const parts = t.includes(",") ? t.split(",") : t.split(/\s+(?=[-\d])/);
  if (parts.length !== 2) return null;
  const lat = parseCoord(parts[0]);
  const lon = parseCoord(parts[1]);
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/* ── the property line ────────────────────────────────────────────────── */
/** One side of the property line: its bearing and length. */
export interface Course {
  from: number;
  to: number;
  azimuth: number;
  bearing: string;
  /** feet */
  length: number;
}

/** Area (square feet), perimeter (feet) and courses of a property line. */
export function boundaryInfo(geo: SiteGeo, pts: V2[]): { area: number; perimeter: number; courses: Course[] } {
  let a2 = 0;
  let perimeter = 0;
  const courses: Course[] = [];
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    a2 += p[0] * q[1] - q[0] * p[1];
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    perimeter += length;
    const az = azimuth(geo, p, q);
    courses.push({ from: i, to: (i + 1) % pts.length, azimuth: az, bearing: bearingText(az), length });
  });
  return { area: Math.abs(a2) / 2, perimeter, courses };
}

/** Area in the units engineers quote: square feet and acres, or square metres and hectares. */
export function fmtSiteArea(sqft: number, metric: boolean): string {
  return metric ? `${(sqft * FT * FT).toFixed(1)} m² · ${((sqft * FT * FT) / 10000).toFixed(4)} ha` : `${Math.round(sqft).toLocaleString("en-US")} sf · ${(sqft / ACRE_SF).toFixed(3)} ac`;
}

/** The centre of the property line, or the base point when there is none. */
export function siteCentre(geo: SiteGeo): { lat: number; lon: number } {
  const b = geo.boundary;
  if (!b?.length) return { lat: geo.lat, lon: geo.lon };
  const c: V2 = [b.reduce((s, p) => s + p[0], 0) / b.length, b.reduce((s, p) => s + p[1], 0) / b.length];
  return toLatLon(geo, c);
}

/* ── links an engineer opens the site with ────────────────────────────── */
const ll = (lat: number, lon: number) => `${lat.toFixed(6)},${lon.toFixed(6)}`;

/** Google Maps with a pin on the point (Maps URLs, no key needed). */
export const googleMapsUrl = (lat: number, lon: number) => `https://www.google.com/maps/search/?api=1&query=${ll(lat, lon)}`;
/** Google Maps satellite imagery centred on the point. */
export const googleSatelliteUrl = (lat: number, lon: number, zoom = 18) => `https://www.google.com/maps/@?api=1&map_action=map&center=${ll(lat, lon)}&zoom=${zoom}&basemap=satellite`;
/** Google Earth in the browser, looking down from `rangeM` metres. */
export const googleEarthUrl = (lat: number, lon: number, rangeM = 3500) => `https://earth.google.com/web/@${ll(lat, lon)},0a,${Math.round(rangeM)}d,35y,0h,0t,0r`;
/** OpenStreetMap at a zoom level. */
export const osmUrl = (lat: number, lon: number, zoom = 17) => `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lon.toFixed(6)}#map=${zoom}/${lat.toFixed(6)}/${lon.toFixed(6)}`;

/** Points of a circle on the ground ([lat, lon]), `radiusM` metres around a point. */
export function circleLatLon(lat: number, lon: number, radiusM: number, n = 72): [number, number][] {
  const m = metresPerDegree(lat);
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([lat + (radiusM * Math.cos(a)) / m.lat, lon + (radiusM * Math.sin(a)) / m.lon]);
  }
  return out;
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const kmlRing = (pts: [number, number][]) => pts.map(([la, lo]) => `${lo.toFixed(7)},${la.toFixed(7)},0`).join(" ");

/** A KML file (Google Earth, Google My Maps, GIS) with the base point, the property line and a radius around the site. */
export function siteKml(name: string, geo: SiteGeo, radiusMiles: number): string {
  const c = siteCentre(geo);
  const parts: string[] = [];
  parts.push(`<Placemark><name>${xml(name)} · base point</name><Point><coordinates>${geo.lon.toFixed(7)},${geo.lat.toFixed(7)},0</coordinates></Point></Placemark>`);
  if (geo.boundary && geo.boundary.length >= 3) {
    const ring = [...geo.boundary, geo.boundary[0]].map((p) => {
      const q = toLatLon(geo, p);
      return [q.lat, q.lon] as [number, number];
    });
    const info = boundaryInfo(geo, geo.boundary);
    const desc = info.courses.map((k) => `P${k.from + 1}–P${k.to + 1}: ${k.bearing}, ${k.length.toFixed(2)} ft`).join("\n");
    parts.push(
      `<Placemark><name>${xml(name)} · property line</name><description>${xml(`${fmtSiteArea(info.area, false)}\n${desc}`)}</description><styleUrl>#lot</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>${kmlRing(ring)}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`,
    );
    geo.boundary.forEach((p, i) => {
      const q = toLatLon(geo, p);
      parts.push(`<Placemark><name>P${i + 1}</name><styleUrl>#corner</styleUrl><Point><coordinates>${q.lon.toFixed(7)},${q.lat.toFixed(7)},0</coordinates></Point></Placemark>`);
    });
  }
  parts.push(
    `<Placemark><name>${radiusMiles} mi radius</name><styleUrl>#radius</styleUrl><LineString><tessellate>1</tessellate><coordinates>${kmlRing(circleLatLon(c.lat, c.lon, radiusMiles * MILE_M))}</coordinates></LineString></Placemark>`,
  );
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(name)}</name>`,
    `<Style id="lot"><LineStyle><color>ff00d7ff</color><width>3</width></LineStyle><PolyStyle><color>3300d7ff</color></PolyStyle></Style>`,
    `<Style id="corner"><IconStyle><scale>0.6</scale></IconStyle></Style>`,
    `<Style id="radius"><LineStyle><color>ffff8d4c</color><width>2</width></LineStyle></Style>`,
    ...parts,
    `</Document></kml>`,
  ].join("\n");
}

/* ── Web Mercator tiles (Google Maps, OpenStreetMap, Esri) ────────────── */
/** Map tiles are 256 px squares. */
export const TILE = 256;
/** X in tile units at a zoom level. */
export const mercX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
/** Y in tile units at a zoom level (0 at the top, 85.05° N). */
export const mercY = (lat: number, z: number) => {
  const p = rad(Math.max(-85.05112878, Math.min(85.05112878, lat)));
  return ((1 - Math.log(Math.tan(p) + 1 / Math.cos(p)) / Math.PI) / 2) * 2 ** z;
};
/** Longitude of an X in tile units. */
export const lonOfX = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
/** Latitude of a Y in tile units. */
export const latOfY = (y: number, z: number) => deg(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))));
/** Metres on the ground per screen pixel at a latitude and zoom. */
export const metresPerPixel = (lat: number, z: number) => (156543.03392 * Math.cos(rad(lat))) / 2 ** z;
/** The zoom at which a circle of `radiusM` fills `px` pixels across (with a little margin). */
export const zoomForRadius = (lat: number, radiusM: number, px: number) => Math.log2((156543.03392 * Math.cos(rad(lat)) * px) / (radiusM * 2.2));
