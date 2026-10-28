/**
 * components/workspace/Palettes/Connections.tsx
 *
 * WHAT   The Connections section of the Properties palette. For a fixture of the catalogue: its wires and pipes
 *        (what each one goes to, click a name to select it, × to take that connection out), what it still needs
 *        (power, cold or hot water, a drain) and, for a switch, an On / Off toggle that lights what it feeds. For a
 *        wire or a pipe: the two fixtures it joins.
 * FOR    Seeing and changing how lights hang off switches and fixtures off the water heater and the drain without
 *        hunting for thin lines in the model. Wires and pipes are drawn items (kind "wire" / "pipelink", made by
 *        the WIRE and PIPECONNECT tools: lib/draw/tools-mep.ts) whose p.from and p.to are fixture ids.
 * DEBUG  - A connection is missing: the list reads the drawn items, so a wire whose from / to is not this
 *          fixture's id (a copy of a fixture keeps no wires) is not listed.
 *        - The switch toggles but nothing lights: the glow follows the wires from the switch (lightUp in
 *          lib/draw/compose.ts); a light wired from another light lights through it.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Icon } from "@/components/icons";
import { Section, Switch } from "@/components/ui/controls";
import { applyChange, deleteChange } from "@/lib/draw";
import { fixtureOf } from "@/lib/draw/fixtures";
import type { DrawnItem } from "@/lib/draw/types";
import type { AppearanceKey } from "@/lib/scene/types";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";

/** What each kind of line carries, as people say it, and the colour it is drawn in (power and cold water take the
 *  electrical and plumbing colours of the Appearance section, as in the model). */
const LINE: Record<string, { label: string; color: string | AppearanceKey }> = {
  power: { label: "Power", color: "electrical" },
  switched: { label: "Switched leg", color: "#ece8dc" },
  cold: { label: "Cold water", color: "plumbing" },
  hot: { label: "Hot water", color: "#e5483c" },
  drain: { label: "Drain", color: "#8a7a63" },
};
const NEEDS: { key: "power" | "cold" | "hot" | "drain"; label: string }[] = [
  { key: "power", label: "Power" },
  { key: "cold", label: "Cold water" },
  { key: "hot", label: "Hot water" },
  { key: "drain", label: "Drain" },
];

const isLink = (i: DrawnItem) => i.kind === "wire" || i.kind === "pipelink";
const subOf = (i: DrawnItem) => String(i.p.sub ?? (i.kind === "wire" ? "power" : "cold"));

/** The Connections section for a drawn fixture, wire or pipe (nothing for anything else). */
export function Connections({ id }: { id: string }) {
  const ws = useWsApi();
  const drawn = useWs((s) => s.drawn);
  const renames = useWs((s) => s.renames);
  const review = useWs((s) => s.reviewMode);
  const colors = useWs((s) => s.colors);
  const it = drawn.find((i) => i.id === id);
  if (!it) return null;
  const nameOf = (x: string) => renames[x] ?? drawn.find((i) => i.id === x)?.name ?? x;
  const select = (x: string) => ws.getState().select([x]);
  const disconnect = (x: string) => ws.getState().edit("Disconnect", (st) => applyChange(st, deleteChange(st, [x])));
  const colour = (c: string) => (c.startsWith("#") ? c : colors[c as AppearanceKey]);

  if (isLink(it)) {
    const line = LINE[subOf(it)] ?? LINE.power;
    return (
      <Section title="Connection">
        <Row color={colour(line.color)} label={line.label} />
        {(["from", "to"] as const).map((end) => (
          <div key={end} className="flex items-baseline justify-between gap-3 py-[0.1875rem] text-[0.75rem]">
            <span className="shrink-0 text-t3">{end === "from" ? "From" : "To"}</span>
            <button className="min-w-0 truncate text-right text-t1 hover:text-accent hover:underline" onClick={() => select(String(it.p[end]))} data-testid={`prop-link-${end}`}>
              {nameOf(String(it.p[end]))}
            </button>
          </div>
        ))}
      </Section>
    );
  }

  const fx = it.kind === "fixture" || it.kind === "equipment" ? fixtureOf(String(it.p.type ?? "")) : undefined;
  if (!fx) return null;
  const links = drawn.filter((i) => isLink(i) && (i.p.from === id || i.p.to === id));
  const has = (need: string) => links.some((l) => (need === "power" ? l.kind === "wire" : l.kind === "pipelink" && subOf(l) === need));
  const needs = NEEDS.filter((n) => fx.needs[n.key]);
  const on = it.p.on === true;
  const toggle = (v: boolean) => ws.getState().edit(v ? "Switch on" : "Switch off", (st) => ({ drawn: st.drawn.map((i) => (i.id === id ? { ...i, p: { ...i.p, on: v } } : i)) }));

  return (
    <Section title="Connections">
      {fx.role === "switch" && (
        <div className="flex items-center justify-between gap-3 py-1 text-[0.75rem]">
          <span className="text-t3">Switch</span>
          <span className="flex items-center gap-2 text-t1">
            {on ? "On" : "Off"}
            <Switch checked={on} onChange={toggle} label="Switch On" disabled={review} />
          </span>
        </div>
      )}
      {links.map((l) => {
        const line = LINE[subOf(l)] ?? LINE.power;
        const out = l.p.from === id;
        const other = String(out ? l.p.to : l.p.from);
        return (
          <div key={l.id} className="flex items-center gap-1.5 py-[0.1875rem] text-[0.75rem]" data-testid="prop-link">
            <span className="size-2 shrink-0 rounded-full" style={{ background: colour(line.color) }} />
            <span className="shrink-0 text-t3">{line.label}</span>
            <button className="min-w-0 flex-1 truncate text-right text-t1 hover:text-accent hover:underline" onClick={() => select(other)} title={`Select ${nameOf(other)}`}>
              {out ? "to" : "from"} {nameOf(other)}
            </button>
            {!review && (
              <button className="shrink-0 text-t3 hover:text-bad" onClick={() => disconnect(l.id)} aria-label={`Disconnect ${nameOf(other)}`} title="Take this connection out">
                <Icon name="close" size={11} />
              </button>
            )}
          </div>
        );
      })}
      {needs.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1" data-testid="prop-needs">
          {needs.map((n) => (
            <span key={n.key} className={`rounded border px-1.5 py-px text-[0.6875rem] ${has(n.key) ? "border-ok/40 text-ok" : "border-line text-t3"}`}>
              {n.label}: {has(n.key) ? "connected" : "not yet"}
            </span>
          ))}
        </div>
      )}
      {!links.length && (
        <p className="mt-1 text-[0.6875rem] text-t3">
          {fx.system === "plumbing" ? "Not piped yet: Pipe Connect (Home → MEP), click the water heater, the supply or the drain stack, then this." : "Not wired yet: Wire (Home → MEP), click a switch or the panel, then this."}
        </p>
      )}
    </Section>
  );
}

function Row({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 py-[0.1875rem] text-[0.75rem]">
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="text-t1">{label}</span>
    </div>
  );
}
