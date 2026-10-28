/**
 * lib/geo.test.ts
 *
 * WHAT   Unit tests of the site location maths (geo.ts): model point ↔ latitude / longitude with and without a
 *        rotated true north, surveyor bearings written and read, typed coordinates, the property line's area and
 *        courses, the map links, the KML file and the Web Mercator tile maths.
 * FOR    `npm test`.
 * DEBUG  - A latitude / longitude off in the 7th decimal: compare with `near` and a tolerance, never exactly.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACRE_SF, azimuth, bearingText, boundaryInfo, circleLatLon, dirOfAzimuth, FT, fmtDms, fmtLat, fmtLon, fromLatLon, googleEarthUrl, googleMapsUrl, latOfY, lonOfX, mercX, mercY,
  metresPerDegree, metresPerPixel, MILE_M, parseBearing, parseLatLon, siteKml, toEN, toLatLon, type SiteGeo,
} from "./geo";

const near = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const MIAMI: SiteGeo = { lat: 25.7593, lon: -80.2378, north: 0 };

describe("model point ↔ latitude / longitude", () => {
  it("puts the base point at the site's latitude and longitude", () => {
    const p = toLatLon(MIAMI, [0, 0]);
    near(p.lat, MIAMI.lat);
    near(p.lon, MIAMI.lon);
  });
  it("moves north by the right number of degrees for 1000 ft", () => {
    const p = toLatLon(MIAMI, [0, 1000]);
    near(p.lat - MIAMI.lat, (1000 * FT) / metresPerDegree(MIAMI.lat).lat, 1e-12);
    near(p.lon, MIAMI.lon);
  });
  it("goes there and back with a rotated true north", () => {
    const geo = { ...MIAMI, north: 30 };
    for (const pt of [[120, -45], [-300, 800], [0.5, 0.25]] as [number, number][]) {
      const q = toLatLon(geo, pt);
      const back = fromLatLon(geo, q.lat, q.lon);
      near(back[0], pt[0], 1e-6);
      near(back[1], pt[1], 1e-6);
    }
  });
  it("turns plan-up into true east when true north points to the right of the plan", () => {
    const [e, n] = toEN({ north: 90 }, [0, 10]);
    near(e, -10);
    near(n, 0, 1e-12);
    const [e2, n2] = toEN({ north: 90 }, [10, 0]);
    near(e2, 0, 1e-12);
    near(n2, 10);
  });
  it("agrees with the known length of a degree of latitude", () => {
    near(metresPerDegree(0).lat, 110574, 2);
    near(metresPerDegree(45).lat, 111132, 2);
    near(metresPerDegree(0).lon, 111320, 2);
  });
});

describe("bearings", () => {
  it("writes quadrant bearings", () => {
    assert.equal(bearingText(0), `N 0°00'00" E`);
    assert.equal(bearingText(45.5), `N 45°30'00" E`);
    assert.equal(bearingText(135), `S 45°00'00" E`);
    assert.equal(bearingText(200.25), `S 20°15'00" W`);
    assert.equal(bearingText(359.5), `N 0°30'00" W`);
  });
  it("reads typed bearings in several spellings", () => {
    near(parseBearing(`N45°30'E`)!, 45.5);
    near(parseBearing(`S 12d30m15s W`)!, 180 + 12 + 30 / 60 + 15 / 3600);
    near(parseBearing("S45E")!, 135);
    near(parseBearing("n10.5w")!, 349.5);
    assert.equal(parseBearing("N95E"), null);
    assert.equal(parseBearing("hello"), null);
  });
  it("measures the azimuth of a line and turns it back into a direction", () => {
    near(azimuth(MIAMI, [0, 0], [10, 10]), 45);
    near(azimuth({ north: 90 }, [0, 0], [10, 0]), 0, 1e-9);
    const d = dirOfAzimuth({ north: 0 }, 90);
    near(d[0], 1);
    near(d[1], 0, 1e-12);
  });
});

describe("typed coordinates", () => {
  it("reads decimal pairs and degrees-minutes-seconds pairs", () => {
    const a = parseLatLon("25.7593, -80.2378")!;
    near(a.lat, 25.7593);
    near(a.lon, -80.2378);
    const b = parseLatLon(`25°45'33.5"N 80°14'16.1"W`)!;
    near(b.lat, 25 + 45 / 60 + 33.5 / 3600, 1e-9);
    near(b.lon, -(80 + 14 / 60 + 16.1 / 3600), 1e-9);
    const c = parseLatLon("17.1310 -61.8440")!;
    near(c.lon, -61.844);
    assert.equal(parseLatLon("95, 10"), null);
  });
  it("writes coordinates with hemispheres", () => {
    assert.equal(fmtLat(25.7593, 4), "25.7593° N");
    assert.equal(fmtLon(-80.2378, 4), "80.2378° W");
    assert.equal(fmtDms(-80.2378, "lon"), `80°14'16.1" W`);
  });
});

describe("property line", () => {
  it("gives area, perimeter and the courses of a 50 × 100 ft lot", () => {
    const info = boundaryInfo(MIAMI, [[0, 0], [50, 0], [50, 100], [0, 100]]);
    near(info.area, 5000);
    near(info.perimeter, 300);
    assert.equal(info.courses.length, 4);
    assert.equal(info.courses[0].bearing, `N 90°00'00" E`);
    assert.equal(info.courses[1].bearing, `N 0°00'00" E`);
    near(info.courses[1].length, 100);
    near(43560 / ACRE_SF, 1);
  });
  it("builds a KML file with the lot, its corners and the radius", () => {
    const k = siteKml("Lot <A>", { ...MIAMI, boundary: [[0, 0], [50, 0], [50, 100], [0, 100]] }, 1);
    assert.match(k, /<kml xmlns="http:\/\/www.opengis.net\/kml\/2.2">/);
    assert.match(k, /Lot &lt;A&gt; · property line/);
    assert.equal((k.match(/<name>P\d<\/name>/g) ?? []).length, 4);
    assert.match(k, /1 mi radius/);
    assert.match(k, /-80\.2378000,25\.7593000,0/);
  });
  it("draws a circle of the right size", () => {
    const ring = circleLatLon(MIAMI.lat, MIAMI.lon, MILE_M, 4);
    near((ring[0][0] - MIAMI.lat) * metresPerDegree(MIAMI.lat).lat, MILE_M, 1e-6);
    near((ring[1][1] - MIAMI.lon) * metresPerDegree(MIAMI.lat).lon, MILE_M, 1e-6);
  });
});

describe("map links and tiles", () => {
  it("links to Google Maps and Google Earth at the point", () => {
    assert.equal(googleMapsUrl(25.7593, -80.2378), "https://www.google.com/maps/search/?api=1&query=25.759300,-80.237800");
    assert.match(googleEarthUrl(25.7593, -80.2378, 3000), /^https:\/\/earth\.google\.com\/web\/@25\.759300,-80\.237800,0a,3000d/);
  });
  it("projects to Web Mercator and back", () => {
    for (const z of [3, 14, 18]) {
      near(lonOfX(mercX(-80.2378, z), z), -80.2378, 1e-9);
      near(latOfY(mercY(25.7593, z), z), 25.7593, 1e-9);
    }
    near(mercX(0, 0), 0.5);
    near(mercY(0, 0), 0.5);
    near(metresPerPixel(0, 0), 156543.03392, 1e-6);
  });
});
