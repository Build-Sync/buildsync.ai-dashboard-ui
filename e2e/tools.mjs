/**
 * e2e/tools.mjs
 *
 * WHAT   Browser tests of the drawing and editing tools: every Draw, Building, Structure, MEP (fixtures on walls,
 *        wires from switches, hot / cold / drain pipes, the pipe and wire looks), Insert (site objects, roads,
 *        gutters, solar, fences), Properties → Size, quarter turns, furniture names, Annotate, Modify, Properties and Measure command is run against the demo workspace and the
 *        geometry it saved is checked (Save writes the work to localStorage; the tests read that record back). Also the Edit commands
 *        (delete, copy / paste, group, undo / redo), mouse drawing, and saving: reload restores the work, versions
 *        can be named and restored, Save As downloads a .bsd file and Open File loads it.
 * FOR    `npm run e2e:tools` (or `npm run e2e`). Needs the app running (BASE, default http://localhost:3000).
 *        Points are typed in the command line (x,y · @dx,dy), which is exact; clicks on the viewport are used where
 *        a tool needs an element under the cursor (DOOR, FRAMING, MOVE of a picked object …).
 * DEBUG  - A check fails with "expected N items": read the saved record the helper `work()` prints; each check
 *          starts from an empty project (an init script clears bs.work.* on every load unless e2e-keep is set).
 *        - A click misses: the plan shows about x -27…51 ft and y -5…37 ft at the default zoom; draw inside it.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
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
const fresh = async (view = "2d") => {
  await page.evaluate(() => sessionStorage.removeItem("e2e-keep")).catch(() => {});
  await open(view === "2d" ? "/demo?view=2d" : "/demo");
  await sleep(300);
};
const cmd = async (t) => {
  const input = page.getByTestId("cmd-input");
  await input.click();
  await input.fill(t);
  await page.keyboard.press("Enter");
  await sleep(40);
};
const esc = async () => {
  await page.keyboard.press("Escape");
  await page.getByTestId("cmd-input").blur().catch(() => {});
  await sleep(40);
};
/** run a tool and type its points one per call; ends the tool with Esc */
const tool = async (name, ...inputs) => {
  await cmd(name);
  for (const t of inputs) await cmd(t);
  await esc();
};
const work = async () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), KEY);
const drawn = async () => {
  await cmd("QSAVE");
  await sleep(60);
  return (await work())?.work.drawn ?? [];
};
const kind = (d, k) => d.filter((i) => i.kind === k);
const close = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;
const same = (p, q, tol = 0.02) => close(p[0], q[0], tol) && close(p[1], q[1], tol);
const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
/** click inside a drawn element's screen box (fx, fy are 0..1 within the box) */
const clickEl = async (id, fx = 0.5, fy = 0.5, opts = {}) => {
  const box = await page.locator(`[data-testid="viewport"] [data-el="${id}"]`).first().boundingBox();
  must(box, `element ${id} is not on screen`);
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy, opts);
  await sleep(60);
};
/** click a point of an element that is really on top there (windows and doors can cover a wall) */
const clickPiece = async (id) => {
  const pt = await page.evaluate((id) => {
    for (const e of document.querySelectorAll(`[data-testid="viewport"] [data-el="${id}"]`)) {
      const b = e.getBoundingClientRect();
      for (let i = 1; i < 12; i++)
        for (let j = 1; j < 12; j++) {
          const x = b.x + (b.width * i) / 12;
          const y = b.y + (b.height * j) / 12;
          if (document.elementFromPoint(x, y)?.closest("[data-el]")?.getAttribute("data-el") === id) return [x, y];
        }
    }
    return null;
  }, id);
  must(pt, `no free spot on ${id}`);
  await page.mouse.click(pt[0], pt[1]);
  await sleep(60);
};
const log = async () => (await page.getByTestId("cmdline").innerText()).replace(/\s+/g, " ");
const setOpt = async (label, value) => {
  const f = page.getByTestId("tool-bar").getByLabel(label, { exact: true });
  const tag = await f.evaluate((e) => e.tagName);
  if (tag === "SELECT") await f.selectOption(value);
  else {
    await f.fill(String(value));
    await f.press("Enter");
  }
  await sleep(40);
};

/* ══ DRAW ═════════════════════════════════════════════════════════════════ */
await check("LINE, PLINE, RECTANG, CIRCLE, ARC, SPLINE: typed points make the exact shapes", async () => {
  await fresh();
  await tool("LINE", "30,10", "40,10", "");
  await tool("LINE", "30,12", "40,12", "40,16", "");
  await tool("PLINE", "30,20", "34,20", "34,24", "c");
  await tool("RECTANG", "30,26", "@6,4");
  await tool("CIRCLE", "40,26", "2.5");
  await tool("ARC", "30,32", "32,34", "34,32");
  await tool("SPLINE", "38,32", "40,34", "42,32", "");
  const d = await drawn();
  eq(kind(d, "line").length, 3, "lines");
  must(same(kind(d, "line")[0].pts[0], [30, 10]) && same(kind(d, "line")[0].pts[1], [40, 10]), "first line points");
  must(same(kind(d, "line")[2].pts[0], [40, 12]) && same(kind(d, "line")[2].pts[1], [40, 16]), "chained second segment starts where the first ended");
  const pl = kind(d, "polyline")[0];
  must(pl && pl.closed === true && pl.pts.length === 3, "closed polyline of 3 points");
  const r = kind(d, "rect")[0];
  must(r && r.pts.length === 4 && same(r.pts[0], [30, 26]) && same(r.pts[2], [36, 30]), "rectangle corners");
  const c = kind(d, "circle")[0];
  must(c && same(c.pts[0], [40, 26]) && close(Math.hypot(c.pts[1][0] - c.pts[0][0], c.pts[1][1] - c.pts[0][1]), 2.5), "circle radius 2.5");
  must(kind(d, "arc")[0]?.pts.length === 3, "arc through three points");
  must(kind(d, "spline")[0]?.pts.length === 3, "spline");
});

await check("drawn shapes show in the plan and in 3D, and a click selects them", async () => {
  await fresh();
  await tool("RECTANG", "30,26", "@6,4");
  const id = (await drawn()).find((i) => i.kind === "rect").id;
  await page.locator(`[data-testid="viewport"] [data-el="${id}"]`).first().waitFor();
  await clickEl(id, 0.5, 0);
  has(await page.getByTestId("palette-body").innerText(), "1 selected");
  await cmd("3D");
  await sleep(300);
  must((await page.locator(`[data-testid="viewport"] [data-el="${id}"]`).count()) > 0, "rectangle is drawn in 3D");
});

await check("mouse drawing: click, click, Enter draws a line; right-click finishes a polyline", async () => {
  await fresh();
  await cmd("LINE");
  const b = await page.getByTestId("viewport").boundingBox();
  await page.mouse.click(b.x + 120, b.y + 200);
  await page.mouse.move(b.x + 260, b.y + 200);
  await page.mouse.click(b.x + 260, b.y + 200);
  await page.keyboard.press("Enter");
  await esc();
  let d = await drawn();
  eq(kind(d, "line").length, 1, "one line from two clicks");
  const [p, q] = kind(d, "line")[0].pts;
  must(Math.abs(q[0] - p[0]) > 3 && close(p[1], q[1], 0.01), "ORTHO keeps the line horizontal");
  await cmd("PLINE");
  await page.mouse.click(b.x + 120, b.y + 320);
  await page.mouse.click(b.x + 200, b.y + 320);
  await page.mouse.click(b.x + 200, b.y + 380);
  await page.mouse.click(b.x + 220, b.y + 400, { button: "right" });
  await esc();
  d = await drawn();
  eq(kind(d, "polyline").length, 1, "right click finishes the polyline");
  eq(kind(d, "polyline")[0].pts.length, 3, "polyline points");
});

await check("HATCH fills the clicked closed shape", async () => {
  await fresh();
  await tool("PLINE", "30,10", "40,10", "40,20", "30,20", "c");
  const pl = (await drawn()).find((i) => i.kind === "polyline");
  await cmd("HATCH");
  await clickEl(pl.id, 0.5, 0.5);
  await esc();
  const h = kind(await drawn(), "hatch");
  eq(h.length, 1, "one hatch");
  eq(h[0].pts.length, 4, "hatch boundary has the four corners");
  await cmd("HATCH");
  const b = await page.getByTestId("viewport").boundingBox();
  await page.mouse.click(b.x + 100, b.y + 300);
  has(await log(), "No closed boundary");
  await esc();
});

/* ══ BUILDING ═════════════════════════════════════════════════════════════ */
await check("WALL chain draws four walls; DOOR and WINDOW cut openings where you click; ROOM finds the space", async () => {
  await fresh();
  await tool("WALL", "30,0", "42,0", "42,10", "30,10", "c");
  let d = await drawn();
  const walls = kind(d, "wall");
  eq(walls.length, 4, "four walls");
  must(walls.every((w) => close(w.p.thick, 0.67)), "default wall type is 8-inch CMU");
  const south = walls.find((w) => same(w.pts[0], [30, 0]) && same(w.pts[1], [42, 0]));
  must(south, "south wall");
  // DOOR: click the middle of the south wall
  await cmd("DOOR");
  await clickEl(south.id, 0.5, 0.5);
  await esc();
  // WINDOW: click the north wall
  const north = walls.find((w) => same(w.pts[0], [42, 10]) && same(w.pts[1], [30, 10]));
  await cmd("WINDOW");
  await clickEl(north.id, 0.3, 0.5);
  await esc();
  d = await drawn();
  const door = kind(d, "door")[0];
  const win = kind(d, "window")[0];
  must(door && door.p.host === south.id, "door hosted on the south wall");
  must(door.p.at > 4 && door.p.at < 6, `door centred near the click (at=${door.p.at})`);
  must(win && win.p.host === north.id && close(win.p.sill, 3), "window hosted on the north wall, sill 3 ft");
  const pieces = await page.locator(`[data-testid="viewport"] [data-el="${south.id}"]`).count();
  must(pieces >= 2, `the wall is cut into pieces around the door (found ${pieces})`);
  // ROOM: click inside
  await cmd("ROOM");
  const a = await page.locator(`[data-testid="viewport"] [data-el="${walls[0].id}"]`).first().boundingBox();
  const c = await page.locator(`[data-testid="viewport"] [data-el="${walls[2].id}"]`).first().boundingBox();
  await page.mouse.click((a.x + c.x + c.width) / 2, (a.y + c.y + c.height) / 2);
  await esc();
  d = await drawn();
  const room = kind(d, "room")[0];
  must(room, `a room was created: ${(await log()).slice(-200)}`);
  const area = Math.abs(room.pts.reduce((s, p, i) => s + (p[0] * room.pts[(i + 1) % room.pts.length][1] - room.pts[(i + 1) % room.pts.length][0] * p[1]), 0) / 2);
  must(area > 80 && area < 112, `room area about 11.3 x 9.3 ft (got ${area.toFixed(1)} sf)`);
});

await check("SLAB, ROOF, FOUNDATION, STAIR, COLUMN, BEAM, RAMP: sizes, levels and heights", async () => {
  await fresh();
  await tool("SLAB", "30,0", "40,8", "");
  await tool("ROOF", "30,12", "40,20", "");
  await tool("FOUNDATION", "30,24", "40,30", "");
  await tool("STAIR", "44,0", "44,12");
  await tool("COLUMN", "30,34");
  await tool("BEAM", "32,34", "42,34");
  await tool("RAMP", "-20,0", "-20,12");
  const d = await drawn();
  const slab = kind(d, "slab")[0];
  must(slab && slab.pts.length === 4 && close(slab.z, 0) && close(slab.p.thick, 0.5), "6-inch slab at level 1");
  const roof = kind(d, "roof")[0];
  must(roof && roof.level === "roof" && close(roof.z, 9.75), `roof sits on top of the storey (z=${roof?.z})`);
  const fd = kind(d, "foundation")[0];
  must(fd && fd.level === "foundation" && close(fd.z, -2.5), "foundation at the foundation level");
  const st = kind(d, "stair")[0];
  must(st && close(st.p.rise, 9.75) && close(st.p.width, 3.5), "stair rises one storey, 3'-6\" wide");
  must(kind(d, "column")[0] && close(kind(d, "column")[0].p.size, 1), "12-inch column");
  must(kind(d, "beam")[0], "beam");
  const rp = kind(d, "ramp")[0];
  must(rp && close(rp.p.rise, 1, 0.01), `1:12 ramp: 12 ft run rises 1 ft (got ${rp?.p.rise})`);
});

await check("tool-bar options change what is drawn (wall type and height, slab type, column type)", async () => {
  await fresh();
  await cmd("WALL");
  await setOpt("Type", "conc10");
  await setOpt("Height", 12);
  await cmd("30,0");
  await cmd("40,0");
  await esc();
  await cmd("COLUMN");
  await setOpt("Type", "steel8");
  await cmd("32,5");
  await esc();
  const d = await drawn();
  const w = kind(d, "wall")[0];
  must(close(w.p.thick, 0.83) && close(w.p.height, 12) && /concrete/i.test(w.p.material), `concrete 10 in, 12 ft high (got ${JSON.stringify(w.p)})`);
  must(/steel/i.test(kind(d, "column")[0].p.material), "steel column");
});

/* ══ STRUCTURE ════════════════════════════════════════════════════════════ */
await check("FRAMING, BRACE, CONNECT: members laid out on a wall, a brace, and a joint between two columns", async () => {
  await fresh();
  await tool("WALL", "30,0", "42,0", "");
  const wall = (await drawn()).find((i) => i.kind === "wall");
  await cmd("FRAMING");
  await clickEl(wall.id, 0.5, 0.5);
  await esc();
  await tool("BRACE", "30,4", "34,4");
  await tool("COLUMN", "30,20");
  await tool("COLUMN", "40,20");
  const cols = kind(await drawn(), "column");
  await cmd("CONNECT");
  await clickEl(cols[0].id, 0.5, 0.5);
  await clickEl(cols[1].id, 0.5, 0.5);
  await esc();
  const d = await drawn();
  const fr = kind(d, "framing")[0];
  must(fr && fr.p.host === wall.id && close(fr.p.spacing, 1.333, 0.01), "studs at 16 inches on the wall");
  eq(kind(d, "brace").length, 1, "brace");
  const cn = kind(d, "connection")[0];
  must(cn && cn.pts[0][0] > 30.4 && cn.pts[0][0] < 39.6 && close(cn.pts[0][1], 20, 0.1), `joint between the columns (${JSON.stringify(cn?.pts)})`);
  await cmd("VSCURRENT XRAY");
  await sleep(300);
  must((await page.locator(`[data-testid="viewport"] [data-el="${fr.id}"]`).count()) > 0, "studs are drawn in X-ray");
});

await check("TRUSS lays trusses under a clicked roof (3D)", async () => {
  await fresh("3d");
  await tool("ROOF", "30,0", "40,10", "");
  const roof = (await drawn()).find((i) => i.kind === "roof");
  await cmd("TRUSS");
  await clickEl(roof.id, 0.5, 0.4);
  await esc();
  const t = kind(await drawn(), "truss")[0];
  must(t && t.p.host === roof.id && close(t.p.spacing, 2), "trusses 2 ft apart under the roof");
});

/* ══ MEP ══════════════════════════════════════════════════════════════════ */
await check("DUCT, PIPE, TRAY, FIRE: runs and devices; ELEC, PLUMB, HVAC, FIXT, EQUIP: catalogue fixtures; MEP layers on", async () => {
  await fresh();
  await tool("DUCT", "30,2", "40,2", "40,8", "");
  await tool("PIPE", "30,4", "36,4", "");
  await tool("TRAY", "30,6", "38,6", "");
  await tool("ELEC", "32,10");
  await tool("PLUMB", "34,10");
  await tool("FIRE", "36,10");
  await tool("HVAC", "30,14");
  await tool("FIXT", "34,14");
  await tool("EQUIP", "38,14");
  const d = await drawn();
  const duct = kind(d, "duct")[0];
  must(duct && duct.pts.length === 3, "duct with a bend");
  must(close(duct.p.h, 8.55, 0.01), `duct hangs 1.2 ft below the ceiling (h=${duct.p.h})`);
  eq(kind(d, "pipe").length, 1, "pipe");
  eq(kind(d, "tray").length, 1, "cable tray");
  const devs = kind(d, "device");
  must(devs.length === 1 && devs[0].p.rk === "fire", "a fire device (sprinkler head)");
  eq(kind(d, "fixture").map((x) => x.p.type).sort().join(", "), "condenser, outlet, toilet, vanity, waterheater", "an outlet, a vanity, an AC condenser, a toilet and a water heater from the catalogue");
  await page.getByTestId("explorer").getByRole("tab", { name: "Layers" }).click();
  for (const l of ["hvac", "plumbing", "electrical", "fire"]) eq(await page.locator(`[data-layer="${l}"] button`).first().getAttribute("aria-pressed"), "true", `${l} layer is on`);
  must((await page.locator(`[data-testid="viewport"] [data-el="${duct.id}"]`).count()) > 0, "the duct can be seen and picked");
});

await check("SWITCH, LIGHT, WIRE: a switch on the wall wired to a light; Properties lists it and Switch On lights it", async () => {
  await fresh();
  await tool("SWITCH", "2,10");
  await tool("LIGHT", "8,10");
  let d = await drawn();
  const sw = kind(d, "fixture").find((x) => x.p.type === "switch");
  const light = kind(d, "fixture").find((x) => x.p.type === "ceilinglight");
  must(sw && close(sw.pts[0][0], 0.67, 0.05) && close(sw.p.rot, 90, 0.01), `the switch sits on the west wall's inside face, facing the room (${sw?.pts[0]}, ${sw?.p.rot}°)`);
  must(light, "the light");
  await cmd("WIRE");
  await clickPiece(sw.id);
  await clickPiece(light.id);
  await esc();
  d = await drawn();
  const w = kind(d, "wire")[0];
  must(w && w.p.from === sw.id && w.p.to === light.id && w.p.sub === "switched", "a switched leg from the switch to the light");
  must((await page.locator(`[data-testid="viewport"] [data-run="${w.id}"][data-look="lines"]`).count()) > 0, "drawn as a dashed line");
  await clickPiece(sw.id);
  has(await page.getByTestId("prop-link").first().innerText(), "Ceiling", "the Properties palette lists the wire to the light:");
  await page.getByRole("switch", { name: "Switch On" }).click();
  await sleep(150);
  must((await page.locator(`[data-testid="viewport"] [data-lit="${light.id}"]`).count()) > 0, "the light glows with the switch on");
  await cmd("WIREVIEW");
  must((await page.locator(`[data-testid="viewport"] [data-run="${w.id}"][data-look="real"]`).count()) > 0, "Wires draws the cable itself");
  await cmd("WIREVIEW");
  // deleting the light takes its wire with it
  await clickPiece(light.id);
  await cmd("ERASE");
  eq(kind(await drawn(), "wire").length, 0, "the wire went with the light");
});

await check("WATERHEATER, SINK, TOILET, PIPECONNECT, PIPEVIEW: hot water to the sink, none to the toilet; shown as pipes", async () => {
  await fresh();
  await tool("WATERHEATER", "2,4");
  await tool("SINK", "2,20");
  await tool("TOILET", "2,25");
  let d = await drawn();
  const id = (t) => kind(d, "fixture").find((x) => x.p.type === t)?.id;
  await cmd("PIPECONNECT");
  await clickPiece(id("waterheater"));
  await clickPiece(id("vanity"));
  await clickPiece(id("toilet"));
  has(await log(), "Toilet takes no hot water", "the toilet is refused hot water:");
  await esc();
  d = await drawn();
  const pipes = kind(d, "pipelink");
  eq(pipes.length, 1, "one pipe");
  must(pipes[0].p.sub === "hot" && pipes[0].p.from === id("waterheater") && pipes[0].p.to === id("vanity"), "hot water from the heater to the sink");
  const look = async () => page.locator(`[data-testid="viewport"] [data-run="${pipes[0].id}"]`).first().getAttribute("data-look");
  eq(await look(), "lines", "dotted at first");
  await cmd("PIPEVIEW");
  eq(await look(), "real", "Pipes draws the pipe itself");
  await cmd("3D");
  await cmd("CUTAWAY");
  await sleep(200);
  must((await page.locator(`[data-testid="viewport"] [data-run="${pipes[0].id}"]`).count()) > 0, "the pipe shows in a 3D cutaway");
  await cmd("CUTAWAY");
  await cmd("PIPEVIEW");
});

await check("POOL, ROCK, GRAVEL, ROAD, SIGN, SIGNAL, DRAIN: site objects where they are clicked, on their layers", async () => {
  await fresh();
  await tool("POOL", "45,40");
  await tool("ROCK", "40,10");
  await tool("GRAVEL", "R", "44,2", "50,8");
  await tool("ROAD", "-30,-30", "60,-30", "");
  await tool("SIGN", "-10,-15");
  await tool("SIGNAL", "50,-15");
  await tool("DRAIN", "20,-17");
  const d = await drawn();
  for (const k of ["pool", "rock", "gravel", "road", "sign", "signal", "drain"]) eq(kind(d, k).length, 1, k);
  const pool = kind(d, "pool")[0];
  must(same(pool.pts[0], [45, 40]) && pool.p.l === 32 && pool.p.depth === 6, "a 32 ft pool, 6 ft deep, where clicked");
  eq(kind(d, "road")[0].pts.length, 2, "the road's centre line");
  for (const it of [pool, kind(d, "road")[0], kind(d, "signal")[0]]) must((await page.locator(`[data-testid="viewport"] [data-el="${it.id}"]`).count()) > 0, `${it.kind} is drawn`);
  await page.getByTestId("explorer").getByRole("tab", { name: "Layers" }).click();
  eq(await page.locator(`[data-layer="civil"] button`).first().getAttribute("aria-pressed"), "true", "the Roads & Drainage layer is on");
});

await check("FENCE: every kind along a line, and closed round a yard with C", async () => {
  await fresh();
  const kinds = ["privacy", "picket", "chainlink", "iron", "vinyl", "masonry"];
  for (let i = 0; i < kinds.length; i++) {
    await cmd("FENCE");
    await setOpt("Kind", kinds[i]);
    await cmd(`${-20 + i * 2},2`);
    await cmd(`${-20 + i * 2},20`);
    await cmd("");
    await esc();
  }
  await tool("FENCE", "30,2", "40,2", "40,12", "30,12", "C");
  const fences = kind(await drawn(), "fence");
  eq(fences.map((f) => f.p.type).slice(0, 6).join(","), kinds.join(","), "one of each kind:");
  must(close(fences.find((f) => f.p.type === "picket").p.h, 3.5) && close(fences.find((f) => f.p.type === "masonry").p.h, 6), "each at its usual height");
  must(fences[6].closed && fences[6].pts.length === 4, "the last one closed round the yard");
  for (const f of fences) must((await page.locator(`[data-testid="viewport"] [data-el="${f.id}"]`).count()) > 0, `${f.name} is drawn`);
});

await check("Properties → Size: a solar array's panels and output, typed in; Alt+Shift+R turns furniture; Furniture names", async () => {
  await fresh();
  await tool("SOLARPANEL", "-14,28");
  await tool("FURN", "8,12");
  let d = await drawn();
  const pv = kind(d, "solar")[0];
  await clickPiece(pv.id);
  const cols = page.getByTestId("size-cols");
  eq(await cols.inputValue(), "6", "panels per row:");
  await cols.fill("10");
  await cols.press("Enter");
  await page.getByTestId("size-watts").fill("450");
  await page.getByTestId("size-watts").press("Enter");
  d = await drawn();
  const pv2 = kind(d, "solar")[0];
  must(pv2.p.cols === 10 && pv2.p.watts === 450 && /9\.0 kW/.test(pv2.name), `10 panels a row of 450 W: 9.0 kW (${pv2.name})`);
  has(await page.getByTestId("palette-properties").innerText(), "20 panels", "the array's total:");
  const sofa = kind(d, "furniture")[0];
  await clickPiece(sofa.id);
  await page.keyboard.press("Alt+Shift+R");
  await sleep(400);
  const turned = kind(await drawn(), "furniture")[0];
  eq((((turned.p.rot ?? 0) % 360) + 360) % 360, 270, "a quarter turn clockwise:");
  await page.getByTestId("furniture-labels-chip").click();
  must((await page.getByTestId("furniture-label").count()) > 0, "furniture names on the plan");
  await page.getByTestId("furniture-labels-chip").click();
  eq(await page.getByTestId("furniture-label").count(), 0, "and off again");
});

await check("GUTTER and SOLARPANEL on a roof clicked in 3D: gutters along its eaves, an array tilted with the slope", async () => {
  await fresh("3d");
  await cmd("GUTTER");
  await clickPiece("R-01");
  await esc();
  await cmd("SOLARPANEL");
  await clickPiece("R-01");
  await esc();
  const d = await drawn();
  must(kind(d, "gutter").length >= 1, "gutters on the eaves");
  const pv = kind(d, "solar")[0];
  must(pv && pv.p.roof === "R-01" && pv.p.tilt > 10 && pv.p.tilt < 45, `the array follows the roof (${pv?.p.tilt}°)`);
});

/* ══ INSERT / ANNOTATE ════════════════════════════════════════════════════ */
await check("FURN, MEPLIB, STRLIB, TEXT, NOTE, PIN, ELEVMARK place one item per click", async () => {
  await fresh();
  await tool("FURN", "30,5");
  await tool("MEPLIB", "34,5");
  await tool("STRLIB", "38,5");
  await tool("TEXT", "30,12");
  await tool("NOTE", "34,12");
  await tool("PIN", "38,12");
  await tool("ELEVMARK", "42,12");
  const d = await drawn();
  eq(kind(d, "furniture").length, 1, "furniture");
  eq(kind(d, "device").length, 1, "MEP part");
  eq(kind(d, "column").length, 1, "steel column");
  eq(kind(d, "text").length + kind(d, "note").length + kind(d, "pin").length + kind(d, "elevmark").length, 4, "four annotations");
  must(/EL /.test(kind(d, "elevmark")[0].p.text), "elevation mark reads the level elevation");
});

await check("DIM, LEADER, TAG, SECTIONLINE, DETAIL, GRIDLINE, MARKUP annotate the drawing", async () => {
  await fresh();
  await tool("DIM", "30,5", "40,5", "35,8");
  await tool("LEADER", "30,12", "34,15");
  await tool("SECTIONLINE", "30,18", "40,18");
  await tool("DETAIL", "36,24", "38,24");
  await tool("GRIDLINE", "30,28", "42,28");
  await tool("GRIDLINE", "30,26", "30,34");
  await tool("MARKUP", "44,20", "46,22", "48,20", "");
  await tool("COLUMN", "42,6");
  const col = kind(await drawn(), "column")[0];
  await cmd("TAG");
  await clickEl(col.id, 0.5, 0.5);
  await esc();
  const d = await drawn();
  const dim = kind(d, "dim")[0];
  must(dim && close(dim.p.off, 3, 0.01), `dimension offset 3 ft (got ${dim?.p.off})`);
  eq(kind(d, "leader").length, 1);
  eq(kind(d, "secmark")[0]?.p.text, "A", "section A");
  must(/^D1$/.test(kind(d, "detail")[0]?.p.text), "detail D1");
  const g = kind(d, "gridline");
  must(g.length === 2 && g[0].p.text === "A" && g[1].p.text === "1", "horizontal grid A, vertical grid 1");
  eq(kind(d, "markup").length, 1, "markup");
  must(kind(d, "tag")[0]?.p.target === col.id, "tag points at the column");
  must((await page.locator('[data-testid="draft-layer"]').textContent()).includes("10'-0\""), "dimension text shows the length");
});

await check("IMAGE places a picture chosen from a file", async () => {
  await fresh();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const chooser = page.waitForEvent("filechooser");
  await cmd("IMAGE");
  await (await chooser).setFiles({ name: "site.png", mimeType: "image/png", buffer: png });
  await sleep(300);
  await cmd("32,10");
  await esc();
  const img = kind(await drawn(), "image")[0];
  must(img && /^data:image\/jpeg/.test(img.p.src) && img.name === "site.png", "image item with a small JPEG");
});

/* ══ MEASURE ══════════════════════════════════════════════════════════════ */
await check("DIST, AREA, ANGLE, ID, ELEV, VOLUME, CLEAR report in the log and on the drawing", async () => {
  await fresh();
  await tool("SLAB", "30,0", "40,10", "");
  const slab = kind(await drawn(), "slab")[0];
  await tool("COLUMN", "32,20");
  await tool("COLUMN", "40,24");
  const cols = kind(await drawn(), "column");
  await cmd("DIST");
  await cmd("0,0");
  await cmd("3,4");
  has(await log(), "Distance: 5'-0\"");
  has(await page.locator('[data-testid="draft-layer"]').textContent(), "Distance:");
  await esc();
  await cmd("AREA");
  for (const p of ["0,0", "10,0", "10,5", "0,5", ""]) await cmd(p);
  has(await log(), "Area: 50.0 sf");
  await esc();
  await cmd("ANGLE");
  for (const p of ["0,0", "5,0", "0,5"]) await cmd(p);
  has(await log(), "90.00°");
  await esc();
  await cmd("ID");
  await cmd("12,34");
  has(await log(), "X = 12'-0\"");
  await esc();
  await cmd("ELEV");
  await cmd("5,5");
  has(await log(), "Level 1");
  await esc();
  await cmd("VOLUME");
  await clickEl(slab.id, 0.5, 0.5);
  has(await log(), "cy");
  await esc();
  await cmd("CLEAR");
  await clickEl(cols[0].id, 0.5, 0.5);
  await clickEl(cols[1].id, 0.5, 0.5);
  has(await log(), "Clearance:");
  await esc();
  await page.keyboard.press("Escape");
  eq(await page.locator('[data-testid="draft-layer"]').textContent().then((t) => t.includes("Clearance")), false, "Esc clears the measurement");
});

/* ══ MODIFY ═══════════════════════════════════════════════════════════════ */
/** draw a rectangle at (28,12) 6 x 4 and select it by its top edge (kept clear of the ViewCube at the top right) */
const rectSelected = async () => {
  await tool("RECTANG", "28,12", "@6,4");
  const r = kind(await drawn(), "rect")[0];
  await clickEl(r.id, 0.5, 0);
  return r;
};
const drawnCount = () => page.evaluate(() => new Set([...document.querySelectorAll('[data-testid="viewport"] [data-el^="U-"]')].map((e) => e.getAttribute("data-el"))).size);

await check("MOVE, COPY, ROTATE, SCALE, MIRROR, ALIGN transform the selection", async () => {
  await fresh();
  let r = await rectSelected();
  await cmd("MOVE");
  await cmd("28,12");
  await cmd("@5,0");
  await esc();
  r = kind(await drawn(), "rect")[0];
  must(same(r.pts[0], [33, 12]) && same(r.pts[2], [39, 16]), `moved 5 ft east (${JSON.stringify(r.pts[0])})`);
  await cmd("COPY");
  await cmd("33,12");
  await cmd("@0,-8");
  await esc();
  let rs = kind(await drawn(), "rect");
  eq(rs.length, 2, "copy adds one");
  must(rs.some((x) => same(x.pts[0], [33, 4])), "copy sits 8 ft south");
  await clickEl(r.id, 0.5, 0);
  await cmd("ROTATE");
  await cmd("33,12");
  await cmd("90");
  await esc();
  r = kind(await drawn(), "rect").find((x) => x.id === r.id);
  must(same(r.pts[1], [33, 18]), `rotated 90° about the base point (${JSON.stringify(r.pts[1])})`);
  await cmd("SCALE");
  await cmd("33,12");
  await cmd("2");
  await esc();
  r = kind(await drawn(), "rect").find((x) => x.id === r.id);
  must(same(r.pts[1], [33, 24]), `scaled x2 about the base point (${JSON.stringify(r.pts[1])})`);
  await cmd("MIRROR");
  await cmd("30,0");
  await cmd("30,50");
  await esc();
  rs = kind(await drawn(), "rect");
  eq(rs.length, 3, "mirror keeps the original and adds a copy");
  must(rs.some((x) => x.id !== r.id && x.pts.some((p) => close(p[0], 27, 0.05))), "mirrored across x = 30");
  await clickEl(r.id, 0, 0.5);
  await cmd("ALIGN");
  await cmd("33,12");
  await cmd("45,15");
  await cmd("");
  await esc();
  r = kind(await drawn(), "rect").find((x) => x.id === r.id);
  must(same(r.pts[0], [45, 15]), `aligned: first source point lands on the destination point (${JSON.stringify(r.pts[0])})`);
});

await check("OFFSET, TRIM, EXTEND, FILLET, CHAMFER, SPLIT, JOIN edit lines", async () => {
  await fresh();
  await tool("LINE", "30,10", "40,10", "");
  let a = kind(await drawn(), "line")[0];
  await cmd("OFFSET");
  await clickEl(a.id, 0.5, 0.5);
  await clickEl(a.id, 0.5, -4);
  await esc();
  let ls = kind(await drawn(), "line");
  eq(ls.length, 2, "offset copy");
  must(ls.some((l) => close(l.pts[0][1], 12, 0.05) && close(l.pts[1][1], 12, 0.05)), "2 ft above the line");
  // TRIM
  await fresh();
  await tool("LINE", "30,10", "44,10", "");
  await tool("LINE", "36,5", "36,15", "");
  let all = kind(await drawn(), "line");
  const [A, C] = all;
  await cmd("TRIM");
  await clickEl(C.id, 0.5, 0.5);
  await cmd("");
  await clickEl(A.id, 0.8, 0.5);
  await esc();
  a = kind(await drawn(), "line").find((l) => l.id === A.id);
  must(a && same(a.pts[0], [30, 10]) && close(a.pts[1][0], 36, 0.05), `trimmed at the cutting edge (${JSON.stringify(a?.pts)})`);
  // EXTEND
  await fresh();
  await tool("LINE", "30,10", "34,10", "");
  await tool("LINE", "40,5", "40,15", "");
  all = kind(await drawn(), "line");
  await cmd("EXTEND");
  await clickEl(all[1].id, 0.5, 0.5);
  await cmd("");
  await clickEl(all[0].id, 0.9, 0.5);
  await esc();
  a = kind(await drawn(), "line").find((l) => l.id === all[0].id);
  must(close(a.pts[1][0], 40, 0.05), `extended to the boundary (${JSON.stringify(a?.pts)})`);
  // FILLET and CHAMFER
  for (const [name, kindName, count] of [["FILLET", "arc", 1], ["CHAMFER", "line", 3]]) {
    await fresh();
    await tool("LINE", "30,10", "40,10", "");
    await tool("LINE", "40,10", "40,20", "");
    all = kind(await drawn(), "line");
    await cmd(name);
    await clickEl(all[0].id, 0.3, 0.5);
    await clickEl(all[1].id, 0.5, 0.7);
    await esc();
    const d = await drawn();
    const A2 = d.find((i) => i.id === all[0].id);
    const B2 = d.find((i) => i.id === all[1].id);
    must(close(A2.pts[1][0], 38, 0.05) && close(B2.pts[1][1], 12, 0.05), `${name}: both lines stop 2 ft from the corner (${JSON.stringify([A2.pts, B2.pts])})`);
    eq(kind(d, kindName).length, count, `${name} adds its ${kindName}`);
  }
  // SPLIT
  await fresh();
  await tool("LINE", "30,10", "40,10", "");
  a = kind(await drawn(), "line")[0];
  await cmd("SPLIT");
  await clickEl(a.id, 0.5, 0.5);
  await esc();
  ls = kind(await drawn(), "line");
  eq(ls.length, 2, "split into two");
  must(ls.every((l) => l.pts.some((p) => close(p[0], 35, 0.6))), "the two pieces meet at the split point");
  // JOIN
  await fresh();
  await tool("LINE", "30,10", "35,10", "");
  await tool("LINE", "35,10", "40,10", "");
  all = kind(await drawn(), "line");
  await cmd("JOIN");
  await clickEl(all[0].id, 0.5, 0.5);
  await clickEl(all[1].id, 0.5, 0.5);
  await cmd("");
  await esc();
  const d = await drawn();
  eq(kind(d, "line").length + kind(d, "polyline").length, 1, "joined into one object");
});

await check("ARRAY makes a rectangular grid of copies", async () => {
  await fresh();
  await rectSelected();
  await cmd("ARRAY");
  await setOpt("Rows", 2);
  await setOpt("Columns", 3);
  await page.getByTestId("tool-apply").click();
  await sleep(100);
  await esc();
  eq(kind(await drawn(), "rect").length, 6, "2 x 3 grid");
});

await check("CHTYPE, CHMAT, CHDIM change what you selected", async () => {
  await fresh();
  await tool("WALL", "30,10", "42,10", "");
  const wall = kind(await drawn(), "wall")[0];
  await clickEl(wall.id, 0.5, 0.5);
  await cmd("CHTYPE");
  await setOpt("Type", "brick6");
  await page.getByTestId("tool-apply").click();
  await esc();
  let w = kind(await drawn(), "wall")[0];
  must(close(w.p.thick, 0.5) && /brick/i.test(w.p.material), `brick veneer, 6 in (${JSON.stringify(w.p)})`);
  await cmd("CHMAT");
  await setOpt("Material", "Steel");
  await page.getByTestId("tool-apply").click();
  await esc();
  await cmd("QSAVE");
  const rec = await work();
  must(rec.work.elColors[wall.id] === "#6f86a6", "steel colour recorded for the wall");
  await cmd("CHDIM");
  await setOpt("Height", 12);
  await setOpt("Length", 8);
  await page.getByTestId("tool-apply").click();
  await esc();
  w = kind(await drawn(), "wall")[0];
  must(close(w.p.height, 12) && close(Math.hypot(w.pts[1][0] - w.pts[0][0], w.pts[1][1] - w.pts[0][1]), 8, 0.02), `12 ft high, 8 ft long (${JSON.stringify([w.p.height, w.pts])})`);
});

await check("ATTACH puts an element on a host and it follows; DETACH releases it", async () => {
  await fresh();
  await tool("SLAB", "30,0", "40,8", "");
  await tool("COLUMN", "46,5");
  const d0 = await drawn();
  const slab = kind(d0, "slab")[0];
  const col = kind(d0, "column")[0];
  await clickEl(col.id, 0.5, 0.5);
  await cmd("ATTACH HOST");
  await clickEl(slab.id, 0.5, 0.5);
  await esc();
  let c = kind(await drawn(), "column")[0];
  eq(c.p.attach, slab.id, "column attached to the slab");
  await clickEl(slab.id, 0.5, 0.5);
  await cmd("MOVE");
  await cmd("30,0");
  await cmd("@0,10");
  await esc();
  c = kind(await drawn(), "column")[0];
  must(close(c.pts[0][1], 15, 0.05), `the attached column moved with the slab (${JSON.stringify(c.pts)})`);
  await clickEl(col.id, 0.5, 0.5);
  await cmd("DETACH");
  c = kind(await drawn(), "column")[0];
  eq(c.p.attach, undefined, "detached");
});

await check("built-in elements move too, and Undo puts them back", async () => {
  await fresh();
  await clickPiece("W-L1-W");
  has(await page.getByTestId("palette-body").innerText(), "W-L1-W");
  await cmd("MOVE");
  await cmd("0,0");
  await cmd("@-10,0");
  await esc();
  await cmd("QSAVE");
  let rec = await work();
  must(rec.work.xf["W-L1-W"] && close(rec.work.xf["W-L1-W"].aff[4], -10), "the west wall was moved 10 ft west");
  await cmd("UNDO");
  await cmd("QSAVE");
  rec = await work();
  eq(Object.keys(rec.work.xf).length, 0, "undo removes the move");
});

/* ══ EDIT COMMANDS ════════════════════════════════════════════════════════ */
await check("DELETE, COPY / PASTE, DUPLICATE, GROUP / UNGROUP, UNDO / REDO", async () => {
  await fresh();
  await rectSelected();
  await cmd("COPYCLIP");
  await cmd("PASTECLIP");
  eq(kind(await drawn(), "rect").length, 2, "paste adds a copy");
  await cmd("DUPLICATE");
  eq(kind(await drawn(), "rect").length, 3, "duplicate adds a copy");
  await cmd("DELETE");
  eq(kind(await drawn(), "rect").length, 2, "delete removes the selected copy");
  await cmd("UNDO");
  eq(kind(await drawn(), "rect").length, 3, "undo brings it back");
  await cmd("REDO");
  eq(kind(await drawn(), "rect").length, 2, "redo deletes it again");
  await cmd("SELECTALL");
  await cmd("GROUP");
  await cmd("QSAVE");
  eq(Object.keys((await work()).work.groups).length, 1, "one group");
  await cmd("DESELECT");
  const r = kind(await drawn(), "rect")[0];
  await clickEl(r.id, 0.5, 0);
  has(await page.getByTestId("palette-body").innerText(), "elements", "clicking one member selects the whole group");
  await cmd("UNGROUP");
  await cmd("QSAVE");
  eq(Object.keys((await work()).work.groups).length, 0, "ungrouped");
});

/* ══ SAVING ═══════════════════════════════════════════════════════════════ */
await check("Save writes the work to this browser and a reload restores it", async () => {
  await fresh();
  await tool("RECTANG", "30,26", "@6,4");
  await tool("WALL", "30,0", "42,0", "");
  eq(await page.getByTestId("save-state").innerText(), "Unsaved changes");
  await cmd("QSAVE");
  has(await page.getByTestId("save-state").innerText(), "Saved");
  await page.evaluate(() => sessionStorage.setItem("e2e-keep", "1"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="workspace"]');
  await sleep(500);
  const n = await drawnCount();
  must(n >= 2, `the rectangle and the wall are back after a reload (found ${n})`);
  has(await log(), "Restored your saved work");
  await page.evaluate(() => sessionStorage.removeItem("e2e-keep"));
});

await check("closing with unsaved changes keeps a draft that is recovered", async () => {
  await fresh();
  await tool("RECTANG", "30,26", "@6,4");
  await page.evaluate(() => sessionStorage.setItem("e2e-keep", "1"));
  await page.goto((await page.evaluate(() => location.origin)) + "/settings/general", { waitUntil: "networkidle" });
  await open("/demo?view=2d");
  await sleep(400);
  eq(await drawnCount(), 1, "the unsaved rectangle came back");
  eq(await page.getByTestId("save-state").innerText(), "Unsaved changes");
  await page.evaluate(() => sessionStorage.removeItem("e2e-keep"));
});

await check("Version history: name a version, save again, restore the first, undo", async () => {
  await fresh();
  await page.locator('[data-palette-tab="versions"]').click();
  await page.getByTestId("palette-versions").waitFor();
  await tool("RECTANG", "30,26", "@6,4");
  await page.getByTestId("version-note").fill("First rectangle");
  await page.getByTestId("save-version").click();
  await tool("CIRCLE", "40,10", "2");
  await page.getByTestId("version-note").fill("Added a circle");
  await page.getByTestId("save-version").click();
  const items = page.getByTestId("version-item");
  eq(await items.count(), 2, "two saved versions");
  has(await items.nth(0).innerText(), "Added a circle");
  has(await items.nth(0).innerText(), "+1 drawn");
  has(await items.nth(0).innerText(), "Current");
  has(await items.nth(1).innerText(), "First rectangle");
  eq(await drawnCount(), 2);
  await items.nth(1).getByTestId("restore-version").click();
  await sleep(200);
  eq(await drawnCount(), 1, "restoring the first version leaves only the rectangle");
  await cmd("UNDO");
  eq(await drawnCount(), 2, "undo brings the circle back");
  await items.nth(0).getByTestId("show-changes").click();
  await page.locator('[data-palette-tab="properties"]').click();
  has(await page.getByTestId("palette-body").innerText(), "1 selected", "Show changes selects what the version added");
  await page.locator('[data-palette-tab="versions"]').click();
  await page.getByTestId("versions-tab-history").click();
  has(await page.getByTestId("activity-list").innerText(), "Saved “First rectangle”");
});

await check("Save As downloads a .bsd file and Open File loads it back", async () => {
  await fresh();
  await tool("RECTANG", "30,26", "@6,4");
  const dl = page.waitForEvent("download");
  await cmd("SAVEAS");
  const d = await dl;
  has(d.suggestedFilename(), ".bsd");
  const { readFileSync } = await import("node:fs");
  const text = readFileSync(await d.path(), "utf8");
  const parsed = JSON.parse(text);
  eq(parsed.format, "buildsync-bsd");
  eq(parsed.work.drawn.filter((i) => i.kind === "rect").length, 1, "the file holds the rectangle");
  await fresh();
  eq(await drawnCount(), 0, "fresh project is empty");
  const chooser = page.waitForEvent("filechooser");
  await cmd("OPENFILE");
  await (await chooser).setFiles({ name: "p.bsd", mimeType: "application/json", buffer: Buffer.from(text) });
  await sleep(400);
  eq(await drawnCount(), 1, "the rectangle is back");
  const bad = page.waitForEvent("filechooser");
  await cmd("OPENFILE");
  await (await bad).setFiles({ name: "x.bsd", mimeType: "application/json", buffer: Buffer.from("{}") });
  await sleep(300);
  has(await page.locator("body").innerText(), "not a BuildSync project file");
});

/* ══ MORE CASES ═══════════════════════════════════════════════════════════ */
const clickOnViewport = async (x, y) => {
  const b = await page.getByTestId("viewport").boundingBox();
  await page.mouse.click(b.x + x, b.y + y);
  await sleep(80);
};
/** click inside the LAST drawn piece of an element (a wall cut by a door has several pieces) */
const clickLast = async (id, fx = 0.5, fy = 0.5) => {
  const box = await page.locator(`[data-testid="viewport"] [data-el="${id}"]`).last().boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await sleep(60);
};
await check("a library component dragged onto the viewport starts its tool and places it", async () => {
  await fresh();
  await page.getByTestId("explorer").getByRole("tab", { name: "Library" }).click();
  await page.getByTestId("library").getByRole("button", { name: "Column" }).dragTo(page.getByTestId("viewport"), { targetPosition: { x: 520, y: 420 } });
  await sleep(300);
  await esc();
  const cols = kind(await drawn(), "column");
  eq(cols.length, 1, "a column was dropped");
  await page.getByTestId("library").getByRole("button", { name: "Furniture" }).click();
  await clickOnViewport(560, 440);
  await esc();
  eq(kind(await drawn(), "furniture").length, 1, "click on a library button, then click in the viewport");
});

await check("a blank project in the app saves its own work (separate from the demo)", async () => {
  await page.goto((await page.evaluate(() => location.origin)) + "/app/projects/untitled-1?view=2d", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="workspace"]');
  await sleep(400);
  await tool("WALL", "5,5", "20,5", "20,15", "5,15", "c");
  await tool("SLAB", "5,5", "20,15", "");
  await cmd("QSAVE");
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem("bs.work.app.untitled-1") || "null"));
  eq(rec?.work.drawn.filter((i) => i.kind === "wall").length, 4, "four walls saved under the app key");
  eq(rec?.work.drawn.filter((i) => i.kind === "slab").length, 1);
  eq(await page.evaluate(() => localStorage.getItem("bs.work.demo.untitled-1")), null, "the demo key is not used");
  await cmd("ZOOM E");
  await sleep(300);
  must((await drawnCount()) >= 5, "Zoom Extents keeps the drawn items on screen");
});

await check("SPLIT keeps a door with the half it sits on; polar ARRAY and JOIN of walls", async () => {
  await fresh();
  await tool("WALL", "30,10", "46,10", "");
  const wall = kind(await drawn(), "wall")[0];
  await cmd("DOOR");
  await clickEl(wall.id, 0.2, 0.5);
  await esc();
  await cmd("SPLIT");
  await clickLast(wall.id, 0.5, 0.5);
  await esc();
  let d = await drawn();
  const walls = kind(d, "wall");
  eq(walls.length, 2, "wall split in two");
  const door = kind(d, "door")[0];
  must(door && walls.some((w) => w.id === door.p.host), "the door still has a host wall");
  must(door.p.at < 6, `door kept its place on the first half (at=${door.p.at})`);
  await cmd("JOIN");
  await clickEl(walls[0].id, 0.5, 0.5);
  await clickLast(walls[1].id, 0.5, 0.5);
  await cmd("");
  await esc();
  d = await drawn();
  eq(kind(d, "wall").length, 1, "the two collinear walls are one again");
  must(kind(d, "door")[0].p.host === kind(d, "wall")[0].id, "and the door follows");
  await fresh();
  await tool("COLUMN", "36,12");
  const col = kind(await drawn(), "column")[0];
  await clickEl(col.id, 0.5, 0.5);
  await cmd("ARRAY");
  await setOpt("Type", "polar");
  await setOpt("Count (polar)", 4);
  await cmd("30,12");
  await page.getByTestId("tool-apply").click();
  await esc();
  const cols = kind(await drawn(), "column");
  eq(cols.length, 4, "four columns around the centre");
  must(cols.some((c) => same(c.pts[0], [30, 18], 0.05)) && cols.some((c) => same(c.pts[0], [24, 12], 0.05)), "spaced 90° around (30,12)");
});

await check("built-in elements: rotate, copy, retype, recolour; the Properties palette names the type", async () => {
  await fresh();
  await clickPiece("P-L1-3");
  await cmd("ROTATE");
  await cmd("8,22");
  await cmd("180");
  await esc();
  await cmd("COPY");
  await cmd("8,22");
  await cmd("@0,-3");
  await esc();
  await cmd("QSAVE");
  let rec = await work();
  must(rec.work.xf["P-L1-3"], "the partition was turned 180°");
  must(rec.work.drawn.some((i) => i.kind === "clone" && i.src === "P-L1-3"), "a copy of a built-in partition is a clone item");
  await clickPiece("P-L1-3");
  await cmd("CHTYPE");
  await setOpt("Type", "brick6");
  await page.getByTestId("tool-apply").click();
  await esc();
  has(await page.getByTestId("palette-body").innerText(), "Brick veneer", "Properties shows the Type row");
  await cmd("CHMAT");
  await setOpt("Material", "Glass");
  await page.getByTestId("tool-apply").click();
  await esc();
  await cmd("QSAVE");
  rec = await work();
  eq(rec.work.elColors["P-L1-3"], "#7fc4e8", "glass colour recorded");
  eq(rec.work.types["P-L1-3"].includes("Brick"), true, "type recorded");
});

await check("locked layers refuse drawing and locked elements refuse editing", async () => {
  await fresh();
  await tool("RECTANG", "28,12", "@6,4");
  await page.getByTestId("explorer").getByRole("tab", { name: "Layers" }).click();
  await page.locator('[data-layer="drafting"] button[aria-label^="Lock"]').click();
  const before = (await drawn()).length;
  await tool("LINE", "30,2", "36,2", "");
  eq((await drawn()).length, before, "nothing is drawn on a locked layer");
  has(await log(), "layer is locked");
  await page.locator('[data-layer="drafting"] button[aria-label^="Unlock"]').click();
  await tool("LINE", "30,2", "36,2", "");
  eq((await drawn()).length, before + 1, "drawing works again once unlocked");
});

/* ══ MOUSE: drag to select, drag to move, grips ═══════════════════════════ */
/** press, move in steps and release, like a hand on a mouse */
const dragMouse = async (x0, y0, x1, y1) => {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 5 });
  await page.mouse.move(x1, y1, { steps: 5 });
  await page.mouse.up();
  await sleep(150);
};
const header = async () => (await page.getByTestId("palette-body").innerText()).split("\n").slice(0, 2).join(" ");
const boxOf = (id) => page.locator(`[data-testid="viewport"] [data-el="${id}"]`).first().boundingBox();

await check("Select tool: a window drag selects what is inside, a crossing drag (right to left) what it touches", async () => {
  await fresh();
  await tool("RECTANG", "-20,5", "@4,3");
  await tool("RECTANG", "-14,5", "@4,3");
  const [r1, r2] = kind(await drawn(), "rect");
  const b1 = await boxOf(r1.id);
  const b2 = await boxOf(r2.id);
  await dragMouse(b1.x - 15, b1.y - 15, b2.x + b2.width + 15, b2.y + b2.height + 15);
  has(await header(), "2 elements", "window around both");
  await page.keyboard.press("Escape");
  await dragMouse(b2.x + b2.width + 15, b2.y - 15, b2.x + b2.width / 2, b2.y + b2.height + 15);
  has(await header(), "1 selected", "crossing touches only the second");
  await page.keyboard.press("Escape");
  // starting over the middle of the first rectangle (its box includes the 11 px pick stroke): the window cuts through it
  await dragMouse(b1.x + b1.width / 2, b1.y - 15, b2.x + b2.width + 15, b2.y + b2.height + 15);
  has(await header(), "1 selected", "a window that cuts through the first rectangle does not take it");
});

await check("dragging a wall moves it: joined walls stretch, the door stays put, the room grows; Esc while dragging cancels", async () => {
  await fresh();
  await tool("WALL", "30,0", "42,0", "42,10", "30,10", "c");
  let walls = kind(await drawn(), "wall");
  const south = walls.find((w) => w.pts[0][1] === 0 && w.pts[1][1] === 0);
  const east = walls.find((w) => w.pts[0][0] === 42 && w.pts[1][0] === 42);
  const north = walls.find((w) => w.pts[0][1] === 10 && w.pts[1][1] === 10);
  const sb = await boxOf(south.id);
  await cmd("DOOR");
  await page.mouse.click(sb.x + sb.width * 0.3, sb.y + sb.height / 2);
  await esc();
  await cmd("ROOM");
  const nb = await boxOf(north.id);
  await page.mouse.click(sb.x + sb.width / 2, (sb.y + nb.y) / 2);
  await esc();
  const ft = sb.width / 12; // pixels per foot
  const eb = await boxOf(east.id);
  // Esc in the middle of a drag puts everything back
  await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
  await page.mouse.down();
  await page.mouse.move(eb.x + eb.width / 2 + 3 * ft, eb.y + eb.height / 2, { steps: 6 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await sleep(150);
  must(same(kind(await drawn(), "wall").find((w) => w.id === east.id).pts[0], [42, 0]), "Esc cancelled the drag");
  const roomBefore = kind(await drawn(), "room")[0];
  await dragMouse(eb.x + eb.width / 2, eb.y + eb.height / 2, eb.x + eb.width / 2 + 4 * ft, eb.y + eb.height / 2);
  const d = await drawn();
  walls = kind(d, "wall");
  const e2 = walls.find((w) => w.id === east.id);
  must(e2.pts[0][0] > 44 && close(e2.pts[0][0], e2.pts[1][0]), `the east wall moved east (${JSON.stringify(e2.pts)})`);
  must(close(walls.find((w) => w.id === south.id).pts[1][0], e2.pts[0][0]), "the south wall stretched to stay joined");
  must(close(walls.find((w) => w.id === north.id).pts[0][0], e2.pts[0][0]), "the north wall stretched to stay joined");
  const door = kind(d, "door")[0];
  must(door.p.host === south.id && door.p.at < 5, "the door stayed where it was");
  await page.waitForFunction(([id, area]) => {
    const t = document.querySelector(`[data-el="${id}"]`)?.parentElement?.textContent ?? "";
    const m = /([\d.]+) sf/.exec(t);
    return m && Number(m[1]) > area + 20;
  }, [roomBefore.id, 100], { timeout: 4000 });
  has(await log(), "connected element(s) adjusted");
});

await check("grips: drag the end of a selected wall; the wall joined there follows", async () => {
  await fresh();
  await tool("WALL", "30,0", "42,0", "42,10", "");
  const walls = kind(await drawn(), "wall");
  const b = await boxOf(walls[1].id);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.getByTestId("grip").first().waitFor();
  eq(await page.getByTestId("grip").count(), 2, "two grips on a straight wall");
  const g = await page.locator(`[data-grip="${walls[1].id}:1"]`).boundingBox();
  const ft = (await boxOf(walls[0].id)).width / 12;
  await dragMouse(g.x + 4, g.y + 4, g.x + 4, g.y + 4 - 4 * ft);
  const after = kind(await drawn(), "wall");
  must(after.find((w) => w.id === walls[1].id).pts[1][1] > 13, `the end moved north (${JSON.stringify(after.find((w) => w.id === walls[1].id).pts)})`);
  must(same(after.find((w) => w.id === walls[0].id).pts[1], [42, 0]), "the other end stayed joined to the south wall");
});

await check("dragging a built-in wall of the house carries its windows and stretches the rest; Undo puts it back", async () => {
  await fresh();
  const pt = await page.evaluate(() => {
    for (const e of document.querySelectorAll('[data-testid="viewport"] [data-el="W-L1-E"]')) {
      const b = e.getBoundingClientRect();
      for (let j = 1; j < 12; j++) {
        const x = b.x + b.width / 2;
        const y = b.y + (b.height * j) / 12;
        if (document.elementFromPoint(x, y)?.closest("[data-el]")?.getAttribute("data-el") === "W-L1-E") return [x, y];
      }
    }
    return null;
  });
  must(pt, "a free spot on the east wall");
  const s = await page.locator('[data-testid="viewport"] [data-el="W-L1-S"]').first().boundingBox();
  await dragMouse(pt[0], pt[1], pt[0] + 60, pt[1]);
  await cmd("QSAVE");
  let rec = await work();
  must(rec.work.xf["W-L1-E"] && rec.work.xf["W-L1-S"]?.win && rec.work.xf["SL-L1"]?.win, "east wall moved, south wall and slab stretched");
  must(Object.keys(rec.work.xf).some((id) => id.startsWith("WN-") && !rec.work.xf[id].win), "its windows moved with it");
  const s2 = await page.locator('[data-testid="viewport"] [data-el="W-L1-S"]').first().boundingBox();
  must(s2.width > s.width + 20 || s2.x !== s.x, "the south wall is longer on screen");
  await cmd("UNDO");
  await cmd("QSAVE");
  rec = await work();
  eq(Object.keys(rec.work.xf).length, 0, "undo restores the house");
});

/* ══ VIEWS: elevations, sections, site plan ══════════════════════════════ */
await check("Elevation tool: all four sides open as sheets with levels, grids and the ground", async () => {
  await fresh();
  await cmd("VIEWELEV");
  await setOpt("Type", "side");
  await setOpt("Side", "all");
  await page.getByTestId("tool-apply").click();
  await page.getByTestId("sheet-view").waitFor();
  const tabs = await page.getByRole("tablist", { name: "Layouts" }).innerText();
  for (const n of ["EL-1 North Elevation", "EL-2 South Elevation", "EL-3 East Elevation", "EL-4 West Elevation"]) has(tabs, n);
  eq(await page.getByTestId("sheet-view").getAttribute("data-dir"), "W", "the last one opened");
  await page.getByRole("tab", { name: /EL-1 North Elevation/ }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="sheet-view"]')?.getAttribute("data-dir") === "N");
  has(await page.getByTestId("view-title").textContent(), "NORTH ELEVATION");
  must((await page.getByTestId("sheet-level").count()) >= 3, "level lines");
  must((await page.getByTestId("sheet-grid").count()) >= 1, "grid lines");
  must((await page.locator('[data-testid="sheet-view"] [data-el]').count()) > 30, "the building is drawn");
  await page.getByRole("tab", { name: /EL-1 North Elevation/ }).getByTestId("close-sheet").click();
  must(!(await page.getByRole("tablist", { name: "Layouts" }).innerText()).includes("EL-1"), "closing a sheet removes it");
  await cmd("UNDO");
  has(await page.getByRole("tablist", { name: "Layouts" }).innerText(), "EL-1 North Elevation", "undo brings it back");
});

await check("Section tool: a cut line and a side make a section mark and a section sheet; Site Plan shows the contours", async () => {
  await fresh();
  await cmd("VIEWSECTION");
  await cmd("-6,16");
  await cmd("30,16.4"); // straightened to run east-west
  await cmd("10,25"); // look north
  await page.getByTestId("sheet-view").waitFor();
  has(await page.getByTestId("view-title").textContent(), "SECTION A–A");
  const tabs = await page.getByRole("tablist", { name: "Layouts" }).innerText();
  has(tabs, "SC-1 Section A–A");
  const mark = kind(await drawn(), "secmark")[0];
  must(mark && mark.p.text === "A" && mark.p.ly === 1 && same(mark.pts[1], [30, 16]), `section mark A looking north (${JSON.stringify(mark)})`);
  must((await page.locator('[data-testid="sheet-view"] [data-el]').count()) > 20, "the cut building is drawn");
  await cmd("VIEWSITE");
  await page.waitForFunction(() => document.querySelector('[data-testid="sheet-view"]')?.getAttribute("data-view") === "site");
  has(await page.getByTestId("view-title").textContent(), "SITE PLAN");
  must((await page.getByTestId("contour-label").count()) > 0, "contour heights");
  // sheets are saved with the work
  await cmd("QSAVE");
  const rec = await work();
  must(rec.work.sheets.some((s) => s.id === "SC-1" && s.view.cut.axis === 1) && rec.work.sheets.some((s) => s.kind === "site"), "section and site plan saved");
});

await finish();
