/**
 * lib/importers.test.ts
 *
 * WHAT   Unit tests of lib/importers.ts and lib/exporters.ts: DXF entities and units, survey points from CSV / PNEZD /
 *        LandXML / LAS, the ground surface and its contours, and round trips of the model through our own DXF and
 *        IFC writers back into the readers.
 * FOR    `npm test`. Catches an import that lands in the wrong units or place, and an export other programs would
 *        read differently from what we drew.
 * DEBUG  - A round trip is off by 3.28×: feet / metres got mixed up in writeIfc or parseIfc.
 *        - The LAS test fails at the header: the offsets of the public LAS 1.2 header changed in parseLas.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contoursOf, dxfItems, FEET_PER, parseDxf, parseIfc, parseLandXml, parseLas, parsePointsText, terrainFrom } from "./importers";
import { writeDxf, writeIfc } from "./exporters";
import { getScene } from "./scene";
import { COTTAGE } from "./mock-data";

const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const dxf = (...rows: (string | number)[]) => rows.map(String).join("\n");

describe("DXF", () => {
  const text = dxf(
    0, "SECTION", 2, "HEADER", 9, "$INSUNITS", 70, 6, 0, "ENDSEC",
    0, "SECTION", 2, "ENTITIES",
    0, "LINE", 8, "WALLS", 10, 0, 20, 0, 11, 3, 21, 0,
    0, "LWPOLYLINE", 8, "LOT", 70, 1, 10, 0, 20, 0, 10, 10, 20, 0, 10, 10, 20, 5,
    0, "CIRCLE", 8, "TREES", 10, 2, 20, 2, 40, 1.5,
    0, "ARC", 8, "WALLS", 10, 0, 20, 0, 40, 2, 50, 0, 51, 90,
    0, "MTEXT", 8, "NOTES", 10, 1, 20, 1, 40, 0.2, 1, "{\\fArial;BED\\PROOM}",
    0, "HATCH", 8, "FILL",
    0, "ENDSEC", 0, "EOF",
  );
  const d = parseDxf(text);

  it("reads lines, polylines, circles, arcs and text, and counts what it skips", () => {
    assert.deepEqual(d.entities.map((e) => e.type), ["line", "polyline", "circle", "arc", "text"]);
    assert.equal(d.skipped, 1);
    assert.deepEqual(d.layers, ["WALLS", "LOT", "TREES", "NOTES"]);
    assert.equal(d.entities[1].closed, true);
    assert.equal(d.entities[4].text, "BED ROOM");
  });

  it("reads the drawing units from the header and measures the extents", () => {
    assert.equal(d.units, "m");
    assert.deepEqual(d.extents, { x0: 0, y0: 0, x1: 10, y1: 5 });
  });

  it("scales to feet and moves by the offset, with arcs as three points on the curve", () => {
    const items = dxfItems(d, FEET_PER.m, [100, 0]);
    near(items[0].pts[1][0], 100 + 3 / 0.3048);
    const arc = items.find((i) => i.kind === "arc")!;
    const r = 2 / 0.3048;
    near(arc.pts[0][0], 100 + r);
    near(arc.pts[2][1], r);
    near(Math.hypot(arc.pts[1][0] - 100, arc.pts[1][1]), r);
    const circle = items.find((i) => i.kind === "circle")!;
    near(circle.pts[1][0] - circle.pts[0][0], 1.5 / 0.3048);
  });

  it("gives back the plan our DXF export wrote, in feet", () => {
    const scene = getScene("cottage");
    const back = parseDxf(writeDxf(scene, ["level1"], []));
    assert.equal(back.units, "ft");
    const walls = scene.prisms.filter((p) => p.axis === "z" && !p.terrain && !p.sectionOnly && p.level === "level1" && p.category === "Wall");
    assert.ok(walls.length > 4);
    const xs = walls.flatMap((p) => p.poly.map((q) => q[0]));
    assert.ok(back.extents && back.extents.x0 <= Math.min(...xs) + 1e-3 && back.extents.x1 >= Math.max(...xs) - 1e-3);
    assert.ok(back.entities.every((e) => e.type !== "polyline" || e.closed));
  });
});

describe("survey points", () => {
  it("reads a headed CSV in any column order", () => {
    assert.deepEqual(parsePointsText("Elev,Easting,Northing\n10.5,100,200\n11,101,201\n"), [[100, 200, 10.5], [101, 201, 11]]);
  });

  it("reads PNEZD rows without a header (point, northing, easting, elevation, description)", () => {
    assert.deepEqual(parsePointsText("1,5000,3000,12.25,TOP\n2 5001 3002 12.5 EP"), [[3000, 5000, 12.25], [3002, 5001, 12.5]]);
  });

  it("reads LandXML points (northing first) and its units", () => {
    const xml = `<LandXML><Units><Imperial linearUnit="USSurveyFoot"/></Units><CgPoints><CgPoint name="1">200 100 7.5</CgPoint></CgPoints><Surface><Pnts><P id="1">210 110 8</P></Pnts></Surface></LandXML>`;
    const r = parseLandXml(xml);
    assert.equal(r.units, "usft");
    assert.deepEqual(r.points, [[100, 200, 7.5], [110, 210, 8]]);
  });

  it("reads an uncompressed LAS point cloud with its scale and offset", () => {
    const n = 3;
    const offset = 227;
    const recLen = 20;
    const buf = new ArrayBuffer(offset + n * recLen);
    const v = new DataView(buf);
    "LASF".split("").forEach((c, i) => v.setUint8(i, c.charCodeAt(0)));
    v.setUint8(24, 1);
    v.setUint8(25, 2);
    v.setUint32(96, offset, true);
    v.setUint16(105, recLen, true);
    v.setUint32(107, n, true);
    [0.01, 0.01, 0.001].forEach((s, i) => v.setFloat64(131 + i * 8, s, true));
    [1000, 2000, 0].forEach((o, i) => v.setFloat64(155 + i * 8, o, true));
    for (let k = 0; k < n; k++) {
      v.setInt32(offset + k * recLen, 100 * k, true);
      v.setInt32(offset + k * recLen + 4, 200 * k, true);
      v.setInt32(offset + k * recLen + 8, 5000 + k, true);
    }
    const pts = parseLas(buf);
    assert.equal(pts.length, 3);
    near(pts[2][0], 1002);
    near(pts[2][1], 2004);
    near(pts[2][2], 5.002);
    assert.throws(() => parseLas(new ArrayBuffer(400)), /Not a LAS file/);
  });
});

describe("ground surface", () => {
  // a plane rising 1 ft every 10 ft to the east
  const pts: [number, number, number][] = [];
  for (let x = 0; x <= 100; x += 10) for (let y = 0; y <= 50; y += 10) pts.push([x, y, x / 10]);
  const t = terrainFrom(pts, 2, 20);

  it("makes a grid through the points that keeps their heights", () => {
    near(t.lo, 0);
    near(t.hi, 10);
    const g = t.grid;
    near(g.z[0], 0);
    near(g.z[g.nx - 1], 10, 1e-3);
  });

  it("draws contours at the interval, each where the ground is at that height", () => {
    const levels = [...new Set(t.contours.map((c) => c.z))].sort((a, b) => a - b);
    assert.deepEqual(levels, [2, 4, 6, 8]);
    for (const c of t.contours) for (const [x] of c.pts) near(x, c.z * 10, t.grid.step);
  });

  it("draws nothing when the ground is flat", () => {
    assert.equal(contoursOf({ x0: 0, y0: 0, step: 1, nx: 3, ny: 3, z: Array(9).fill(5) }, 1).length, 0);
  });
});

describe("IFC", () => {
  it("gives back the model our IFC export wrote: walls and footings, at their size, in feet", () => {
    const scene = getScene("cottage");
    const r = parseIfc(writeIfc(scene, COTTAGE));
    assert.equal(r.units, "m");
    const cats = new Set(r.solids.map((s) => s.category));
    assert.ok(cats.has("Wall") && cats.has("Footing"), [...cats].join(", "));
    // the gable ends are walls too, so the tallest wall reaches the ridge
    const walls = scene.elements.filter((e) => e.category === "Wall");
    const read = r.solids.filter((s) => s.category === "Wall");
    const xs = read.flatMap((s) => s.poly.map((q) => q[0]));
    near(Math.min(...xs), Math.min(...walls.map((e) => e.min[0])), 0.05);
    near(Math.max(...xs), Math.max(...walls.map((e) => e.max[0])), 0.05);
    near(Math.max(...read.map((s) => s.z1)), Math.max(...walls.map((e) => e.max[2])), 0.05);
  });

  it("falls back to an element's bounding box when its shape is not an extrusion", () => {
    const text = `ISO-10303-21;
DATA;
#1=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCCARTESIANPOINT((3.,0.,0.));
#12=IFCCARTESIANPOINT((3.,2.,2.5));
#13=IFCPOLYLINE((#10,#11,#12));
#20=IFCSHAPEREPRESENTATION(#99,'Body','Curve3D',(#13));
#21=IFCPRODUCTDEFINITIONSHAPE($,$,(#20));
#30=IFCBUILDINGELEMENTPROXY('guid',$,'Odd thing',$,$,$,#21,$,$);
ENDSEC;
END-ISO-10303-21;`;
    const r = parseIfc(text);
    assert.equal(r.solids.length, 1);
    const s = r.solids[0];
    assert.equal(s.name, "Odd thing");
    near(Math.max(...s.poly.map((q) => q[0])) - Math.min(...s.poly.map((q) => q[0])), 3 / 0.3048, 1e-3);
    near(s.z1 - s.z0, 2.5 / 0.3048, 1e-3);
  });
});
