/**
 * components/workspace/Palettes/Simulation.tsx
 *
 * WHAT   The Disaster Simulation palette: a scenario builder (type, intensity, wind / fire / sun direction,
 *        duration), Run, Show in viewport, and the results with optional calculations.
 * FOR    What-if scenarios (hurricane, seismic, flood …) defined in SIM_TYPES in lib/services/analysis.ts.
 *        Results and the vector overlay are held in the workspace store and drawn by the viewport; output is
 *        advisory only.
 * DEBUG  - The direction dial is dim: the chosen scenario does not use a direction (only hurricane, fire and
 *          lighting do).
 *        - Run does nothing: a run is already in progress (`simRunning`).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Pill, Segmented, Select, Slider, Spinner } from "@/components/ui/controls";
import { compassName, SIM_TYPES, type SimType } from "@/lib/services/analysis";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";

const DIRS = [
  { d: 0, l: "N" }, { d: 45, l: "NE" }, { d: 90, l: "E" }, { d: 135, l: "SE" },
  { d: 180, l: "S" }, { d: 225, l: "SW" }, { d: 270, l: "W" }, { d: 315, l: "NW" },
];

/* Simulation: scenario builder (type, intensity, direction, duration) → Run / Show in viewport → results with calculations. */
export function Simulation() {
  const ws = useWsApi();
  const setup = useWs((s) => s.simSetup);
  const result = useWs((s) => s.simResult);
  const running = useWs((s) => s.simRunning);
  const vectors = useWs((s) => s.simVectors);
  const [calc, setCalc] = useState(false);
  const meta = SIM_TYPES.find((t) => t.id === setup.type)!;
  const directional = setup.type === "hurricane" || setup.type === "fire" || setup.type === "lighting";

  return (
    <div data-testid="palette-simulation">
      <div className="space-y-3 border-b border-soft p-3">
        <Field label="Scenario Type">
          <Select<SimType> label="Scenario Type" className="w-full" value={setup.type} onChange={(v) => ws.getState().setSimSetup({ type: v })} options={SIM_TYPES.map((t) => ({ value: t.id, label: t.label }))} />
        </Field>
        <Field label={`Intensity (${meta.unit})`}>
          <Slider label="Intensity" min={meta.min} max={meta.max} step={meta.step} value={setup.intensity} suffix="" onChange={(v) => ws.getState().setSimSetup({ intensity: v })} />
        </Field>
        <Field label={`Direction · from the ${compassName(setup.direction)}`}>
          <div className="flex items-center gap-3">
            <svg viewBox="-34 -34 68 68" className={cn("size-16 shrink-0", !directional && "opacity-40")} aria-label="Direction Dial">
              <circle r="30" fill="var(--bg-panel-alt)" stroke="var(--line)" />
              <rect x="-6" y="-6" width="12" height="12" rx="1" fill="none" stroke="var(--t3)" />
              {DIRS.map(({ d, l }) => {
                const a = (d * Math.PI) / 180;
                const on = setup.direction === d;
                return (
                  <g key={d} className="cursor-pointer" onClick={() => ws.getState().setSimSetup({ direction: d })}>
                    <circle cx={Math.sin(a) * 24} cy={-Math.cos(a) * 24} r={on ? 6 : 4.4} fill={on ? "var(--accent)" : "var(--bg-chrome)"} stroke={on ? "var(--accent)" : "var(--line)"} />
                    {(d % 90 === 0 || on) && (
                      <text x={Math.sin(a) * 24} y={-Math.cos(a) * 24 + 2.6} textAnchor="middle" fontSize="6.5" fontWeight="700" fill={on ? "#fff" : "var(--t2)"} className="pointer-events-none" fontFamily="var(--font-data)">
                        {l}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            <Slider label="Direction" min={0} max={359} step={5} value={setup.direction} suffix="°" onChange={(v) => ws.getState().setSimSetup({ direction: v })} />
          </div>
        </Field>
        <Field label="Duration">
          <Segmented<number>
            label="Duration"
            size="sm"
            value={setup.duration}
            onChange={(v) => ws.getState().setSimSetup({ duration: v })}
            options={[{ value: 15, label: "15 m" }, { value: 60, label: "1 h" }, { value: 180, label: "3 h" }, { value: 720, label: "12 h" }]}
          />
        </Field>
        <div className="flex gap-1.5">
          <button className="btn btn-primary h-7 flex-1" disabled={running} onClick={() => void ws.getState().runSim()} data-testid="run-sim">
            {running ? <Spinner size={13} /> : <Icon name="play" size={13} />} Run
          </button>
          <button className="btn h-7 flex-1" disabled={!result} aria-pressed={vectors} onClick={() => ws.getState().patch({ simVectors: !vectors })}>
            <Icon name={vectors ? "showall" : "hide"} size={13} /> Show in Viewport
          </button>
          <button className="btn h-7 px-2" disabled={!result} aria-label="Clear Results" onClick={() => ws.getState().clearSim()}>
            <Icon name="close" size={13} />
          </button>
        </div>
      </div>

      {result ? (
        <div className="p-3" data-testid="sim-result">
          <div className="flex items-start gap-2">
            <Pill tone={result.breachRisk > 40 ? "bad" : result.breachRisk > 15 ? "warn" : "ok"} className="mt-px shrink-0">
              {result.breachRisk > 40 ? "Fails" : result.breachRisk > 15 ? "At Risk" : "Holds"}
            </Pill>
            <p className="text-[0.75rem] font-medium leading-snug text-t1">{result.headline}</p>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-1.5">
            {result.metrics.map((m) => (
              <div key={m.label} className="rounded-md border border-line bg-panel-alt px-2 py-1.5">
                <dt className="text-[0.625rem] uppercase tracking-wide text-t3">{m.label}</dt>
                <dd className="mono text-[0.9375rem] font-semibold" style={{ color: m.tone === "ok" ? "var(--t1)" : `var(--${m.tone})` }}>
                  {m.value}
                </dd>
              </div>
            ))}
          </dl>
          {result.failurePoints.length > 0 && (
            <div className="mt-3">
              <h4 className="label-xs mb-1">Failure Points</h4>
              <ul className="space-y-1.5">
                {result.failurePoints.map((f) => (
                  <li key={f.label} className="rounded-md border border-bad/30 bg-bad/10 px-2 py-1.5">
                    <div className="text-[0.75rem] font-medium text-t1">{f.label}</div>
                    <div className="text-[0.6875rem] text-t2">{f.detail}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button className="mt-3 flex items-center gap-1 text-[0.75rem] text-accent hover:underline" aria-expanded={calc} onClick={() => setCalc(!calc)}>
            <Icon name={calc ? "chevDown" : "chevRight"} size={12} /> {calc ? "Hide Calculations" : "Show Calculations"}
          </button>
          {calc && (
            <pre className="anim-fade mono mt-1.5 overflow-x-auto whitespace-pre-wrap rounded-md border border-line bg-app p-2 text-[0.6875rem] leading-relaxed text-t2" data-testid="sim-calc">
              {result.calc.join("\n")}
            </pre>
          )}
        </div>
      ) : (
        <p className="px-3 py-6 text-center text-[0.75rem] text-t3">Build a scenario and press Run. Full calculations are shown, not just pass / fail.</p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-xs mb-1">{label}</div>
      {children}
    </div>
  );
}
