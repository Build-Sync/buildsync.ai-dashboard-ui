/**
 * lib/store/app-provider.tsx
 *
 * WHAT   React provider and hooks for the global store: AppStoreProvider creates the store, restores the saved
 *        settings after mount (so the first browser render matches the server), writes the bs_start cookie for
 *        /app, and applies theme, accent and UI scale to <html> (ThemeApplier, which also updates the theme-
 *        color meta tag and follows the OS in "Match system" mode).
 * FOR    Mounted once in app/layout.tsx. Components use useApp(selector), useAppShallow and useAppApi().
 * OS     "Match system" follows macOS Appearance, the Windows app mode, or the desktop's dark mode and
 *        increase-contrast setting, live, through useResolvedTheme (lib/use-theme.ts).
 * DEBUG  - Flash of the wrong theme: public/theme-boot.js sets data-theme before first paint; ThemeApplier
 *          leaves <html> alone until `hydrated`.
 *        - bs_start cookie wrong: it is written only after hydration, because before that `start` is the
 *          default and would overwrite the saved choice.
 *        - useApp outside the provider throws "useAppApi must be used inside <AppStoreProvider>".
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { THEME_COLOR } from "../theme";
import { useResolvedTheme } from "../use-theme";
import { createAppStore, selectEffective, type AppState, type AppStore } from "./app-store";

const AppStoreContext = createContext<AppStore | null>(null);

/** Provides the global store to the tree and applies the display settings. */
export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createAppStore());

  // Rehydrate persisted settings after mount so the first client render matches the server.
  useEffect(() => {
    try {
      // `persist` is attached to the store by the middleware
      (store as unknown as { persist: { rehydrate: () => void | Promise<void> } }).persist.rehydrate();
    } catch {
      /* storage blocked: stay on defaults */
    }
    // nothing was loaded (storage blocked or unreadable): carry on with defaults
    if (!store.getState().hydrated) store.setState({ hydrated: true });
  }, [store]);

  const start = useStore(store, (s) => s.settings.general.startScreen);
  const hydrated = useStore(store, (s) => s.hydrated);
  useEffect(() => {
    // before hydration `start` is the default, which would overwrite the saved preference
    if (hydrated) document.cookie = `bs_start=${start}; path=/; max-age=31536000; samesite=lax`;
  }, [hydrated, start]);

  return (
    <AppStoreContext.Provider value={store}>
      <ThemeApplier store={store} />
      {children}
    </AppStoreContext.Provider>
  );
}

/** Mirrors display settings (theme, accent, UI scale) onto <html>. Live-previews drafts. */
function ThemeApplier({ store }: { store: AppStore }) {
  const display = useStore(store, (s) => selectEffective(s).display);
  const hydrated = useStore(store, (s) => s.hydrated);
  // "Match system" follows the OS live (macOS Appearance, Windows app mode, high-contrast switch)
  const theme = useResolvedTheme(display.theme);
  // layout effect: panels that measure text (the ribbon) run in the same commit and must see the new look
  useLayoutEffect(() => {
    // until the saved settings are in, leave what the boot script put on <html> (no flash of defaults)
    if (!hydrated) return;
    const h = document.documentElement;
    if (theme === "dark") h.removeAttribute("data-theme");
    else h.setAttribute("data-theme", theme);
    h.style.setProperty("--accent", display.accent);
    h.style.setProperty("--ui-scale", String(display.uiScale / 100));
    h.style.setProperty("--on-accent", "#ffffff");
    // installed-app title bar and mobile browser chrome follow the theme
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", THEME_COLOR[theme]));
  }, [hydrated, theme, display.accent, display.uiScale]);
  return null;
}

/** The store object itself (for getState() in event handlers). */
export function useAppApi(): AppStore {
  const s = useContext(AppStoreContext);
  if (!s) throw new Error("useAppApi must be used inside <AppStoreProvider>");
  return s;
}

/** Subscribe to a slice of the global state. */
export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(useAppApi(), selector);
}

/** Like useApp but compares the slice shallowly (for objects and arrays). */
export function useAppShallow<T>(selector: (s: AppState) => T): T {
  return useStore(useAppApi(), useShallow(selector));
}

/** Committed + live-draft settings (drafts preview theme etc. while the settings frame is open). */
export function useEffectiveSettings() {
  return useApp(selectEffective);
}
