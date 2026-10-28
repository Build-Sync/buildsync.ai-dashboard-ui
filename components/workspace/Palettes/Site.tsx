/**
 * components/workspace/Palettes/Site.tsx
 *
 * WHAT   The Site palette: where the project is on the earth and its property line. Location: find the address
 *        (OpenStreetMap search), type or paste the latitude and longitude of the base point (decimal or degrees,
 *        minutes, seconds), or take this device's position; and the angle to true north. A live map (SiteMap)
 *        shows the site with its property line and a ¼, ½, 1, 2, 5 or 10 mile radius on satellite imagery or streets.
 *        Buttons open the same place in Google Maps (pin or satellite), Google Earth and OpenStreetMap, download
 *        a KML (property line + radius, for Google Earth / My Maps / GIS) and copy the coordinates. The property
 *        line table lists every corner (northing and easting from the base point, latitude and longitude, all
 *        editable), every course (bearing and length), the area and perimeter, and exports them as CSV.
 *        Site from the Map makes a site plan from the coordinates: the ground's contours from public elevation data
 *        (lib/sitemap.ts) and the satellite photo under the plan, with the site plan and topography sheets.
 *        Ground (at the top): the kind of ground (lawn, dirt, clay, loam, sand, gravel, rock; lib/ground.ts), which
 *        changes its look in 3D and on the sheets and the presumptive soil values the checks use.
 * FOR    Engineers checking a site: the coordinates of the boundary corners and the land around it. Every change
 *        is one undoable edit of project.site (lib/geo.ts) and is saved with the project.
 * OS     Address search and map tiles need an internet connection; everything else works offline. Links open
 *        in a new browser tab (the system browser in a desktop build).
 * DEBUG  - "Not on the map yet": no location was set; corners then have no latitude / longitude.
 *        - The address is found in the wrong place: the search returns the best match only; type the latitude
 *          and longitude from a survey instead.
 *        - Northing / easting look rotated against the plan: they are true north / east; the plan is turned by
 *          the north angle.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useState, type KeyboardEvent } from "react";
import { Icon, type IconKey } from "@/components/icons";
import { EmptyState, KV, Section, Segmented, Spinner } from "@/components/ui/controls";
import { tip } from "@/components/ui/Tooltip";
import { applyChange } from "@/lib/draw/change";
import { parseLen } from "@/lib/draw/snap";
import {
  boundaryInfo, fmtDms, fmtLat, fmtLon, fmtSiteArea, fromEN, fromLatLon, googleEarthUrl, googleMapsUrl, googleSatelliteUrl, isPlaced, osmUrl, parseLatLon, siteCentre, siteKml,
  toEN, toLatLon, UNPLACED, type SiteGeo,
} from "@/lib/geo";
import { saveCsv, saveFile } from "@/lib/save-file";
import { AERIAL_CREDIT, aerialItem, areaAround, groundFromMap } from "@/lib/sitemap";
import { setGround } from "@/lib/commands";
import { GROUNDS, GROUND_TYPES } from "@/lib/ground";
import { ViewportDefs } from "../Viewport/Overlays";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn, fmtLength, uid, type MeasureSystem } from "@/lib/utils";
import { openView } from "@/lib/views";
import { useRunner, useScene } from "../hooks";
import { SiteMap, type Basemap } from "./SiteMap";

type V2 = [number, number];
const RADII = [0.25, 0.5, 1, 2, 5, 10] as const;
const radiusLabel = (r: number) => (r === 0.25 ? "¼ mi" : r === 0.5 ? "½ mi" : `${r} mi`);

/** A length in feet as the number shown in a field, in the project's units. */
const toField = (ft: number, sys: MeasureSystem) => (sys === "imperial" ? ft.toFixed(2) : sys === "metric-m" ? (ft * 0.3048).toFixed(3) : (ft * 304.8).toFixed(0));
const unitName = (sys: MeasureSystem) => (sys === "imperial" ? "ft" : sys === "metric-m" ? "m" : "mm");

/** Commit a field on Enter or when it loses focus. */
const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") e.currentTarget.blur();
};

/** The Site palette body. */
export function SitePalette() {
  const ws = useWsApi();
  const app = useAppApi();
  const { run } = useRunner();
  const scene = useScene();
  const project = useWs((s) => s.project);
  const large = useWs((s) => s.dockSize.palettes === "large");
  const units = useApp((s) => s.settings.units);
  const site = project.site;
  const placed = isPlaced(site);
  // the map's radius and base map live in the store, so Analyze → Traffic Radius can set them
  const radius = useWs((s) => s.mapView.radius);
  const basemap = useWs((s) => s.mapView.base) as Basemap;
  const setRadius = (r: number) => ws.getState().patch({ mapView: { ...ws.getState().mapView, radius: r } });
  const setBasemap = (b: Basemap) => ws.getState().patch({ mapView: { ...ws.getState().mapView, base: b } });
  const [address, setAddress] = useState(project.address);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const sys = units.system;
  const fmt = (ft: number) => fmtLength(ft, sys, units.precision);

  /** One undoable change of the site (and the project address, when given). */
  const update = (label: string, patch: Partial<SiteGeo> | null, addr?: string) => {
    const s = ws.getState();
    const cur = s.project.site ?? UNPLACED;
    s.edit(label, (st) => {
      const out = applyChange(st, { site: patch === null ? null : { ...cur, ...patch } });
      if (addr !== undefined) out.project = { ...(out.project ?? st.project), address: addr };
      return out;
    });
  };
  const place = (lat: number, lon: number, source: SiteGeo["source"], label: string) => {
    update("Site location", { lat, lon, source }, address.trim() || undefined);
    app.getState().log("ok", `✓ Site placed at ${fmtLat(lat)}, ${fmtLon(lon)} (${label})`);
    setMsg(null);
  };

  const find = async () => {
    const q = address.trim();
    if (!q) return setMsg("Type an address first.");
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, { headers: { Accept: "application/json" } });
      const hits = (await r.json()) as { lat: string; lon: string; display_name: string }[];
      if (!hits.length) setMsg("No place found for that address. Type the latitude and longitude instead.");
      else place(Number(hits[0].lat), Number(hits[0].lon), "search", hits[0].display_name);
    } catch {
      setMsg("The address search needs an internet connection. Type the latitude and longitude instead.");
    }
    setBusy(false);
  };

  const here = () => {
    if (!navigator.geolocation) return setMsg("This browser cannot tell its position.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(false);
        place(p.coords.latitude, p.coords.longitude, "device", `this device, ±${Math.round(p.coords.accuracy)} m`);
      },
      () => {
        setBusy(false);
        setMsg("The position was not shared. Allow location access, or type the coordinates.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const boundary = site?.boundary;
  const info = site && boundary && boundary.length >= 3 ? boundaryInfo(site, boundary) : null;
  const setCorner = (i: number, pt: V2) => {
    if (!site || !boundary) return;
    update(`Property corner P${i + 1}`, { boundary: boundary.map((q, j) => (j === i ? pt : q)) });
  };
  const centre = placed && site ? siteCentre(site) : null;
  const f = scene.footprint;
  const footprint: V2[] = [[f.x0, f.y0], [f.x1, f.y0], [f.x1, f.y1], [f.x0, f.y1]];

  const exportCsv = () => {
    if (!site || !boundary) return;
    const rows: string[][] = [["Corner", `Northing (${unitName(sys)})`, `Easting (${unitName(sys)})`, "Latitude", "Longitude"]];
    boundary.forEach((p, i) => {
      const [e, n] = toEN(site, p);
      const g = placed ? toLatLon(site, p) : null;
      rows.push([`P${i + 1}`, toField(n, sys), toField(e, sys), g ? g.lat.toFixed(7) : "", g ? g.lon.toFixed(7) : ""]);
    });
    rows.push([]);
    rows.push(["Course", "Bearing", `Length (${unitName(sys)})`]);
    info?.courses.forEach((c) => rows.push([`P${c.from + 1}–P${c.to + 1}`, c.bearing, toField(c.length, sys)]));
    rows.push([]);
    rows.push(["Area", info ? fmtSiteArea(info.area, sys !== "imperial") : ""]);
    saveCsv(`${project.name}-property-line.csv`, rows);
  };

  const link = (href: string, label: string, icon: IconKey, testId: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="btn !h-7 !justify-start !px-2" data-testid={testId}>
      <Icon name={icon} size={13} className="text-t2" />
      {label}
      <Icon name="external" size={11} className="ml-auto text-t3" />
    </a>
  );

  return (
    <div data-testid="site-palette">
      <Section title="Ground">
        <GroundPicker />
      </Section>
      <Section title="Location">
        <div className="space-y-2">
          <div className={cn("flex items-start gap-2 rounded-md border px-2 py-1.5 text-[0.75rem]", placed ? "border-ok/30 bg-ok/5" : "border-warn/40 bg-warn/5")} data-testid="site-status">
            <Icon name={placed ? "map" : "warn"} size={14} className={cn("mt-px shrink-0", placed ? "text-ok" : "text-warn")} />
            {placed && site ? (
              <span className="min-w-0">
                <span className="mono block text-t1" data-testid="site-coords">
                  {fmtLat(site.lat)}, {fmtLon(site.lon)}
                </span>
                <span className="mono block text-[0.6875rem] text-t2">
                  {fmtDms(site.lat, "lat")} {fmtDms(site.lon, "lon")}
                </span>
                <span className="block text-[0.6875rem] text-t3">
                  Base point (0, 0) of the model{site.source === "sample" ? " · sample spot, approximate" : site.source === "device" ? " · from this device" : site.source === "search" ? " · from the address" : ""}
                </span>
              </span>
            ) : (
              <span className="text-t1">Not on the map yet. Find the address, type the coordinates, or use this device&apos;s position.</span>
            )}
          </div>

          <label className="block text-[0.6875rem] text-t2">
            Address
            <span className="mt-0.5 flex gap-1">
              <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void find()} placeholder="Street, city, country" aria-label="Site Address" data-testid="site-address" />
              <button className="btn shrink-0" onClick={() => void find()} disabled={busy} {...tip("Find the Address", "Searches OpenStreetMap (Nominatim) and places the base point there")}>
                <Icon name="search" size={13} />
                Find
              </button>
            </span>
          </label>

          <label className="block text-[0.6875rem] text-t2">
            Latitude, longitude of the base point
            <span className="mt-0.5 flex gap-1">
              <input
                key={placed && site ? `${site.lat},${site.lon}` : "none"}
                className="input mono"
                defaultValue={placed && site ? `${site.lat.toFixed(7)}, ${site.lon.toFixed(7)}` : ""}
                placeholder={`25.7593, -80.2378  or  25°45'33"N 80°14'16"W`}
                aria-label="Latitude, Longitude"
                data-testid="site-latlon"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const ll = parseLatLon(e.currentTarget.value);
                  if (ll) place(ll.lat, ll.lon, "typed", "typed");
                  else setMsg("Type the latitude and longitude as 25.7593, -80.2378 or 25°45'33\"N 80°14'16\"W.");
                }}
              />
              <button className="btn shrink-0" onClick={here} disabled={busy} {...tip("Use This Device's Position", "Stand on the base point of the site and press this")}>
                <Icon name="target" size={13} />
              </button>
            </span>
          </label>

          <label className="flex items-center gap-2 text-[0.6875rem] text-t2">
            True north from up on the plan
            <input
              key={`north-${site?.north ?? 0}`}
              type="number"
              step={0.5}
              className="input mono !w-20 text-right"
              defaultValue={site?.north ?? 0}
              aria-label="North Angle"
              data-testid="site-north"
              onKeyDown={onEnter}
              onBlur={(e) => {
                const v = Number(e.currentTarget.value);
                if (Number.isFinite(v) && v !== (site?.north ?? 0)) update("North angle", { north: ((v % 360) + 360) % 360 });
              }}
            />
            ° clockwise
          </label>
          {msg && (
            <p className="rounded-md bg-warn/10 px-2 py-1 text-[0.6875rem] text-warn" role="status" data-testid="site-msg">
              {msg}
            </p>
          )}
        </div>
      </Section>

      {placed && site && centre && (
        <Section title="Map and Surroundings">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <Segmented label="Radius" size="sm" value={radius} onChange={setRadius} options={RADII.map((r) => ({ value: r, label: radiusLabel(r) }))} />
              <Segmented label="Map" size="sm" value={basemap} onChange={setBasemap} options={[{ value: "satellite", label: "Satellite" }, { value: "streets", label: "Streets" }]} />
            </div>
            <SiteMap site={site} radiusMiles={radius} basemap={basemap} footprint={footprint} height={large ? 400 : 250} />
            <div className="grid grid-cols-2 gap-1">
              {link(googleMapsUrl(centre.lat, centre.lon), "Google Maps", "map", "open-google-maps")}
              {link(googleSatelliteUrl(centre.lat, centre.lon, radius >= 1 ? 15 : 17), "Satellite", "globe", "open-google-satellite")}
              {link(googleEarthUrl(centre.lat, centre.lon, radius * 1609.344 * 3), "Google Earth", "globe", "open-google-earth")}
              {link(osmUrl(centre.lat, centre.lon, radius >= 1 ? 15 : 17), "OpenStreetMap", "mapIcon", "open-osm")}
            </div>
            <div className="flex gap-1">
              <button
                className="btn flex-1"
                data-testid="site-kml"
                onClick={() => {
                  saveFile(`${project.name}-site.kml`, siteKml(project.name, site, radius), "application/vnd.google-earth.kml+xml");
                  app.getState().log("ok", `✓ ${project.name}-site.kml: property line and ${radiusLabel(radius)} radius (opens in Google Earth, My Maps or a GIS)`);
                }}
                {...tip("Download KML", "The property line, its corners and the radius, for Google Earth, Google My Maps or a GIS")}
              >
                <Icon name="download" size={13} />
                KML
              </button>
              <button
                className="btn flex-1"
                onClick={() => {
                  const text = `${site.lat.toFixed(7)}, ${site.lon.toFixed(7)}`;
                  void navigator.clipboard?.writeText(text).then(
                    () => app.getState().toast(`Copied ${text}`, "ok"),
                    () => app.getState().toast(text, "info"),
                  );
                }}
                {...tip("Copy Coordinates", "Latitude, longitude of the base point")}
              >
                <Icon name="copy" size={13} />
                Copy
              </button>
            </div>
          </div>
        </Section>
      )}

      <Section title="Site from the Map">
        <SiteFromMap />
      </Section>
      <Section title="Property Line">
        {!site || !boundary || boundary.length < 3 || !info ? (
          <EmptyState
            icon="compass"
            title="No property line yet"
            hint="Draw it over a site plan or survey: click the corners, or type a bearing and distance for each course (N45°30'E 120)."
            action={
              <button className="btn btn-primary" onClick={() => run("PROPLINE")} data-testid="draw-propline">
                <Icon name="compass" size={13} />
                Draw Property Line
              </button>
            }
          />
        ) : (
          <div className="space-y-2" data-testid="property-table">
            <KV k="Area" v={fmtSiteArea(info.area, sys !== "imperial")} />
            <KV k="Perimeter" v={fmt(info.perimeter)} />
            <div className="overflow-x-auto">
              <table className="mono w-full text-[0.6875rem]">
                <thead>
                  <tr className="text-left text-t3">
                    <th className="py-1 pr-1 font-medium">#</th>
                    <th className="pr-1 font-medium">N ({unitName(sys)})</th>
                    <th className="pr-1 font-medium">E ({unitName(sys)})</th>
                    {placed && <th className="pr-1 font-medium">Lat, Lon</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {boundary.map((p, i) => {
                    const [e, n] = toEN(site, p);
                    const g = placed ? toLatLon(site, p) : null;
                    const field = (value: string, label: string, commit: (text: string) => void, wide = false) => (
                      <input
                        key={`${label}-${value}`}
                        className={cn("input mono !h-6 !px-1 text-right", wide ? "!w-[11.5rem]" : "!w-[4.75rem]")}
                        defaultValue={value}
                        aria-label={label}
                        onKeyDown={onEnter}
                        onBlur={(ev) => ev.currentTarget.value !== value && commit(ev.currentTarget.value)}
                      />
                    );
                    return (
                      <tr key={i} data-testid="corner-row">
                        <td className="pr-1 font-semibold text-t1">P{i + 1}</td>
                        <td className="pr-1">
                          {field(toField(n, sys), `P${i + 1} Northing`, (t) => {
                            const v = parseLen(t, sys);
                            if (v !== null) setCorner(i, fromEN(site, [e, v]));
                          })}
                        </td>
                        <td className="pr-1">
                          {field(toField(e, sys), `P${i + 1} Easting`, (t) => {
                            const v = parseLen(t, sys);
                            if (v !== null) setCorner(i, fromEN(site, [v, n]));
                          })}
                        </td>
                        {g && (
                          <td className="pr-1">
                            {field(`${g.lat.toFixed(7)}, ${g.lon.toFixed(7)}`, `P${i + 1} Latitude, Longitude`, (t) => {
                              const ll = parseLatLon(t);
                              if (ll) setCorner(i, fromLatLon(site, ll.lat, ll.lon));
                            }, true)}
                          </td>
                        )}
                        <td>
                          <button
                            className="grid size-5 place-items-center rounded text-t3 hover:bg-bad/15 hover:text-bad disabled:opacity-30"
                            disabled={boundary.length <= 3}
                            aria-label={`Remove P${i + 1}`}
                            onClick={() => update(`Remove P${i + 1}`, { boundary: boundary.filter((_, j) => j !== i) })}
                          >
                            <Icon name="close" size={11} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ol className="space-y-0.5 text-[0.6875rem]" data-testid="course-list">
              {info.courses.map((c) => (
                <li key={c.from} className="mono flex justify-between gap-2 text-t2">
                  <span className="text-t3">
                    P{c.from + 1}–P{c.to + 1}
                  </span>
                  <span className="text-t1">{c.bearing}</span>
                  <span>{fmt(c.length)}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-1">
              <button className="btn" onClick={() => run("PROPLINE")} {...tip("Redraw", "Draw the property line again (it replaces this one)", "PROPLINE")}>
                <Icon name="compass" size={13} />
                Redraw
              </button>
              <button
                className="btn"
                onClick={() => {
                  const a = boundary[boundary.length - 1];
                  const b = boundary[0];
                  update("Add property corner", { boundary: [...boundary, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]] });
                }}
                {...tip("Add Corner", "Adds a corner halfway along the last side; then type its coordinates")}
              >
                <Icon name="plus" size={13} />
                Corner
              </button>
              <button className="btn" onClick={exportCsv} data-testid="site-csv" {...tip("Export CSV", "Corners (northing, easting, latitude, longitude), courses and area")}>
                <Icon name="download" size={13} />
                CSV
              </button>
              <button className="btn btn-danger" onClick={() => update("Remove property line", { boundary: undefined })} {...tip("Remove", "Removes the property line (Undo brings it back)")}>
                <Icon name="trash" size={13} />
              </button>
            </div>
            {!placed && <p className="text-[0.6875rem] text-t3">Place the site on the map (Location above) to see each corner&apos;s latitude and longitude.</p>}
          </div>
        )}
      </Section>
    </div>
  );
}

/** Site from the Map: the ground (contours) from public elevation data and the satellite photo under the plan, from the site's coordinates. */
function SiteFromMap() {
  const ws = useWsApi();
  const app = useAppApi();
  const scene = useScene();
  const site = useWs((s) => s.project.site);
  const terrain = useWs((s) => s.project.terrain);
  const units = useApp((s) => s.settings.units);
  const [margin, setMargin] = useState(100);
  const [contourStep, setContourStep] = useState(1);
  const [busy, setBusy] = useState<"ground" | "photo" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fmt = (ft: number) => fmtLength(ft, units.system, units.precision);
  if (!isPlaced(site)) return <p className="px-0.5 py-1 text-[0.75rem] text-t3">Place the site on the map first (Location, above): the ground and the photo come from its coordinates.</p>;
  const area = areaAround(site, scene.footprint, margin);
  const f = scene.footprint;
  const centre: V2 = [(f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2];

  const ground = async () => {
    setBusy("ground");
    setMsg(null);
    try {
      const r = await groundFromMap(site, area, centre, scene.grade, contourStep);
      ws.getState().edit("Ground from the map", (st) => ({ project: { ...st.project, terrain: r.terrain } }));
      const zs = r.terrain.grid.z;
      app.getState().log("ok", `✓ Ground from the map: ${r.terrain.contours.length} contours every ${fmt(contourStep)} over ${fmt(area.x1 - area.x0)} × ${fmt(area.y1 - area.y0)}; the ground falls ${fmt(Math.max(...zs) - Math.min(...zs))} across it; about ${Math.round(r.seaLevel)} ft above sea level at the building`);
      setMsg("Done. Approximate public data (10–30 m apart): it shows the lie of the land, not a survey.");
      openView(ws.getState(), { kind: "topo" });
    } catch (e) {
      setMsg(e instanceof Error && e.message !== "tile" ? e.message : "Couldn't read the elevation tiles. This needs an internet connection.");
    }
    setBusy(null);
  };

  const photo = () => {
    if (Math.abs(site.north) > 0.01) return setMsg("The photo is placed north-up: set the north angle to 0° first (Location, above), or trace from the live map.");
    const item = aerialItem(site, area, scene.grade, uid("U"));
    if (!item) return setMsg("That area is too large for one photo: make the margin smaller.");
    const s = ws.getState();
    const tiles = JSON.parse(String(item.p.tiles)) as unknown[];
    const w = Number(item.p.w);
    const h = Number(item.p.h);
    // one photo at a time: a new one replaces the last
    const old = s.drawn.filter((d) => d.kind === "image" && typeof d.p.tiles === "string").map((d) => d.id);
    s.edit("Aerial photo", (st) => applyChange(st, { remove: old, add: [item] }));
    app.getState().log("ok", `✓ Aerial photo under the plan (${tiles.length} tiles, ${fmt(w)} × ${fmt(h)}). ${AERIAL_CREDIT}. Trace over it on the 2D plan.`);
    setMsg(null);
    s.setView("2d");
  };

  return (
    <div className="space-y-2 text-[0.75rem]" data-testid="site-from-map">
      <p className="text-t2">From the site&apos;s coordinates: the ground&apos;s contours from public elevation data, and the satellite photo under the plan to trace the site plan from.</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-t2">
          Around the lot
          <select className="input !h-6 !w-24 !text-[0.75rem]" value={margin} onChange={(e) => setMargin(Number(e.target.value))} aria-label="Margin Around the Lot">
            {[50, 100, 200, 400].map((m) => (
              <option key={m} value={m}>
                {m} ft
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-t2">
          Contours
          <select className="input !h-6 !w-20 !text-[0.75rem]" value={contourStep} onChange={(e) => setContourStep(Number(e.target.value))} aria-label="Contour Interval">
            {[0.5, 1, 2, 5].map((v) => (
              <option key={v} value={v}>
                {v} ft
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button className="btn !h-7" disabled={!!busy} onClick={() => void ground()} data-testid="site-ground">
          {busy === "ground" ? <Spinner size={12} /> : <Icon name="terrain" size={13} />} Get the ground
        </button>
        <button className="btn !h-7" disabled={!!busy} onClick={photo} data-testid="site-photo">
          <Icon name="image" size={13} /> Photo under the plan
        </button>
        <button className="btn !h-7" onClick={() => openView(ws.getState(), { kind: "site" })} data-testid="site-sheet">
          <Icon name="terrain" size={13} /> Site plan sheet
        </button>
        <button className="btn !h-7" onClick={() => openView(ws.getState(), { kind: "topo" })}>
          <Icon name="grading" size={13} /> Topography sheet
        </button>
      </div>
      {terrain && (
        <p className="text-t3" data-testid="site-terrain">
          Ground: {terrain.source.length > 60 ? `${terrain.source.slice(0, 60)}…` : terrain.source} · {terrain.contours.length} contours every {fmt(terrain.interval)}
          {typeof terrain.seaLevel === "number" ? ` · about ${Math.round(terrain.seaLevel)} ft above sea level at the building` : ""}.{" "}
          <button className="text-accent hover:underline" onClick={() => ws.getState().edit("Remove imported ground", (st) => ({ project: { ...st.project, terrain: undefined } }))}>
            Remove
          </button>
        </p>
      )}
      {msg && (
        <p className="text-t2" data-testid="site-map-msg">
          {msg}
        </p>
      )}
    </div>
  );
}

/** The kind of ground: a swatch per type, and what the chosen one means for footings and a septic field. */
function GroundPicker() {
  const ws = useWsApi();
  const app = useAppApi();
  const current = useWs((s) => s.project.ground ?? "lawn");
  const soil = useWs((s) => s.project.soil);
  const g = GROUNDS[current];
  return (
    <div className="space-y-2" data-testid="ground-picker">
      <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Ground Type">
        {GROUND_TYPES.map((id) => {
          const t = GROUNDS[id];
          const on = id === current;
          return (
            <button
              key={id}
              role="radio"
              aria-checked={on}
              data-testid={`ground-${id}`}
              onClick={() => {
                if (on) return;
                setGround(ws, id);
                app.getState().log("ok", `✓ Ground: ${t.label}`);
              }}
              className={cn("flex flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-[0.625rem] leading-tight transition-colors", on ? "border-accent bg-accent/10 text-t1" : "border-line text-t2 hover:border-t3 hover:text-t1")}
              {...tip(t.label, t.desc)}
            >
              <svg width="28" height="16" viewBox="0 0 28 16" aria-hidden="true" className="rounded-sm">
                <rect width="28" height="9" fill={t.top} />
                <rect y="9" width="28" height="7" fill={t.side} />
                <rect width="28" height="9" fill={`url(#bs-ground-${t.pattern})`} />
              </svg>
              {t.label.split(" (")[0]}
            </button>
          );
        })}
      </div>
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <ViewportDefs />
      </svg>
      <div className="rounded-md border border-line px-2 py-1.5 text-[0.6875rem] leading-snug text-t2" data-testid="ground-info">
        <p className="text-t1">{g.desc}.</p>
        <KV k="Soil classes" v={g.uscs} />
        <KV k="Bearing (presumptive)" v={`${g.bearing.toLocaleString("en-US")} psf`} />
        <KV k="Percolation" v={g.perc ? `${g.perc[0]}–${g.perc[1]} min/in` : "does not percolate"} />
        <p className="mt-1">Septic: {g.septic}.</p>
        <p>Footings: {g.footing}.</p>
        <p className="mt-1 text-t3">{soil ? `The soil report (${soil.file}) governs: ${soil.bearing.toLocaleString("en-US")} psf.` : "Code table values (FBC-R Table R401.4.1); a soil report (Insert → Soil Data) governs."}</p>
      </div>
    </div>
  );
}

