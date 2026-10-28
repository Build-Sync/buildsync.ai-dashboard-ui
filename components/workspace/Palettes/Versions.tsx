/**
 * components/workspace/Palettes/Versions.tsx
 *
 * WHAT   The Versions palette: the project's version history. A "working copy" card (saved or not, a box to name
 *        a version, Save version, Save As file, Open file), then the versions you saved newest first, each with
 *        who / when, a summary of what changed since the one before ("+3 drawn · 1 moved"), and Restore, Show
 *        changes, Rename and Delete; then the earlier sample history. A second tab, Activity, lists what you did
 *        in this session (every undoable step) and the saves.
 * FOR    Reachable from the palette tabs, Collaborate → Share → Versions / History, the application menu and the
 *        status bar's save indicator. Saving writes to this browser (localStorage, lib/persist.ts); Restore puts
 *        a version's snapshot back as one undoable step.
 * DEBUG  - Restore is disabled: sample history has no snapshot, and only the 20 newest saved versions keep one.
 *        - "Saved 5 min ago" never changes: the clock ticks every 30 s on the client only.
 *        - Nothing appears after Save in a private window: storage may be blocked; the toast says so.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { EmptyState, Pill } from "@/components/ui/controls";
import { tip } from "@/components/ui/Tooltip";
import { ago, stamp } from "@/lib/persist";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import type { VersionRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useRunner } from "../hooks";

/** Milliseconds since 1970 on the client, refreshed every 30 s; null during the server render. */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return now;
}

/** Ids of drawn items that are new or different in `snap` compared with `prev`. */
function changedIds(prev: VersionRecord["snapshot"], snap: NonNullable<VersionRecord["snapshot"]>): string[] {
  const before = new Map((prev?.drawn ?? []).map((i) => [i.id, JSON.stringify(i)]));
  return snap.drawn.filter((i) => before.get(i.id) !== JSON.stringify(i)).map((i) => i.id);
}

/** The version history palette. */
export function Versions() {
  const ws = useWsApi();
  const { run } = useRunner();
  const versions = useWs((s) => s.project.versions);
  const dirty = useWs((s) => s.dirty);
  const savedAt = useWs((s) => s.savedAt);
  const mode = useWs((s) => s.mode);
  const tab = useWs((s) => s.versionsTab);
  const undo = useWs((s) => s.undoStack);
  const now = useNow();
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  const mine = versions.filter((v) => v.ts);
  const sample = versions.filter((v) => !v.ts);
  const save = () => {
    ws.getState().save({ note });
    setNote("");
  };
  useEffect(() => {
    if (editing) editRef.current?.select();
  }, [editing]);

  const status = dirty ? "Unsaved changes" : savedAt ? `All changes saved ${now ? ago(savedAt, now) : ""}`.trim() : "No changes yet";

  return (
    <div data-testid="palette-versions">
      <section className="border-b border-soft px-2.5 py-2.5" aria-label="Working Copy">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", dirty ? "bg-warn" : "bg-ok")} aria-hidden="true" />
          <span className="text-[0.8125rem] font-semibold text-t1">Working copy</span>
          <span className="ml-auto text-[0.6875rem] text-t3" data-testid="versions-status">
            {status}
          </span>
        </div>
        <p className="mt-1 text-[0.6875rem] leading-snug text-t3">{mode === "demo" ? "Saved in this browser only (the demo has no account)." : "Saved in this browser."} Each save adds a version you can restore.</p>
        <div className="mt-2 flex gap-1.5">
          <input
            aria-label="Version Name"
            data-testid="version-note"
            className="input !h-7 min-w-0 flex-1 !text-[0.75rem]"
            placeholder="Name this version (optional)"
            value={note}
            maxLength={80}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") save();
            }}
          />
          <button className="btn btn-primary !h-7 px-2.5 text-[0.75rem]" data-testid="save-version" onClick={save} {...tip("Save Version", "Save to this browser and add this state to the history", "SAVE")}>
            <Icon name="save" size={13} /> Save
          </button>
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <button className="btn !h-6 flex-1 px-2 text-[0.6875rem]" data-testid="save-as-file" onClick={() => run("SAVEAS")} {...tip("Save As", "Download the project as a .bsd file", "SAVEAS")}>
            <Icon name="download" size={12} /> Save as file
          </button>
          <button className="btn !h-6 flex-1 px-2 text-[0.6875rem]" data-testid="open-file" onClick={() => run("OPENFILE")} {...tip("Open File", "Load a .bsd file into this project", "OPENFILE")}>
            <Icon name="open" size={12} /> Open file
          </button>
        </div>
      </section>

      <div role="tablist" aria-label="Version Tabs" className="flex gap-4 border-b border-soft px-2.5">
        {(["versions", "history"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} data-testid={`versions-tab-${t}`} onClick={() => ws.getState().patch({ versionsTab: t })} className={cn("-mb-px border-b-2 py-1.5 text-[0.75rem] font-medium", tab === t ? "border-accent text-t1" : "border-transparent text-t2 hover:text-t1")}>
            {t === "versions" ? `Versions (${mine.length})` : "Activity"}
          </button>
        ))}
      </div>

      {tab === "versions" ? (
        <div className="py-1">
          {mine.length === 0 && <EmptyState icon="versions" title="No saved versions yet" hint="Press Save (Ctrl+S) to keep this state. Every save is added here and can be restored later." />}
          <ul data-testid="version-list" className="px-2">
            {mine.map((v, i) => {
              const prevSnap = mine.slice(i + 1).find((x) => x.snapshot)?.snapshot;
              const isCurrent = i === 0 && !dirty;
              return (
                <li key={v.id} data-testid="version-item" data-version={v.id} className={cn("mb-1.5 rounded-lg border px-2.5 py-2", isCurrent ? "border-accent/60 bg-accent/8" : "border-line")}>
                  <div className="flex items-start gap-2">
                    <Icon name="versions" size={14} className="mt-0.5 text-t3" />
                    <div className="min-w-0 flex-1">
                      {editing === v.id ? (
                        <input
                          ref={editRef}
                          aria-label="Rename Version"
                          className="input !h-6 w-full !text-[0.75rem]"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => {
                            ws.getState().renameVersion(v.id, draft);
                            setEditing(null);
                          }}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                      ) : (
                        <div className="truncate text-[0.8125rem] font-medium text-t1" title={v.label}>
                          {v.label}
                        </div>
                      )}
                      <div className="text-[0.6875rem] text-t3">
                        {v.by} · {v.ts ? stamp(v.ts) : v.at}
                        {v.ts && now ? ` · ${ago(v.ts, now)}` : ""}
                      </div>
                      {v.summary && <div className="mt-0.5 text-[0.6875rem] text-t2">{v.summary}</div>}
                    </div>
                    {isCurrent && <Pill tone="info">Current</Pill>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <button className="btn !h-6 px-2 text-[0.6875rem]" data-testid="restore-version" disabled={!v.snapshot} onClick={() => ws.getState().restoreVersion(v.id)} {...tip("Restore", v.snapshot ? "Put the project back as it was in this version (undoable)" : "This old version no longer has a snapshot")}>
                      Restore
                    </button>
                    <button
                      className="btn !h-6 px-2 text-[0.6875rem]"
                      disabled={!v.snapshot}
                      data-testid="show-changes"
                      onClick={() => {
                        if (!v.snapshot) return;
                        const ids = changedIds(prevSnap, v.snapshot);
                        ws.getState().select(ids);
                        ws.getState().focusElements(ids.slice(0, 40));
                      }}
                      {...tip("Show Changes", "Select what was added or changed in this version")}
                    >
                      Show changes
                    </button>
                    <button
                      className="btn !h-6 px-2 text-[0.6875rem]"
                      data-testid="rename-version"
                      onClick={() => {
                        setDraft(v.label);
                        setEditing(v.id);
                      }}
                    >
                      Rename
                    </button>
                    <button className="btn !h-6 px-2 text-[0.6875rem] text-bad" aria-label={`Delete ${v.label}`} data-testid="delete-version" onClick={() => ws.getState().deleteVersion(v.id)}>
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {sample.length > 0 && (
            <>
              <p className="label-xs px-2.5 pb-1 pt-3">Earlier history (sample)</p>
              <ul className="px-2 pb-3">
                {sample.map((v) => (
                  <li key={v.id} className="flex items-center gap-2.5 border-b border-soft/60 px-1 py-1.5">
                    <Icon name="versions" size={13} className="text-t3" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[0.75rem] text-t1">{v.label.replace(/ — current$/, "")}</div>
                      <div className="text-[0.6875rem] text-t3">
                        {v.by} · {v.at}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <ol className="space-y-1.5 px-2.5 py-2 text-[0.75rem]" data-testid="activity-list">
          {[...undo].reverse().map((u, i) => (
            <li key={`u${i}`} className="flex gap-2 border-b border-soft/60 pb-1.5">
              <span className="mono text-t3">You</span>
              <span className="text-t1">{u.label}</span>
              <span className="ml-auto text-t3">this session</span>
            </li>
          ))}
          {mine.map((v) => (
            <li key={`s${v.id}`} className="flex gap-2 border-b border-soft/60 pb-1.5">
              <span className="mono text-t3">{v.by}</span>
              <span className="text-t1">Saved “{v.label}”</span>
              <span className="ml-auto text-t3">{v.ts ? stamp(v.ts) : ""}</span>
            </li>
          ))}
          {["Imported concept plan v1.0", "Ran compliance pass (FBC 8th Ed.)", "Added stair and L2 partitions", "Foundation revised for soil report"].map((t) => (
            <li key={t} className="flex gap-2 border-b border-soft/60 pb-1.5">
              <span className="mono text-t3">Team</span>
              <span className="text-t1">{t}</span>
              <span className="ml-auto text-t3">earlier</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
