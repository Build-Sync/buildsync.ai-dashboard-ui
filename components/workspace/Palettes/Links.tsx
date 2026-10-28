/**
 * components/workspace/Palettes/Links.tsx
 *
 * WHAT   The Links palette: the other projects on this parcel. Each linked project shows when it was last saved
 *        (it updates here at once when it is saved again), its position (east / north offsets) and turn (0° or 180°),
 *        and Open (go and edit it), Merge (turn it into an editable copy here) and Unlink. Merged copies are listed
 *        with Remove. Buttons open the Link a Project and New Community dialog.
 * FOR    Communities: several houses on one parcel, each still its own project (lib/links.ts). Every change here is
 *        one undoable edit of project.links / project.merged, saved with the project.
 * DEBUG  - "As shipped": the linked project has never been saved in this browser; save it once to show your changes.
 *        - Offsets are where the linked project's own origin (0, 0) lands in this project, in feet.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { EmptyState, Section } from "@/components/ui/controls";
import { tip } from "@/components/ui/Tooltip";
import { applyChange } from "@/lib/draw/change";
import { linkRevision, mergeOf, nextBlockId, sourceWork, type ProjectLink } from "@/lib/links";
import { ago } from "@/lib/persist";
import type { V2 } from "@/lib/scene/types";
import { useAppApi } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";

/** The Links palette. */
export function LinksPalette() {
  const ws = useWsApi();
  const app = useAppApi();
  const router = useRouter();
  const links = useWs((s) => s.project.links) ?? [];
  const merged = useWs((s) => s.project.merged) ?? [];
  const mode = useWs((s) => s.mode);
  // re-read "saved … ago" when a linked project is saved
  useSyncExternalStore(linkRevision.subscribe, linkRevision.get, () => 0);
  const [now] = useState(() => Date.now());

  const setLinks = (label: string, next: ProjectLink[]) => ws.getState().edit(label, (st) => applyChange(st, { links: next }), { coalesce: true });
  const patch = (id: string, p: Partial<ProjectLink>) => setLinks("Move linked project", links.map((l) => (l.id === id ? { ...l, ...p } : l)));

  const merge = (l: ProjectLink) => {
    const m = mergeOf(mode, l, nextBlockId("MG", merged));
    if (!m) return;
    ws.getState().edit(`Merge ${l.name}`, (st) => applyChange(st, { links: links.filter((x) => x.id !== l.id), merged: [...merged, m] }));
    app.getState().log("ok", `✓ ${l.name} merged: its elements are now part of this project (Undo brings the link back)`);
  };

  return (
    <div className="space-y-1 p-2.5" data-testid="palette-links">
      <div className="flex gap-1.5">
        <button className="btn flex-1 !h-7 text-[0.75rem]" onClick={() => ws.getState().openModal("link-project")} data-testid="links-add">
          <Icon name="xref" size={13} /> Link a project…
        </button>
        <button className="btn flex-1 !h-7 text-[0.75rem]" onClick={() => ws.getState().openModal("link-project", { community: true })} data-testid="links-community">
          <Icon name="community" size={13} /> New community…
        </button>
      </div>
      {!links.length && !merged.length && <EmptyState icon="xref" title="No other projects here" hint="Link a project to see it on this parcel. It stays its own project, and updates here whenever it is saved." />}
      {links.length > 0 && (
        <Section title={`Linked (${links.length}) · live`}>
          <ul className="space-y-2" data-testid="links-list">
            {links.map((l) => {
              const w = sourceWork(mode, l.projectId);
              return (
                <li key={l.id} className="rounded-lg border border-line p-2" data-testid="link-row">
                  <div className="flex items-center gap-1.5">
                    <Icon name="xref" size={13} className="text-accent" />
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold text-t1">{w?.name ?? l.name}</span>
                    <span className="mono text-[0.625rem] text-t3">{l.id}</span>
                  </div>
                  <p className="mt-0.5 text-[0.6875rem] text-t3" data-testid="link-saved">
                    {w?.savedAt ? `Saved ${ago(w.savedAt, Math.max(now, w.savedAt))}: shown as saved` : "As shipped (never saved in this browser)"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[0.6875rem] text-t2">
                    <Num label="East" value={l.at[0]} onChange={(v) => patch(l.id, { at: [v, l.at[1]] as V2 })} />
                    <Num label="North" value={l.at[1]} onChange={(v) => patch(l.id, { at: [l.at[0], v] as V2 })} />
                    <button className="btn !h-6 px-2 text-[0.6875rem]" onClick={() => patch(l.id, { rot: l.rot === 180 ? 0 : 180 })} {...tip("Turn 180°", "Turn the whole linked project around its own origin")}>
                      Turn {l.rot === 180 ? "180°" : "0°"}
                    </button>
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <button className="btn !h-6 flex-1 px-2 text-[0.6875rem]" onClick={() => router.push(mode === "demo" ? `/demo?project=${l.projectId}` : `/app/projects/${l.projectId}`)} {...tip("Open", "Edit it in its own project; save there and it updates here")}>
                      Open
                    </button>
                    <button className="btn !h-6 flex-1 px-2 text-[0.6875rem]" onClick={() => merge(l)} data-testid="link-merge" {...tip("Merge a copy", "Its elements become part of this project, editable here; it stops following the original")}>
                      Merge
                    </button>
                    <button className="btn !h-6 flex-1 px-2 text-[0.6875rem] text-bad" onClick={() => setLinks(`Unlink ${l.name}`, links.filter((x) => x.id !== l.id))} data-testid="link-remove">
                      Unlink
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      {merged.length > 0 && (
        <Section title={`Merged copies (${merged.length}) · editable here`}>
          <ul className="space-y-1.5" data-testid="merged-list">
            {merged.map((m) => (
              <li key={m.id} className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-[0.75rem]">
                <Icon name="join" size={13} className="text-t2" />
                <span className="min-w-0 flex-1 truncate text-t1">{m.name}</span>
                <span className="mono text-[0.625rem] text-t3">{m.id}</span>
                <button className="btn !h-6 px-2 text-[0.6875rem] text-bad" onClick={() => ws.getState().edit(`Remove ${m.name}`, (st) => applyChange(st, { merged: merged.filter((x) => x.id !== m.id) }))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <p className="px-0.5 pt-1 text-[0.6875rem] leading-snug text-t3">Linked projects are read-only here: drag one to move it as a whole. Save a linked project in its own tab and it changes here at once.</p>
    </div>
  );
}

/** A small number box applied on Enter or when it loses focus. */
function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-1">
      {label}
      <input
        className="input mono !h-6 !w-16 !px-1 text-right !text-[0.6875rem]"
        value={text ?? String(Math.round(value * 10) / 10)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = parseFloat(text ?? "");
          if (Number.isFinite(n) && n !== value) onChange(n);
          setText(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        aria-label={`${label} offset`}
      />
      ft
    </label>
  );
}
