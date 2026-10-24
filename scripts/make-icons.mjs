/**
 * scripts/make-icons.mjs
 *
 * WHAT   Renders the app's PNG icons from the single source of truth, app/icon.svg, using headless Chromium:
 *          public/icons/icon-192.png, icon-512.png            "any" purpose, rounded corners (install prompt, taskbar, Dock)
 *          public/icons/icon-maskable-512.png                 full-bleed with a safe zone, for launchers that mask icons
 *          app/apple-icon.png                                 180x180 touch icon (Safari "Add to Dock", iOS home screen)
 * FOR    The web app manifest (app/manifest.ts) and the <link rel="apple-touch-icon"> Next.js generates from
 *        app/apple-icon.png. Run it again after changing app/icon.svg.
 *
 * USAGE  node scripts/make-icons.mjs            (set CHROMIUM_PATH to a Chrome/Chromium binary if Playwright has no
 *                                                browser installed: `npx playwright-core install chromium`)
 * DEBUG  Blurry or clipped icons: check the viewBox in app/icon.svg and the `fullBleed` safe-zone transform below.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const at = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const svg = readFileSync(at("app/icon.svg"), "utf8");
const glyph = /<path[^>]*\/>/.exec(svg)?.[0];
if (!glyph) throw new Error("app/icon.svg has no <path> glyph");
const BLUE = /<rect[^>]*fill="(#[0-9a-fA-F]{6})"/.exec(svg)?.[1] ?? "#4C8DFF";

// Maskable icons are cropped to a circle/squircle by the OS: fill the whole canvas and keep the glyph in the middle 80 %.
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${BLUE}"/><g transform="translate(3.2 3.2) scale(0.8)">${glyph}</g></svg>`;

const jobs = [
  { file: "public/icons/icon-192.png", size: 192, markup: svg },
  { file: "public/icons/icon-512.png", size: 512, markup: svg },
  { file: "public/icons/icon-maskable-512.png", size: 512, markup: fullBleed },
  { file: "app/apple-icon.png", size: 180, markup: fullBleed },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
try {
  for (const { file, size, markup } of jobs) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${markup.replace("<svg ", `<svg width="${size}" height="${size}" `)}`);
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    mkdirSync(dirname(at(file)), { recursive: true });
    writeFileSync(at(file), png);
    console.log(`${file}  ${size}x${size}  ${png.length} bytes`);
    await page.close();
  }
} finally {
  await browser.close();
}
