"use client";

import { Section, KV, EmptyState } from "@/components/ui/controls";
import { elementDetails } from "@/lib/scene";
import { DEFAULT_APPEARANCE, type AppearanceKey } from "@/lib/scene/types";
import { useApp } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { fmtMoney } from "@/lib/utils";
import { useScene } from "../hooks";

const APPEARANCE: { key: AppearanceKey; label: string }[] = [
  { key: "walls", label: "Walls" },
  { key: "roof", label: "Roof" },
  { key: "structural", label: "Structural" },
  { key: "topography", label: "Topography" },
  { key: "electrical", label: "Electrical" },
  { key: "plumbing", label: "Plumbing" },
];

/* Properties: element header + collapsible General / Geometry / Appearance / Material / Structural / Cost. */
export function Properties() {
  const ws = useWsApi();
  const scene = useScene();
  const selection = useWs((s) => s.selection);
  const colors = useWs((s) => s.colors);
  const renames = useWs((s) => s.renames);
  const overrides = useWs((s) => s.materialOverrides);
  const currency = useApp((s) => s.settings.units.currency);

  const single = selection.length === 1 ? scene.elementById[selection[0]] : null;
  const details = single ? elementDetails(scene, single, renames[single.id]) : null;
  if (details && single && overrides[single.id]) details.material[0] = ["Material", overrides[single.id]];

  const appearance = (
    <Section title="Appearance">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {APPEARANCE.map((a) => (
          <label key={a.key} className="flex items-center gap-2 text-[0.75rem] text-t2">
            <input
              type="color"
              aria-label={`${a.label} colour`}
              value={colors[a.key]}
              onChange={(e) => ws.getState().setColor(a.key, e.target.value)}
              className="size-5 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0"
            />
            <span className="flex-1 text-t1">{a.label}</span>
          </label>
        ))}
      </div>
      <button className="mt-2 text-[0.6875rem] text-accent hover:underline" onClick={() => (Object.keys(DEFAULT_APPEARANCE) as AppearanceKey[]).forEach((k) => ws.getState().setColor(k, DEFAULT_APPEARANCE[k]))}>
        Reset colours
      </button>
    </Section>
  );

  if (!single) {
    return (
      <div data-testid="palette-properties">
        <header className="border-b border-soft px-2.5 py-2">
          <div className="text-[0.8125rem] font-semibold text-t1">{selection.length ? `${selection.length} elements` : "No selection"}</div>
          <div className="text-[0.6875rem] text-t3">{selection.length ? selection.slice(0, 4).join(", ") + (selection.length > 4 ? "…" : "") : "Click an element in the viewport or the tree"}</div>
        </header>
        {!selection.length && <EmptyState icon="pointer" title="Select an element" hint="Properties for walls, doors, beams and more appear here. Colour changes below apply live." />}
        {appearance}
      </div>
    );
  }

  const d = details!;
  const money = (n: number) => fmtMoney(n, currency);
  return (
    <div data-testid="palette-properties">
      <header className="border-b border-soft px-2.5 py-2">
        <div className="truncate text-[0.8125rem] font-semibold text-t1">{renames[single.id] ?? single.name}</div>
        <div className="text-[0.6875rem] text-t3">1 selected · {single.id}</div>
      </header>
      <Section title="General">
        {d.general.map(([k, v]) => (
          <KV key={k} k={k} v={v} mono={k !== "Name"} />
        ))}
      </Section>
      <Section title="Geometry">
        {d.geometry.map(([k, v]) => (
          <KV key={k} k={k} v={v} />
        ))}
      </Section>
      {appearance}
      <Section title="Material">
        {d.material.map(([k, v]) => (
          <KV key={k} k={k} v={v} mono={false} />
        ))}
      </Section>
      <Section title="Structural" defaultOpen={single.loadBearing}>
        {d.structural.map(([k, v]) => (
          <KV key={k} k={k} v={v} />
        ))}
        {single.loadBearing && <p className="mt-1.5 text-[0.6875rem] text-warn">Load-bearing: requires PE review</p>}
      </Section>
      <Section title="Cost">
        <KV k="Material" v={money(d.cost.material)} />
        <KV k="Labor" v={money(d.cost.labor)} />
        <KV k="Total" v={<b>{money(d.cost.total)}</b>} />
      </Section>
    </div>
  );
}
