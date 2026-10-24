/**
 * lib/theme.ts
 *
 * WHAT   Resolves the Theme setting into the theme that is actually drawn. The setting has four values
 *        ("dark", "light", "hc" high contrast, and "system" = follow the operating system); the drawn
 *        theme is always one of the first three. `readOsTheme` / `subscribeOsTheme` expose the OS
 *        preference: macOS Appearance, Windows "app mode", GNOME/KDE dark mode, and the "increase
 *        contrast" accessibility switch.
 * FOR    The theme types and colours (app/layout.tsx, app/manifest.ts) and, through the hooks in
 *        lib/use-theme.ts, the theme applier (lib/store/app-provider.tsx), the Display settings pane and
 *        the ribbon's text-measurement cache key. This file has no React so server modules can import it.
 *        public/theme-boot.js repeats `resolveTheme` in plain JS so the right theme is on <html> before
 *        first paint; keep the two in step.
 *
 * DEBUG  - "Match system" stays dark: check `matchMedia("(prefers-color-scheme: light)")` in the console.
 *        - Theme flashes on load: the boot script (public/theme-boot.js) did not run or was edited out of step.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
/** What the user picks in Settings → Display. */
export type ThemeSetting = "dark" | "light" | "hc" | "system";
/** What is drawn (the value of `data-theme`; "dark" is the default and sets no attribute). */
export type ResolvedTheme = "dark" | "light" | "hc";

/** Page chrome colour per theme, used for the browser / installed-app title bar (`theme-color`). */
export const THEME_COLOR: Record<ResolvedTheme, string> = { dark: "#0d1015", light: "#fafaf6", hc: "#000000" };

/** Default model-space background per theme (matches --bg-viewport in globals.css). */
export const THEME_VIEWPORT_BG: Record<ResolvedTheme, string> = { dark: "#12161d", light: "#eef0f3", hc: "#000000" };

/** The OS preferences that matter, as `matchMedia` results. */
export interface OsPrefs {
  light: boolean;
  moreContrast: boolean;
}

/** More-contrast wins over light/dark, as the OS setting implies. */
export function resolveTheme(setting: ThemeSetting, os: OsPrefs): ResolvedTheme {
  if (setting !== "system") return setting;
  return os.moreContrast ? "hc" : os.light ? "light" : "dark";
}

const QUERIES = ["(prefers-color-scheme: light)", "(prefers-contrast: more)"] as const;

/** The theme the OS asks for right now ("dark" where it cannot be read, e.g. on the server). */
export function readOsTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return resolveTheme("system", { light: window.matchMedia(QUERIES[0]).matches, moreContrast: window.matchMedia(QUERIES[1]).matches });
}

/** Call `onChange` whenever the OS colour scheme or contrast preference changes; returns the unsubscribe function. */
export function subscribeOsTheme(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const lists = QUERIES.map((q) => window.matchMedia(q));
  lists.forEach((m) => m.addEventListener("change", onChange));
  return () => lists.forEach((m) => m.removeEventListener("change", onChange));
}
