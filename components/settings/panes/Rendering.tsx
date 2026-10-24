"use client";

import { Select, Slider, Switch } from "@/components/ui/controls";
import type { VisualStyle } from "@/lib/types";
import { sunAltAz } from "@/lib/scene/sun";
import { Row, useDraft } from "../rows";

export function RenderingPane() {
  const { s, set } = useDraft();
  const r = s.rendering;
  const sun = sunAltAz(r.sunPosition === "custom" ? r.sunHour : 15);
  return (
    <div data-testid="pane-rendering">
      <Row label="Default visual style" help="Style used when you open a project. The viewport menu can override it per session.">
        <Select<VisualStyle> label="Default visual style" value={r.visualStyle} onChange={(v) => set((d) => (d.rendering.visualStyle = v))} options={[{ value: "realistic", label: "Realistic" }, { value: "shaded", label: "Shaded" }, { value: "wireframe", label: "Wireframe" }, { value: "xray", label: "X-Ray" }]} />
      </Row>
      <Row label="Shadows" help="Cast shadows on the ground in Realistic style.">
        <Switch label="Shadows" checked={r.shadows} onChange={(v) => set((d) => (d.rendering.shadows = v))} />
      </Row>
      <Row label="Sun position" help={`Sun altitude ${sun.alt.toFixed(0)}°, azimuth ${sun.az.toFixed(0)}°. Drives shadows and the Solar overlay.`}>
        <div className="flex flex-col items-end gap-2">
          <Select<"project" | "custom"> label="Sun position" value={r.sunPosition} onChange={(v) => set((d) => (d.rendering.sunPosition = v))} options={[{ value: "project", label: "Project location & date" }, { value: "custom", label: "Custom" }]} />
          {r.sunPosition === "custom" && <Slider label="Sun hour" min={7} max={17} step={1} value={r.sunHour} suffix=":00" onChange={(v) => set((d) => (d.rendering.sunHour = v))} />}
        </div>
      </Row>
      <Row label="Anti-aliasing" help="Smoother edges at a small cost on large models.">
        <Select<"off" | "2x" | "4x"> label="Anti-aliasing" value={r.antialiasing} onChange={(v) => set((d) => (d.rendering.antialiasing = v))} options={[{ value: "off", label: "Off" }, { value: "2x", label: "2×" }, { value: "4x", label: "4×" }]} />
      </Row>
      <Row label="Quality" help="Draft hides edge lines while you orbit to stay smooth.">
        <Select<"draft" | "standard" | "high"> label="Quality" value={r.quality} onChange={(v) => set((d) => (d.rendering.quality = v))} options={[{ value: "draft", label: "Draft" }, { value: "standard", label: "Standard" }, { value: "high", label: "High" }]} />
      </Row>
      <Row label="Edge display" help="Draw outlines on faces.">
        <Switch label="Edge display" checked={r.edges} onChange={(v) => set((d) => (d.rendering.edges = v))} />
      </Row>
    </div>
  );
}
