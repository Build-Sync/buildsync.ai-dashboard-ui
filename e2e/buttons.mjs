/**
 * e2e/buttons.mjs
 *
 * WHAT   The browser click-through of every ribbon button on every tab (folded panels opened as flyouts too): each
 *        click must run its command (the "› COMMAND" echo in the command line, or a settings page), must react
 *        (a dialog, a tool prompt, a palette, a toggle, a view, a log line …), and must not log "Unknown command",
 *        "failed" or a page error. Then the features behind the newest buttons, end to end: the first-run tutorial
 *        and its 70 % dim, the Button Guide's "show me where", Interfaces, dragging a window's edge, a diagonal
 *        elevation from two points, a community of two linked houses, Site from the Map, DXF import and export,
 *        Place by Measurement, shortcuts pressed as chords and recorded, moved and removed in Settings, room names
 *        and labels switched apart, the ground type, furniture placed in 3D with the cutaway, and the eye.
 * FOR    `npm run e2e:buttons` (also part of `npm run e2e`). The same buttons are checked headless, command by
 *        command, in lib/buttons.test.ts; this suite proves the real buttons are wired to them.
 * DEBUG  - "no reaction": the button ran its command and nothing on screen changed. Run the command in the command
 *          line by hand; if it is meant to be silent when already on (a view you are in), add it to SAME_STATE.
 *        - "not on the ribbon": the button sits in a folded panel the suite did not open (buttonsOf reads every
 *          flyout of the tab first).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { BASE, check, clickViewport, eq, finish, has, open, page, shot, sleep } from "./harness.mjs";

const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
// every page load starts with no saved work and the standard windows, the command line fully open (its last 40 lines)
const LAYOUT = JSON.stringify({
  v: 2,
  a: { shown: { explorer: true, palettes: true, timeline: true, cmdline: true }, size: { explorer: "mid", palettes: "mid", timeline: "min", cmdline: "large" } },
  iface: null,
});
await page.addInitScript((layout) => {
  try {
    if (sessionStorage.getItem("e2e-keep")) return;
    for (const k of Object.keys(localStorage)) if (k.startsWith("bs.work") || k === "bs.interfaces") localStorage.removeItem(k);
    localStorage.setItem("bs.layout", layout);
  } catch {
    /* storage blocked */
  }
}, LAYOUT);

/** Buttons that, pressed when their state is already on, rightly change nothing (the view you are already in). */
const SAME_STATE = new Set(["PLAN", "VIEW TOP", "VIEW PLAN"]);

/** What the screen shows, minus the command history: a click must change it or add a reply to the history. */
const signature = () =>
  page.evaluate(() => {
    const qa = (s) => [...document.querySelectorAll(s)];
    const vp = document.querySelector('[data-testid="viewport"]');
    const input = document.querySelector('[data-testid="cmd-input"]');
    return JSON.stringify({
      url: location.pathname + location.search,
      dialogs: qa('[role="dialog"]').map((d) => d.getAttribute("aria-label") ?? d.textContent?.slice(0, 40)),
      menus: qa('[role="menu"]').length,
      pressed: qa("[data-ribbon-item][aria-pressed]").map((b) => b.getAttribute("aria-pressed")).join(""),
      tabs: qa('[role="tab"][aria-selected="true"]').map((t) => t.textContent).join("|"),
      docks: qa("[data-dock]").map((d) => `${d.getAttribute("data-dock")}:${d.getAttribute("data-size")}`).join(","),
      vp: vp ? [...vp.attributes].map((a) => `${a.name}=${a.value}`).join(" ") + vp.innerHTML.length : "",
      input: input ? `${input.getAttribute("placeholder")}|${input.value}` : "",
      tool: document.querySelector('[data-testid="tool-bar"]')?.textContent ?? "",
      status: qa('[role="status"], [role="alert"]').map((t) => t.textContent).join("|"),
      full: !!document.fullscreenElement,
      sheets: qa("[data-testid=sheet-view]").length,
      focus: document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName,
    });
  });
const history = () => page.locator('[role="log"][aria-label="Command History"] > div').allInnerTexts();
const isEcho = (l, command) => l.startsWith(`› ${command.toUpperCase()}`);
const lastEcho = (lines, command) => lines.map((l) => isEcho(l, command)).lastIndexOf(true);

/** Put the workspace back to rest between buttons: no tool, dialog, menu, flyout, fullscreen or settings page, and every window back. */
async function settle() {
  const docks = await page.evaluate(() => [...document.querySelectorAll("[data-dock]")].map((d) => `${d.getAttribute("data-dock")}:${d.getAttribute("data-size")}`).join(",")).catch(() => "");
  if (!new URL(page.url()).pathname.startsWith("/demo") || !/cmdline:large/.test(docks) || docks.split(",").length < 4) {
    await page.evaluate((layout) => localStorage.setItem("bs.layout", layout), LAYOUT).catch(() => {});
    await open("/demo?view=2d");
  }
  for (let i = 0; i < 4; i++) {
    const busy = await page.evaluate(() => !!document.querySelector('[role="dialog"], [role="menu"], [data-testid="ribbon-flyout"], [data-testid="tool-bar"]') || !!document.fullscreenElement);
    if (!busy) break;
    await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
    await page.keyboard.press("Escape");
    await sleep(80);
  }
}

/** Every button on a tab: [id, index of the folded panel holding it, or -1]. */
async function buttonsOf(tab) {
  await page.locator(`#tab-${tab}`).click();
  const out = (await page.getByTestId("ribbon").locator("[data-ribbon-item]").evaluateAll((bs) => bs.map((b) => b.getAttribute("data-ribbon-item")))).map((id) => [id, -1]);
  const folded = await page.getByTestId("ribbon-collapsed").count();
  for (let f = 0; f < folded; f++) {
    await page.getByTestId("ribbon-collapsed").nth(f).click();
    const fly = page.getByTestId("ribbon-flyout");
    await fly.waitFor({ timeout: 3000 });
    for (const id of await fly.locator("[data-ribbon-item]").evaluateAll((bs) => bs.map((b) => b.getAttribute("data-ribbon-item")))) out.push([id, f]);
    await page.keyboard.press("Escape");
    await fly.waitFor({ state: "detached", timeout: 3000 });
  }
  const seen = new Set();
  return out.filter(([id]) => !seen.has(id) && seen.add(id));
}

/** Click one ribbon button (opening its folded panel first) and say what went wrong, or null. */
async function press(tab, id, fold) {
  await settle();
  await page.locator(`#tab-${tab}`).click();
  if (fold >= 0) {
    await page.getByTestId("ribbon-collapsed").nth(fold).click();
    await page.getByTestId("ribbon-flyout").waitFor({ timeout: 3000 });
  }
  const btn = page.getByTestId(fold >= 0 ? "ribbon-flyout" : "ribbon").locator(`[data-ribbon-item="${id}"]`).first();
  if (!(await btn.count())) return `${id}: not on the ribbon`;
  const command = (await btn.getAttribute("data-command")) ?? "";
  const before = await signature();
  const lines0 = await history();
  await btn.click();
  if (command.startsWith("/")) {
    await page.waitForFunction((p) => location.pathname === p, command.split("?")[0], { timeout: 15000 }).catch(() => {});
    const at = new URL(page.url()).pathname;
    return at === command.split("?")[0] ? null : `${id}: went to ${at}, not ${command}`;
  }
  // wait for a reaction: the screen changes or the command answers (settings pages and AI replies take a moment)
  let after = [];
  let changed = false;
  for (let t = 0; t < 20; t++) {
    await sleep(t ? 100 : 200);
    after = await history().catch(() => []);
    changed = before !== (await signature());
    const at = lastEcho(after, command);
    if (at >= 0 && (changed || at < after.length - 1)) break;
    if (changed && !(await page.locator('[data-dock="cmdline"]').count())) break;
  }
  // the button closed the command line or left the workspace (a settings page): the change is the reaction
  if (!(await page.locator('[data-dock="cmdline"]').count()) || !new URL(page.url()).pathname.startsWith("/demo")) return changed ? null : `${id} (${command}): no reaction`;
  const count = (lines) => lines.filter((l) => isEcho(l, command)).length;
  if (count(after) <= count(lines0) && lines0.length < 40) return `${id}: no "› ${command}" in the command line (${after.slice(-2).join(" / ")})`;
  if (lastEcho(after, command) < 0) return `${id}: no "› ${command}" in the command line (${after.slice(-2).join(" / ")})`;
  const replies = after.slice(lastEcho(after, command) + 1);
  const bad = replies.find((l) => /Unknown command| failed: /.test(l));
  if (bad) return `${id}: ${bad}`;
  if (!changed && !replies.length && !SAME_STATE.has(command.toUpperCase())) return `${id} (${command}): no reaction`;
  return null;
}

/* ══ every button ═════════════════════════════════════════════════════════ */
await page.setViewportSize({ width: 1920, height: 1000 });
await open("/demo?view=2d");
const TABS = await page.locator('[data-testid="ribbon-tabs"] [role="tab"][id^="tab-"]').evaluateAll((ts) => ts.map((t) => t.id.slice(4)));

await check("the ribbon tabs are in working order: Home, Insert, Systems, Annotate, View, Analyze, AI, Collaborate, Manage", async () => {
  eq(TABS.join(","), "home,insert,systems,annotate,view,analyze,ai,collaborate,manage");
});

for (const tab of TABS) {
  await check(`${tab} tab: every button (folded ones too) runs its command and something happens`, async () => {
    await open("/demo?view=2d");
    const ids = await buttonsOf(tab);
    must(ids.length >= 8, `only ${ids.length} buttons on ${tab}`);
    const problems = [];
    for (const [id, fold] of ids) {
      const p = await press(tab, id, fold);
      if (p) problems.push(p);
    }
    await settle();
    must(!problems.length, `${problems.length} of ${ids.length} buttons:\n${problems.join("\n")}`);
  });
}

await check("a narrow window folds panels into flyouts, and a button inside a flyout still works", async () => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await open("/demo?view=2d");
  await page.locator("#tab-home").click();
  const folded = page.locator('[data-testid="ribbon-collapsed"]');
  must((await folded.count()) > 0, "nothing folded at 1100 px");
  await folded.first().click();
  const fly = page.getByTestId("ribbon-flyout");
  await fly.waitFor({ timeout: 3000 });
  const btn = fly.locator("[data-ribbon-item]").first();
  const command = await btn.getAttribute("data-command");
  await btn.click();
  await sleep(200);
  must((await history()).some((l) => l.startsWith(`› ${command.toUpperCase()}`)), `the flyout's ${command} did not run`);
  await settle();
  // the Help panel is pinned: it never folds
  must(await page.locator('[data-testid="ribbon"] [data-ribbon-item="tutorial"]').isVisible(), "Help folded away");
  await page.setViewportSize({ width: 1440, height: 900 });
});

/* ══ the tutorial and the Button Guide ═══════════════════════════════════ */
await check("first visit: the tutorial is offered; Skip ends it for good", async () => {
  await page.evaluate(() => {
    sessionStorage.setItem("e2e-first-run", "1");
    localStorage.removeItem("bs.tour");
  });
  await open("/demo");
  await page.getByTestId("tour-prompt-skip").click();
  await sleep(150);
  eq(await page.getByTestId("tour-prompt-start").count(), 0);
  await open("/demo");
  await sleep(400);
  eq(await page.getByTestId("tour-prompt-start").count(), 0, "asked again after Skip:");
  await page.evaluate(() => sessionStorage.removeItem("e2e-first-run"));
});

await check("the tutorial dims the rest at 70 %, lights each part, and walks every ribbon tab", async () => {
  await open("/demo");
  await page.locator("#tab-view").click();
  await page.locator("#tab-home").click();
  await page.locator('[data-testid="ribbon"] [data-ribbon-item="tutorial"]').click();
  await page.getByTestId("tour-card").waitFor({ timeout: 3000 });
  const dim = await page.getByTestId("tour-dim").evaluate((e) => Number(getComputedStyle(e).fillOpacity || e.getAttribute("fill-opacity")));
  eq(dim, 0.7, "dim opacity:");
  const seen = new Set();
  for (let i = 0; i < 40 && (await page.getByTestId("tour-card").count()); i++) {
    const t = await page.getByTestId("tour-title").innerText();
    const m = /^The (.+) tab$/.exec(t);
    if (m) {
      seen.add(m[1]);
      has(await page.locator('[role="tab"][aria-selected="true"][id^="tab-"]').innerText(), m[1], "the ribbon follows the tour:");
      must((await page.getByTestId("tour-hole").count()) > 0, `nothing lit on "${t}"`);
    }
    const next = page.getByTestId("tour-next");
    if (!(await next.count())) break;
    await next.click();
    await sleep(120);
  }
  eq(seen.size, TABS.length, `tab steps seen: ${[...seen].join(", ")} —`);
  eq(await page.getByTestId("tour-card").count(), 0, "the last Next should end the tour:");
  has(await page.locator('[role="tab"][aria-selected="true"][id^="tab-"]').innerText(), "Home", "the tab the user was on comes back:");
});

await check("Button Guide: sorted by tab with what the tab is for; Show me lights the real button", async () => {
  await open("/demo");
  await page.locator('[data-testid="ribbon"] [data-ribbon-item="buttonguide"]').click();
  const guide = page.getByTestId("button-guide");
  await guide.waitFor({ timeout: 3000 });
  for (const t of TABS) must((await guide.getByTestId(`guide-tab-${t}`).count()) > 0, `no ${t} section`);
  await guide.getByTestId("guide-search").fill("septic");
  const row = guide.getByTestId("guide-row").filter({ hasText: "Septic Tank" }).first();
  has(await row.innerText(), "Insert");
  await row.getByTestId("guide-show").click();
  await page.getByTestId("spotlight-ok").waitFor({ timeout: 3000 });
  has(await page.locator('[role="tab"][aria-selected="true"][id^="tab-"]').innerText(), "Insert", "Show me switches to the button's tab:");
  must(await page.locator('[data-testid="ribbon"] [data-ribbon-item="septic"]').isVisible(), "the septic button is not visible under the spotlight");
  await page.getByTestId("spotlight-ok").click();
  await page.goto(BASE + "/settings/buttons", { waitUntil: "networkidle" });
  await page.getByTestId("button-guide").waitFor({ timeout: 10000 });
});

/* ══ Interfaces and window edges ══════════════════════════════════════════ */
await check("Interfaces: Presentation hides every window but the status bar; a saved interface survives a reload", async () => {
  await open("/demo");
  await page.locator("#tab-view").click();
  await page.locator('[data-testid="ribbon"] [data-ribbon-item="interfaces"]').click();
  await page.getByTestId("interfaces").waitFor({ timeout: 3000 });
  await page.getByTestId("iface-apply-presentation").click();
  await sleep(200);
  await page.keyboard.press("Escape");
  for (const d of ["explorer", "palettes", "timeline", "cmdline"]) eq(await page.locator(`[data-dock="${d}"]`).count(), 0, `${d} still shown:`);
  must(await page.getByTestId("statusbar").isVisible(), "the status bar went away");
  await shot("e2e-presentation");
  await page.locator("#tab-view").click();
  await page.locator('[data-testid="ribbon"] [data-ribbon-item="interfaces"]').click();
  await page.getByTestId("iface-apply-mirrored").click();
  await page.getByTestId("iface-name").fill("My mirror");
  await page.getByTestId("iface-save").click();
  await page.keyboard.press("Escape");
  await page.evaluate(() => sessionStorage.setItem("e2e-keep", "1"));
  await open("/demo");
  const ex = await page.locator('[data-dock="explorer"]').boundingBox();
  const pa = await page.locator('[data-dock="palettes"]').boundingBox();
  must(ex && pa && pa.x < ex.x, "the palettes should be left of the explorer after a reload");
  await page.locator("#tab-view").click();
  await page.locator('[data-testid="ribbon"] [data-ribbon-item="interfaces"]').click();
  has(await page.getByTestId("interfaces").innerText(), "My mirror");
  await page.getByTestId("iface-apply-standard").click();
  await page.keyboard.press("Escape");
  await page.evaluate(() => sessionStorage.removeItem("e2e-keep"));
});

await check("dragging the timeline's top edge resizes it; a double-click puts it back", async () => {
  await open("/demo");
  const tl = page.locator('[data-dock="timeline"]');
  // from header only to its normal size, then drag
  for (let i = 0; i < 3 && (await tl.getAttribute("data-size")) !== "mid"; i++) await page.getByTestId("dock-toggle-timeline").first().click();
  await sleep(200);
  const edge = page.getByTestId("dock-edge-timeline");
  const h0 = (await tl.boundingBox()).height;
  const e = await edge.boundingBox();
  await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
  await page.mouse.down();
  await page.mouse.move(e.x + e.width / 2, e.y - 160, { steps: 8 });
  await page.mouse.up();
  await sleep(150);
  const h1 = (await tl.boundingBox()).height;
  must(h1 > h0 + 100, `timeline ${h0} → ${h1} px`);
  await edge.dblclick();
  await sleep(150);
  const h2 = (await tl.boundingBox()).height;
  must(Math.abs(h2 - h0) < 12, `double-click: ${h1} → ${h2} px, normal is ${h0}`);
});

/* ══ elevations, communities, site, import / export, placing ══════════════ */
const cmd = async (t) => {
  const input = page.getByTestId("cmd-input");
  await input.click();
  await input.fill(t);
  await page.keyboard.press("Enter");
  await sleep(60);
};

await check("Elevation: two typed points at 30° make a new sheet; typing a new angle turns it", async () => {
  await open("/demo?view=2d");
  const tabs0 = await page.getByRole("tab", { name: /Elevation/ }).count();
  await cmd("VIEWELEV");
  await cmd("-20,-20");
  await cmd("@60<30");
  await page.keyboard.press("Enter");
  await page.getByTestId("sheet-view").waitFor({ timeout: 5000 });
  must((await page.getByRole("tab", { name: /Elevation/ }).count()) > tabs0, "no new elevation sheet tab");
  const angle = page.getByTestId("elev-angle");
  await angle.fill("45");
  await angle.press("Tab");
  await sleep(200);
  eq(Math.round(parseFloat(await angle.inputValue())), 45, "angle after typing 45:");
});

await check("Community: two houses linked on one parcel open as a new project with both lots", async () => {
  await open("/demo");
  await page.locator("#tab-insert").click();
  await page.locator('[data-testid="ribbon"] [data-ribbon-item="community"]').click();
  await page.getByTestId("link-modal").waitFor({ timeout: 3000 });
  await page.getByTestId("link-pick-cottage-2br-1ba").check();
  const self = page.getByTestId("link-pick-residence-2br-miami");
  if (await self.count()) await self.check();
  await page.getByTestId("link-go").click();
  await page.waitForFunction(() => /community-\d+/.test(location.href), null, { timeout: 15000 });
  await page.getByTestId("workspace").waitFor();
  await sleep(500);
  const lots = await page.locator('[data-testid="viewport"] [data-testid="lot-name"]').count();
  must(lots >= 2, `${lots} lots drawn`);
  // Room to Room: the rooms of each house under its own name
  await page.getByTestId("room-to-room").click();
  const menu = page.getByTestId("room-to-room-menu");
  const text = await menu.innerText();
  const heads = (await menu.locator(".label-xs").allInnerTexts()).map((h) => h.toLowerCase());
  must(heads.length >= 2 && new Set(heads).size === heads.length, `one heading per building: ${heads.join(" | ")}`);
  must(/cottage_2br_1ba/.test(text.toLowerCase()) && /residence_2br_miami/.test(text.toLowerCase()), `both houses are listed: ${heads.join(" | ")}`);
  // pick a room of the second house: the building picker shows it, and Next Room stays in that house
  const second = "Residence_2BR_Miami";
  await menu.getByRole("menuitem", { name: /KITCHEN \/ DINING/ }).first().click();
  await page.getByTestId("room-bar").waitFor({ timeout: 5000 });
  eq(await page.getByTestId("building-select").locator("option:checked").innerText(), second, "the building picker names the house you are in:");
  for (let i = 0; i < 12; i++) {
    await page.getByTestId("room-bar").getByRole("button", { name: "Next Room" }).click();
    await sleep(120);
    eq(await page.getByTestId("building-select").locator("option:checked").innerText(), second, "Next Room never leaves the house:");
  }
  // switching buildings in the bar goes to the other house's first room
  await page.getByTestId("building-select").selectOption({ label: "Cottage_2BR_1BA" });
  await sleep(600);
  eq(await page.getByTestId("building-select").locator("option:checked").innerText(), "Cottage_2BR_1BA", "the building picker switches houses:");
  await page.keyboard.press("Escape");
});

await check("Site from the Map: the ground comes from the elevation tiles with contours and the height above sea level", async () => {
  await open("/demo?view=2d");
  await cmd("SITEFROMMAP");
  await page.waitForFunction(() => /Site from the map: [1-9]\d* contours/.test(document.querySelector('[role="log"]')?.textContent ?? ""), null, { timeout: 20000 });
  await page.getByTestId("sheet-view").waitFor({ timeout: 5000 });
  // the Site palette shows where the ground came from, and Get the ground fetches it again
  await page.getByRole("tablist", { name: "Palette Tabs" }).getByRole("tab", { name: "Site" }).click();
  await page.getByTestId("site-ground").click();
  await page.getByTestId("site-terrain").waitFor({ timeout: 20000 });
  const t = await page.getByTestId("site-terrain").innerText();
  must(/[1-9]\d* contours/.test(t), t);
  has(t, "above sea level");
});

await check("Import a DXF: its lines land on the plan; Export DWG writes a DXF back", async () => {
  await open("/demo?view=2d");
  const dxf = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "2", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", "0", "LINE", "8", "FENCE", "10", "0", "20", "-40", "11", "40", "21", "-40", "0", "ENDSEC", "0", "EOF"].join("\n");
  await page.locator("#tab-insert").click();
  await page.locator('[data-testid="ribbon"] [data-ribbon-item="dwg"]').click();
  await page.getByTestId("import-file").setInputFiles({ name: "fence.dxf", mimeType: "application/dxf", buffer: Buffer.from(dxf) });
  await page.getByTestId("import-ready").waitFor({ timeout: 5000 });
  await page.getByTestId("import-insert").click();
  await sleep(300);
  has((await history()).join(" "), "fence.dxf: 1 entities on 1 layer");
  await cmd("EXPORT");
  await page.getByTestId("export-dwg").click();
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), page.getByTestId("export-go").click()]);
  const text = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
  must(dl.suggestedFilename().endsWith(".dxf"), dl.suggestedFilename());
  has(text, "ENTITIES");
  has(text, "POLYLINE");
}, { allow: [/download/i] });

await check("Place by Measurement: a 10 × 12 ft shed 15 ft east and 20 ft north of the south-west corner", async () => {
  await open("/demo?view=2d");
  await cmd("PLACE");
  await page.getByTestId("place-modal").waitFor({ timeout: 3000 });
  await page.getByTestId("place-shed").click();
  await page.getByTestId("place-east").fill("15");
  await page.getByTestId("place-north").fill("20");
  has(await page.getByTestId("place-summary").innerText(), "15");
  await page.getByTestId("place-insert").click();
  await sleep(300);
  must((await page.locator('[data-testid="viewport"] [data-el^="D-"]').count()) > 0, "no shed on the plan");
});

/* ══ shortcuts, room names, ground, furniture, the eye ═══════════════════ */
const hold = async (...keys) => {
  for (const k of keys) await page.keyboard.down(k);
  for (const k of [...keys].reverse()) await page.keyboard.up(k);
  await sleep(150);
};
const ran = async (command) => (await history()).some((l) => l.startsWith(`› ${command}`));

await check("chords: Alt+W+N held together starts Window; Alt+L (inside Alt+L+B) runs Line when let go", async () => {
  await open("/demo?view=2d");
  await clickViewport(0.5, 0.9);
  await page.keyboard.press("Escape");
  await hold("Alt", "w", "n");
  must(await ran("WINDOW"), `Alt+W+N did not start Window: ${(await history()).slice(-3).join(" / ")}`);
  await page.keyboard.press("Escape");
  await hold("Alt", "l");
  must(await ran("LINE"), "Alt+L did not start Line");
  await page.keyboard.press("Escape");
  await hold("Alt", "l", "b");
  must(await ran("LABELS"), "Alt+L+B did not run Labels");
});

await check("Settings → Shortcuts: record a 4-key chord, move a chord from another command, remove one", async () => {
  await page.goto(BASE + "/settings/shortcuts", { waitUntil: "networkidle" });
  await page.getByTestId("pane-shortcuts").waitFor({ timeout: 15000 });
  // four keys at once for Wall
  await page.getByTestId("sc-record-WALL").click();
  await hold("Alt", "Shift", "q", "k");
  has(await page.getByTestId("sc-row-WALL").innerText(), "Alt+Shift+Q+K");
  // Alt+W+N belongs to Window: take it for Slab, Window is left without one
  await page.getByTestId("sc-record-SLAB").click();
  await hold("Alt", "w", "n");
  await page.getByTestId("sc-clash").waitFor({ timeout: 3000 });
  await page.getByTestId("sc-take").click();
  has(await page.getByTestId("sc-row-SLAB").innerText(), "Alt+W+N");
  must(!(await page.getByTestId("sc-row-WINDOW").innerText()).includes("Alt+"), "Window still has a chord");
  // remove Line's shortcut: blank
  await page.getByTestId("sc-remove-LINE").click();
  must(!(await page.getByTestId("sc-row-LINE").innerText()).includes("Alt+L"), "Line still has Alt+L");
  // a bare letter is refused
  await page.getByTestId("sc-record-ARC").click();
  await hold("x");
  await page.getByTestId("sc-error").waitFor({ timeout: 3000 });
  // Esc cancels the recording only: Settings stays open with the changes made so far
  await page.keyboard.press("Escape");
  await sleep(200);
  must(await page.getByTestId("pane-shortcuts").isVisible(), "Esc while recording closed Settings");
  await page.getByTestId("settings-apply").click();
  await sleep(200);
  await open("/demo?view=2d");
  await clickViewport(0.5, 0.9);
  await page.keyboard.press("Escape");
  await hold("Alt", "Shift", "q", "k");
  must(await ran("WALL"), "the recorded 4-key chord did not start Wall");
  await page.keyboard.press("Escape");
  await hold("Alt", "w", "n");
  must(await ran("SLAB"), "Alt+W+N did not start Slab after moving it");
  await page.keyboard.press("Escape");
  await hold("Alt", "l");
  must(!(await ran("LINE")), "a removed shortcut still ran Line");
  await page.evaluate(() => localStorage.removeItem("bs.settings"));
});

await check("room names and labels switch separately, in 2D and in 3D", async () => {
  await open("/demo");
  must((await page.getByTestId("room-labels-3d").count()) > 0, "no room names in 3D");
  await page.getByTestId("room-labels-chip").click();
  eq(await page.getByTestId("room-labels-3d").count(), 0, "room names after switching them off:");
  eq(await page.getByTestId("labels-chip").getAttribute("aria-pressed"), "true", "labels stay on:");
  await page.getByTestId("room-labels-chip").click();
  must((await page.getByTestId("room-labels-3d").count()) > 0, "room names did not come back");
});

await check("ground type: clay turns the ground brown with its texture, and the reports use clay", async () => {
  await open("/demo");
  await page.getByRole("tablist", { name: "Palette Tabs" }).getByRole("tab", { name: "Site" }).click();
  await page.getByTestId("ground-clay").click();
  await sleep(200);
  eq(await page.getByTestId("ground-clay").getAttribute("aria-checked"), "true");
  has(await page.getByTestId("ground-info").innerText(), "1,500 psf");
  must((await page.getByTestId("viewport").innerHTML()).includes("bs-ground-clods"), "no clay texture on the ground");
  const input = page.getByTestId("cmd-input");
  await input.click();
  await input.fill("MATCHECK");
  await page.keyboard.press("Enter");
  await sleep(200);
  has((await history()).join(" "), "Ground: Clay soil");
});

await check("furniture: a queen bed from the Library, placed in 3D with the cutaway on, saved as a bed", async () => {
  await open("/demo");
  await page.getByTestId("explorer").getByRole("tab", { name: "Library" }).click();
  await page.getByTestId("furn-bed-queen").click();
  await sleep(150);
  eq(await page.getByTestId("cutaway-chip").getAttribute("aria-pressed"), "true", "cutaway when placing furniture in 3D:");
  await clickViewport(0.5, 0.55);
  await page.keyboard.press("Escape");
  const input = page.getByTestId("cmd-input");
  await input.click();
  await input.fill("QSAVE");
  await page.keyboard.press("Enter");
  await sleep(200);
  const drawn = await page.evaluate(() => JSON.parse(localStorage.getItem("bs.work.demo.residence-2br-miami") || "null")?.work.drawn ?? []);
  must(drawn.some((i) => i.kind === "furniture" && i.p.type === "bed-queen"), `no bed saved: ${JSON.stringify(drawn.map((i) => i.kind))}`);
});

await check("window headers have only the eye (no arrow beside it)", async () => {
  await open("/demo");
  for (const d of ["explorer", "palettes", "timeline", "cmdline"]) eq(await page.getByTestId(`dock-toggle-${d}`).first().locator("svg").count(), 1, `${d}:`);
});

await finish();
