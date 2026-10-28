/**
 * app/manifest.ts
 *
 * WHAT   The web app manifest, served by Next.js at /manifest.webmanifest. It tells the browser how to
 *        install BuildSync AI as a stand-alone desktop app: name, start page, window style, colours,
 *        icons and the jump-list shortcuts.
 * FOR    "Install app" in Chrome and Edge on Windows, macOS and Linux, "Add to Dock" in Safari on macOS,
 *        and pinning to the Windows taskbar. Installed, the workspace opens in its own window without
 *        browser tabs, and the browser gives it more of its keyboard shortcuts.
 *
 * DEBUG  - No install button: the manifest must be valid and served over HTTPS (or localhost) with a 192 and a
 *          512 px PNG icon. Open /manifest.webmanifest and check every icon URL returns 200.
 *        - Icons wrong or missing: regenerate them with `node scripts/make-icons.mjs` (they come from app/icon.svg).
 *        - Colours: background_color/theme_color must match THEME_COLOR.dark in lib/theme.ts (the app's default theme).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { MetadataRoute } from "next";
import { THEME_COLOR } from "@/lib/theme";

/** Next.js metadata route: the web app manifest served at /manifest.webmanifest. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "BuildSync AI",
    short_name: "BuildSync",
    description: "AI workspace for engineering plans: code checks, schedule, cost and stress tests in one CAD-style workspace.",
    lang: "en",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: THEME_COLOR.dark,
    theme_color: THEME_COLOR.dark,
    categories: ["productivity", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    // jump-list / launcher actions, where the browser supports manifest shortcuts (e.g. the Windows taskbar)
    shortcuts: [
      { name: "Open the Demo Workspace", short_name: "Demo", url: "/demo" },
      { name: "Settings", url: "/settings/general" },
    ],
  };
}
