/**
 * lib/use-theme.ts
 *
 * WHAT   React hooks that give components the theme actually being drawn:
 *        `useOsTheme()` is what the operating system currently asks for; `useResolvedTheme(setting)` is the
 *        setting itself, or the live OS theme when the setting is "system".
 * FOR    The theme applier (lib/store/app-provider.tsx), the Display settings pane and the ribbon's cache key.
 *        Kept apart from lib/theme.ts so that file stays React-free and importable from server modules.
 *
 * DEBUG  "Match system" does not follow the OS while the page is open: the media-query subscription in
 *        lib/theme.ts (`subscribeOsTheme`); the server snapshot is "dark" and corrects itself after hydration.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useSyncExternalStore } from "react";
import { readOsTheme, subscribeOsTheme, type ResolvedTheme, type ThemeSetting } from "./theme";

/** The theme the OS asks for right now; "dark" on the server. Re-renders when the OS setting changes. */
export function useOsTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeOsTheme, readOsTheme, () => "dark");
}

/** The theme to draw for a setting: itself, or the live OS theme for "system". */
export function useResolvedTheme(setting: ThemeSetting): ResolvedTheme {
  const os = useOsTheme();
  return setting === "system" ? os : setting;
}
