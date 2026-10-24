/**
 * public/theme-boot.js
 *
 * WHAT   A tiny blocking script, loaded from <head> by app/layout.tsx, that copies the saved theme, accent
 *        colour and UI scale onto <html> before the first paint. "Match system" is resolved here from the
 *        OS colour-scheme and contrast preferences (the same rule as resolveTheme in lib/theme.ts).
 * FOR    Avoiding a flash of the wrong theme on load or reload. React applies the same values once it has
 *        hydrated (ThemeApplier in lib/store/app-provider.tsx); this script only covers the gap before that.
 *
 * DEBUG  - Flash of dark theme for light/system users: confirm this file is served and loaded without
 *          `async`/`defer` (it must block), and that the storage key matches SETTINGS_STORAGE_KEY.
 *        - Keep the settings shape in step with lib/settings.ts (state.settings.display.*).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
(function () {
  try {
    var raw = localStorage.getItem("bs.settings");
    if (!raw) return;
    var d = JSON.parse(raw).state.settings.display;
    var h = document.documentElement;
    var theme = d.theme;
    if (theme === "system") {
      theme = matchMedia("(prefers-contrast: more)").matches ? "hc" : matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    if (theme && theme !== "dark") h.setAttribute("data-theme", theme);
    if (d.accent) h.style.setProperty("--accent", d.accent);
    if (d.uiScale) h.style.setProperty("--ui-scale", String(d.uiScale / 100));
  } catch {
    /* storage unavailable: stay on defaults */
  }
})();
