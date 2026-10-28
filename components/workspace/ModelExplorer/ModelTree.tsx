/**
 * components/workspace/ModelExplorer/ModelTree.tsx
 *
 * WHAT   The Model tab: a tree of Project → Site → Building → levels → categories → elements. Each row has
 *        expand / collapse, an eye (visibility), a lock and a name; click selects (Shift-click, or ⌘-click on a
 *        Mac / Ctrl-click elsewhere, adds to the selection), double-click renames, right-click opens a menu
 *        (Select, Isolate, Hide, Show all, Rename, Zoom to).
 * FOR    Browsing and bulk-editing the scene. The tree is built by buildModelTree in lib/scene; renames, hidden
 *        and locked ids live in the workspace store.
 * OS     The add-to-selection modifier is Shift or the platform's primary key (hasPrimaryModifier in
 *        lib/platform.ts); on a Mac, Control-click opens the context menu instead.
 * DEBUG  - A row is dim: all of its elements are hidden, or its layer is switched off.
 *        - Expanding a row jumps the list to the top: rows must stay a plain function (row()), not a component
 *          declared inside ModelTree, or React rebuilds every row on each render.
 *        - The eye of a category row that is tied to a layer switches that layer; the eye of any other row
 *          hides or shows its elements. The lock works the same way (a layer row locks the layer), and on a row
 *          with no elements of its own (the project, MEP) both act on every row under it.
 *        - The tree does not refresh after a project change: it is memoised on the scene, project name and id.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Menu, MenuItem, MenuSep, type Anchor } from "@/components/ui/Menu";
import { tip } from "@/components/ui/Tooltip";
import { hasPrimaryModifier } from "@/lib/platform";
import { buildModelTree, type TreeNode } from "@/lib/scene";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";
import { useScene } from "../hooks";

/* Model tree: Project → Site → Building → levels → categories → elements.
 * Every row: expand/collapse · 👁 visibility · 🔒 lock · click selects · double-click renames · right-click isolates. */

const OPEN_BY_DEFAULT = new Set(["project", "building", "site"]);

/** The Model tab: expandable project tree with visibility, lock, rename and a context menu. */
export function ModelTree() {
  const ws = useWsApi();
  const scene = useScene();
  const project = useWs((s) => s.project);
  const selection = useWs((s) => s.selection);
  const hidden = useWs((s) => s.hidden);
  const locked = useWs((s) => s.locked);
  const renames = useWs((s) => s.renames);
  const layers = useWs((s) => s.project.layers);
  const tree = useMemo(() => buildModelTree(scene, project), [scene, project.name, project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ anchor: Anchor; node: TreeNode } | null>(null);
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const lockedSet = useMemo(() => new Set(locked), [locked]);
  const selSet = useMemo(() => new Set(selection), [selection]);

  const isOpen = (n: TreeNode) => open[n.id] ?? OPEN_BY_DEFAULT.has(n.id);
  const layerVisible = (id?: string) => (id ? layers.find((l) => l.id === id)?.visible !== false : true);

  const nodeIds = (n: TreeNode): string[] => n.elementIds ?? [];
  const nodeVisible = (n: TreeNode): boolean => {
    if (n.layer && !n.elementIds?.length) return layerVisible(n.layer);
    const ids = nodeIds(n);
    if (!ids.length) return (n.children ?? []).some((c) => nodeVisible(c));
    return ids.some((id) => !hiddenSet.has(id));
  };
  const layerLocked = (id?: string) => (id ? layers.find((l) => l.id === id)?.locked === true : false);
  const nodeLocked = (n: TreeNode): boolean => {
    if (n.layer && !n.elementIds?.length) return layerLocked(n.layer);
    const ids = nodeIds(n);
    if (!ids.length) return !!n.children?.length && n.children.every((c) => nodeLocked(c));
    return ids.every((id) => lockedSet.has(id));
  };

  const toggleVisible = (n: TreeNode): void => {
    const s = ws.getState();
    if (n.layer && !n.elementIds?.length) return s.toggleLayer(n.layer as never);
    const ids = nodeIds(n);
    if (ids.length) s.setHidden(ids, nodeVisible(n));
    else (n.children ?? []).forEach((c) => toggleVisible(c));
  };
  // mirrors toggleVisible: a layer row locks its layer, a row without elements of its own (project, MEP) locks its children
  const toggleLock = (n: TreeNode, lock = !nodeLocked(n)): void => {
    const s = ws.getState();
    if (n.layer && !n.elementIds?.length) {
      if (layerLocked(n.layer) !== lock) s.toggleLayerLock(n.layer as never);
      return;
    }
    const ids = nodeIds(n);
    if (ids.length) s.setLocked(ids, lock);
    else (n.children ?? []).forEach((c) => toggleLock(c, lock));
  };
  const selectNode = (n: TreeNode, additive: boolean) => {
    const ids = nodeIds(n);
    if (ids.length) ws.getState().select(ids.filter((id) => !hiddenSet.has(id)), additive);
  };

  const label = (n: TreeNode) => renames[n.id] ?? n.label;

  // a plain function, not a component: a component made inside this render would be a new type on every render,
  // so React would rebuild the whole tree on each expand / collapse and the scroll would jump back to the top
  const row = (n: TreeNode, depth: number): ReactNode => {
    const hasKids = !!n.children?.length || (n.kind === "category" && !n.layer && (n.elementIds?.length ?? 0) > 0);
    const expanded = isOpen(n);
    const ids = nodeIds(n);
    const selected = ids.length > 0 && ids.every((id) => selSet.has(id));
    const vis = nodeVisible(n);
    const lock = nodeLocked(n);
    return (
      <>
        <div
          role="treeitem"
          aria-expanded={hasKids ? expanded : undefined}
          aria-selected={selected}
          className={cn("group flex h-6 items-center gap-1 pr-1.5 text-[0.75rem] transition-colors", selected ? "bg-accent/20 text-t1" : "text-t1 hover:bg-t1/8", !vis && "opacity-50")}
          style={{ paddingLeft: 4 + depth * 12 }}
          onClick={(e) => selectNode(n, e.shiftKey || hasPrimaryModifier(e))}
          onDoubleClick={() => setRenaming(n.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ anchor: { x: e.clientX, y: e.clientY, h: 0 }, node: n });
          }}
        >
          <button
            aria-label={expanded ? "Collapse" : "Expand"}
            className={cn("grid size-4 shrink-0 place-items-center text-t3 hover:text-t1", !hasKids && "invisible")}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => ({ ...o, [n.id]: !expanded }));
            }}
          >
            <Icon name={expanded ? "chevDown" : "chevRight"} size={12} />
          </button>
          {renaming === n.id ? (
            <input
              autoFocus
              defaultValue={label(n)}
              aria-label="Rename"
              className="input h-5 flex-1 px-1 text-[0.75rem]"
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== label(n)) ws.getState().rename(n.id, v);
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setRenaming(null);
              }}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate">
              {label(n)}
              {n.count !== undefined && <span className="mono ml-1 text-[0.6875rem] text-t3">[{n.count}]</span>}
            </span>
          )}
          <button aria-label={vis ? "Hide" : "Show"} aria-pressed={vis} className="grid size-4 place-items-center text-t3 opacity-60 hover:text-t1 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); toggleVisible(n); }} {...tip(vis ? "Hide" : "Show", "Toggle visibility in the viewport", "HIDE")}>
            <Icon name={vis ? "showall" : "hide"} size={13} />
          </button>
          <button aria-label={lock ? "Unlock" : "Lock"} aria-pressed={lock} className={cn("grid size-4 place-items-center hover:text-t1", lock ? "text-warn" : "text-t3 opacity-60 group-hover:opacity-100")} onClick={(e) => { e.stopPropagation(); toggleLock(n); }} {...tip(lock ? "Unlock" : "Lock", "Lock against edits and selection", "LOCK")}>
            <Icon name={lock ? "lock" : "unlock"} size={12} />
          </button>
        </div>
        {expanded && n.children?.map((c) => <Fragment key={c.id}>{row(c, depth + 1)}</Fragment>)}
        {expanded && !n.children && n.kind === "category" && !n.layer &&
          (n.elementIds ?? []).slice(0, 80).map((id) => {
            const el = scene.elementById[id];
            if (!el) return null;
            const eSel = selSet.has(id);
            const eHidden = hiddenSet.has(id);
            const eLocked = lockedSet.has(id);
            return (
              <div
                key={id}
                role="treeitem"
                aria-selected={eSel}
                className={cn("group flex h-[1.375rem] items-center gap-1 pr-1.5 text-[0.6875rem] transition-colors", eSel ? "bg-accent/20 text-t1" : "text-t2 hover:bg-t1/8 hover:text-t1", eHidden && "opacity-45")}
                style={{ paddingLeft: 4 + (depth + 1) * 12 + 16 }}
                onClick={(e) => ws.getState().select([id], e.shiftKey || hasPrimaryModifier(e))}
                onDoubleClick={() => setRenaming(id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  ws.getState().select([id]);
                  setMenu({ anchor: { x: e.clientX, y: e.clientY, h: 0 }, node: { id, label: el.name, elementIds: [id], kind: "element" } });
                }}
              >
                {renaming === id ? (
                  <input autoFocus defaultValue={renames[id] ?? el.name} aria-label="Rename" className="input h-5 flex-1 px-1 text-[0.6875rem]" onClick={(e) => e.stopPropagation()} onBlur={(e) => { const v = e.target.value.trim(); if (v) ws.getState().rename(id, v); setRenaming(null); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); }} />
                ) : (
                  <span className="min-w-0 flex-1 truncate">
                    {renames[id] ?? el.name} <span className="mono text-t3">{id}</span>
                  </span>
                )}
                <button aria-label={eHidden ? "Show" : "Hide"} className="grid size-4 place-items-center text-t3 opacity-0 hover:text-t1 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); ws.getState().setHidden([id], !eHidden); }}>
                  <Icon name={eHidden ? "hide" : "showall"} size={12} />
                </button>
                <button aria-label={eLocked ? "Unlock" : "Lock"} className={cn("grid size-4 place-items-center hover:text-t1", eLocked ? "text-warn" : "text-t3 opacity-0 group-hover:opacity-100")} onClick={(e) => { e.stopPropagation(); ws.getState().setLocked([id], !eLocked); }}>
                  <Icon name={eLocked ? "lock" : "unlock"} size={11} />
                </button>
              </div>
            );
          })}
      </>
    );
  };

  const close = () => setMenu(null);
  const m = menu?.node;
  const ids = m ? nodeIds(m) : [];

  return (
    <div role="tree" aria-label="Model Tree" className="py-1" data-testid="model-tree">
      {tree.map((n) => (
        <Fragment key={n.id}>{row(n, 0)}</Fragment>
      ))}
      <Menu anchor={menu?.anchor ?? null} onClose={close} label="Tree Item Menu" width="12rem">
        <MenuItem label="Select" icon="pointer" disabled={!ids.length} onClick={() => ws.getState().select(ids)} onClose={close} />
        <MenuItem label="Isolate" icon="isolate" disabled={!ids.length} onClick={() => ws.getState().isolate(ids)} onClose={close} />
        <MenuItem label="Hide" icon="hide" disabled={!ids.length} onClick={() => ws.getState().setHidden(ids, true)} onClose={close} />
        <MenuItem label="Show All" icon="showall" onClick={() => ws.getState().showAll()} onClose={close} />
        <MenuSep />
        <MenuItem label="Rename" icon="pencil" onClick={() => m && setRenaming(m.id)} onClose={close} />
        <MenuItem label="Zoom To" icon="zoomext" disabled={!ids.length} onClick={() => ws.getState().focusElements(ids.slice(0, 40))} onClose={close} />
      </Menu>
    </div>
  );
}
