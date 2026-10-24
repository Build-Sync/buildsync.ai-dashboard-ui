/**
 * e2e/platform.mjs
 *
 * WHAT   Browser tests of everything that must behave differently, or identically, on macOS, Windows and
 *        Linux. Each test runs the real app in a browser context that reports as that OS (navigator.platform,
 *        userAgentData, user agent) and presses real keys / makes real pointer input:
 *          - shortcut labels (⌘K vs Ctrl+K), key handling (⌘Z vs Ctrl+Z, redo forms, Mac delete key, Option/Alt combos)
 *          - viewport input (⌘/Ctrl select, ⌃-click on a Mac, Space+drag pan, wheel, pinch, touch pinch)
 *          - theming (Match system with the OS light/dark and contrast settings), forced colours (Windows Contrast themes)
 *          - installability (manifest, icons, apple-touch-icon), IME composition guard, author metadata
 * FOR    `npm run e2e:platform` (part of `npm run e2e`). Run against a started app: see the README.
 *
 * DEBUG  - A label test fails: print navigator.platform in the page; the override is installed by `session()` below.
 *        - A key test fails: log `comboOf` for the event in lib/shortcuts.ts, and remember Playwright sends the
 *          modifier named in the test (Meta = ⌘), exactly like a real keyboard.
 *        - Each OS uses its own browser context, so failures never leak settings between OSes.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { readFileSync } from "node:fs";
import { BASE, browser, check, eq, finish, has, shotOf, sleep } from "./harness.mjs";

const CHROME = "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const OSES = {
  mac: { platform: "MacIntel", uaPlatform: "macOS", ua: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${CHROME}`, mod: "Meta", other: "Control" },
  windows: { platform: "Win32", uaPlatform: "Windows", ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${CHROME}`, mod: "Control", other: "Meta" },
  linux: { platform: "Linux x86_64", uaPlatform: "Linux", ua: `Mozilla/5.0 (X11; Linux x86_64) ${CHROME}`, mod: "Control", other: "Meta" },
};

/**
 * A browser context that reports as `os`. `settings` seeds Settings (merged over the defaults) before the first load;
 * `media` is passed to page.emulateMedia (OS colour scheme, contrast, forced colours).
 */
async function session(os, { settings, media, colorScheme = "dark" } = {}) {
  const o = OSES[os];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: o.ua, colorScheme });
  await ctx.addInitScript(
    ({ platform, uaPlatform, settings }) => {
      Object.defineProperty(Navigator.prototype, "platform", { get: () => platform, configurable: true });
      Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => ({ platform: uaPlatform, mobile: false, brands: [] }), configurable: true });
      try {
        if (settings && !sessionStorage.getItem("__seeded")) {
          sessionStorage.setItem("__seeded", "1");
          localStorage.setItem("bs.settings", JSON.stringify({ state: { settings }, version: 1 }));
        }
      } catch {
        /* storage blocked */
      }
    },
    { platform: o.platform, uaPlatform: o.uaPlatform, settings: settings ?? null },
  );
  const page = await ctx.newPage();
  if (media) await page.emulateMedia(media);
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text().slice(0, 200)));
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 200)));

  const s = {
    os,
    o,
    page,
    ctx,
    errors,
    async open(path = "/demo") {
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-testid="workspace"]', { timeout: 30000 });
      await page.waitForFunction(() => document.documentElement.style.getPropertyValue("--on-accent") !== "", null, { timeout: 30000 });
    },
    /** run a command through the command line, then take focus out of the text field so hotkeys apply */
    async command(text) {
      await page.getByTestId("cmd-input").click();
      await page.getByTestId("cmd-input").fill(text);
      await page.keyboard.press("Enter");
      await page.evaluate(() => document.activeElement?.blur());
    },
    async history() {
      return page.getByTestId("cmdline").innerText();
    },
    async viewportBox() {
      return page.getByTestId("viewport").boundingBox();
    },
    /** bounding box of the rendered model: moves when the view pans, grows when it zooms */
    async sceneBox() {
      return page.evaluate(() => {
        const r = document.querySelector('[data-testid="scene"]').getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      });
    },
    /** the centre of some model element, in page coordinates */
    async elementPoint() {
      return page.evaluate(() => {
        const els = [...document.querySelectorAll('[data-testid="scene"] [data-el]')];
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (r.width > 8 && r.height > 8) {
            const x = r.x + r.width / 2;
            const y = r.y + r.height / 2;
            if (document.elementFromPoint(x, y)?.closest("[data-el]")) return { x, y };
          }
        }
        return null;
      });
    },
    /** how many elements are selected, read from the Properties palette header */
    async selectionCount() {
      const t = await page.getByTestId("palette-properties").innerText();
      if (/No selection/.test(t)) return 0;
      const many = /(\d+) elements/.exec(t);
      return many ? Number(many[1]) : /1 selected/.test(t) ? 1 : -1;
    },
    /** page-coordinate centres of up to `n` distinct model elements that are actually hit-testable */
    async elementPoints(n) {
      return page.evaluate((n) => {
        const out = [];
        const seen = new Set();
        for (const el of document.querySelectorAll('[data-testid="scene"] [data-el]')) {
          const r = el.getBoundingClientRect();
          if (r.width < 8 || r.height < 8) continue;
          const x = r.x + r.width / 2;
          const y = r.y + r.height / 2;
          const hit = document.elementFromPoint(x, y)?.closest("[data-el]");
          const id = hit?.getAttribute("data-el");
          if (id && !seen.has(id)) {
            seen.add(id);
            out.push({ x, y, id });
            if (out.length === n) break;
          }
        }
        return out;
      }, n);
    },
    async until(fn, what, ms = 4000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await fn()) return;
        await sleep(40);
      }
      throw new Error(`timed out waiting for ${what}`);
    },
    async close() {
      await ctx.close();
    },
  };
  return s;
}

const s_other = (os) => OSES[os].other;
const sessions = {};
/** one reusable session per OS, reloaded for every check so state never carries over */
async function fresh(os) {
  sessions[os] ??= await session(os);
  const s = sessions[os];
  s.errors.length = 0;
  await s.open("/demo");
  return s;
}
const noErrors = (s) => eq(s.errors.join(" | "), "", `${s.os} page errors`);

for (const os of Object.keys(OSES)) {
  const mac = os === "mac";

  await check(`${os}: shortcut labels use this OS's convention`, async () => {
    const s = await fresh(os);
    eq(await s.page.locator("kbd.kbd").first().innerText(), mac ? "⌘K" : "Ctrl+K", "search box hint");
    await s.page.getByRole("button", { name: "Application menu" }).click();
    has(await s.page.getByRole("menuitem", { name: /Save As/ }).innerText(), mac ? "⇧⌘S" : "Ctrl+Shift+S");
    await s.page.keyboard.press("Escape");
    const b = await s.viewportBox();
    await s.page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.9, { button: "right" });
    await s.page.getByRole("menu").first().waitFor();
    has(await s.page.getByRole("menuitem", { name: /^Delete/ }).innerText(), mac ? "⌫" : "Del");
    has(await s.page.getByRole("menuitem", { name: /^Select All/ }).innerText(), mac ? "⌘A" : "Ctrl+A");
    has(await s.page.getByRole("menuitem", { name: /^Properties/ }).innerText(), mac ? "⌘1" : "Ctrl+1");
    await s.page.keyboard.press("Escape");
    noErrors(s);
  });

  await check(`${os}: Settings → Shortcuts shows this OS's defaults and notes`, async () => {
    const s = await fresh(os);
    await s.page.goto(BASE + "/settings/shortcuts", { waitUntil: "networkidle" });
    await s.page.getByTestId("pane-shortcuts").waitFor();
    const redo = s.page.locator("tr", { hasText: "REDO" }).first();
    const text = await redo.innerText();
    if (mac) {
      has(text, "⇧⌘Z");
      if (text.includes("Ctrl+Y")) throw new Error("Mac should not show Ctrl+Y: " + text);
    } else {
      has(text, "Ctrl+Y");
      has(text, "Ctrl+Shift+Z");
    }
    const note = await s.page.getByTestId("shortcuts-os-note").innerText();
    has(note, mac ? "⌘ (Command)" : "Ctrl as the main modifier");
    eq(note.includes("fn key"), mac, "the function-key note is Mac-only");
    // recording a shortcut stores the canonical combo whatever the OS
    await s.page.getByRole("button", { name: "Edit shortcut for GRID", exact: true }).click();
    await s.page.getByLabel("Shortcut for GRID", { exact: true }).press(`${s.o.mod}+Alt+g`);
    await s.page.getByTestId("settings-apply").click();
    await sleep(200);
    const stored = JSON.parse(await s.page.evaluate(() => localStorage.getItem("bs.settings")));
    eq(stored.state.settings.shortcuts.keys.GRID, "Ctrl+Alt+G", "stored in canonical form");
    await s.page.evaluate(() => localStorage.removeItem("bs.settings"));
    noErrors(s);
  });

  await check(`${os}: undo and redo answer to ${mac ? "⌘Z / ⇧⌘Z (and Ctrl+Y does not redo)" : "Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z"}`, async () => {
    const s = await fresh(os);
    const { page } = s;
    await s.command("UNHIDE"); // any undoable edit
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const redo = page.getByRole("button", { name: "Redo", exact: true });
    await s.until(async () => await undo.isEnabled(), "Undo to enable after an edit");
    await page.keyboard.press(`${s.o.mod}+z`);
    await s.until(async () => !(await undo.isEnabled()), "undo");
    eq(await redo.isEnabled(), true);
    if (mac) {
      await page.keyboard.press("Control+y"); // Ctrl+Y is not a Mac redo
      await sleep(150);
      eq(await redo.isEnabled(), true, "Ctrl+Y must not redo on a Mac");
      await page.keyboard.press("Meta+Shift+z");
    } else {
      await page.keyboard.press("Control+y");
    }
    await s.until(async () => (await undo.isEnabled()) && !(await redo.isEnabled()), "redo");
    // ⇧⌘Z / Ctrl+Shift+Z redoes everywhere
    await page.keyboard.press(`${s.o.mod}+z`);
    await s.until(async () => await redo.isEnabled(), "second undo");
    await page.keyboard.press(`${s.o.mod}+Shift+z`);
    await s.until(async () => !(await redo.isEnabled()), "redo with Shift");
    noErrors(s);
  });

  await check(`${os}: the other OS's modifier does not trigger shortcuts (${s_other(os)}+G is not Group here)`, async () => {
    const s = await fresh(os);
    const { page } = s;
    await page.keyboard.press(`${s.o.other}+g`);
    await sleep(250);
    eq((await s.history()).includes("› GROUP"), false, `${s.o.other}+G must not run GROUP on ${os}`);
    await page.keyboard.press(`${s.o.mod}+g`);
    await s.until(async () => (await s.history()).includes("› GROUP"), `${s.o.mod}+G to run GROUP`);
    noErrors(s);
  });

  await check(`${os}: Delete deletes the selection${mac ? ", and so does the Mac delete key (Backspace)" : "; Backspace does not"}`, async () => {
    const s = await fresh(os);
    const { page } = s;
    await s.command("SELECTALL");
    await page.keyboard.press("Backspace");
    await sleep(250);
    eq((await s.history()).includes("› DELETE"), mac, mac ? "Backspace should delete on a Mac" : "Backspace must not delete on Windows/Linux");
    await s.command("SELECTALL");
    await page.keyboard.press("Delete");
    await s.until(async () => (await s.history()).includes("› DELETE"), "Delete key to run DELETE");
    noErrors(s);
  });

  await check(`${os}: ${mac ? "⌥⌘N" : "Ctrl+Alt+N"} opens New, ${mac ? "⌘," : "Ctrl+,"} opens Settings`, async () => {
    const s = await fresh(os);
    const { page } = s;
    await page.getByTestId("viewport").hover();
    await page.keyboard.press(`${s.o.mod}+Alt+n`);
    await page.getByRole("dialog").first().waitFor({ timeout: 4000 });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page.keyboard.press(`${s.o.mod}+Comma`);
    await page.waitForFunction(() => location.pathname === "/settings/general", null, { timeout: 5000 });
    noErrors(s);
  });

  await check(`${os}: typing in the command line keeps native text shortcuts and function keys still work`, async () => {
    const s = await fresh(os);
    const { page } = s;
    await page.getByTestId("cmd-input").click();
    await page.getByTestId("cmd-input").fill("hello");
    await page.keyboard.press(`${s.o.mod}+a`); // select all text in the field, not the model
    await page.keyboard.press(`${s.o.mod}+z`); // native undo inside the field, not the model
    eq((await s.history()).includes("› SELECTALL"), false, "must not run the SELECTALL command while typing");
    await page.keyboard.press("F8"); // function keys still reach commands
    await s.until(async () => (await s.history()).includes("› ORTHO"), "F8 from inside the command line");
    noErrors(s);
  });

  await check(`${os}: ${mac ? "⌘" : "Ctrl"}+click adds to the selection${mac ? ", ⌃+click is a right-click and selects nothing" : ""}`, async () => {
    const s = await fresh(os);
    const { page } = s;
    const [a, b] = await s.elementPoints(2);
    if (!a || !b) throw new Error("need two model elements to click");
    const clickWith = async (key, pt) => {
      if (key) await page.keyboard.down(key);
      await page.mouse.click(pt.x, pt.y);
      if (key) await page.keyboard.up(key);
      await sleep(150);
    };
    eq(await s.selectionCount(), 0, "nothing selected at the start");
    if (mac) {
      await clickWith("Control", a); // a secondary click on a Mac: never starts a selection
      eq(await s.selectionCount(), 0, "⌃-click must not select on a Mac");
    }
    await clickWith(null, a);
    eq(await s.selectionCount(), 1, "plain click selects one");
    await clickWith(null, b);
    eq(await s.selectionCount(), 1, "plain click on another element replaces the selection");
    await clickWith(null, a);
    await clickWith(s.o.mod, b);
    eq(await s.selectionCount(), 2, `${s.o.mod}+click adds to the selection`);
    noErrors(s);
  });

  await check(`${os}: ${mac ? "⌘" : "Ctrl"}+drag draws a selection window`, async () => {
    const s = await fresh(os);
    const { page } = s;
    const b = await s.viewportBox();
    await page.keyboard.down(s.o.mod);
    await page.mouse.move(b.x + b.width * 0.1, b.y + b.height * 0.15);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.9, b.y + b.height * 0.9, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up(s.o.mod);
    await s.until(async () => (await s.history()).includes("selected by window"), "window selection");
    noErrors(s);
  });

  await check(`${os}: Space+drag pans the 3D view (no middle button needed)`, async () => {
    const s = await fresh(os);
    const { page } = s;
    const b = await s.viewportBox();
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.9);
    const before = await s.sceneBox();
    await page.keyboard.down("Space");
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.5 + 90, b.y + b.height * 0.9 + 40, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up("Space");
    const after = await s.sceneBox();
    if (Math.abs(after.x - before.x - 90) > 3 || Math.abs(after.y - before.y - 40) > 3) throw new Error(`expected a pure pan of (90, 40), saw (${after.x - before.x}, ${after.y - before.y})`);
    if (Math.abs(after.w - before.w) > 1 || Math.abs(after.h - before.h) > 1) throw new Error("the view changed shape: that was an orbit, not a pan");
    noErrors(s);
  });
}

/* ── scroll gestures: the setting decides, pinch always zooms ─────────────────────────────────────────────── */
for (const [pref, wheelDoes] of [["zoom", "zoom"], ["pan", "pan"]]) {
  await check(`scroll gesture "${pref}": the wheel ${wheelDoes === "zoom" ? "zooms about the cursor" : "pans the view"}; pinch zooms either way`, async () => {
    const s = await session("mac", { settings: { display: { scrollGesture: pref } } });
    try {
      await s.open("/demo");
      const b = await s.viewportBox();
      await s.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      const before = await s.sceneBox();
      await s.page.mouse.wheel(0, -200);
      await sleep(250);
      const wheel = await s.sceneBox();
      if (wheelDoes === "zoom") {
        if (!(wheel.w > before.w * 1.15)) throw new Error(`wheel up should zoom in: width ${before.w} -> ${wheel.w}`);
      } else {
        if (Math.abs(wheel.w - before.w) > 1) throw new Error("the wheel changed the zoom in pan mode");
        if (!(wheel.y > before.y + 100)) throw new Error(`scrolling up should move the content down: y ${before.y} -> ${wheel.y}`);
      }
      // a trackpad pinch arrives as ctrl+wheel with small deltas
      const pre = await s.sceneBox();
      await s.page.evaluate(() => {
        const svg = document.querySelector('[data-testid="viewport"] svg');
        const r = svg.getBoundingClientRect();
        for (let i = 0; i < 10; i++) svg.dispatchEvent(new WheelEvent("wheel", { deltaY: -4, ctrlKey: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, cancelable: true }));
      });
      await sleep(250);
      const post = await s.sceneBox();
      if (!(post.w > pre.w * 1.2)) throw new Error(`pinch should zoom in: width ${pre.w} -> ${post.w}`);
      noErrors(s);
    } finally {
      await s.close();
    }
  });
}

await check("touch: two fingers pinch to zoom and drag to pan", async () => {
  const s = await session("windows");
  try {
    await s.open("/demo");
    const b = await s.viewportBox();
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const before = await s.sceneBox();
    await s.page.evaluate(
      async ({ cx, cy }) => {
        const svg = document.querySelector('[data-testid="viewport"] svg');
        const fire = (type, id, x, y) => svg.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", isPrimary: id === 1, clientX: x, clientY: y, button: 0, buttons: 1, bubbles: true, cancelable: true }));
        fire("pointerdown", 1, cx - 40, cy);
        fire("pointerdown", 2, cx + 40, cy);
        for (let i = 1; i <= 10; i++) {
          const spread = 40 + i * 8; // fingers move apart
          fire("pointermove", 1, cx - spread, cy);
          fire("pointermove", 2, cx + spread, cy);
          await new Promise((r) => setTimeout(r, 10));
        }
        fire("pointerup", 1, cx - 120, cy);
        fire("pointerup", 2, cx + 120, cy);
      },
      { cx, cy },
    );
    await sleep(250);
    const after = await s.sceneBox();
    if (!(after.w > before.w * 1.5)) throw new Error(`pinch should zoom in: width ${before.w} -> ${after.w}`);
    noErrors(s);
  } finally {
    await s.close();
  }
});

/* ── theme: Match system follows the OS ───────────────────────────────────────────────────────────────────── */
await check("Match system follows the OS appearance live: dark, light, then more-contrast", async () => {
  const s = await session("mac", { settings: { display: { theme: "system" } }, colorScheme: "dark" });
  try {
    await s.open("/demo");
    const theme = () => s.page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    eq(await theme(), null, "dark OS → dark app (no attribute)");
    await s.page.emulateMedia({ colorScheme: "light" });
    await s.until(async () => (await theme()) === "light", "the app to follow the OS to light");
    await s.page.emulateMedia({ colorScheme: "light", contrast: "more" });
    await s.until(async () => (await theme()) === "hc", "high contrast when the OS asks for more contrast");
    await s.page.emulateMedia({ colorScheme: "dark", contrast: "no-preference" });
    await s.until(async () => (await theme()) === null, "back to dark");
    noErrors(s);
  } finally {
    await s.close();
  }
}, { engines: ["chromium"] });

await check("Match system is applied before first paint (boot script), not only after hydration", async () => {
  const s = await session("windows", { settings: { display: { theme: "system" } }, colorScheme: "light" });
  try {
    await s.page.route("**/_next/static/**", (r) => r.abort()); // no React at all: only the blocking script can act
    await s.page.goto(BASE + "/demo", { waitUntil: "domcontentloaded" });
    eq(await s.page.evaluate(() => document.documentElement.getAttribute("data-theme")), "light");
  } finally {
    await s.close();
  }
});

await check("the installed-app title bar colour follows the theme (meta theme-color)", async () => {
  const s = await session("windows", { settings: { display: { theme: "light" } } });
  try {
    await s.open("/demo");
    eq(await s.page.evaluate(() => document.querySelector('meta[name="theme-color"]').getAttribute("content")), "#fafaf6");
  } finally {
    await s.close();
  }
});

await check("Windows Contrast themes (forced colors): the app loads, focus rings show, the drawing keeps its colours", async () => {
  const s = await session("windows", { media: { forcedColors: "active" } });
  try {
    await s.open("/demo");
    eq(await s.page.evaluate(() => matchMedia("(forced-colors: active)").matches), true);
    await s.page.keyboard.press("Tab");
    const ring = await s.page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement);
      return { w: parseFloat(cs.outlineWidth), style: cs.outlineStyle };
    });
    if (!(ring.w >= 1 && ring.style !== "none")) throw new Error("focused control has no visible outline: " + JSON.stringify(ring));
    const keep = await s.page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="viewport"] svg')).forcedColorAdjust);
    if (keep === "auto") throw new Error("the drawing is being recoloured by the forced-colors palette (forced-color-adjust: " + keep + ")");
    await shotOf(s.page, "platform-forced-colors");
    noErrors(s);
  } finally {
    await s.close();
  }
}, { engines: ["chromium"] });

/* ── installable as a desktop app ───────────────────────────────────────────────────────────────────────── */
await check("installable: manifest, icons, touch icon and author metadata", async () => {
  const s = await session("mac");
  try {
    await s.open("/demo");
    const href = await s.page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute("href"));
    eq(href, "/manifest.webmanifest");
    const res = await s.page.request.get(BASE + href);
    eq(res.status(), 200);
    const m = await res.json();
    eq(m.display, "standalone");
    eq(m.start_url, "/app");
    eq(m.name, "BuildSync AI");
    const sizes = m.icons.filter((i) => i.type === "image/png").map((i) => i.sizes);
    for (const want of ["192x192", "512x512"]) if (!sizes.includes(want)) throw new Error(`manifest has no ${want} PNG icon`);
    if (!m.icons.some((i) => i.purpose === "maskable")) throw new Error("manifest has no maskable icon");
    for (const icon of m.icons) {
      const r = await s.page.request.get(BASE + icon.src);
      eq(r.status(), 200, icon.src);
      eq((r.headers()["content-type"] ?? "").split(";")[0], icon.type, icon.src);
    }
    if (!(m.shortcuts?.length >= 1)) throw new Error("no jump-list shortcuts");
    const touch = await s.page.evaluate(() => document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"));
    if (!touch) throw new Error("no apple-touch-icon link");
    eq((await s.page.request.get(BASE + touch)).status(), 200);
    eq(await s.page.evaluate(() => document.querySelector('meta[name="author"]')?.getAttribute("content")), "Giordano Bertin-Maurice");
    noErrors(s);
  } finally {
    await s.close();
  }
});

/* ── text input from other keyboards ──────────────────────────────────────────────────────────────────────── */
await check("IME: Enter that confirms a composition does not run the command; a normal Enter does", async () => {
  const s = await fresh("windows");
  const { page } = s;
  await page.getByTestId("cmd-input").click();
  await page.getByTestId("cmd-input").fill("SECTION");
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="cmd-input"]');
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, keyCode: 229, bubbles: true, cancelable: true }));
  });
  await sleep(300);
  eq(await page.evaluate(() => location.search.includes("section=1")), false, "composition Enter must not run SECTION");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.search.includes("section=1"), null, { timeout: 4000 });
  noErrors(s);
});

await check("command and search fields turn off auto-correct and auto-capitalise (macOS / iPadOS text substitution)", async () => {
  const s = await fresh("mac");
  for (const sel of ['[data-testid="cmd-input"]', 'input[aria-label="Search commands and settings"]']) {
    const a = await s.page.locator(sel).evaluate((el) => ({ c: el.getAttribute("autocorrect"), z: el.getAttribute("autocapitalize"), sp: el.spellcheck }));
    eq(JSON.stringify(a), JSON.stringify({ c: "off", z: "off", sp: false }), sel);
  }
});

await check("downloads: CSV tables carry a UTF-8 BOM and CRLF (Excel on Windows), exports get sensible names", async () => {
  const s = await fresh("windows");
  const { page } = s;
  await s.command("QTO");
  const csvButton = page.getByRole("button", { name: "Export CSV" });
  await csvButton.waitFor();
  const [csv] = await Promise.all([page.waitForEvent("download"), csvButton.click()]);
  eq(csv.suggestedFilename(), "quantity-takeoff.csv");
  const bytes = readFileSync(await csv.path());
  eq([...bytes.subarray(0, 3)].join(","), "239,187,191", "UTF-8 byte-order mark");
  has(bytes.toString("utf8"), "\r\n", "CRLF line ends");
  noErrors(s);
});

await check("downloads: the shortcuts export is JSON and the file name is the same on every OS", async () => {
  for (const os of ["mac", "windows"]) {
    const s = await fresh(os);
    await s.page.goto(BASE + "/settings/shortcuts", { waitUntil: "networkidle" });
    const button = s.page.getByRole("button", { name: "Export", exact: true });
    await button.waitFor();
    const [json] = await Promise.all([s.page.waitForEvent("download"), button.click()]);
    eq(json.suggestedFilename(), "buildsync-shortcuts.json", os);
    const data = JSON.parse(readFileSync(await json.path(), "utf8"));
    eq(typeof data.keys, "object", `${os} export has keys`);
  }
});

for (const s of Object.values(sessions)) await s.close();
await finish();
