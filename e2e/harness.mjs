/**
 * e2e/harness.mjs
 *
 * WHAT   The shared Playwright harness behind the browser suites (routing, workspace, tools, layout, site, buttons,
 *        platform):
 *        launches Chromium once, exposes the page and small helpers (`check`, `eq`, `has`, `open`, screenshots…),
 *        collects console and page errors, and prints a PASS/FAIL summary through `finish()`.
 * FOR    Every suite imports this file. A check also fails when the page logs a console error or throws while
 *        it runs, unless the check names the message it expects (`{ allow: [/status of 404/] }`). Requests to the
 *        map tile servers, the elevation tiles (a generated rolling ground) and the address search (Site palette)
 *        are answered locally, so no suite reaches out. The first-run tutorial prompt is marked seen before every
 *        page load; a check that wants it sets sessionStorage "e2e-first-run".
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
import { deflateSync } from "node:zlib";
import { chromium, firefox, webkit } from "playwright-core";

/* ── a tiny PNG writer (RGB, 8 bits), for the fake elevation tiles ─────── */
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const pngChunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
/** A w × h RGB PNG whose pixel (x, y) is `rgb(x, y)` → [r, g, b]. */
export function pngRGB(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = rgb(x, y);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]);
}

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
// the first-run tutorial prompt would cover the workspace: mark it seen, unless a check sets "e2e-first-run" to see it
await ctx.addInitScript(() => {
  try {
    if (!sessionStorage.getItem("e2e-first-run")) localStorage.setItem("bs.tour", "done");
  } catch {
    /* storage blocked: the app treats the tour as seen */
  }
});
// map tiles and the address search are answered here, so the suites never depend on (or load) outside servers
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const CORS = { "Access-Control-Allow-Origin": "*" };
await ctx.route(/server.arcgisonline.com|tile.openstreetmap.org/, (r) => r.fulfill({ status: 200, contentType: "image/png", headers: CORS, body: PNG }));
await ctx.route(/nominatim.openstreetmap.org/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
// elevation tiles (Site from Map): rolling ground of 11–29 m, continuous across tile edges
await ctx.route(/elevation-tiles-prod\/terrarium\/\d+\/\d+\/\d+\.png/, (r) => {
  const [, tx, ty] = /\/(\d+)\/(\d+)\/(\d+)\.png/.exec(r.request().url()).slice(1).map(Number);
  const body = pngRGB(256, 256, (x, y) => {
    const m = 20 + 6 * Math.sin((tx * 256 + x) / 60) + 3 * Math.cos((ty * 256 + y) / 45) + 32768;
    return [Math.floor(m / 256), Math.floor(m) % 256, Math.floor((m % 1) * 256)];
  });
  return r.fulfill({ status: 200, contentType: "image/png", headers: CORS, body });
});
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
