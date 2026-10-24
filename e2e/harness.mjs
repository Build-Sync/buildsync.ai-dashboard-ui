/**
 * e2e/harness.mjs
 *
 * WHAT   The shared Playwright harness behind the browser suites (routing.mjs, workspace.mjs, platform.mjs):
 *        launches Chromium once, exposes the page and small helpers (`check`, `eq`, `has`, `open`, screenshots…),
 *        collects console and page errors, and prints a PASS/FAIL summary through `finish()`.
 * FOR    Every suite imports this file. A check also fails when the page logs a console error or throws while
 *        it runs, unless the check names the message it expects (`{ allow: [/status of 404/] }`).
 *
 * OPTIONS (flags work in every shell; the environment variables are the older spelling of the same thing)
 *        --base=URL        app origin                             BASE            default http://localhost:3000
 *        --chromium=PATH   a Chrome/Chromium binary to drive      CHROMIUM_PATH   default: Playwright's own browser
 *        --out=DIR         screenshot folder                      OUT             default e2e/.shots
 *        --browser=NAME    chromium (default) | webkit (Safari's engine) | firefox     BROWSER
 *                          webkit and firefox need `npx playwright-core install webkit firefox` first
 *        first other argument: run only checks whose name contains one of the comma-separated fragments
 *        Windows PowerShell: `$env:BASE="http://localhost:3000"; npm run e2e`, or `npm run e2e -- --base=http://localhost:3000`.
 *
 * DEBUG  - "browserType.launch: Executable doesn't exist": run `npx playwright-core install chromium` or pass --chromium.
 *        - A check fails only in a full run: checks share one page; open the route you need at the start of the check.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright-core";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const only = args.find((a) => !a.startsWith("--"));

export const BASE = flag("base") ?? process.env.BASE ?? "http://localhost:3000";
const OUT = flag("out") ?? process.env.OUT ?? fileURLToPath(new URL("./.shots", import.meta.url));
mkdirSync(OUT, { recursive: true });

/** Which engine the suite runs on: "chromium", "webkit" (Safari's engine) or "firefox". */
export const engine = flag("browser") ?? process.env.BROWSER ?? "chromium";
const launcher = { chromium, webkit, firefox }[engine];
if (!launcher) throw new Error(`Unknown browser "${engine}": use chromium, webkit or firefox.`);

export const browser = await launcher
  .launch(engine === "chromium" ? { executablePath: flag("chromium") ?? (process.env.CHROMIUM_PATH || undefined), args: ["--no-sandbox"] } : {})
  .catch((e) => {
    console.error(`Could not start ${engine}: ${String(e.message).split("\n")[0]}`);
    console.error(engine === "chromium" ? "Install it with: npx playwright-core install chromium  (or pass --chromium=PATH to an installed Chrome/Chromium)" : `Install it with: npx playwright-core install ${engine}`);
    process.exit(2);
  });
export const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
export const page = await ctx.newPage();

const errors = [];
const failedRequests = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 240)); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 240)));
page.on("response", (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`); });
page.on("dialog", (d) => d.dismiss().catch(() => {}));

let pass = 0;
let fail = 0;
let skipped = 0;
const results = [];

/**
 * Run one named check. `allow`: console messages this check is expected to produce. `engines`: run it only on
 * these engines (for features, like some media-query emulation, that only Chromium offers); others report SKIP.
 */
export async function check(name, fn, { allow = [], engines } = {}) {
  if (only && !only.split(",").some((f) => name.toLowerCase().includes(f.trim().toLowerCase()))) return;
  if (engines && !engines.includes(engine)) {
    skipped++;
    results.push(`SKIP  ${name} (needs ${engines.join(" or ")}, running ${engine})`);
    return;
  }
  const before = errors.length;
  try {
    await fn();
    const unexpected = errors.slice(before).filter((e) => !allow.some((re) => re.test(e)));
    if (unexpected.length) throw new Error("runtime errors during check: " + unexpected.join(" | ").slice(0, 300));
    pass++;
    results.push(`PASS  ${name}`);
  } catch (e) {
    fail++;
    results.push(`FAIL  ${name}\n        ${String(e.message).split("\n").slice(0, 5).map((l) => l.slice(0, 220)).join("\n        ")}`);
  }
}

export async function finish() {
  console.log(results.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ""}  [${engine}]`);
  if (failedRequests.length) console.log("failed requests:\n" + [...new Set(failedRequests)].join("\n"));
  console.log(errors.length ? "console errors:\n" + [...new Set(errors)].join("\n") : "no console errors");
  await browser.close();
  process.exit(fail ? 1 : 0);
}

export const eq = (a, b, msg = "") => { if (a !== b) throw new Error(`${msg} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
export const has = (s, sub, msg = "") => { if (!String(s).includes(sub)) throw new Error(`${msg} expected "${String(s).slice(0, 160)}" to include "${sub}"`); };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const path = () => { const u = new URL(page.url()); return u.pathname + u.search; };
export const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
/** Screenshot of any page (e.g. a per-OS session), saved next to the others. */
export const shotOf = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });

/** The workspace is mounted AND hydrated: the theme applier only runs once the provider has mounted. */
export const ready = () =>
  page
    .waitForSelector('[data-testid="workspace"]', { timeout: 30000 })
    .then(() => page.waitForFunction(() => document.documentElement.style.getPropertyValue("--on-accent") !== "", null, { timeout: 30000 }));
export const open = async (p = "/demo") => {
  await page.goto(BASE + p, { waitUntil: "networkidle" });
  await ready();
};
/** A settings page opened directly (no workspace behind it). */
export const gotoSettings = async (p) => {
  const r = await page.goto(BASE + p, { waitUntil: "networkidle" });
  await page.getByTestId("settings-frame").waitFor({ timeout: 15000 });
  return r;
};
/** Click inside the viewport, away from the corner overlays (label, ViewCube, nav bar, legend). */
export const clickViewport = async (fx = 0.5, fy = 0.9, opts = {}) => {
  const b = await page.getByTestId("viewport").boundingBox();
  await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy, opts);
};
