/**
 * components/workspace/Palettes/Issues.tsx
 *
 * WHAT   The Issues palette: add an issue (pinned to the selected element), filter by status, and for each
 *        issue the severity, title, location, assignee, status selector and due date.
 * FOR    Tracking problems to resolution (project.issues). Clicking an issue zooms to its element; due dates
 *        follow Settings → Units → Date format.
 * DEBUG  - Zoom does nothing: the issue has no elementId.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useState } from "react";
import { EmptyState, Pill, Select } from "@/components/ui/controls";
import { fmtDate } from "@/lib/utils";
import { useApp } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import type { IssueStatus, Severity } from "@/lib/types";

const SEV_TONE: Record<Severity, "bad" | "warn" | "info" | "neutral"> = { critical: "bad", high: "bad", medium: "warn", low: "neutral" };

/* Issues: severity pill, title, location, assignee, status, due date, resolution. Click to zoom to the element. */
export function Issues() {
  const ws = useWsApi();
  const issues = useWs((s) => s.project.issues);
  const selection = useWs((s) => s.selection);
  const dateFormat = useApp((s) => s.settings.units.dateFormat);
  const [filter, setFilter] = useState<"all" | IssueStatus>("all");
  const [title, setTitle] = useState("");
  const shown = issues.filter((i) => filter === "all" || i.status === filter);
  const counts = { open: issues.filter((i) => i.status === "open").length, "in-progress": issues.filter((i) => i.status === "in-progress").length, resolved: issues.filter((i) => i.status === "resolved").length };

  return (
    <div data-testid="palette-issues">
      <div className="border-b border-soft p-2.5">
        <div className="flex gap-1.5">
          <input aria-label="New issue title" className="input" placeholder={selection[0] ? `New issue on ${selection[0]}…` : "New issue…"} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) { ws.getState().addIssue(title.trim(), selection[0]); setTitle(""); } }} />
          <button className="btn btn-primary h-7 px-2.5 text-[0.6875rem]" disabled={!title.trim()} onClick={() => { ws.getState().addIssue(title.trim(), selection[0]); setTitle(""); }}>
            Add
          </button>
        </div>
        <div className="mt-2 flex gap-1 text-[0.6875rem]">
          {(["all", "open", "in-progress", "resolved"] as const).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-full border px-2 py-0.5 capitalize transition-colors ${filter === f ? "border-accent bg-accent/15 text-t1" : "border-line text-t2 hover:text-t1"}`}>
              {f === "all" ? `All ${issues.length}` : `${f.replace("-", " ")} ${counts[f]}`}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <EmptyState icon="issue" title="No issues here" hint="Issues you create are pinned to model elements and tracked to resolution." />
      ) : (
        <ul>
          {shown.map((i) => (
            <li key={i.id} className="border-b border-soft/70 px-2.5 py-2.5">
              <button className="block w-full text-left" onClick={() => i.elementId && ws.getState().focusElements([i.elementId])} title={i.elementId ? "Zoom to element" : undefined}>
                <div className="flex items-center gap-1.5">
                  <Pill tone={SEV_TONE[i.severity]} className="uppercase">
                    {i.severity}
                  </Pill>
                  <span className="mono text-[0.625rem] text-t3">{i.id}</span>
                </div>
                <div className="mt-1 text-[0.75rem] font-medium leading-snug text-t1">{i.title}</div>
                <div className="mt-0.5 text-[0.6875rem] text-t3">{i.location}</div>
              </button>
              <div className="mt-2 flex items-center gap-2 text-[0.6875rem] text-t2">
                <span className="flex-1 truncate">
                  {i.assignee} · due <span className="mono">{fmtDate(i.due, dateFormat)}</span>
                </span>
                <Select<IssueStatus>
                  label={`Status of ${i.id}`}
                  className="!h-6 !min-w-[6.5rem] !px-1.5 !text-[0.6875rem]"
                  value={i.status}
                  onChange={(v) => ws.getState().setIssueStatus(i.id, v)}
                  options={[
                    { value: "open", label: "Open" },
                    { value: "in-progress", label: "In progress" },
                    { value: "resolved", label: "Resolved" },
                  ]}
                />
              </div>
              {i.status === "resolved" && i.resolution && <p className="mt-1.5 rounded bg-ok/10 px-2 py-1 text-[0.6875rem] text-ok">Resolution: {i.resolution}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
