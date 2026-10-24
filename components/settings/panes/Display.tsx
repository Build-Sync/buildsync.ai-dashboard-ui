"use client";

import { Select, Slider, Switch } from "@/components/ui/controls";
import { ACCENTS } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { Hint, Row, useDraft } from "../rows";

const THEME_BG = { dark: "#12161d", light: "#eef0f3", hc: "#000000" } as const;

export function DisplayPane() {
  const { s, set } = useDraft();
  const d = s.display;
  const bg = d.background ?? THEME_BG[d.theme];
  return (
    <div data-testid="pane-display">
      <Row label="Theme" help="Dark is the default. Light uses an off-white palette set in Inter; High contrast maximises text and edge contrast.">
        <Select<"dark" | "light" | "hc"> label="Theme" value={d.theme} onChange={(v) => set((x) => (x.display.theme = v))} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }, { value: "hc", label: "High contrast" }]} />
      </Row>
      <Row label="Accent colour" help="Used for selection, active toggles and primary buttons." stack>
        <div className="flex flex-wrap items-center gap-2.5" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((c) => (
            <button key={c} role="radio" aria-checked={d.accent.toLowerCase() === c.toLowerCase()} aria-label={`Accent ${c}`} onClick={() => set((x) => (x.display.accent = c))} className={cn("size-7 rounded-full border-2 transition-transform hover:scale-110", d.accent.toLowerCase() === c.toLowerCase() ? "border-t1 ring-2 ring-t1/25" : "border-transparent")} style={{ background: c }} />
          ))}
          <label className="ml-2 flex items-center gap-2 text-[0.75rem] text-t2">
            <input type="color" aria-label="Custom accent colour" value={d.accent} onChange={(e) => set((x) => (x.display.accent = e.target.value))} className="size-7 cursor-pointer rounded border border-line bg-transparent p-0" />
            Custom
          </label>
        </div>
      </Row>
      <Row label="UI scale" help="Scales the whole interface.">
        <Select<90 | 100 | 110 | 125> label="UI scale" value={d.uiScale} onChange={(v) => set((x) => (x.display.uiScale = v))} options={[90, 100, 110, 125].map((n) => ({ value: n as 90 | 100 | 110 | 125, label: `${n}%` }))} />
      </Row>
      <Row label="Crosshair size" help="Length of the crosshair as a share of the viewport.">
        <Slider label="Crosshair size" min={5} max={100} step={5} value={d.crosshairSize} suffix="%" onChange={(v) => set((x) => (x.display.crosshairSize = v))} />
      </Row>
      <Row label="Show ViewCube">
        <Switch label="Show ViewCube" checked={d.showViewCube} onChange={(v) => set((x) => (x.display.showViewCube = v))} />
      </Row>
      <Row label="Show navigation bar">
        <Switch label="Show navigation bar" checked={d.showNavBar} onChange={(v) => set((x) => (x.display.showNavBar = v))} />
      </Row>
      <Row label="Show UCS icon">
        <Switch label="Show UCS icon" checked={d.showUcs} onChange={(v) => set((x) => (x.display.showUcs = v))} />
      </Row>
      <Row label="Tooltips" help="Extended shows the command name under each description.">
        <Select<"off" | "basic" | "extended"> label="Tooltips" value={d.tooltips} onChange={(v) => set((x) => (x.display.tooltips = v))} options={[{ value: "off", label: "Off" }, { value: "basic", label: "Basic" }, { value: "extended", label: "Extended with command" }]} />
      </Row>
      <Row label="Model-space background" help="Default follows the theme (#12161D in dark).">
        <div className="flex items-center gap-2.5">
          <input type="color" aria-label="Model-space background" value={bg} onChange={(e) => set((x) => (x.display.background = e.target.value))} className="size-7 cursor-pointer rounded border border-line bg-transparent p-0" />
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
