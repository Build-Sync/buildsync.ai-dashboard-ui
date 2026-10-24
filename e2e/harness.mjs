/* Shared Playwright harness for the browser suites.
 *
 *   BASE           app origin (default http://localhost:3000)
 *   CHROMIUM_PATH  a Chrome/Chromium binary; unset uses Playwright's own (npx playwright-core install chromium)
 *   OUT            screenshot folder (default e2e/.shots)
 *   node e2e/<suite>.mjs "text,other"   runs only checks whose name contains one of the fragments
 *
 * A check also fails when the page logs a console error or throws while it runs, unless the check
 * names the message it expects (`{ allow: [/status of 404/] }`).
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

export const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? fileURLToPath(new URL("./.shots", import.meta.url));
mkdirSync(OUT, { recursive: true });
const only = process.argv[2];

export const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
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
const results = [];

export async function check(name, fn, { allow = [] } = {}) {
  if (only && !only.split(",").some((f) => name.toLowerCase().includes(f.trim().toLowerCase()))) return;
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
  console.log(`\n${pass} passed, ${fail} failed`);
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
