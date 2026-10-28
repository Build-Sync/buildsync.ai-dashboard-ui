/**
 * components/workspace/StartPage.tsx
 *
 * WHAT   The Start tab: New project, Prompt to Plan, recent projects and templates.
 * FOR    The landing document of the workspace (workspace `doc` = "start"). Opening a project navigates to its
 *        route; in /demo the templates open the Start-free dialog because the demo cannot create projects.
 * DEBUG  - A recent project only shows a toast: only ids known to lib/services/projects.ts (isKnownProject) can
 *          be opened.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Icon } from "@/components/icons";
import { RECENT_PROJECTS, TEMPLATES } from "@/lib/mock-data";
import { isKnownProject } from "@/lib/services/projects";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { useRunner } from "./hooks";

/* The Start tab: recent projects, new project and templates. */
export function StartPage() {
  const ws = useWsApi();
  const { run, ctx } = useRunner();
  const mode = useWs((s) => s.mode);

  const open = (id: string, name: string) => {
    if (!isKnownProject(id)) {
      ctx.app.getState().toast(`${name} isn't part of this demo workspace`, "info");
      return;
    }
    ctx.app.getState().openTab(id);
    ws.getState().setDoc("project");
    ctx.router.push(mode === "demo" ? `/demo?project=${id}` : `/app/projects/${id}`);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-viewport" data-testid="start-page">
      <div className="mx-auto max-w-4xl px-8 py-8">
        <h1 className="text-xl font-semibold text-t1">Start</h1>
        <p className="mt-1 text-[0.8125rem] text-t2">Open a recent project, start a new one or begin from a template.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button onClick={() => run("NEW")} className="flex items-center gap-3 rounded-xl border border-dashed border-line p-4 text-left transition-colors hover:border-accent hover:bg-accent/5">
            <span className="grid size-10 place-items-center rounded-lg bg-accent text-on-accent">
              <Icon name="plus" size={20} />
            </span>
            <span>
              <span className="block text-[0.875rem] font-semibold text-t1">New Project</span>
              <span className="block text-[0.75rem] text-t2">Blank model with your default jurisdiction</span>
            </span>
          </button>
          <button onClick={() => run("P2P")} className="flex items-center gap-3 rounded-xl border border-line bg-panel p-4 text-left transition-colors hover:border-accent">
            <span className="grid size-10 place-items-center rounded-lg bg-[#8b6cf0] text-white">
              <Icon name="p2p" size={20} />
            </span>
            <span>
              <span className="block text-[0.875rem] font-semibold text-t1">Prompt to Plan</span>
              <span className="block text-[0.75rem] text-t2">“Affordable 800 sq ft 2-bed 1-bath” becomes a starter plan</span>
            </span>
          </button>
        </div>

        <h2 className="label-xs mb-2 mt-8">Recent Projects</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {RECENT_PROJECTS.map((p) => (
            <button key={p.id} onClick={() => open(p.id, p.name)} className="group overflow-hidden rounded-xl border border-line bg-panel text-left transition-colors hover:border-accent">
              <div className="grid h-24 place-items-center bg-gradient-to-br from-panel-alt to-viewport text-t3 group-hover:text-accent">
                <Icon name="building" size={34} strokeWidth={1.2} />
              </div>
              <div className="px-3 py-2">
                <div className="truncate text-[0.8125rem] font-medium text-t1">{p.name}</div>
                <div className="mono truncate text-[0.625rem] text-t3">
                  {p.jurisdiction} · {p.openedAt}
                </div>
              </div>
            </button>
          ))}
        </div>

        <h2 className="label-xs mb-2 mt-8">Templates</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => (mode === "demo" ? ws.getState().openModal("start-free") : run("NEW"))}
              className="rounded-xl border border-line bg-panel p-3 text-left transition-colors hover:border-accent"
            >
              <Icon name="templates" size={18} className="text-accent" />
              <div className="mt-2 text-[0.75rem] font-medium text-t1">{t.name}</div>
              <div className="mt-0.5 text-[0.6875rem] text-t3">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
