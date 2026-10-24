"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { createAppStore, selectEffective, type AppState, type AppStore } from "./app-store";

const AppStoreContext = createContext<AppStore | null>(null);

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
  // layout effect: panels that measure text (the ribbon) run in the same commit and must see the new look
  useLayoutEffect(() => {
    // until the saved settings are in, leave what the boot script put on <html> (no flash of defaults)
    if (!hydrated) return;
    const h = document.documentElement;
    if (display.theme === "dark") h.removeAttribute("data-theme");
    else h.setAttribute("data-theme", display.theme);
    h.style.setProperty("--accent", display.accent);
    h.style.setProperty("--ui-scale", String(display.uiScale / 100));
    h.style.setProperty("--on-accent", "#ffffff");
  }, [hydrated, display.theme, display.accent, display.uiScale]);
  return null;
}

export function useAppApi(): AppStore {
  const s = useContext(AppStoreContext);
  if (!s) throw new Error("useAppApi must be used inside <AppStoreProvider>");
  return s;
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(useAppApi(), selector);
}

export function useAppShallow<T>(selector: (s: AppState) => T): T {
  return useStore(useAppApi(), useShallow(selector));
}

/** Committed + live-draft settings (drafts preview theme etc. while the settings frame is open). */
export function useEffectiveSettings() {
  return useApp(selectEffective);
}
