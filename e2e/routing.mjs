/**
 * e2e/routing.mjs
 *
 * WHAT   Browser tests of the routing contract: the landing page; /app redirects (to the demo project, or to
 *        the last-open project from the bs_last_project cookie); the not-found page for an unknown project;
 *        /demo and its banner; URL query mirroring (?tab, ?panel, ?explorer, ?view, ?section) including deep
 *        links; Settings opened from the gear as a modal over the workspace (state intact behind it, Close
 *        returns to the exact URL) and opened directly as a normal page; /settings redirect; unknown settings
 *        page 404.
 * FOR    `npm run e2e:routing` (or `npm run e2e` for every suite). Needs the app running (BASE, default
 *        http://localhost:3000) and a Chromium. Start with `npm run dev` or, for production behaviour, `npm run
 *        build && npm start`.
 * DEBUG  - A check fails only in a full run: the checks share one page and cookies; each check should open the
 *          route it needs.
 *        - "Unknown project" check logs a 404 console error: that check lists it in `allow`; any other console
 *          error fails the check.
 *        - Timing flakes right after a page load: use ready() from the harness, which waits for the workspace
 *          to hydrate.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { check, ctx, eq, finish, has, path, page, shot, ready, BASE } from "./harness.mjs";

/** A ribbon button by name, opening the folded panel that holds it when the window is too narrow to show it. */
async function ribbonButton(name) {
  const inline = page.getByTestId("ribbon").getByRole("button", { name });
  if (await inline.count()) return inline.first();
  const folded = page.getByTestId("ribbon-collapsed");
  for (let i = 0; i < (await folded.count()); i++) {
    await folded.nth(i).click();
    const b = page.getByTestId("ribbon-flyout").getByRole("button", { name });
    if (await b.count()) return b.first();
    await page.keyboard.press("Escape");
  }
  throw new Error(`no ribbon button "${name}" on this tab`);
}

await check("landing page renders with links", async () => {
  const r = await page.goto(BASE + "/", { waitUntil: "networkidle" });
  eq(r.status(), 200);
  await page.getByRole("link", { name: /Try the Demo/ }).waitFor();
});

await check("/app redirects to the demo project when there is no last project", async () => {
  await ctx.clearCookies();
  await page.goto(BASE + "/app", { waitUntil: "networkidle" });
  eq(path(), "/app/projects/residence-2br-miami");
  await ready();
});

await check("/app honours the last-open-project cookie", async () => {
  await page.goto(BASE + "/app/projects/clinic-phase1-antigua", { waitUntil: "networkidle" });
  await ready();
  await page.goto(BASE + "/app", { waitUntil: "networkidle" });
  eq(path(), "/app/projects/clinic-phase1-antigua");
});

await check("unknown project id shows the not-found page", async () => {
  const r = await page.goto(BASE + "/app/projects/does-not-exist", { waitUntil: "networkidle" });
  eq(r.status(), 404);
  await page.getByText("find that project").waitFor();
}, { allow: [/status of 404/, /Encountered a script tag/] });

await check("/demo shows the demo banner and the full workspace", async () => {
  await page.goto(BASE + "/demo", { waitUntil: "networkidle" });
  await ready();
  await page.getByTestId("demo-banner").waitFor();
  has(await page.getByTestId("demo-banner").innerText(), "saves in this browser");
  for (const id of ["appbar", "ribbon-tabs", "ribbon", "doc-tabs", "explorer", "viewport", "palettes", "cmdline", "statusbar"]) await page.getByTestId(id).waitFor();
  await shot("e2e-demo");
});

await check("ribbon tab click updates the URL query", async () => {
  await page.getByRole("tab", { name: "Analyze" }).click();
  await page.waitForFunction(() => location.search.includes("tab=analyze"));
  await page.getByRole("button", { name: "Stress Test" }).first().waitFor();
});

await check("Stress Test command opens the palette (?panel=stress-test) and runs", async () => {
  await (await ribbonButton("Stress Test")).click();
  await page.waitForFunction(() => location.search.includes("panel=stress-test"));
  await page.getByTestId("run-stress").click();
  await page.getByTestId("stress-result").waitFor({ timeout: 10000 });
  has((await page.getByTestId("stress-result").innerText()).toLowerCase(), "safety factor");
  await shot("e2e-stress");
});

await check("Apply in model resolves the failing beam", async () => {
  await page.getByTestId("apply-fix").click();
  await page.getByTestId("stress-result").waitFor();
  has(await page.getByTestId("stress-result").innerText(), "Passes");
});

await check("section cut toggles via ribbon and URL (?section=1)", async () => {
  await page.getByRole("tab", { name: "View", exact: true }).click();
  await (await ribbonButton("Section Cut")).click();
  await page.waitForFunction(() => location.search.includes("section=1"));
  has(await page.getByText("SECTION CUT ACTIVE").innerText(), "Y = 12.0 ft");
  await shot("e2e-section");
});

await check("2D plan switches view (?view=2d) and ViewCube label updates", async () => {
  await (await ribbonButton("2D Plan")).click();
  await page.waitForFunction(() => location.search.includes("view=2d"));
  await page.waitForFunction(() => document.querySelector('[data-testid="view-label"]')?.textContent?.startsWith("2D"));
  await shot("e2e-2d");
});

await check("deep link restores tab, panel, explorer, view and section", async () => {
  await page.goto(BASE + "/demo?tab=analyze&panel=simulation&explorer=layers&view=2d&section=1", { waitUntil: "networkidle" });
  await ready();
  eq(await page.getByRole("tab", { name: "Analyze" }).getAttribute("aria-selected"), "true");
  eq(await page.locator('[data-palette-tab="simulation"]').getAttribute("aria-selected"), "true");
  eq(await page.getByRole("tab", { name: "Layers" }).getAttribute("aria-selected"), "true");
  has(await page.getByTestId("view-label").innerText(), "2D");
});

await check("gear opens settings as a modal over the workspace (URL /settings/general)", async () => {
  await page.getByTestId("gear").click();
  await page.waitForFunction(() => location.pathname === "/settings/general");
  await page.getByTestId("settings-frame").waitFor();
  eq(await page.getByTestId("settings-frame").getAttribute("data-mode"), "modal");
  await page.getByTestId("workspace").waitFor(); // still mounted behind
  await shot("e2e-settings-modal");
});

await check("workspace state is intact behind the modal and survives navigating inside it", async () => {
  await page.getByRole("link", { name: "Units" }).click();
  await page.waitForFunction(() => location.pathname === "/settings/units");
  eq(await page.getByTestId("settings-frame").getAttribute("data-mode"), "modal");
  eq(await page.getByRole("tab", { name: "Analyze" }).getAttribute("aria-selected"), "true");
});

await check("Close returns to the exact workspace URL and state", async () => {
  await page.getByTestId("settings-close").click();
  await page.waitForFunction(() => location.pathname === "/demo");
  eq(path(), "/demo?tab=analyze&panel=simulation&explorer=layers&view=2d&section=1");
  eq(await page.getByTestId("settings-frame").count(), 0);
  eq(await page.getByRole("tab", { name: "Analyze" }).getAttribute("aria-selected"), "true");
  eq(await page.locator('[data-palette-tab="simulation"]').getAttribute("aria-selected"), "true");
});

await check("/settings/units opened directly renders as a normal page", async () => {
  await page.goto(BASE + "/settings/units", { waitUntil: "networkidle" });
  eq(await page.getByTestId("settings-frame").getAttribute("data-mode"), "page");
  eq(await page.getByTestId("workspace").count(), 0);
  has(await page.locator("h2").first().innerText(), "Units");
  await shot("e2e-settings-page");
});

await check("/settings redirects to /settings/general", async () => {
  await page.goto(BASE + "/settings", { waitUntil: "networkidle" });
  eq(path(), "/settings/general");
});

await check("unknown settings page is a 404", async () => {
  const r = await page.goto(BASE + "/settings/nope", { waitUntil: "networkidle" });
  eq(r.status(), 404);
}, { allow: [/status of 404/, /Encountered a script tag/] });

await finish();
