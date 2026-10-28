/**
 * components/settings/panes/Units.tsx
 *
 * WHAT   Settings → Units: measurement system (imperial ft-in, metric m or mm), length precision, angle units,
 *        area and volume units, currency and date format, with a live preview line.
 * FOR    The `settings.units` values. Every length, coordinate, cost and date in the app is formatted with them
 *        through fmtLength, fmtCoord, fmtMoney and fmtDate in lib/utils.ts.
 * DEBUG  - The preview shows the wrong format: the formatting functions live in lib/utils.ts; this pane only
 *          passes the draft values.
 *        - Currency: costs are stored in USD and converted for display with mock rates (fmtMoney).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Select } from "@/components/ui/controls";
import type { MeasureSystem, DateFormat } from "@/lib/utils";
import { fmtDate, fmtLength, fmtMoney } from "@/lib/utils";
import { Hint, Row, useDraft } from "../rows";

/** The Settings → Units pane. */
export function UnitsPane() {
  const { s, set } = useDraft();
  const u = s.units;
  const area = u.areaVolume === "imperial" ? ["sf", "cy", 1250, 46.3] : ["m²", "m³", 116.1, 35.4];
  const prec = u.precision;
  const angle = u.angle === "degrees" ? "45.00°" : u.angle === "radians" ? "0.785 rad" : "50.00 gon";
  return (
    <div data-testid="pane-units">
      <Row label="Measurement System" help="Used for dimensions, coordinates and the status bar.">
        <Select<MeasureSystem> label="Measurement System" value={u.system} onChange={(v) => set((d) => (d.units.system = v))} options={[{ value: "imperial", label: "Imperial (ft-in)" }, { value: "metric-m", label: "Metric (m)" }, { value: "metric-mm", label: "Metric (mm)" }]} />
      </Row>
      <Row label="Length Precision" help="Decimal places for lengths and coordinates.">
        <Select<0 | 1 | 2 | 3> label="Length Precision" value={u.precision} onChange={(v) => set((d) => (d.units.precision = v))} options={[{ value: 0, label: "0" }, { value: 1, label: "0.0" }, { value: 2, label: "0.00" }, { value: 3, label: "0.000" }]} />
      </Row>
      <Row label="Angle Units">
        <Select<"degrees" | "radians" | "grads"> label="Angle Units" value={u.angle} onChange={(v) => set((d) => (d.units.angle = v))} options={[{ value: "degrees", label: "Degrees" }, { value: "radians", label: "Radians" }, { value: "grads", label: "Grads" }]} />
      </Row>
      <Row label="Area / Volume Units">
        <Select<"imperial" | "metric"> label="Area and Volume Units" value={u.areaVolume} onChange={(v) => set((d) => (d.units.areaVolume = v))} options={[{ value: "imperial", label: "sf / cy" }, { value: "metric", label: "m² / m³" }]} />
      </Row>
      <Row label="Currency" help="Costs are stored in USD and converted for display with mock rates.">
        <Select<"USD" | "XCD" | "EUR" | "ANG"> label="Currency" value={u.currency} onChange={(v) => set((d) => (d.units.currency = v))} options={[{ value: "USD", label: "USD ($)" }, { value: "XCD", label: "XCD (EC$)" }, { value: "EUR", label: "EUR (€)" }, { value: "ANG", label: "ANG (ƒ)" }]} />
      </Row>
      <Row label="Date Format">
        <Select<DateFormat> label="Date Format" value={u.dateFormat} onChange={(v) => set((d) => (d.units.dateFormat = v))} options={[{ value: "MM/DD/YYYY", label: "MM/DD/YYYY" }, { value: "DD/MM/YYYY", label: "DD/MM/YYYY" }, { value: "YYYY-MM-DD", label: "YYYY-MM-DD" }]} />
      </Row>
      <Hint>
        <span className="label-xs mr-2">Preview</span>
        <span className="mono text-t1" data-testid="units-preview">
          {fmtLength(12.5, u.system, prec)} · {angle} · {Number(area[2]).toLocaleString("en-US")} {area[0]} · {area[3]} {area[1]} · {fmtMoney(12500, u.currency)} · {fmtDate("2027-01-11", u.dateFormat)}
        </span>
      </Hint>
    </div>
  );
}
