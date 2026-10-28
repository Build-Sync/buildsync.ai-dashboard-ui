/**
 * components/workspace/Palettes/Properties.tsx
 *
 * WHAT   The Properties palette: a header for the selected element and collapsible General, Geometry,
 *        Size (the sizes and turn of something drawn, typed in place: SizeSection.tsx), Connections (wires and pipes
 *        of a fixture, a switch's On / Off: Connections.tsx), Appearance, Material,
 *        Structural and Cost sections. Appearance holds the six colour overrides; with
 *        several elements selected it shows a count instead. With the ground selected, a Ground section picks
 *        its kind (lawn, dirt, clay, loam, sand, gravel, rock: lib/ground.ts).
 * FOR    Inspecting one element. Details come from elementDetails in lib/scene; colour and material overrides
 *        are stored in the workspace store and drawn by the viewport.
 * DEBUG  - Nothing shows: the palette needs exactly one selected element.
 *        - A colour change has no effect: colours are keyed by AppearanceKey (walls, roof, structural,
 *          topography, electrical, plumbing).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Icon } from "@/components/icons";
import { Section, KV, EmptyState } from "@/components/ui/controls";
import { setGround } from "@/lib/commands";
import { GROUNDS, GROUND_TYPES, type GroundType } from "@/lib/ground";
import { isLinkedId } from "@/lib/links";
import { elementDetails } from "@/lib/scene";
import { DEFAULT_APPEARANCE, type AppearanceKey } from "@/lib/scene/types";
import { useApp } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { fmtMoney } from "@/lib/utils";
import { useScene } from "../hooks";
import { Connections } from "./Connections";
import { SizeSection } from "./SizeSection";

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
  const types = useWs((s) => s.types);
  const currency = useApp((s) => s.settings.units.currency);
  const groundType = useWs((s) => s.project.ground ?? "lawn");

  const single = selection.length === 1 ? scene.elementById[selection[0]] : null;
  const details = single ? elementDetails(scene, single, renames[single.id]) : null;
  if (details && single && overrides[single.id]) details.material[0] = ["Material", overrides[single.id]];
  // the type chosen with CHTYPE, or the type a drawn element was created with
  const typeName = single ? (types[single.id] ?? (typeof scene.items?.[single.id]?.p.type === "string" ? (scene.items[single.id].p.type as string) : "")) : "";
  if (details && typeName) details.general.splice(3, 0, ["Type", typeName]);
  // the ground's material is the kind of ground the site has
  const isGround = single?.category === "Topography";
  if (details && isGround) details.material[0] = ["Material", `${GROUNDS[groundType].label} (${GROUNDS[groundType].uscs.split(" (")[0]})`];

  const appearance = (
    <Section title="Appearance">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {APPEARANCE.map((a) => (
          <label key={a.key} className="flex items-center gap-2 text-[0.75rem] text-t2">
            <input
              type="color"
              aria-label={`${a.label} Colour`}
              value={colors[a.key]}
              onChange={(e) => ws.getState().setColor(a.key, e.target.value)}
              className="size-5 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0"
            />
            <span className="flex-1 text-t1">{a.label}</span>
          </label>
        ))}
      </div>
      <button className="mt-2 text-[0.6875rem] text-accent hover:underline" onClick={() => (Object.keys(DEFAULT_APPEARANCE) as AppearanceKey[]).forEach((k) => ws.getState().setColor(k, DEFAULT_APPEARANCE[k]))}>
        Reset Colours
      </button>
    </Section>
  );

  if (!single) {
    return (
      <div data-testid="palette-properties">
        <header className="border-b border-soft px-2.5 py-2">
          <div className="text-[0.8125rem] font-semibold text-t1">{selection.length ? `${selection.length} elements` : "No Selection"}</div>
          <div className="text-[0.6875rem] text-t3">{selection.length ? selection.slice(0, 4).join(", ") + (selection.length > 4 ? "…" : "") : "Click an element in the viewport or the tree"}</div>
        </header>
        {!selection.length && <EmptyState icon="pointer" title="Select an Element" hint="Properties for walls, doors, beams and more appear here. Colour changes below apply live." />}
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
        {isLinkedId(single.id) && (
          <div className="mt-1.5 flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-[0.6875rem] text-t1" data-testid="linked-note">
            <Icon name="xref" size={12} className="text-accent" />
            <span className="flex-1">Part of a linked project: read-only here. Drag to move the whole project; edit it in its own tab (Links palette).</span>
          </div>
        )}
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
      {isGround && (
        <Section title="Ground">
          <label className="flex items-center justify-between gap-2 text-[0.75rem] text-t2">
            Ground type
            <select className="input !h-7 !w-40" value={groundType} onChange={(e) => setGround(ws, e.target.value as GroundType)} aria-label="Ground Type" data-testid="prop-ground">
              {GROUND_TYPES.map((g) => (
                <option key={g} value={g}>
                  {GROUNDS[g].label}
                </option>
              ))}
            </select>
          </label>
          <KV k="Bearing (presumptive)" v={`${GROUNDS[groundType].bearing.toLocaleString("en-US")} psf`} />
          <p className="mt-1 text-[0.6875rem] text-t3">{GROUNDS[groundType].desc}. More in the Site palette → Ground.</p>
        </Section>
      )}
      {scene.items?.[single.id] && <SizeSection id={scene.items[single.id].id} />}
      {scene.items?.[single.id] && <Connections id={scene.items[single.id].id} />}
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
