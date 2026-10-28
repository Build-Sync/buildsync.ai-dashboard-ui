/**
 * components/settings/panes/Display.tsx
 *
 * WHAT   Settings → Display: theme (dark, light, high contrast, match system), accent colour, UI scale,
 *        crosshair size, scroll gesture, ViewCube / navigation bar / UCS icon visibility, tooltips and the
 *        model-space background colour.
 * FOR    The `settings.display` values. Theme, accent and UI scale preview live while the panel is open
 *        (ThemeApplier in lib/store/app-provider.tsx applies the draft) and are reverted by Close.
 * OS     "Match System" follows macOS Appearance, the Windows app mode or the Linux desktop's dark mode, and
 *        the increase-contrast setting (lib/theme.ts). "Scroll Gesture" chooses between mouse-wheel and
 *        trackpad behaviour (lib/input.ts).
 * DEBUG  - The background colour picker shows a different default than expected: the default follows the
 *          resolved theme (useResolvedTheme), not the stored setting.
 *        - Theme does not change: ThemeApplier writes data-theme on <html> only after the saved settings have
 *          loaded (hydrated).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Select, Slider, Switch } from "@/components/ui/controls";
import type { ScrollGesture } from "@/lib/input";
import { ACCENTS } from "@/lib/settings";
import { THEME_VIEWPORT_BG, type ThemeSetting } from "@/lib/theme";
import { useResolvedTheme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";
import { Hint, Row, useDraft } from "../rows";

/** The Settings → Display pane. */
export function DisplayPane() {
  const { s, set } = useDraft();
  const d = s.display;
  const drawn = useResolvedTheme(d.theme);
  const bg = d.background ?? THEME_VIEWPORT_BG[drawn];
  return (
    <div data-testid="pane-display">
      <Row label="Theme" help="Dark is the default. Light uses an off-white palette set in Inter; High contrast maximises text and edge contrast. Match system follows macOS Appearance, Windows app mode or your desktop's dark mode and its increase-contrast setting.">
        <Select<ThemeSetting> label="Theme" value={d.theme} onChange={(v) => set((x) => (x.display.theme = v))} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }, { value: "hc", label: "High Contrast" }, { value: "system", label: "Match System" }]} />
      </Row>
      <Row label="Accent Colour" help="Used for selection, active toggles and primary buttons." stack>
        <div className="flex flex-wrap items-center gap-2.5" role="radiogroup" aria-label="Accent Colour">
          {ACCENTS.map((c) => (
            <button key={c} role="radio" aria-checked={d.accent.toLowerCase() === c.toLowerCase()} aria-label={`Accent ${c}`} onClick={() => set((x) => (x.display.accent = c))} className={cn("size-7 rounded-full border-2 transition-transform hover:scale-110", d.accent.toLowerCase() === c.toLowerCase() ? "border-t1 ring-2 ring-t1/25" : "border-transparent")} style={{ background: c }} />
          ))}
          <label className="ml-2 flex items-center gap-2 text-[0.75rem] text-t2">
            <input type="color" aria-label="Custom Accent Colour" value={d.accent} onChange={(e) => set((x) => (x.display.accent = e.target.value))} className="size-7 cursor-pointer rounded border border-line bg-transparent p-0" />
            Custom
          </label>
        </div>
      </Row>
      <Row label="UI Scale" help="Scales the whole interface.">
        <Select<90 | 100 | 110 | 125> label="UI Scale" value={d.uiScale} onChange={(v) => set((x) => (x.display.uiScale = v))} options={[90, 100, 110, 125].map((n) => ({ value: n as 90 | 100 | 110 | 125, label: `${n}%` }))} />
      </Row>
      <Row label="Crosshair Size" help="Length of the crosshair as a share of the viewport.">
        <Slider label="Crosshair Size" min={5} max={100} step={5} value={d.crosshairSize} suffix="%" onChange={(v) => set((x) => (x.display.crosshairSize = v))} />
      </Row>
      <Row label="Scroll Gesture" help="Auto zooms with a mouse wheel and pans with a trackpad or Magic Mouse. Pinching always zooms; Space + drag always pans.">
        <Select<ScrollGesture> label="Scroll Gesture" value={d.scrollGesture} onChange={(v) => set((x) => (x.display.scrollGesture = v))} options={[{ value: "auto", label: "Auto (By Device)" }, { value: "zoom", label: "Scroll Zooms" }, { value: "pan", label: "Scroll Pans" }]} />
      </Row>
      <Row label="Show ViewCube">
        <Switch label="Show ViewCube" checked={d.showViewCube} onChange={(v) => set((x) => (x.display.showViewCube = v))} />
      </Row>
      <Row label="Show Navigation Bar">
        <Switch label="Show Navigation Bar" checked={d.showNavBar} onChange={(v) => set((x) => (x.display.showNavBar = v))} />
      </Row>
      <Row label="Show UCS Icon">
        <Switch label="Show UCS Icon" checked={d.showUcs} onChange={(v) => set((x) => (x.display.showUcs = v))} />
      </Row>
      <Row label="Tooltips" help="Extended shows the command name under each description.">
        <Select<"off" | "basic" | "extended"> label="Tooltips" value={d.tooltips} onChange={(v) => set((x) => (x.display.tooltips = v))} options={[{ value: "off", label: "Off" }, { value: "basic", label: "Basic" }, { value: "extended", label: "Extended with Command" }]} />
      </Row>
      <Row label="Model-Space Background" help="Default follows the theme (#12161D in dark).">
        <div className="flex items-center gap-2.5">
          <input type="color" aria-label="Model-Space Background" value={bg} onChange={(e) => set((x) => (x.display.background = e.target.value))} className="size-7 cursor-pointer rounded border border-line bg-transparent p-0" />
          <span className="mono w-16 text-[0.75rem] text-t2">{bg.toUpperCase()}</span>
          <button className="btn !h-6 px-2 text-[0.6875rem]" disabled={d.background === null} onClick={() => set((x) => (x.display.background = null))}>
            Reset
          </button>
        </div>
      </Row>
      <Hint>Theme, accent colour and UI scale preview live while this panel is open. Press Close to discard, Apply to keep.</Hint>
    </div>
  );
}
