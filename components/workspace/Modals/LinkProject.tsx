/**
 * components/workspace/Modals/LinkProject.tsx
 *
 * WHAT   The Link Project dialog (Insert → Link Project / Community, commands XREF, LINK, COMMUNITY). Two jobs:
 *        - bring other projects into this one: choose them, choose Keep separate (a live link: read-only here, it
 *          updates when that project is saved) or Merge a copy (its elements become part of this project, editable
 *          here, no longer updated), and where they go (east / north offsets and a 0° or 180° turn);
 *        - make a new community: a new project on one parcel with the chosen projects side by side (or facing each
 *          other across a street), linked or merged, with a property line around them all; it opens in a new tab.
 * FOR    Seeing how two houses look together on the same parcel while each stays its own project. The links live on
 *        project.links / project.merged (lib/links.ts) and are edited later in the Links palette.
 * DEBUG  - A project is missing from the list: only the samples and projects with work saved in this browser (in
 *          this mode: the demo and the app keep separate work) can be linked.
 *        - A new community opens empty: its first save is written before the page opens (writeStored); storage may be
 *          blocked (private window).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Segmented } from "@/components/ui/controls";
import { Modal } from "@/components/ui/Modal";
import { applyChange } from "@/lib/draw/change";
import { sceneOf } from "@/lib/draw/scene-of";
import type { SavedWork } from "@/lib/draw/types";
import { linkableProjects, mergeOf, nextBlockId, nextCommunityId, parcelAround, sideBySide, sourceWork, type MergedBlock, type ProjectLink } from "@/lib/links";
import { writeStored } from "@/lib/persist";
import type { V2 } from "@/lib/scene/types";
import { projectById } from "@/lib/services/projects";
import { useAppApi } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

type How = "link" | "merge";

/** The Link Project / New Community dialog. */
export function LinkProjectModal({ community: startCommunity }: { community?: boolean }) {
  const ws = useWsApi();
  const app = useAppApi();
  const router = useRouter();
  const mode = useWs((s) => s.mode);
  const self = useWs((s) => s.project.id);
  const selfName = useWs((s) => s.project.name);
  const list = useMemo(() => linkableProjects(mode, self), [mode, self]);
  const [community, setCommunity] = useState(!!startCommunity);
  // a new community starts with this project and the next one; linking into this project starts with the first other one
  const [picked, setPicked] = useState<string[]>(() => (startCommunity ? [self, ...list.map((l) => l.id).filter((id) => id !== self)].slice(0, 2) : list.slice(0, 1).map((l) => l.id)));
  const [how, setHow] = useState<How>("link");
  const [layout, setLayout] = useState<"side" | "facing">("side");
  const [gap, setGap] = useState(10);
  const scene = sceneOf(ws.getState());
  const f = scene.footprint;
  const lotRight = Math.max(f.x1, ...(ws.getState().project.site?.boundary ?? []).map((q) => q[0]));
  const [east, setEast] = useState(Math.round(lotRight + 30));
  const [north, setNorth] = useState(0);
  const [rot, setRot] = useState<0 | 180>(0);
  const close = () => ws.getState().closeModal();
  const options = community && !list.some((l) => l.id === self) ? [{ id: self, name: selfName, savedAt: null }, ...list] : list;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const linkHere = () => {
    const s = ws.getState();
    const links = [...(s.project.links ?? [])];
    const merged = [...(s.project.merged ?? [])];
    const placed = sideBySide(mode, picked, 10, false).map((p) => ({ ...p, at: [p.at[0] + east, p.at[1] + north] as V2, rot }));
    for (const p of placed) {
      const link: ProjectLink = { id: nextBlockId("LK", links), projectId: p.projectId, name: sourceWork(mode, p.projectId)?.name ?? p.projectId, at: p.at, rot: p.rot };
      if (how === "link") links.push(link);
      else {
        const m = mergeOf(mode, link, nextBlockId("MG", merged));
        if (m) merged.push(m);
      }
    }
    s.edit(how === "link" ? "Link project" : "Merge project", (st) => applyChange(st, how === "link" ? { links } : { merged }));
    s.setPanel("links");
    app.getState().log("ok", `✓ ${how === "link" ? "Linked" : "Merged"} ${placed.length} project(s): ${placed.map((p) => sourceWork(mode, p.projectId)?.name).join(", ")}${how === "link" ? ". They update here whenever they are saved." : ". The copy is editable here."}`);
    s.zoomExtents();
    close();
  };

  const makeCommunity = () => {
    const id = nextCommunityId(mode, app.getState().tabs);
    const blank = projectById(id);
    if (!blank) return;
    const placed = sideBySide(mode, picked, gap, layout === "facing");
    const links: ProjectLink[] = [];
    const merged: MergedBlock[] = [];
    placed.forEach((p, i) => {
      const link: ProjectLink = { id: `LK${i + 1}`, projectId: p.projectId, name: sourceWork(mode, p.projectId)?.name ?? p.projectId, at: p.at, rot: p.rot };
      if (how === "link") links.push(link);
      else {
        const m = mergeOf(mode, link, `MG${i + 1}`);
        if (m) merged.push(m);
      }
    });
    const first = projectById(picked[0])?.site;
    const project: Partial<Project> = { ...blank, links, merged, site: { lat: first?.lat ?? 0, lon: first?.lon ?? 0, north: first?.north ?? 0, source: first?.source, boundary: parcelAround(mode, placed) } };
    delete project.versions;
    const now = Date.now();
    const work: SavedWork = { v: 1, projectId: id, at: now, drawn: [], xf: {}, hidden: [], locked: [], isolated: null, renames: {}, materialOverrides: {}, colors: {}, elColors: {}, types: {}, groups: {}, project };
    if (!writeStored(mode, id, { work, versions: [], dirty: false, savedAt: now })) {
      app.getState().toast("This browser blocks storage, so a community can't be made here.", "bad");
      return;
    }
    app.getState().openTab(id);
    app.getState().log("ok", `✓ ${blank.name}: ${placed.length} projects ${how === "link" ? "linked (each stays its own project and updates here when saved)" : "merged into one editable project"}`);
    close();
    router.push(mode === "demo" ? `/demo?project=${id}` : `/app/projects/${id}`);
  };

  return (
    <Modal
      title={community ? "New Community" : "Link a Project"}
      subtitle={community ? "Put several projects on one parcel to see how they look together." : "Bring another project into this one, on the same parcel."}
      onClose={close}
      width="40rem"
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={community ? picked.length < 2 : !picked.length} onClick={community ? makeCommunity : linkHere} data-testid="link-go">
            {community ? `Create community (${picked.length})` : how === "link" ? "Link" : "Merge a copy"}
          </button>
        </>
      }
    >
      <div className="space-y-3" data-testid="link-modal">
        <Segmented<"here" | "community">
          label="What to Make"
          value={community ? "community" : "here"}
          onChange={(v) => setCommunity(v === "community")}
          options={[
            { value: "here", label: `Into ${selfName}` },
            { value: "community", label: "A new community" },
          ]}
        />
        <div>
          <div className="label-xs mb-1">{community ? "Projects on the parcel (two or more)" : "Projects to bring in"}</div>
          <ul className="max-h-48 overflow-y-auto rounded-lg border border-line" data-testid="link-list">
            {options.map((p) => (
              <li key={p.id} className="border-b border-soft/60 last:border-0">
                <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[0.8125rem]">
                  <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} aria-label={`Use ${p.name}`} data-testid={`link-pick-${p.id}`} />
                  <Icon name={p.id.startsWith("cottage") || p.id.startsWith("residence") ? "roof" : "building"} size={14} className="text-t2" />
                  <span className="flex-1 truncate text-t1">{p.name}</span>
                  <span className="text-[0.6875rem] text-t3">{p.savedAt ? "your saved work" : "as shipped"}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div role="radiogroup" aria-label="Keep Separate or Merge" className="grid grid-cols-2 gap-2">
          {(
            [
              ["link", "Keep them separate", "A live link: read-only here. Edit it in its own project; when it is saved, it changes here at once."],
              ["merge", "Merge a copy", "Its elements become part of this project: move, copy or delete them here. It no longer follows the original."],
            ] as [How, string, string][]
          ).map(([id, title, desc]) => (
            <button key={id} role="radio" aria-checked={how === id} onClick={() => setHow(id)} data-testid={`link-how-${id}`} className={cn("rounded-lg border p-2.5 text-left", how === id ? "border-accent bg-accent/10" : "border-line hover:border-t3")}>
              <div className="text-[0.8125rem] font-semibold text-t1">{title}</div>
              <div className="mt-0.5 text-[0.6875rem] leading-snug text-t2">{desc}</div>
            </button>
          ))}
        </div>
        {community ? (
          <div className="flex flex-wrap items-center gap-3 text-[0.75rem] text-t2">
            <Segmented<"side" | "facing"> label="Layout" value={layout} onChange={setLayout} options={[{ value: "side", label: "Side by side" }, { value: "facing", label: "Facing across a street" }]} />
            <label className="flex items-center gap-1.5">
              Gap between lots
              <input type="number" className="input mono !h-7 !w-20 text-right" value={gap} onChange={(e) => setGap(Math.max(0, Number(e.target.value) || 0))} aria-label="Gap Between Lots" /> ft
            </label>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-[0.75rem] text-t2">
            <label className="flex items-center gap-1.5">
              East
              <input type="number" className="input mono !h-7 !w-20 text-right" value={east} onChange={(e) => setEast(Number(e.target.value) || 0)} aria-label="Offset East" data-testid="link-east" /> ft
            </label>
            <label className="flex items-center gap-1.5">
              North
              <input type="number" className="input mono !h-7 !w-20 text-right" value={north} onChange={(e) => setNorth(Number(e.target.value) || 0)} aria-label="Offset North" /> ft
            </label>
            <Segmented<"0" | "180"> label="Turn" value={String(rot) as "0" | "180"} onChange={(v) => setRot(v === "180" ? 180 : 0)} options={[{ value: "0", label: "0°" }, { value: "180", label: "180°" }]} />
            <span className="text-t3">Drag it later to fine-tune.</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
