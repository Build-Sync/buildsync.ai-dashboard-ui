/**
 * e2e/site.mjs
 *
 * WHAT   Browser tests of drawing aids, views and the site: Offset sits beside Draw on the Home tab; the OSNAP
 *        arrow menu picks object snaps and the marker names what the cursor locked onto (Midpoint, Nearest);
 *        Shift keeps a line straight (temporary ORTHO); OTRACK lines up with a midpoint the cursor rested on; place
 *        labels show in the plan and stand up in 3D and the Labels switch hides them and the 3D room names; the
 *        Views tab opens each storey, all storeys side by side, the topography and the elevations (without making
 *        a second sheet); the plan underlay shows other storeys faded; the property line is drawn from typed
 *        bearings; the Site palette shows the coordinates of the base point and each corner, moves the site
 *        from typed coordinates or an address, links to Google Maps and downloads a KML; and an uploaded site
 *        plan image is placed at its real width.
 * FOR    `npm run e2e:site` (or `npm run e2e`). Needs the app running (BASE, default http://localhost:3000).
 *        The map tiles and the address search are answered by the harness (no outside requests).
 * DEBUG  - Text inside the SVG canvas is read with textContent (innerText only works on HTML elements).
 *        - A snap check fails: `toScreen` reads the cursor read-out at two spots to map model feet to screen
 *          pixels; the plan must not move between the calibration and the hover.
 *        - Labels checks: the Labels switch is per project and starts on.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { readFileSync } from "node:fs";
import { check, eq, finish, has, open, page, sleep } from "./harness.mjs";

const KEY = "bs.work.demo.residence-2br-miami";
await page.addInitScript(() => {
  try {
    if (!sessionStorage.getItem("e2e-keep")) for (const k of Object.keys(localStorage)) if (k.startsWith("bs.work")) localStorage.removeItem(k);
  } catch {
    /* storage blocked: nothing to clear */
  }
});

/* ── helpers ──────────────────────────────────────────────────────────── */
const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const close = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;
const fresh = async (view = "2d") => {
  await open(view === "2d" ? "/demo?view=2d" : "/demo");
  await sleep(300);
};
const cmd = async (t) => {
  const input = page.getByTestId("cmd-input");
  await input.click();
  await input.fill(t);
  await page.keyboard.press("Enter");
  await sleep(50);
};
const esc = async () => {
  await page.keyboard.press("Escape");
  await page.getByTestId("cmd-input").blur().catch(() => {});
  await sleep(50);
};
const work = async () => {
  await cmd("QSAVE");
  await sleep(80);
  return (await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), KEY))?.work;
};
const drawn = async () => (await work())?.drawn ?? [];
/** model feet → screen pixels of the 2D plan, read from the cursor coordinates at two spots */
const toScreen = async () => {
  const b = await page.getByTestId("viewport").boundingBox();
  const read = async (sx, sy) => {
    await page.mouse.move(sx, sy);
    await sleep(120);
    const [x, y] = (await page.getByTestId("coords").innerText()).split(",").map((v) => parseFloat(v));
    return [x, y];
  };
  const s1 = [b.x + b.width * 0.25, b.y + b.height * 0.3];
  const s2 = [b.x + b.width * 0.75, b.y + b.height * 0.8];
  const m1 = await read(...s1);
  const m2 = await read(...s2);
  const kx = (s2[0] - s1[0]) / (m2[0] - m1[0]);
  const ky = (s2[1] - s1[1]) / (m2[1] - m1[1]);
  return (x, y) => [s1[0] + (x - m1[0]) * kx, s1[1] + (y - m1[1]) * ky];
};
const snapName = async () => (await page.getByTestId("snap-name").count()) ? ((await page.getByTestId("snap-name").textContent()) ?? "").trim() : "";
const statusToggle = (label) => page.getByTestId("statusbar").getByRole("button", { name: label, exact: true });
const setToggle = async (label, on) => {
  if ((await statusToggle(label).getAttribute("aria-pressed")) !== String(on)) await statusToggle(label).click();
  await sleep(40);
};

/* ══ RIBBON ═══════════════════════════════════════════════════════════════ */
await check("Offset is a large button in Modify, right after Draw on the Home tab", async () => {
  await fresh();
  await page.getByRole("tab", { name: "Home", exact: true }).click();
  const off = page.getByTestId("ribbon").getByRole("button", { name: "Offset", exact: true });
  await off.waitFor({ timeout: 5000 });
  must(await off.isVisible(), "Offset is visible without opening a flyout");
  const names = await page.getByTestId("ribbon").locator("section").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") || ""));
  const draw = names.findIndex((n) => /draw/i.test(n));
  const modify = names.findIndex((n) => /modify/i.test(n));
  must(draw >= 0 && modify === draw + 1, `Modify follows Draw (panels: ${names.join(", ")})`);
  await off.click();
  has(await page.getByTestId("statusbar").innerText(), "OFFSET", "Offset runs");
  await esc();
});

/* ══ SNAPS ════════════════════════════════════════════════════════════════ */
await check("OSNAP arrow menu lists the object snaps; the marker names Midpoint and, once ticked, Nearest", async () => {
  await fresh();
  await cmd("LINE");
  await cmd("30,10");
  await cmd("40,10");
  await esc();
  await setToggle("OSNAP", true);
  const at = await toScreen();
  await page.getByTestId("osnap-menu").click();
  const menu = page.getByRole("menu", { name: "Object Snap Modes" });
  await menu.waitFor();
  const text = await menu.innerText();
  for (const m of ["Endpoint", "Midpoint", "Center", "Intersection", "Perpendicular", "Nearest", "Object Snap Tracking"]) has(text, m);
  await page.keyboard.press("Escape");
  await cmd("LINE");
  const [mx, my] = at(35, 10);
  await page.mouse.move(mx + 3, my - 2);
  await sleep(150);
  eq(await snapName(), "Midpoint", "the marker over the middle of the line");
  await page.mouse.move(...at(32.3, 10.25));
  await sleep(150);
  must((await snapName()) !== "Nearest", "Nearest is off by default");
  await page.getByTestId("osnap-menu").click();
  await page.getByRole("menu", { name: "Object Snap Modes" }).getByRole("menuitem", { name: "Nearest" }).click();
  await page.keyboard.press("Escape");
  await page.mouse.move(...at(32.3, 10.25));
  await sleep(150);
  await page.mouse.move(...at(32.3, 10.2));
  await sleep(150);
  eq(await snapName(), "Nearest", "the marker on the line between its points");
  await esc();
});

await check("a click on the midpoint starts the line there; Shift keeps the next segment straight", async () => {
  await fresh();
  await cmd("LINE");
  await cmd("30,10");
  await cmd("40,10");
  await esc();
  await setToggle("OSNAP", true);
  await setToggle("ORTHO", false);
  const at = await toScreen();
  await cmd("LINE");
  const [mx, my] = at(35, 10);
  await page.mouse.move(mx + 2, my + 2);
  await sleep(120);
  await page.mouse.click(mx + 2, my + 2);
  await sleep(80);
  await page.keyboard.down("Shift");
  await page.mouse.move(...at(39, 16));
  await sleep(150);
  eq(await page.getByTestId("snap-marker").getAttribute("data-kind"), "ortho", "Shift flips ORTHO on");
  await page.mouse.click(...at(39, 16));
  await page.keyboard.up("Shift");
  await sleep(80);
  await esc();
  const lines = (await drawn()).filter((i) => i.kind === "line");
  const l = lines[lines.length - 1];
  must(l && close(l.pts[0][0], 35) && close(l.pts[0][1], 10), `the line starts on the midpoint (got ${JSON.stringify(l?.pts[0])})`);
  must(close(l.pts[1][0], 35) && close(l.pts[1][1], 16, 0.3), `Shift kept it vertical (got ${JSON.stringify(l?.pts[1])})`);
});

await check("OTRACK: resting on a midpoint acquires it, and the next point lines up with it", async () => {
  await fresh();
  await cmd("LINE");
  await cmd("30,10");
  await cmd("40,10");
  await esc();
  await setToggle("OSNAP", true);
  await setToggle("OTRACK", true);
  const at = await toScreen();
  await cmd("LINE");
  await page.mouse.move(...at(35, 10.05));
  await sleep(800);
  must((await page.getByTestId("track-point").count()) === 1, "the midpoint was acquired (green cross)");
  await page.mouse.move(...at(35.3, 20));
  await sleep(150);
  eq(await page.getByTestId("snap-marker").getAttribute("data-kind"), "track", "the cursor locks to the vertical through it");
  await page.mouse.click(...at(35.3, 20));
  await sleep(80);
  await cmd("@4,0");
  await esc();
  const lines = (await drawn()).filter((i) => i.kind === "line");
  const l = lines[lines.length - 1];
  must(l && close(l.pts[0][0], 35, 0.02), `the new line starts straight above the midpoint (got ${JSON.stringify(l?.pts[0])})`);
});

/* ══ LABELS ═══════════════════════════════════════════════════════════════ */
await check("Place Label names a place in the plan and in 3D; Labels and Rooms switch labels and room names apart", async () => {
  await fresh();
  await cmd("LABEL");
  const name = page.getByTestId("tool-bar").getByLabel("Name", { exact: true });
  await name.fill("Pool");
  await name.press("Enter");
  await cmd("-12,20");
  await esc();
  const label = (await drawn()).find((i) => i.kind === "label");
  must(label && label.p.text === "Pool", "a label item named Pool");
  has(await page.getByTestId("place-label").textContent(), "Pool");
  await cmd("3D");
  await sleep(300);
  eq(await page.getByTestId("place-label").count(), 1, "the label in 3D");
  must((await page.getByTestId("room-label-3d").count()) > 3, "room names stand up in 3D");
  await page.getByTestId("labels-chip").click();
  await sleep(150);
  eq(await page.getByTestId("place-label").count(), 0, "labels off: no place label");
  must((await page.getByTestId("room-labels-3d").count()) > 0, "labels off: room names stay (they have their own switch)");
  await page.getByTestId("room-labels-chip").click();
  await sleep(150);
  eq(await page.getByTestId("room-labels-3d").count(), 0, "rooms off: no room names");
  await cmd("LABELS");
  await cmd("ROOMLABELS");
  await sleep(150);
  eq(await page.getByTestId("place-label").count(), 1, "LABELS turns them back on");
  must((await page.getByTestId("room-labels-3d").count()) > 0, "ROOMLABELS turns the room names back on");
});

/* ══ VIEWS ════════════════════════════════════════════════════════════════ */
await check("Views tab: each storey, all storeys side by side, topography and an elevation, one sheet each", async () => {
  await fresh();
  await page.getByTestId("explorer").getByRole("tab", { name: "Views", exact: true }).click();
  await page.getByTestId("view-plan-level2").click();
  await sleep(150);
  has(await page.getByTestId("vp-level").innerText(), "Level 2", "the plan shows Level 2");
  eq(await page.getByTestId("view-plan-level2").getAttribute("aria-current"), "true");
  await page.getByTestId("view-plans").click();
  await page.getByTestId("sheet-view").waitFor();
  eq(await page.locator('[data-testid="sheet-plan"]').count(), 3, "Level 1, Level 2 and Roof side by side");
  await page.getByTestId("view-topo").click();
  await page.locator('[data-testid="sheet-view"][data-view="topo"]').waitFor();
  must((await page.getByTestId("topo-band").count()) >= 4, "the ground is shaded between contours");
  await page.getByTestId("topo-legend").waitFor();
  await page.getByTestId("corner-table").waitFor();
  await page.getByTestId("view-elev-N").click();
  await page.locator('[data-testid="sheet-view"][data-dir="N"]').waitFor();
  await page.getByTestId("view-plan-level1").click();
  await page.getByTestId("view-elev-N").click();
  await page.locator('[data-testid="sheet-view"][data-dir="N"]').waitFor();
  const tabs = await page.getByRole("tablist", { name: "Layouts" }).innerText();
  eq(tabs.split("North Elevation").length - 1, 1, "the second click opens the same sheet");
});

await check("Underlay: the 2D plan shows the level below, then every level, faded", async () => {
  await fresh();
  await page.getByTestId("explorer").getByRole("tab", { name: "Views", exact: true }).click();
  await page.getByTestId("view-plan-level2").click();
  await page.getByTestId("plan-show-below").click();
  await sleep(200);
  eq(await page.getByTestId("plan-underlay").getAttribute("data-levels"), "level1");
  await page.getByTestId("view-plan-level1").click();
  await page.getByTestId("plan-show-all").click();
  await sleep(200);
  eq(await page.getByTestId("plan-underlay").getAttribute("data-levels"), "level2 roof");
  await cmd("UNDERLAY");
  await sleep(150);
  eq(await page.getByTestId("plan-underlay").count(), 0, "UNDERLAY steps on to off");
});

/* ══ SITE ═════════════════════════════════════════════════════════════════ */
await check("Site palette: base point and corner coordinates, courses, map, Google Maps link, KML", async () => {
  await fresh();
  await cmd("GEOLOCATE");
  await page.getByTestId("site-palette").waitFor();
  has(await page.getByTestId("site-coords").innerText(), "25.759300° N");
  has(await page.getByTestId("site-coords").innerText(), "80.237800° W");
  eq(await page.getByTestId("corner-row").count(), 4, "four property corners");
  has(await page.getByTestId("course-list").innerText(), `N 90°00'00" E`);
  await page.getByTestId("site-map").waitFor();
  eq(await page.getByTestId("map-lot").count(), 1, "the lot on the map");
  eq(await page.getByTestId("map-radius").count(), 1, "the radius on the map");
  const href = await page.getByTestId("open-google-maps").getAttribute("href");
  must(href.startsWith("https://www.google.com/maps/search/?api=1&query=25.75"), `Google Maps link (${href})`);
  eq(await page.getByTestId("open-google-maps").getAttribute("target"), "_blank");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("site-kml").click()]);
  must(dl.suggestedFilename().endsWith("-site.kml"), dl.suggestedFilename());
  const kml = readFileSync(await dl.path(), "utf8");
  has(kml, "<kml");
  has(kml, "property line");
  has(kml, "1 mi radius");
  must((await page.getByTestId("property-line").count()) >= 1, "the property line is drawn in the plan");
  must((await page.getByTestId("course-label").count()) >= 2, "with bearings and lengths");
});

await check("Site palette: typed coordinates and an address move the site; Undo puts it back", async () => {
  await fresh();
  await page.route(/nominatim\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ lat: "17.1400", lon: "-61.8500", display_name: "Fort Road, St. John's" }]) }));
  await cmd("GEOLOCATE");
  const ll = page.getByTestId("site-latlon");
  await ll.fill(`17°07'51.6"N 61°50'38.4"W`);
  await ll.press("Enter");
  await sleep(150);
  has(await page.getByTestId("site-coords").innerText(), "17.131000° N");
  has(await page.getByTestId("site-coords").innerText(), "61.844000° W");
  await page.getByTestId("site-address").fill("Fort Road, St John's, Antigua");
  await page.getByRole("button", { name: "Find", exact: true }).click();
  await sleep(300);
  has(await page.getByTestId("site-coords").innerText(), "17.140000° N");
  await cmd("UNDO");
  await sleep(150);
  has(await page.getByTestId("site-coords").innerText(), "17.131000° N");
  await page.unroute(/nominatim\.openstreetmap\.org/);
});

await check("Property Line from typed bearings and distances replaces the lot (undoable)", async () => {
  await fresh();
  await cmd("PROPLINE");
  await cmd("0,-10");
  await cmd("N90E 60");
  await cmd("N0E 80");
  await cmd("S90W 60");
  await cmd("");
  await sleep(150);
  const site = (await work())?.project?.site;
  must(site?.boundary?.length === 4, `four corners (got ${JSON.stringify(site?.boundary)})`);
  const [a, b, c, d] = site.boundary;
  must(close(a[0], 0) && close(a[1], -10) && close(b[0], 60) && close(b[1], -10) && close(c[0], 60) && close(c[1], 70) && close(d[0], 0) && close(d[1], 70), JSON.stringify(site.boundary));
  await page.getByTestId("site-palette").waitFor();
  has(await page.getByTestId("property-table").innerText(), "4,800 sf");
  has(await page.getByTestId("lot-area").first().textContent(), "4,800 sf");
  await cmd("UNDO");
  await sleep(150);
  eq(await page.getByTestId("corner-row").count(), 4);
  must(!(await page.getByTestId("property-table").innerText()).includes("4,800 sf"), "undo brings back the sample lot");
});

await check("an uploaded site plan image is placed at its real width, ready to trace", async () => {
  await fresh();
  await cmd("PDFATTACH");
  // a real PNG, drawn by the browser itself
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 40;
    c.height = 30;
    const g = c.getContext("2d");
    g.fillStyle = "#3a7";
    g.fillRect(0, 0, 40, 30);
    return c.toDataURL("image/png").split(",")[1];
  });
  const png = Buffer.from(b64, "base64");
  await page.getByLabel("Choose File").setInputFiles({ name: "site-plan.png", mimeType: "image/png", buffer: png });
  await page.getByTestId("import-ready").waitFor();
  await page.getByLabel("Real Width (ft)").fill("120");
  await page.getByTestId("import-insert").click();
  await sleep(150);
  await cmd("-20,-30");
  await esc();
  const img = (await drawn()).find((i) => i.kind === "image");
  must(img && img.p.w === 120 && img.p.file === "site-plan.png", `image placed 120 ft wide (got ${JSON.stringify(img?.p && { w: img.p.w, file: img.p.file })})`);
});

await finish();
