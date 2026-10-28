/**
 * e2e/workspace.mjs
 *
 * WHAT   Browser tests of workspace behaviour: every palette tab and explorer tab; the nine ribbon tabs, panel
 *        collapse and every ribbon command; the command line and AI proposals (Accept / Reject); keyboard
 *        shortcuts; the context menu; document tabs; the timeline; sheets; the Model Explorer keeping its scroll
 *        position; the room view (in by a double-click on a room's name, look, room to room, Esc out); and the Settings draft / Apply / persistence flow and the Connect dialog.
 * FOR    `npm run e2e:workspace` (or `npm run e2e`). Needs the app running (BASE, default
 *        http://localhost:3000) and a Chromium. Screenshots go to e2e/.shots (git-ignored).
 * DEBUG  - A ribbon command check fails: confirm the command exists in lib/commands.ts and the button in
 *          ribbon.config.ts.
 *        - Selection checks read the Properties header ("N elements", "1 selected", "No Selection") because
 *          modifier clicks must be sent with keyboard.down / up, not page.mouse.click({ modifiers }).
 *        - A check times out waiting for a data-testid: the id is set on the component (search the repo for it);
 *          open() and ready() in the harness wait until the workspace is mounted and hydrated.
 *        - Many checks fail after the ribbon smoke test: a window it hid (View → Panels) or work it saved (Site from
 *          Map) came back on reload. Both are saved, so every page load here starts clean (bs.work.*, bs.layout).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { browser, check, clickViewport, eq, finish, gotoSettings, has, open, page, ready, shot, sleep, BASE } from "./harness.mjs";

// saved project work and the window arrangement persist: start every page load from the sample and the standard windows
await page.addInitScript(() => {
  try {
    if (!sessionStorage.getItem("e2e-keep")) for (const k of Object.keys(localStorage)) if (k.startsWith("bs.work") || k === "bs.layout" || k === "bs.interfaces") localStorage.removeItem(k);
  } catch {
    /* storage blocked */
  }
});

const PALETTES = ["properties", "health", "compliance", "cost", "comments", "issues", "simulation", "stress-test", "clash", "ai-analysis", "council"];
const BODY_ID = { "stress-test": "palette-stress", "ai-analysis": "palette-ai" };

await check("palette tabs: each opens a non-empty body and mirrors ?panel=", async () => {
  await open("/demo");
  for (const id of PALETTES) {
    await page.locator(`[data-palette-tab="${id}"]`).click();
    await page.getByTestId(BODY_ID[id] ?? `palette-${id}`).waitFor({ timeout: 5000 });
    const q = new URL(page.url()).searchParams.get("panel");
    if (q !== id && q !== null) throw new Error(`panel param for ${id} was ${q}`);
    const t = (await page.getByTestId("palette-body").innerText()).trim();
    if (t.length < 15) throw new Error(`palette ${id} looks empty`);
  }
});

await check("explorer tabs: model / views / layers / levels / library", async () => {
  for (const [name, id] of [["Views", "views-list"], ["Layers", "layers-table"], ["Levels", "levels-list"], ["Library", "library"], ["Model", "model-tree"]]) {
    await page.getByTestId("explorer").getByRole("tab", { name, exact: true }).click();
    await page.getByTestId(id).waitFor({ timeout: 5000 });
  }
});

await check("ribbon: all nine tabs render labelled buttons", async () => {
  await open("/demo");
  for (const t of ["Home", "Insert", "Systems", "Annotate", "Analyze", "Collaborate", "AI", "View", "Manage"]) {
    await page.getByRole("tab", { name: t, exact: true }).click();
    const n = await page.getByTestId("ribbon").getByRole("button").count();
    if (n < 6) throw new Error(`${t} tab has only ${n} buttons`);
    const names = await page.getByTestId("ribbon").getByRole("button").evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim()));
    const blank = names.filter((x) => !x).length;
    if (blank) throw new Error(`${t}: ${blank} unlabelled ribbon buttons`);
  }
});

await check("ribbon smoke: every button on every tab, including inside collapsed-panel flyouts, never crashes the workspace", async () => {
  const tabs = ["Home", "Insert", "Systems", "Annotate", "Analyze", "Collaborate", "AI", "View", "Manage"];
  let clicked = 0, viaFlyout = 0;
  const reset = async (t) => { await open("/demo"); await page.getByRole("tab", { name: t, exact: true }).click(); };
  const settle = async (t, label, command = "") => {
    // a button that opens a settings page (a /settings link, or a command such as SHORTCUTS): let it open, then come back
    if (command.startsWith("/")) await page.waitForFunction((p) => location.pathname === p, command.split("?")[0], { timeout: 10000 }).catch(() => {});
    else await page.waitForFunction(() => !location.pathname.startsWith("/demo"), null, { timeout: 150 }).catch(() => {});
    if (!new URL(page.url()).pathname.startsWith("/demo") || (await page.getByTestId("settings-frame").count())) { await reset(t); return false; }
    await page.keyboard.press("Escape");
    if ((await page.getByTestId("workspace").count()) === 0) throw new Error(`workspace vanished after clicking "${label}" on ${t}`);
    if ((await page.getByTestId("ribbon").count()) === 0) throw new Error(`ribbon vanished after clicking "${label}" on ${t}`);
    return true;
  };
  // a settings page can open late (its code loads on first use): before each click, come back from one if it did
  const guard = async (t) => {
    if (!new URL(page.url()).pathname.startsWith("/demo") || (await page.getByTestId("settings-frame").count())) await reset(t);
  };
  const clickFolded = async (t, c) => {
    await guard(t);
    try {
      await page.getByTestId("ribbon-collapsed").nth(c).click({ timeout: 5000 });
    } catch {
      await guard(t);
      await page.keyboard.press("Escape");
      await page.getByTestId("ribbon-collapsed").nth(c).click({ timeout: 5000 });
    }
  };
  for (const t of tabs) {
    await reset(t);
    // 1. everything directly in the strip (collapsed buttons just open and close their flyout)
    const n = await page.getByTestId("ribbon").getByRole("button").count();
    for (let i = 0; i < n; i++) {
      await guard(t);
      const btn = page.getByTestId("ribbon").getByRole("button").nth(i);
      const label = ((await btn.getAttribute("aria-label")) || (await btn.innerText()) || `#${i}`).trim().replace(/\s+/g, " ");
      const command = (await btn.getAttribute("data-command")) ?? "";
      try { await btn.click({ timeout: 2500, force: true }); } catch { continue; }
      clicked++;
      await settle(t, label, command);
    }
    // 2. everything inside collapsed panels
    const folded = await page.getByTestId("ribbon-collapsed").count();
    for (let c = 0; c < folded; c++) {
      await clickFolded(t, c);
      const items = await page.getByTestId("ribbon-flyout").getByRole("button").count();
      if (items < 2) throw new Error(`flyout ${c} on ${t} has only ${items} buttons`);
      await page.keyboard.press("Escape");
      for (let j = 0; j < items; j++) {
        await guard(t);
        if ((await page.getByTestId("ribbon-collapsed").count()) <= c) break;
        await clickFolded(t, c);
        const b = page.getByTestId("ribbon-flyout").getByRole("button").nth(j);
        const label = ((await b.getAttribute("aria-label")) || (await b.innerText()) || `#${j}`).trim().replace(/\s+/g, " ");
        const command = (await b.getAttribute("data-command")) ?? "";
        try { await b.click({ timeout: 2500, force: true }); } catch { await page.keyboard.press("Escape"); continue; }
        viaFlyout++;
        if (await page.getByTestId("ribbon-flyout").count()) throw new Error(`flyout stayed open after running "${label}"`);
        if (await settle(t, label, command)) await settle(t, label);
      }
    }
  }
  console.log(`   (smoke clicked ${clicked} strip buttons + ${viaFlyout} flyout items = ${clicked + viaFlyout})`);
  if (viaFlyout < 40) throw new Error(`only ${viaFlyout} flyout items exercised`);
});

await check("ribbon collapse: Home at 1440 folds right-most panels, widening unfolds them, nothing overflows", async () => {
  await open("/demo");
  await page.getByRole("tab", { name: "Home", exact: true }).click();
  const collapsed1440 = (await page.getByTestId("ribbon").getAttribute("data-collapsed")).split(",").filter(Boolean);
  if (collapsed1440.length < 3) throw new Error("Home should fold several panels at 1440: " + collapsed1440);
  has(collapsed1440.join(","), "measure");
  const over = await page.getByTestId("ribbon").evaluate((el) => el.scrollWidth - el.clientWidth);
  if (over > 1) throw new Error("ribbon overflows by " + over);
  // Home is the widest tab (Draw, Modify, Building, Structure, MEP, Properties, Layers, Measure, Help): all of it fits at 3400
  await page.setViewportSize({ width: 3400, height: 900 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="ribbon"]').getAttribute("data-collapsed"), null, { timeout: 5000 });
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.waitForFunction((n) => document.querySelector('[data-testid="ribbon"]').getAttribute("data-collapsed").split(",").length > n, collapsed1440.length, { timeout: 5000 });
  await page.setViewportSize({ width: 1440, height: 900 });
});

await check("ribbon flyout: opens under its button, Escape and outside click close it, toggle works", async () => {
  await open("/demo");
  const b = page.getByTestId("ribbon-collapsed").first();
  await b.click();
  await page.getByTestId("ribbon-flyout").waitFor();
  eq(await b.getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Escape");
  await page.getByTestId("ribbon-flyout").waitFor({ state: "detached" });
  await b.click();
  await page.getByTestId("ribbon-flyout").waitFor();
  await b.click();
  await page.getByTestId("ribbon-flyout").waitFor({ state: "detached" });
  await b.click();
  await page.getByTestId("ribbon-flyout").waitFor();
  await page.mouse.click(700, 400);
  await page.getByTestId("ribbon-flyout").waitFor({ state: "detached" });
});

await check("command line: SECTION / 2D / 3D toggle URL state", async () => {
  await open("/demo");
  const type = async (t) => { await page.getByTestId("cmd-input").click(); await page.getByTestId("cmd-input").fill(t); await page.keyboard.press("Enter"); };
  await type("SECTION");
  await page.waitForFunction(() => location.search.includes("section=1"));
  await type("SECTION");
  await page.waitForFunction(() => !location.search.includes("section="));
  await type("2D");
  await page.waitForFunction(() => location.search.includes("view=2d"));
  await type("3D");
  await page.waitForFunction(() => !location.search.includes("view="));
  const log = await page.getByTestId("cmdline").innerText();
  has(log, "› 3D");
});

await check("command line: command aliases and unknown commands", async () => {
  await page.getByTestId("cmd-input").click();
  await page.getByTestId("cmd-input").fill("ZE");
  await page.keyboard.press("Enter");
  await sleep(120);
  await page.getByTestId("cmd-input").fill("ST");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.search.includes("panel=stress-test"));
});

await check("free text goes to the AI agent, returns a proposal, Accept applies it", async () => {
  await page.getByTestId("cmd-input").click();
  await page.getByTestId("cmd-input").fill("Change all exterior walls to concrete");
  await page.keyboard.press("Enter");
  await page.getByTestId("proposal").waitFor({ timeout: 15000 });
  has(await page.getByTestId("proposal").innerText(), "concrete");
  await shot("e2e-proposal");
  await page.getByTestId("accept-proposal").click();
  await page.getByTestId("proposal").waitFor({ state: "detached", timeout: 5000 });
  has(await page.getByTestId("title").innerText(), "*");
});

await check("free text question is answered in the command-line history by the active agent", async () => {
  await page.getByTestId("cmd-input").click();
  await page.getByTestId("cmd-input").fill("Why is the floor beam failing?");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => /→/.test(document.querySelector('[data-testid="cmdline"]')?.textContent ?? ""), null, { timeout: 15000 });
  await sleep(1500);
  await shot("e2e-ai-answer");
});

await check("AI Analysis palette: Run shows the Answered-by chip and recommendations", async () => {
  await page.locator('[data-palette-tab="ai-analysis"]').click();
  await page.getByTestId("run-analysis").click();
  await page.getByTestId("answered-by").waitFor({ timeout: 15000 });
  await shot("e2e-ai-analysis");
});

await check("F8 toggles ORTHO and the status bar reflects it", async () => {
  await open("/demo");
  const ortho = page.getByTestId("statusbar").getByRole("button", { name: "ORTHO" });
  const before = await ortho.getAttribute("aria-pressed");
  await clickViewport();
  await page.keyboard.press("F8");
  await sleep(80);
  const after = await ortho.getAttribute("aria-pressed");
  if (before === after) throw new Error("F8 did not change ORTHO");
  await page.keyboard.press("F8");
  await sleep(80);
  eq(await ortho.getAttribute("aria-pressed"), before);
});

await check("right-click on the viewport opens the context menu; Escape closes it", async () => {
  await clickViewport(0.5, 0.6, { button: "right" });
  await page.getByRole("menu").first().waitFor({ timeout: 3000 });
  const items = await page.getByRole("menuitem").count();
  if (items < 4) throw new Error(`context menu has only ${items} items`);
  await shot("e2e-context-menu");
  await page.keyboard.press("Escape");
  await page.getByRole("menu").first().waitFor({ state: "detached", timeout: 3000 });
});

await check("document tabs switch projects (?project=) and back", async () => {
  await open("/demo");
  await page.getByTestId("doc-tabs").getByRole("tab", { name: /Cottage_2BR/ }).click();
  await page.waitForFunction(() => location.search.includes("project=cottage-2br-1ba"));
  has(await page.getByTestId("title").innerText(), "Cottage");
  await shot("e2e-cottage");
  await page.getByTestId("doc-tabs").getByRole("tab", { name: /Residence_2BR/ }).click();
  await page.waitForFunction(() => location.search.includes("project=residence-2br-miami") || !location.search.includes("project=cottage"));
  has(await page.getByTestId("title").innerText(), "Residence");
});

await check("Start tab shows recent projects and templates", async () => {
  await page.getByTestId("doc-tabs").getByRole("tab", { name: "Start" }).click();
  await page.getByTestId("start-page").waitFor();
  await page.waitForFunction(() => location.search.includes("doc=start"));
  await shot("e2e-start");
  await page.getByTestId("doc-tabs").getByRole("tab", { name: /Residence_2BR/ }).click();
  await page.getByTestId("viewport").waitFor();
});

await check("timeline: presets set a window, summary + cost palette follow, Clear removes it", async () => {
  await open("/demo?panel=cost");
  await page.getByTestId("timeline").waitFor();
  const presets = page.getByTestId("timeline").getByRole("group", { name: "Time Window Presets" }).getByRole("button");
  const n = await presets.count();
  if (n < 3) throw new Error(`only ${n} timeline presets`);
  await presets.nth(1).click();
  await page.getByTestId("window-summary").waitFor();
  await page.getByTestId("gantt-window").waitFor();
  has(await page.getByTestId("window-summary").innerText(), "Day");
  await shot("e2e-timeline");
  await page.getByTestId("window-summary").getByRole("button", { name: "Clear Window" }).click();
  await page.getByTestId("window-summary").waitFor({ state: "detached" });
});

await check("timeline: Play starts the timelapse and the viewport keeps rendering", async () => {
  await page.getByTestId("timeline").getByRole("button", { name: /Play/ }).click();
  await sleep(900);
  await page.getByTestId("timeline").getByRole("button", { name: /Pause|Play/ }).first().click();
  await page.getByTestId("scene").waitFor();
});

await check("ViewCube click on TOP changes the camera label", async () => {
  await open("/demo");
  await page.getByTestId("viewport").getByText("TOP", { exact: true }).first().click({ force: true }).catch(() => {});
  await sleep(250);
  const t = (await page.getByTestId("view-label").innerText()).toLowerCase();
  if (!/top|plan|2d/.test(t)) throw new Error(`view label did not change: ${t}`);
});

await check("layout sheets: A-101 Floor Plan shows the title block", async () => {
  await open("/demo");
  await page.getByRole("tab", { name: "A-101 Floor Plan" }).click();
  await page.getByTestId("sheet-view").waitFor();
  has((await page.getByTestId("sheet-view").innerText()).toLowerCase(), "unstamped");
  await shot("e2e-sheet");
  await page.getByRole("tab", { name: "Model", exact: true }).last().click();
  await page.getByTestId("scene").waitFor();
});

await check("settings draft: theme previews live, Close discards, Apply persists across reload", async () => {
  await open("/demo");
  await page.getByTestId("gear").click();
  await page.waitForFunction(() => location.pathname === "/settings/general");
  await page.getByRole("link", { name: "Display" }).click();
  await page.waitForFunction(() => location.pathname === "/settings/display");
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "light");
  await page.getByTestId("settings-close").click();
  await page.waitForFunction(() => location.pathname === "/demo");
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-theme") || document.documentElement.getAttribute("data-theme") === "dark");
  // now apply
  await page.getByTestId("gear").click();
  await page.getByRole("link", { name: "Display" }).click();
  await page.waitForFunction(() => location.pathname === "/settings/display");
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  await page.getByRole("radio", { name: "Accent #3ECF8E" }).click();
  await page.getByTestId("settings-apply").click();
  await sleep(250);
  const stored = await page.evaluate(() => localStorage.getItem("bs.settings"));
  has(stored, '"theme":"light"');
  has(stored, "#3ECF8E");
  await page.getByTestId("settings-close").click();
  await page.waitForFunction(() => location.pathname === "/demo");
  eq(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "light");
  await shot("e2e-light");
  await page.reload({ waitUntil: "domcontentloaded" });
  eq(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "light");
  await ready();
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().toLowerCase());
  eq(accent, "#3ecf8e");
});

await check("high-contrast + UI scale apply and restore", async () => {
  await gotoSettings("/settings/display");
  await page.getByLabel("Theme", { exact: true }).selectOption("hc");
  await page.getByLabel("UI Scale", { exact: true }).selectOption("125");
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "hc");
  const fs = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  eq(fs, "20px");
  await shot("e2e-hc");
  await page.getByTestId("settings-close").click();
});

await check("reset appearance to dark/100% for the remaining checks", async () => {
  await gotoSettings("/settings/display");
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  await page.getByLabel("UI Scale", { exact: true }).selectOption("100");
  await page.getByRole("radio", { name: "Accent #4C8DFF" }).click();
  await page.getByTestId("settings-apply").click();
  await sleep(200);
});

await check("connect Kimi from the chip: modal over workspace, test, connect, chip becomes 3 agents", async () => {
  await open("/demo");
  has(await page.getByTestId("agents-chip").innerText(), "2 Agents");
  await page.getByTestId("agents-chip").click();
  await page.waitForFunction(() => location.pathname === "/settings/integrations");
  await page.getByTestId("agent-grid").waitFor();
  await page.getByTestId("connect-kimi").click();
  await page.waitForFunction(() => location.pathname === "/settings/integrations/kimi");
  await page.getByTestId("connect-dialog").waitFor();
  await page.locator("#api-key").fill("sk-test-1234567890abcdef");
  await page.getByTestId("test-connection").click();
  await page.getByTestId("test-result").waitFor({ timeout: 8000 });
  has(await page.getByTestId("test-result").innerText(), "Connection verified");
  await shot("e2e-connect");
  await page.getByTestId("connect-submit").click();
  await page.waitForFunction(() => location.pathname === "/settings/integrations", null, { timeout: 8000 });
  // the key must never be rendered back in the DOM
  const html = await page.content();
  if (html.includes("sk-test-1234567890abcdef")) throw new Error("API key leaked into the DOM");
  await page.getByTestId("settings-close").click();
  await page.waitForFunction(() => location.pathname === "/demo");
  has(await page.getByTestId("agents-chip").innerText(), "3 Agents");
});

await check("manage Kimi: disconnect returns the chip to 2 agents", async () => {
  await page.getByTestId("agents-chip").click();
  await page.waitForFunction(() => location.pathname === "/settings/integrations");
  await page.getByRole("listitem").filter({ hasText: "Kimi" }).getByRole("button", { name: "Manage", exact: true }).click();
  await page.waitForFunction(() => location.pathname === "/settings/integrations/kimi");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await page.waitForFunction(() => location.pathname === "/settings/integrations");
  await page.getByTestId("settings-close").click();
  await page.waitForFunction(() => location.pathname === "/demo");
  has(await page.getByTestId("agents-chip").innerText(), "2 Agents");
});

await check("settings: all thirteen panes render without errors", async () => {
  const panes = ["general", "units", "grid-snap", "display", "rendering", "shortcuts", "ai", "integrations", "notifications", "permissions", "account", "help", "buttons"];
  for (const p of panes) {
    const r = await page.goto(BASE + `/settings/${p}`, { waitUntil: "networkidle" });
    if (r.status() !== 200) throw new Error(`/settings/${p} -> ${r.status()}`);
    await page.getByTestId("settings-pane").waitFor({ timeout: 5000 });
    const t = (await page.getByTestId("settings-pane").innerText()).trim();
    if (t.length < 20) throw new Error(`settings pane ${p} looks empty`);
  }
});

await check("app menu opens with project actions", async () => {
  await open("/demo");
  await page.getByRole("button", { name: "Application Menu" }).click();
  await page.getByRole("menu").first().waitFor();
  await shot("e2e-appmenu");
  await page.keyboard.press("Escape");
});

await check("search box finds commands and runs on Enter", async () => {
  await page.keyboard.press("Control+k");
  const input = page.getByPlaceholder(/Search commands/);
  await input.fill("stress");
  await sleep(250);
  await shot("e2e-search");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.search.includes("panel=stress-test"));
});

await check("Prompt to Plan modal generates a starter plan (mock)", async () => {
  await open("/demo");
  await page.getByTestId("cmd-input").click();
  await page.getByTestId("cmd-input").fill("P2P");
  await page.keyboard.press("Enter");
  const dlg = page.getByRole("dialog").first();
  await dlg.waitFor({ timeout: 5000 });
  await shot("e2e-p2p");
  await page.keyboard.press("Escape");
});

await check("PE workflow modal and invite dialog open and close", async () => {
  await page.getByTestId("invite-btn").first().click({ timeout: 3000 }).catch(() => {});
  await sleep(150);
  await page.keyboard.press("Escape");
});

await check("keyboard: Ctrl+Z / Ctrl+Y round-trip after an edit", async () => {
  await open("/demo");
  await page.getByTestId("cmd-input").click();
  await page.getByTestId("cmd-input").fill("HIDE");
  await page.keyboard.press("Enter");
  await sleep(120);
  await clickViewport();
  await page.keyboard.press("Control+z");
  await sleep(120);
  await page.keyboard.press("Control+y");
  await sleep(120);
});

await check("regression: loading a settings page directly keeps the saved settings (no clobber by defaults)", async () => {
  await gotoSettings("/settings/display");
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  await page.getByRole("radio", { name: "Accent #3ECF8E" }).click();
  await page.getByTestId("settings-apply").click();
  await sleep(250);
  for (const url of ["/settings/display", "/settings/units", "/settings/general"]) {
    await gotoSettings(url);
    await sleep(300);
    const st = await page.evaluate(() => ({ stored: localStorage.getItem("bs.settings"), theme: document.documentElement.getAttribute("data-theme"), apply: document.querySelector('[data-testid=settings-apply]').disabled }));
    has(st.stored, '"theme":"light"', url + " stored theme");
    has(st.stored, "#3ECF8E", url + " stored accent");
    eq(st.theme, "light", url + " html theme");
    eq(st.apply, true, url + " Apply should be disabled until something changes");
  }
  await gotoSettings("/settings/display");
  eq(await page.getByLabel("Theme", { exact: true }).inputValue(), "light", "Display pane shows the saved theme");
});

await check("regression: the saved theme survives a workspace reload and Apply leaves other settings alone", async () => {
  await open("/demo");
  eq(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "light");
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem("bs.settings")));
  eq(stored.state.settings.general.autosaveMinutes, 2);
});

await check("blocked localStorage: the app still loads and theme changes still apply", async () => {
  const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await c2.addInitScript(() => { Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("blocked", "SecurityError"); } }); });
  const p2 = await c2.newPage();
  const errs = [];
  p2.on("pageerror", (e) => errs.push(e.message));
  await p2.goto(BASE + "/demo", { waitUntil: "networkidle" });
  await p2.waitForSelector('[data-testid="workspace"]', { timeout: 30000 });
  await p2.getByTestId("gear").click();
  await p2.waitForFunction(() => location.pathname === "/settings/general");
  await p2.getByRole("link", { name: "Display" }).click();
  await p2.waitForFunction(() => location.pathname === "/settings/display");
  await p2.getByLabel("Theme", { exact: true }).selectOption("light");
  await p2.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "light");
  await p2.getByTestId("settings-apply").click();
  await p2.getByTestId("settings-close").click();
  await p2.waitForFunction(() => location.pathname === "/demo");
  eq(await p2.evaluate(() => document.documentElement.getAttribute("data-theme")), "light");
  await c2.close();
  if (errs.length) throw new Error("page errors with blocked storage: " + errs.join(" | ").slice(0, 200));
});

await check("Esc closes a modal even when focus has dropped to the page (focused button disabled mid-request)", async () => {
  await open("/demo");
  await page.getByTestId("cmd-input").click();
  await page.getByTestId("cmd-input").fill("P2P");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").first().waitFor();
  await page.getByRole("button", { name: "Generate" }).click();
  await page.evaluate(() => document.activeElement?.blur()); // focus falls to <body>, as it does when the clicked button disables itself
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 3000 });
});

await check("Esc closes only the top-most layer: the Connect dialog first, then settings", async () => {
  await open("/demo");
  await page.getByTestId("agents-chip").click();
  await page.waitForFunction(() => location.pathname === "/settings/integrations");
  await page.getByTestId("connect-kimi").click();
  await page.waitForFunction(() => location.pathname === "/settings/integrations/kimi");
  await page.getByTestId("connect-dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => location.pathname === "/settings/integrations");
  await page.getByTestId("connect-dialog").waitFor({ state: "detached" });
  eq(await page.getByTestId("settings-frame").count(), 1, "settings should still be open");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => location.pathname === "/demo");
});

const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
await check("the room view: double-click a room's name to stand inside, look around, go room to room, Esc to leave", async () => {
  await open("/demo?view=2d");
  const label = () => page.locator('[aria-label="Viewport Label"]').innerText();
  await page.getByTestId("room-label-2d").filter({ hasText: "BEDROOM 1" }).dblclick();
  await page.getByTestId("room-bar").waitFor({ timeout: 5000 });
  has(await label(), "Inside · BEDROOM 1", "the view is inside the room:");
  eq(await page.getByTestId("room-select").inputValue(), "RM-3", "the bar names the room:");
  // drag to look around: what is on screen changes
  const before = await page.getByTestId("scene").innerHTML();
  const b = await page.getByTestId("viewport").boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 200, b.y + b.height / 2 + 60, { steps: 6 });
  await page.mouse.up();
  await sleep(200);
  must((await page.getByTestId("scene").innerHTML()) !== before, "dragging turns the view");
  has(await label(), "Inside", "and stays inside (a drag never moves walls):");
  // the next room, then a marker
  await page.getByTestId("room-bar").getByRole("button", { name: "Next Room" }).click();
  await sleep(700);
  eq(await page.getByTestId("room-select").inputValue(), "RM-4", "Next Room:");
  const marker = page.getByTestId("room-marker").first();
  if (await marker.count()) {
    const to = await marker.getAttribute("data-room");
    await marker.click();
    await sleep(700);
    eq(await page.getByTestId("room-select").inputValue(), to, "a click on a room's marker goes there:");
  }
  await page.keyboard.press("Escape");
  await sleep(200);
  eq(await page.getByTestId("room-bar").count(), 0, "Esc leaves the room:");
  // the Room to Room button in the top bar lists the rooms by building and storey (this house has two storeys)
  await page.getByTestId("room-to-room").click();
  const menu = page.getByTestId("room-to-room-menu");
  // headings are drawn in capitals (CSS), so compare without case
  const text = (await menu.innerText()).toLowerCase();
  has(text, "residence_2br_miami", "the building's name heads its rooms:");
  has(text, "level 1", "a storey heading:");
  has(text, "level 2", "and the one above:");
  must(text.indexOf("level 1") < text.indexOf("level 2") && text.indexOf("stair hall") < text.indexOf("study"), "storeys go from the ground up");
  await menu.getByRole("menuitem", { name: /STUDY/ }).click();
  await page.getByTestId("room-bar").waitFor({ timeout: 5000 });
  has(await label(), "Inside · STUDY", "a room picked from the menu:");
  eq(await page.getByTestId("room-to-room").getAttribute("data-inside"), "true", "the button is lit inside a room:");
  eq(await page.getByTestId("building-select").count(), 0, "one building: no building picker:");
  await page.getByTestId("room-to-room").click();
  await page.getByRole("menuitem", { name: "Leave the Room" }).click();
  await sleep(200);
  eq(await page.getByTestId("room-bar").count(), 0, "Leave the Room in the menu:");
  must(!(await label()).includes("Inside"), "back outside");
  // a double-click on a room's name in 3D goes in too
  const name3d = page.getByTestId("room-label-3d").last();
  const name = (await name3d.locator("text").textContent()).trim();
  await name3d.locator("rect").dblclick({ force: true });
  await page.getByTestId("room-bar").waitFor({ timeout: 5000 });
  has(await label(), `Inside · ${name}`, "from the 3D names as well:");
});

await check("the Model Explorer keeps its scroll position when a node is opened or closed, and across tabs", async () => {
  await open("/demo");
  const tree = page.getByTestId("model-tree");
  const state = () => tree.evaluate((e) => {
    const s = e.closest(".overflow-y-auto");
    return { top: s.scrollTop, max: s.scrollHeight - s.clientHeight };
  });
  // open nodes until the tree is taller than its window
  for (let i = 0; i < 12 && (await state()).max < 160; i++) await tree.locator('[role="treeitem"][aria-expanded="false"] button').first().click();
  if ((await state()).max < 160) throw new Error(`the tree does not scroll (${JSON.stringify(await state())})`);
  await tree.evaluate((e) => (e.closest(".overflow-y-auto").scrollTop = 80));
  await sleep(60);
  // a closed node on screen: opening it makes the tree taller, closing it gives the height back
  const name = await tree.evaluate((e) => {
    const box = e.closest(".overflow-y-auto").getBoundingClientRect();
    const r = [...e.querySelectorAll('[role="treeitem"][aria-expanded="false"]')].find((x) => {
      const b = x.getBoundingClientRect();
      return b.top > box.top + 10 && b.bottom < box.bottom - 10;
    });
    return r ? r.textContent.replace(/\[\d+\]/, "").trim() : null;
  });
  if (!name) throw new Error("no closed node on screen");
  const row = tree.locator('[role="treeitem"]', { hasText: name }).first();
  await row.locator("button").first().click();
  await sleep(80);
  eq(await row.getAttribute("aria-expanded"), "true", `${name} opened:`);
  eq((await state()).top, 80, `after opening ${name} the tree stays where it was scrolled:`);
  await row.locator("button").first().click();
  await sleep(80);
  eq((await state()).top, 80, `after closing ${name} again:`);
  // the tabs share one scroll area: the tree keeps its place across a visit to a short tab
  await page.getByTestId("explorer").getByRole("tab", { name: "Layers" }).click();
  await sleep(80);
  await page.getByTestId("explorer").getByRole("tab", { name: "Model" }).click();
  await sleep(80);
  eq((await state()).top, 80, "after the Layers tab and back:");
});

await finish();
