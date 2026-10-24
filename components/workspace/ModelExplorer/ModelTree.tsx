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
 *        - The eye of a category row that is tied to a layer switches that layer; the eye of any other row
 *          hides or shows its elements.
 *        - The tree does not refresh after a project change: it is memoised on the scene, project name and id.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useMemo, useState } from "react";
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
  const nodeLocked = (n: TreeNode) => {
    const ids = nodeIds(n);
    return ids.length > 0 && ids.every((id) => lockedSet.has(id));
  };

  const toggleVisible = (n: TreeNode): void => {
    const s = ws.getState();
    if (n.layer && !n.elementIds?.length) return s.toggleLayer(n.layer as never);
    const ids = nodeIds(n);
    if (ids.length) s.setHidden(ids, nodeVisible(n));
    else (n.children ?? []).forEach((c) => toggleVisible(c));
  };
  const toggleLock = (n: TreeNode) => {
    const ids = nodeIds(n);
    if (ids.length) ws.getState().setLocked(ids, !nodeLocked(n));
  };
  const selectNode = (n: TreeNode, additive: boolean) => {
    const ids = nodeIds(n);
    if (ids.length) ws.getState().select(ids.filter((id) => !hiddenSet.has(id)), additive);
  };

  const label = (n: TreeNode) => renames[n.id] ?? n.label;

  const Row = ({ n, depth }: { n: TreeNode; depth: number }) => {
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
        {expanded && n.children?.map((c) => <Row key={c.id} n={c} depth={depth + 1} />)}
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
    <div role="tree" aria-label="Model tree" className="py-1" data-testid="model-tree">
      {tree.map((n) => (
        <Row key={n.id} n={n} depth={0} />
      ))}
      <Menu anchor={menu?.anchor ?? null} onClose={close} label="Tree item menu" width="12rem">
        <MenuItem label="Select" icon="pointer" disabled={!ids.length} onClick={() => ws.getState().select(ids)} onClose={close} />
        <MenuItem label="Isolate" icon="isolate" disabled={!ids.length} onClick={() => ws.getState().isolate(ids)} onClose={close} />
        <MenuItem label="Hide" icon="hide" disabled={!ids.length} onClick={() => ws.getState().setHidden(ids, true)} onClose={close} />
        <MenuItem label="Show all" icon="showall" onClick={() => ws.getState().showAll()} onClose={close} />
        <MenuSep />
        <MenuItem label="Rename" icon="pencil" onClick={() => m && setRenaming(m.id)} onClose={close} />
        <MenuItem label="Zoom to" icon="zoomext" disabled={!ids.length} onClick={() => ws.getState().focusElements(ids.slice(0, 40))} onClose={close} />
      </Menu>
    </div>
  );
}
