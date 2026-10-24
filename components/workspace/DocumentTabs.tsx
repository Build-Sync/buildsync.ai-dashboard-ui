"use client";

import { Icon } from "@/components/icons";
import { tip } from "@/components/ui/Tooltip";
import { projectLabel } from "@/lib/services/projects";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";
import { useRunner } from "./hooks";

/* Document tabs (28px): Start · one tab per open project (orange ● = unsaved, × closes,
 * middle-click closes) · + new project. */
export function DocumentTabs() {
  const ws = useWsApi();
  const appApi = useAppApi();
  const { run, ctx } = useRunner();
  const tabs = useApp((s) => s.tabs);
  const dirtyMap = useApp((s) => s.dirty);
  const mode = useWs((s) => s.mode);
  const projectId = useWs((s) => s.project.id);
  const doc = useWs((s) => s.doc);
  const dirtyHere = useWs((s) => s.dirty);

  const hrefFor = (id: string) => (mode === "demo" ? `/demo?project=${id}` : `/app/projects/${id}`);
  const go = (id: string) => {
    if (id === projectId) {
      ws.getState().setDoc("project");
      return;
    }
    ctx.router.push(hrefFor(id));
  };

  const close = (id: string) => {
    if (mode === "demo" && tabs.length <= 1) return;
    const next = appApi.getState().closeTab(id);
    if (id === projectId) {
      if (next) ctx.router.push(hrefFor(next));
      else ctx.router.push(mode === "demo" ? "/demo?doc=start" : "/app");
    }
  };

  return (
    <div role="tablist" aria-label="Open documents" className="flex h-[var(--h-doctabs)] shrink-0 items-end gap-px border-b border-line bg-app pl-1" data-testid="doc-tabs">
      <button
        role="tab"
        aria-selected={doc === "start"}
        onClick={() => ws.getState().setDoc("start")}
        className={cn("flex h-6 items-center gap-1.5 rounded-t-md px-3 text-[0.75rem] transition-colors", doc === "start" ? "bg-viewport font-semibold text-t1 shadow-[inset_0_2px_0_var(--accent)]" : "text-t2 hover:bg-t1/10 hover:text-t1")}
        {...tip("Start", "Recent projects, new project and templates", "OPEN")}
      >
        <Icon name="roof" size={13} />
        Start
      </button>
      {tabs.map((id) => {
        const active = id === projectId && doc === "project";
        const dirty = id === projectId ? dirtyHere : !!dirtyMap[id];
        const label = projectLabel(id);
        return (
          <div
            key={id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            onClick={() => go(id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go(id)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                close(id);
              }
            }}
            className={cn("group flex h-6 max-w-[13rem] cursor-pointer items-center gap-1.5 rounded-t-md pl-3 pr-1 text-[0.75rem] transition-colors", active ? "bg-viewport font-semibold text-t1 shadow-[inset_0_2px_0_var(--accent)]" : "text-t2 hover:bg-t1/10 hover:text-t1")}
            {...tip(label.fileName, dirty ? "Unsaved changes" : "Click to switch, middle-click to close", "CLOSE")}
          >
            <span className="truncate">{label.name}</span>
            {dirty && <span className="size-1.5 shrink-0 rounded-full bg-warn" aria-label="Unsaved changes" />}
            <button
              aria-label={`Close ${label.name}`}
              onClick={(e) => {
                e.stopPropagation();
                close(id);
              }}
              className="grid size-4 place-items-center rounded text-t3 opacity-70 hover:bg-t1/15 hover:text-t1 group-hover:opacity-100"
            >
              <Icon name="close" size={11} />
            </button>
          </div>
        );
      })}
      <button
        aria-label="New project"
        onClick={() => run("NEW")}
        className="mb-px grid size-5 place-items-center rounded text-t2 hover:bg-t1/10 hover:text-t1"
        {...tip("New project", "Create a new project tab", "NEW")}
      >
        <Icon name="plus" size={13} />
      </button>
    </div>
  );
}
