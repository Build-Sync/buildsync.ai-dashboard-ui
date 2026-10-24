/* Applies theme / accent / UI scale from persisted settings before first paint (no flash).
 * Keep the storage key in sync with SETTINGS_STORAGE_KEY in lib/settings.ts. */
(function () {
  try {
    var raw = localStorage.getItem("bs.settings");
    if (!raw) return;
    var d = JSON.parse(raw).state.settings.display;
    var h = document.documentElement;
    if (d.theme && d.theme !== "dark") h.setAttribute("data-theme", d.theme);
    if (d.accent) h.style.setProperty("--accent", d.accent);
    if (d.uiScale) h.style.setProperty("--ui-scale", String(d.uiScale / 100));
  } catch {
    /* storage unavailable: stay on defaults */
  }
})();
