/**
 * e2e/layout.mjs
 *
 * WHAT   Browser tests of the dockable windows: Model Explorer, palettes, timeline and command line each step
 *        through three sizes (normal → large → header only → normal) with their arrow; the sizes are measured,
 *        survive a reload, leave the ribbon alone, keep their content mounted, and come back when a command needs
 *        them (a palette command, a timeline preset, a proposed AI edit stays visible).
 * FOR    `npm run e2e:layout` (or `npm run e2e`). Needs the app running (BASE, default http://localhost:3000).
 * DEBUG  - A size check is off by a few pixels: windows animate their size for 150 ms; the helper waits 300 ms.
 *        - The layout from a previous check leaks in: each check opens a page after clearing bs.layout.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { check, eq, finish, has, open, page, sleep } from "./harness.mjs";

await page.addInitScript(() => {
  try {
    if (!sessionStorage.getItem("e2e-keep-layout")) localStorage.removeItem("bs.layout");
  } catch {
    /* storage blocked */
  }
});

const DOCKS = { explorer: "explorer", palettes: "palettes", timeline: "timeline", cmdline: "cmdline" };
const dims = (id) => page.getByTestId(id).evaluate((e) => ({ w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height), size: e.getAttribute("data-size") }));
const press = async (dock) => {
  await page.getByTestId(`dock-toggle-${dock}`).first().click();
  await sleep(300);
  return dims(DOCKS[dock]);
};
const must = (c, m) => {
  if (!c) throw new Error(m);
};

await check("Model Explorer: normal 268 px → large → header strip → normal", async () => {
  await open("/demo");
  const a = await dims("explorer");
  eq(a.size, "mid");
  eq(a.w, 268);
  const b = await press("explorer");
  eq(b.size, "large");
  must(b.w > 350, `large explorer is wider (${b.w})`);
  const c = await press("explorer");
  eq(c.size, "min");
  eq(c.w, 32);
  has((await page.getByTestId("explorer-strip").innerText()).toLowerCase(), "model explorer");
  const d = await press("explorer");
  eq(d.size, "mid");
  eq(d.w, 268);
});

await check("Palettes: normal 330 px → large → header strip → normal", async () => {
  await open("/demo");
  eq((await dims("palettes")).w, 330);
  const b = await press("palettes");
  eq(b.size, "large");
  must(b.w > 450, `large palettes are wider (${b.w})`);
  const c = await press("palettes");
  eq(c.size, "min");
  eq(c.w, 32);
  has((await page.getByTestId("palettes-strip").innerText()).toLowerCase(), "properties");
  eq((await press("palettes")).w, 330);
});

await check("Timeline: header only (as it always started) → normal → large → header only", async () => {
  await open("/demo");
  const a = await dims("timeline");
  eq(a.size, "min");
  must(a.h <= 32, `header only is about 30 px (${a.h})`);
  const b = await press("timeline");
  eq(b.size, "mid");
  must(b.h > 250 && b.h < 290, `normal timeline is about 272 px (${b.h})`);
  const c = await press("timeline");
  eq(c.size, "large");
  must(c.h > b.h + 120, `large timeline is much taller (${c.h})`);
  eq((await press("timeline")).size, "min");
});

await check("Command line: normal → large (taller history) → header only → normal", async () => {
  await open("/demo");
  const a = await dims("cmdline");
  eq(a.size, "mid");
  const b = await press("cmdline");
  eq(b.size, "large");
  must(b.h > a.h + 80, `large command line shows more history (${a.h} → ${b.h})`);
  const c = await press("cmdline");
  eq(c.size, "min");
  must(c.h <= 30, `header only is a single bar (${c.h})`);
  await page.getByTestId("cmd-input").waitFor({ state: "hidden" });
  eq((await press("cmdline")).size, "mid");
  await page.getByTestId("cmd-input").waitFor({ state: "visible" });
});

await check("the ribbon at the top never changes while windows change", async () => {
  await open("/demo");
  const before = await page.getByTestId("ribbon").evaluate((e) => Math.round(e.getBoundingClientRect().height));
  for (const d of ["explorer", "palettes", "timeline", "cmdline"]) for (let i = 0; i < 3; i++) await press(d);
  await press("explorer");
  await press("explorer");
  const after = await page.getByTestId("ribbon").evaluate((e) => Math.round(e.getBoundingClientRect().height));
  eq(after, before, "ribbon height");
  eq(await page.getByTestId("ribbon").getByTestId("dock-toggle-explorer").count(), 0, "the ribbon has no window arrow");
});

await check("the layout is remembered across a reload", async () => {
  await open("/demo");
  await press("explorer");
  await press("explorer"); // header strip
  await press("palettes"); // large
  await press("cmdline");
  await press("cmdline"); // header only
  await page.evaluate(() => sessionStorage.setItem("e2e-keep-layout", "1"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="workspace"]');
  await sleep(700);
  eq((await dims("explorer")).size, "min");
  eq((await dims("palettes")).size, "large");
  eq((await dims("cmdline")).size, "min");
  eq((await dims("timeline")).size, "min");
  await page.evaluate(() => sessionStorage.removeItem("e2e-keep-layout"));
});

await check("a minimised window keeps its content, and commands bring it back", async () => {
  await open("/demo");
  await press("palettes");
  await press("palettes"); // header strip
  eq((await dims("palettes")).size, "min");
  // clicking something in the model does not pop the palette open
  await page.mouse.click(700, 420);
  eq((await dims("palettes")).size, "min", "selecting leaves the palette minimised");
  // a command that opens a palette restores it
  await page.getByTestId("cmd-input").click();
  await page.getByTestId("cmd-input").fill("STRESS");
  await page.keyboard.press("Enter");
  await sleep(400);
  eq((await dims("palettes")).size, "mid", "STRESS restores the palette window");
  await page.getByTestId("palette-stress").waitFor();
  // explorer content stays mounted while minimised
  await press("explorer");
  await press("explorer");
  eq(await page.getByTestId("model-tree").count(), 1, "the tree stays mounted behind the header strip");
  eq(await page.getByTestId("model-tree").isVisible(), false);
  // the timeline presets restore the timeline
  await page.getByTestId("timeline").getByRole("button", { name: "3 mo", exact: true }).click();
  await sleep(300);
  eq((await dims("timeline")).size, "mid", "a preset opens the timeline");
});

await check("an AI proposal stays visible when the command line is header only", async () => {
  await open("/demo");
  await page.getByTestId("cmd-input").click();
  await page.getByTestId("cmd-input").fill("Change all exterior walls to concrete");
  await page.keyboard.press("Enter");
  await page.getByTestId("proposal").waitFor({ timeout: 15000 });
  await press("cmdline");
  await press("cmdline");
  eq((await dims("cmdline")).size, "min");
  eq(await page.getByTestId("proposal").isVisible(), true, "Accept / Reject remain reachable");
  await page.getByTestId("accept-proposal").click();
  await page.getByTestId("proposal").waitFor({ state: "detached" });
});

await finish();
