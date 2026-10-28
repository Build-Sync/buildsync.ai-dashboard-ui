/**
 * lib/sitemap.test.ts
 *
 * WHAT   Unit tests of lib/sitemap.ts: Terrarium elevation pixels decoded to metres, the area around a lot, and the
 *        satellite photo tiles placed at their true size and position under the plan (and refused when the plan is
 *        not north-up or the area is too large).
 * FOR    `npm test`. The tiles themselves come from the internet, so the browser test (e2e/site.mjs) serves fake
 *        ones; this checks the arithmetic.
 * DEBUG  - The tiles are shifted: fromLatLon / toLatLon in lib/geo.ts or the tile maths (mercX / latOfY) changed.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aerialItem, aerialTiles, areaAround, terrarium } from "./sitemap";
import { metresPerPixel, FT, type SiteGeo } from "./geo";

const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const site: SiteGeo = { lat: 28.5653, lon: -81.176, north: 0, source: "sample", boundary: [[-16, -30], [44, -30], [44, 80], [-16, 80]] };

describe("site from the map", () => {
  it("decodes Terrarium pixels to metres", () => {
    assert.equal(terrarium(128, 0, 0), 0);
    assert.equal(terrarium(128, 30, 128), 30.5);
    assert.equal(terrarium(127, 255, 0), -1);
  });

  it("covers the lot (or the building when there is no lot) with the margin around it", () => {
    assert.deepEqual(areaAround(site, { x0: 0, y0: 0, x1: 28, y1: 38 }, 50), { x0: -66, y0: -80, x1: 94, y1: 130 });
    assert.deepEqual(areaAround({ ...site, boundary: undefined }, { x0: 0, y0: 0, x1: 28, y1: 38 }, 10), { x0: -10, y0: -10, x1: 38, y1: 48 });
  });

  it("lays the photo tiles edge to edge over the whole area, each at its true size", () => {
    const area = { x0: -66, y0: -80, x1: 94, y1: 130 };
    const tiles = aerialTiles(site, area);
    assert.ok(tiles.length > 0 && tiles.length <= 64);
    const side = (metresPerPixel(site.lat, 19) * 256) / FT;
    for (const t of tiles) {
      near(t.w, side, side * 0.01);
      near(t.h, side, side * 0.01);
    }
    assert.ok(Math.min(...tiles.map((t) => t.x)) <= area.x0 && Math.max(...tiles.map((t) => t.x + t.w)) >= area.x1);
    assert.ok(Math.min(...tiles.map((t) => t.y)) <= area.y0 && Math.max(...tiles.map((t) => t.y + t.h)) >= area.y1);
    assert.ok(tiles.every((t) => /\/tile\/19\/\d+\/\d+$/.test(t.url)));
  });

  it("makes one image item from the tiles, only for a north-up plan and a small enough area", () => {
    const area = { x0: -66, y0: -80, x1: 94, y1: 130 };
    const it0 = aerialItem(site, area, -0.5, "D-9")!;
    assert.equal(it0.kind, "image");
    assert.equal(it0.p.frame, false);
    assert.equal(JSON.parse(String(it0.p.tiles)).length, aerialTiles(site, area).length);
    assert.equal(aerialItem({ ...site, north: 12 }, area, 0, "D-9"), null);
    assert.equal(aerialItem(site, { x0: -3000, y0: -3000, x1: 3000, y1: 3000 }, 0, "D-9"), null);
  });
});
