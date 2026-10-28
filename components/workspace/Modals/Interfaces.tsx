/**
 * components/workspace/Modals/Interfaces.tsx
 *
 * WHAT   The Interfaces dialog (View → Interfaces, command INTERFACES): switch between saved arrangements of the
 *        windows, save the current one under a name, rename, update or delete your own, and customise the current
 *        arrangement on the spot: which windows show, their size (the three eyes), the edge each side window sits
 *        on, the order of the bottom windows, the dragged sizes, and which palette and explorer tabs show and in
 *        what order. The ribbon at the top and the status bar at the bottom are fixed and are not listed.
 * FOR    Keeping the screen uncluttered: a Drafting interface with only the explorer and the command line, an
 *        Analysis one with large palettes, and so on (built-in list in lib/layout.ts). Changes apply at once; the
 *        arrangement in use is remembered by Workspace.tsx.
 * DEBUG  - Saved interfaces are gone after a reload: localStorage (bs.interfaces) may be blocked; the dialog says so.
 *        - "Modified" next to an interface: the live arrangement no longer matches what it saved (Update saves it).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Segmented } from "@/components/ui/controls";
import { Modal } from "@/components/ui/Modal";
import { tip } from "@/components/ui/Tooltip";
import {
  BUILT_IN_INTERFACES,
  DOCK_KEYS,
  DOCK_LABEL,
  allInterfaces,
  readInterfaces,
  sameArrangement,
  writeInterfaces,
  type BottomDock,
  type DockSize,
  type Interface,
  type SideDock,
} from "@/lib/layout";
import { useAppApi } from "@/lib/store/app-provider";
import { useWs, useWsApi, useWsShallow } from "@/lib/store/workspace-provider";
import { arrangementOf } from "@/lib/store/workspace-store";
import { EXPLORER_IDS, PALETTE_IDS, type ExplorerId, type PaletteId } from "@/lib/types";
import { cn, uid } from "@/lib/utils";
import { EXPLORER_LABEL } from "../ModelExplorer";
import { PALETTE_META } from "../Palettes";

/** Move an item one place up (-1) or down (+1) in a list. */
function nudge<T>(list: T[], id: T, d: -1 | 1): T[] {
  const i = list.indexOf(id);
  const j = i + d;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** The Interfaces dialog. */
export function InterfacesModal() {
  const ws = useWsApi();
  const app = useAppApi();
  const s = useWsShallow((st) => ({ docks: st.docks, dockSize: st.dockSize, dockPx: st.dockPx, dockSide: st.dockSide, bottomOrder: st.bottomOrder, paletteTabs: st.paletteTabs, explorerTabs: st.explorerTabs }));
  const iface = useWs((st) => st.iface);
  const [user, setUser] = useState<Interface[]>(() => readInterfaces());
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const live = arrangementOf(s);
  const list = allInterfaces(user);
  const close = () => ws.getState().closeModal();

  const store = (next: Interface[]) => {
    setUser(next);
    if (!writeInterfaces(next)) app.getState().toast("This browser blocks storage, so saved interfaces will not survive a reload.", "warn");
  };
  const apply = (it: Interface) => {
    ws.getState().applyArrangement(it.a, it.id);
    app.getState().log("ok", `✓ Interface: ${it.name}`);
  };
  const saveAs = () => {
    const n = name.trim();
    if (!n) return;
    const existing = user.find((u) => u.name.toLowerCase() === n.toLowerCase());
    const it: Interface = existing ? { ...existing, a: live } : { id: uid("if"), name: n.slice(0, 40), desc: "Saved by you", a: live };
    store(existing ? user.map((u) => (u.id === existing.id ? it : u)) : [...user, it]);
    ws.getState().patch({ iface: it.id });
    setName("");
    app.getState().toast(`Interface “${it.name}” saved`);
  };

  const pTabs = s.paletteTabs;
  const eTabs = s.explorerTabs;
  const togglePalette = (id: PaletteId, on: boolean) => ws.getState().setPaletteTabs(on ? [...pTabs, id] : pTabs.filter((t) => t !== id));
  const toggleExplorer = (id: ExplorerId, on: boolean) => ws.getState().setExplorerTabs(on ? [...eTabs, id] : eTabs.filter((t) => t !== id));

  return (
    <Modal title="Interfaces" subtitle="Arrange the windows the way you work, then save the arrangement to switch back to it any time." onClose={close} width="54rem" footer={<button className="btn btn-primary" onClick={close}>Done</button>}>
      <div className="grid grid-cols-[17rem_1fr] gap-4" data-testid="interfaces">
        {/* saved arrangements */}
        <div className="flex min-h-0 flex-col gap-2">
          <div className="label-xs">Saved interfaces</div>
          <ul className="max-h-[22rem] space-y-1 overflow-y-auto pr-1" aria-label="Saved Interfaces">
            {list.map((it) => {
              const current = iface === it.id;
              const modified = current && !sameArrangement(it.a, live);
              return (
                <li key={it.id} className={cn("rounded-lg border px-2 py-1.5", current ? "border-accent bg-accent/10" : "border-line")} data-testid={`iface-${it.id}`}>
                  <div className="flex items-center gap-1.5">
                    {renaming === it.id ? (
                      <input
                        className="input !h-6 flex-1 text-[0.75rem]"
                        defaultValue={it.name}
                        aria-label="Interface Name"
                        autoFocus
                        onBlur={(e) => {
                          store(user.map((u) => (u.id === it.id ? { ...u, name: e.target.value.trim().slice(0, 40) || u.name } : u)));
                          setRenaming(null);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      />
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium text-t1">{it.name}</span>
                    )}
                    {modified && <span className="text-[0.625rem] text-warn">modified</span>}
                    <button className="btn !h-6 px-2 text-[0.6875rem]" onClick={() => apply(it)} data-testid={`iface-apply-${it.id}`}>
                      {current && !modified ? "In use" : "Apply"}
                    </button>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[0.6875rem] text-t3">
                    <span className="min-w-0 flex-1 truncate">{it.desc}</span>
                    {!it.builtIn && (
                      <>
                        <button className="hover:text-t1" onClick={() => store(user.map((u) => (u.id === it.id ? { ...u, a: live } : u)))} {...tip("Update", "Save the current arrangement into this interface")}>
                          Update
                        </button>
                        <button className="hover:text-t1" onClick={() => setRenaming(it.id)}>
                          Rename
                        </button>
                        <button className="hover:text-bad" onClick={() => store(user.filter((u) => u.id !== it.id))} aria-label={`Delete ${it.name}`}>
                          <Icon name="trash" size={11} />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              saveAs();
            }}
          >
            <input className="input !h-7 flex-1 text-[0.75rem]" placeholder="Name, e.g. My drafting" value={name} onChange={(e) => setName(e.target.value)} aria-label="New Interface Name" data-testid="iface-name" />
            <button className="btn !h-7 px-2.5 text-[0.75rem]" disabled={!name.trim()} data-testid="iface-save">
              Save current
            </button>
          </form>
          <p className="text-[0.6875rem] text-t3">Built-in: {BUILT_IN_INTERFACES.map((b) => b.name).join(", ")}.</p>
        </div>

        {/* the arrangement in use */}
        <div className="min-w-0 space-y-3">
          <div>
            <div className="label-xs mb-1">Windows</div>
            <table className="w-full text-[0.75rem]">
              <tbody>
                {DOCK_KEYS.map((k) => {
                  const side = k === "explorer" || k === "palettes";
                  return (
                    <tr key={k} className="border-b border-soft/60" data-testid={`iface-row-${k}`}>
                      <td className="py-1.5 pr-2">
                        <label className="flex items-center gap-2 text-t1">
                          <input type="checkbox" checked={s.docks[k]} onChange={(e) => ws.getState().toggleDock(k, e.target.checked)} aria-label={`Show ${DOCK_LABEL[k]}`} />
                          {DOCK_LABEL[k]}
                        </label>
                      </td>
                      <td className="py-1.5 pr-2">
                        <Segmented<DockSize>
                          size="sm"
                          label={`${DOCK_LABEL[k]} Size`}
                          value={s.dockSize[k]}
                          onChange={(v) => ws.getState().setDockSize(k, v)}
                          options={[{ value: "large", label: "Open" }, { value: "mid", label: "Normal" }, { value: "min", label: "Header" }]}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        {side ? (
                          <Segmented<"left" | "right"> size="sm" label={`${DOCK_LABEL[k]} Edge`} value={s.dockSide[k as SideDock]} onChange={(v) => ws.getState().setDockSide(k as SideDock, v)} options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]} />
                        ) : (
                          <Segmented<"top" | "bottom">
                            size="sm"
                            label={`${DOCK_LABEL[k]} Position`}
                            value={s.bottomOrder[0] === k ? "top" : "bottom"}
                            onChange={(v) => {
                              const other = s.bottomOrder.find((b) => b !== k) as BottomDock;
                              ws.getState().setBottomOrder(v === "top" ? [k as BottomDock, other] : [other, k as BottomDock]);
                            }}
                            options={[{ value: "top", label: "Upper" }, { value: "bottom", label: "Lower" }]}
                          />
                        )}
                      </td>
                      <td className="py-1.5 text-right">
                        {s.dockPx[k] ? (
                          <button className="text-[0.6875rem] text-t2 hover:text-t1" onClick={() => ws.getState().setDockPx(k, null)} {...tip("Reset size", `Dragged to ${s.dockPx[k]} px. Go back to the normal size.`)}>
                            {s.dockPx[k]} px ✕
                          </button>
                        ) : (
                          <span className="text-[0.6875rem] text-t3">default size</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-1 text-[0.6875rem] text-t3">Drag a window&apos;s inner edge to resize it, or its ⋮⋮ grip to move it. The ribbon and the status bar always stay put.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TabList
              title="Palette tabs"
              ids={[...pTabs, ...PALETTE_IDS.filter((p) => !pTabs.includes(p))]}
              on={(id) => pTabs.includes(id)}
              label={(id) => PALETTE_META[id].label}
              toggle={togglePalette}
              move={(id, d) => ws.getState().setPaletteTabs(nudge(pTabs, id, d))}
              testid="iface-palettes"
            />
            <TabList
              title="Explorer tabs"
              ids={[...eTabs, ...EXPLORER_IDS.filter((p) => !eTabs.includes(p))]}
              on={(id) => eTabs.includes(id)}
              label={(id) => EXPLORER_LABEL[id]}
              toggle={toggleExplorer}
              move={(id, d) => ws.getState().setExplorerTabs(nudge(eTabs, id, d))}
              testid="iface-explorer"
              keepOne
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** A list of tabs with a checkbox and up / down buttons each. */
function TabList<T extends string>({ title, ids, on, label, toggle, move, testid, keepOne }: { title: string; ids: T[]; on: (id: T) => boolean; label: (id: T) => string; toggle: (id: T, v: boolean) => void; move: (id: T, d: -1 | 1) => void; testid: string; keepOne?: boolean }) {
  const shown = ids.filter(on).length;
  return (
    <div>
      <div className="label-xs mb-1">{title}</div>
      <ul className="max-h-[13rem] overflow-y-auto rounded-lg border border-line" data-testid={testid}>
        {ids.map((id) => (
          <li key={id} className="flex items-center gap-1.5 border-b border-soft/60 px-2 py-1 text-[0.75rem] last:border-0">
            <input type="checkbox" checked={on(id)} disabled={keepOne && on(id) && shown <= 1} onChange={(e) => toggle(id, e.target.checked)} aria-label={`Show ${label(id)}`} />
            <span className={cn("flex-1 truncate", on(id) ? "text-t1" : "text-t3")}>{label(id)}</span>
            {on(id) && (
              <>
                <button className="grid size-5 place-items-center rounded text-t3 hover:bg-t1/10 hover:text-t1" onClick={() => move(id, -1)} aria-label={`Move ${label(id)} up`}>
                  <Icon name="chevUp" size={11} />
                </button>
                <button className="grid size-5 place-items-center rounded text-t3 hover:bg-t1/10 hover:text-t1" onClick={() => move(id, 1)} aria-label={`Move ${label(id)} down`}>
                  <Icon name="chevDown" size={11} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
