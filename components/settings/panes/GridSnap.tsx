/**
 * components/settings/panes/GridSnap.tsx
 *
 * WHAT   Settings → Grid & Snap: grid spacing, major-line interval, snap spacing, the six object-snap modes,
 *        ortho and polar tracking (with the polar angle) and dynamic input.
 * FOR    The `settings.gridSnap` values. components/workspace/Workspace.tsx copies the switches onto the
 *        status-bar toggles (ORTHO, POLAR, DYN, OSNAP); the spacing values are stored for the drawing tools.
 * DEBUG  - A status-bar toggle disagrees with this pane: Workspace.tsx re-applies these settings whenever they
 *          change.
 *        - "Major Line Every" is clamped to 2-50 on input, and falls back to 10 if the field is emptied.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Checkbox, Select, Switch } from "@/components/ui/controls";
import type { OsnapMode } from "@/lib/settings";
import { Row, useDraft } from "../rows";

const OSNAP: { id: OsnapMode; label: string }[] = [
  { id: "endpoint", label: "Endpoint" },
  { id: "midpoint", label: "Midpoint" },
  { id: "center", label: "Center" },
  { id: "intersection", label: "Intersection" },
  { id: "perpendicular", label: "Perpendicular" },
  { id: "nearest", label: "Nearest" },
];

/** The Settings → Grid & Snap pane. */
export function GridSnapPane() {
  const { s, set } = useDraft();
  const g = s.gridSnap;
  return (
    <div data-testid="pane-grid-snap">
      <Row label="Grid Spacing" help={'Distance between grid dots, e.g. 1\'-0" or 0.5 m.'} htmlFor="grid-spacing">
        <input id="grid-spacing" className="input mono !w-32 text-right" value={g.gridSpacing} onChange={(e) => set((d) => (d.gridSnap.gridSpacing = e.target.value))} />
      </Row>
      <Row label="Major Line Every" help="Emphasise every Nth grid line." htmlFor="major">
        <input id="major" type="number" min={2} max={50} className="input mono !w-20 text-right" value={g.majorEvery} onChange={(e) => set((d) => (d.gridSnap.majorEvery = Math.max(2, Math.min(50, Number(e.target.value) || 10))))} />
      </Row>
      <Row label="Snap Spacing" help="Cursor snaps to multiples of this distance when SNAP is on." htmlFor="snap-spacing">
        <input id="snap-spacing" className="input mono !w-32 text-right" value={g.snapSpacing} onChange={(e) => set((d) => (d.gridSnap.snapSpacing = e.target.value))} />
      </Row>
      <Row label="Object Snap Modes" help="Geometry the cursor locks onto when OSNAP is on." stack>
        <div className="grid w-full grid-cols-3 gap-x-4 gap-y-2.5">
          {OSNAP.map((o) => (
            <Checkbox key={o.id} label={o.label} checked={g.osnap[o.id]} onChange={(v) => set((d) => (d.gridSnap.osnap[o.id] = v))} />
          ))}
        </div>
      </Row>
      <Row label="Ortho Tracking" help="Constrain drawing to horizontal and vertical.">
        <Switch label="Ortho Tracking" checked={g.ortho} onChange={(v) => set((d) => (d.gridSnap.ortho = v))} />
      </Row>
      <Row label="Polar Tracking" help="Track at the increment below. Turning it on is separate from Ortho.">
        <div className="flex items-center gap-3">
          <Select<15 | 30 | 45 | 90> label="Polar Angle" disabled={!g.polar} className="!min-w-[6rem]" value={g.polarAngle} onChange={(v) => set((d) => (d.gridSnap.polarAngle = v))} options={[15, 30, 45, 90].map((a) => ({ value: a as 15 | 30 | 45 | 90, label: `${a}°` }))} />
          <Switch label="Polar Tracking" checked={g.polar} onChange={(v) => set((d) => (d.gridSnap.polar = v))} />
        </div>
      </Row>
      <Row label="Dynamic Input" help="Show coordinates and prompts next to the cursor.">
        <Switch label="Dynamic Input" checked={g.dynInput} onChange={(v) => set((d) => (d.gridSnap.dynInput = v))} />
      </Row>
    </div>
  );
}
