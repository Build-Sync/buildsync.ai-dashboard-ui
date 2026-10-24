/**
 * components/workspace/Palettes/StressTest.tsx
 *
 * WHAT   The Stress Test palette: set up an element, load case, conditions and mesh, then Run or Clear. Results
 *        show max stress against the allowable, strain, deflection against its limit, safety factor, max load
 *        and a pass / fail verdict, with "Apply in model" to act on the result.
 * FOR    Structural checks of load-bearing elements from the open scene (the Element list is built from them).
 *        Calculations come from lib/services/analysis.ts (mock); results are advisory until a PE signs off.
 * DEBUG  - An element is missing from the list: only load-bearing elements, plus one truss, are offered;
 *          footings, doors and windows are excluded.
 *        - A result is shown as failing when the safety factor is below 1 or the deflection is above its limit.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Pill, Select, Spinner } from "@/components/ui/controls";
import { CONDITIONS, LOAD_CASES, MESHES, type ConditionId, type LoadCaseId, type MeshId } from "@/lib/services/analysis";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { useScene } from "../hooks";

/* Stress Test: Setup (element, load case, conditions, mesh) → Run / Clear → results with "Apply in model →". */
export function StressTest() {
  const ws = useWsApi();
  const scene = useScene();
  const setup = useWs((s) => s.stressSetup);
  const result = useWs((s) => s.stressResult);
  const running = useWs((s) => s.stressRunning);
  const overlay = useWs((s) => s.stressOverlay);
  const renames = useWs((s) => s.renames);
  const [calc, setCalc] = useState(false);

  const elements = useMemo(() => {
    const keep = scene.elements.filter((e) => e.loadBearing && e.category !== "Truss" && e.category !== "Footing" && e.category !== "Door" && e.category !== "Window");
    const trusses = scene.elements.filter((e) => e.category === "Truss").slice(0, 1);
    return [...keep, ...trusses].sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));
  }, [scene]);

  const failing = !!result && (result.safetyFactor < 1 || result.deflection > result.limit);

  return (
    <div data-testid="palette-stress">
      <div className="space-y-2.5 border-b border-soft p-3">
        <div className="label-xs">Setup</div>
        <Row label="Element">
          <Select<string> label="Element" className="w-full" value={setup.elementId} onChange={(v) => ws.getState().setStressSetup({ elementId: v })} options={[{ value: "all", label: "Whole structure" }, ...elements.map((e) => ({ value: e.id, label: `${renames[e.id] ?? e.name} · ${e.id}` }))]} />
        </Row>
        <Row label="Load case">
          <Select<LoadCaseId> label="Load case" className="w-full" value={setup.loadCase} onChange={(v) => ws.getState().setStressSetup({ loadCase: v })} options={LOAD_CASES.map((l) => ({ value: l.id, label: l.label }))} />
        </Row>
        <Row label="Conditions">
          <Select<ConditionId> label="Conditions" className="w-full" value={setup.condition} onChange={(v) => ws.getState().setStressSetup({ condition: v })} options={CONDITIONS.map((l) => ({ value: l.id, label: l.label }))} />
        </Row>
        <Row label="Mesh">
          <Select<MeshId> label="Mesh" className="w-full" value={setup.mesh} onChange={(v) => ws.getState().setStressSetup({ mesh: v })} options={MESHES.map((l) => ({ value: l.id, label: l.label }))} />
        </Row>
        <div className="flex gap-1.5 pt-0.5">
          <button className="btn btn-primary h-7 flex-1" disabled={running} onClick={() => void ws.getState().runStress()} data-testid="run-stress">
            {running ? <Spinner size={13} /> : <Icon name="play" size={13} />} Run
          </button>
          <button className="btn h-7 flex-1" disabled={!result && !running} onClick={() => ws.getState().clearStress()} data-testid="clear-stress">
            <Icon name="close" size={13} /> Clear
          </button>
        </div>
      </div>

      {result ? (
        <div className="p-3" data-testid="stress-result">
          <div className="mb-2 flex items-center justify-between">
            <div className="label-xs">Results</div>
            <button className="flex items-center gap-1 text-[0.6875rem] text-t2 hover:text-t1" onClick={() => ws.getState().patch({ stressOverlay: !overlay })} aria-pressed={overlay}>
              <Icon name={overlay ? "showall" : "hide"} size={12} /> Heat overlay
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-1.5">
            <Stat label="Max stress" value={`${result.maxStress.toFixed(2)} ksi`} tone={result.maxStress > result.allowable ? "bad" : "ok"} sub={`allow ${result.allowable.toFixed(1)}`} />
            <Stat label="Strain" value={`${result.strain.toFixed(3)} %`} />
            <Stat label="Deflection" value={`${result.deflection.toFixed(2)} in`} tone={result.deflection > result.limit ? "bad" : "ok"} sub={`limit ${result.limit.toFixed(2)} in`} />
            <Stat label="Safety factor" value={result.safetyFactor.toFixed(2)} tone={result.safetyFactor < 1 ? "bad" : result.safetyFactor < 1.25 ? "warn" : "ok"} />
            <Stat label="Max load" value={`${result.maxLoad.toFixed(1)} kip`} />
            <Stat label="Result" value={failing ? "Fails" : "Passes"} tone={failing ? "bad" : "ok"} />
          </dl>

          {result.failurePoints.length > 0 && (
            <div className="mt-3">
              <h4 className="label-xs mb-1">Failure points</h4>
              <ul className="space-y-1">
                {result.failurePoints.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 rounded border border-bad/30 bg-bad/10 px-2 py-1 text-[0.75rem]">
                    <Icon name="warn" size={12} className="shrink-0 text-bad" />
                    <span className="flex-1 text-t1">{f.label}</span>
                    <span className="mono text-bad">{f.ksi.toFixed(1)} ksi</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3">
            <h4 className="label-xs mb-1">Critical areas</h4>
            <ul className="space-y-0.5 text-[0.75rem] text-t2">
              {result.criticalAreas.map((a) => (
                <li key={a} className="flex gap-1.5">
                  <span className="text-t3">•</span>
                  {a}
                </li>
              ))}
            </ul>
          </div>

          <div className={`mt-3 rounded-md border px-2.5 py-2 ${failing ? "border-warn/40 bg-warn/10" : "border-ok/30 bg-ok/10"}`}>
            <div className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-t2">
              <Icon name="explain" size={12} /> Recommendation
              {failing && <Pill tone="warn" className="ml-auto">Requires PE Review</Pill>}
            </div>
            <p className="mt-1 text-[0.75rem] leading-snug text-t1">{result.recommendation}</p>
            {result.fixable && (
              <button className="btn btn-primary mt-2 h-7 w-full" onClick={() => ws.getState().applyStressFix()} data-testid="apply-fix">
                Apply in model <Icon name="arrowRight" size={13} />
              </button>
            )}
          </div>

          <button className="mt-3 flex items-center gap-1 text-[0.75rem] text-accent hover:underline" aria-expanded={calc} onClick={() => setCalc(!calc)}>
            <Icon name={calc ? "chevDown" : "chevRight"} size={12} /> {calc ? "Hide calculations" : "Show calculations"}
          </button>
          {calc && (
            <pre className="anim-fade mono mt-1.5 overflow-x-auto whitespace-pre-wrap rounded-md border border-line bg-app p-2 text-[0.6875rem] leading-relaxed text-t2">{result.calc.join("\n")}</pre>
          )}
        </div>
      ) : (
        <p className="px-3 py-6 text-center text-[0.75rem] text-t3">{running ? "Meshing and solving…" : "Choose an element and a load case, then Run. The heat overlay and legend appear in the viewport."}</p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.75rem_1fr] items-center gap-2">
      <span className="text-[0.75rem] text-t2">{label}</span>
      {children}
    </div>
  );
}

function Stat({ label, value, tone = "ok", sub }: { label: string; value: string; tone?: "ok" | "warn" | "bad"; sub?: string }) {
  return (
    <div className="rounded-md border border-line bg-panel-alt px-2 py-1.5">
      <dt className="text-[0.625rem] uppercase tracking-wide text-t3">{label}</dt>
      <dd className="mono text-[0.9375rem] font-semibold" style={{ color: tone === "ok" ? "var(--t1)" : `var(--${tone})` }}>
        {value}
      </dd>
      {sub && <div className="mono text-[0.625rem] text-t3">{sub}</div>}
    </div>
  );
}
