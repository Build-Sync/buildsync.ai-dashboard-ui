/**
 * components/settings/panes/Integrations.tsx
 *
 * WHAT   Settings → Integrations / Connectors: cards for each AI agent (Connect, Manage, Disconnect), a table
 *        routing task kinds to agents, the MCP-server switch with its copyable URL, and a "notify me" list of
 *        future integrations. When the URL has an agent id (/settings/integrations/<agent>) it also shows the
 *        ConnectDialog.
 * FOR    `agents` and `activeAgentId` in the app store, `settings.routing` and `settings.mcp`. Connecting and
 *        disconnecting go through lib/services/agents.ts (mock).
 * DEBUG  - The Connect dialog does not open: it is driven by the URL segment; open() uses router.replace so one
 *          Close suffices.
 *        - MCP URL shows the demo project: it uses the last project from the bs_last_project cookie, else the
 *          Miami residence.
 *        - A route says "Falls back to active agent": the chosen agent is not connected.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { AgentLogo } from "@/components/ui/AgentLogo";
import { Pill, Select, Spinner, Switch } from "@/components/ui/controls";
import { AGENT_META, AGENT_ORDER, OTHER_INTEGRATIONS, TASK_LABEL } from "@/lib/agents";
import { disconnectAgent } from "@/lib/services/agents";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import type { Agent, AgentId, TaskKind } from "@/lib/types";
import { Group, Hint, useDraft } from "../rows";
import { ConnectDialog } from "./ConnectDialog";

/* Integrations / Connectors (spec §11.8): A agent cards · B connect dialog (route) · C routing · D MCP · E other integrations. */

const TASKS = Object.keys(TASK_LABEL) as TaskKind[];

const subscribeNever = () => () => {};

function lastProjectSlug(): string {
  try {
    const m = /(?:^|; )bs_last_project=([^;]+)/.exec(document.cookie);
    if (m) return decodeURIComponent(m[1]);
  } catch {
    /* no cookies */
  }
  return "residence-2br-miami";
}

/** The Settings → Integrations pane; `agentId` opens that agent's Connect / Manage dialog. */
export function IntegrationsPane({ agentId }: { agentId?: AgentId }) {
  const router = useRouter();
  const app = useAppApi();
  const agents = useApp((s) => s.agents);
  const active = useApp((s) => s.activeAgentId);
  const { s, set } = useDraft();
  const [busy, setBusy] = useState<AgentId | null>(null);
  const slug = useSyncExternalStore(subscribeNever, lastProjectSlug, () => "residence-2br-miami");
  const [notify, setNotify] = useState<string[]>([]);
  const connected = agents.filter((a) => a.connected);
  const mcpUrl = `https://mcp.buildsync.ai/p/${slug}`;

  const open = (id: AgentId) => router.replace(`/settings/integrations/${id}`);

  const disconnect = async (a: Agent) => {
    setBusy(a.id);
    await disconnectAgent(a.id);
    app.getState().disconnectAgent(a.id);
    app.getState().toast(`${AGENT_META[a.id].name} disconnected`, "info");
    app.getState().log("warn", `⚠ ${AGENT_META[a.id].name} disconnected`);
    setBusy(null);
  };

  return (
    <div data-testid="pane-integrations">
      <p className="mb-5 max-w-3xl rounded-lg border border-line bg-panel-alt px-4 py-3 text-[0.8125rem] leading-relaxed text-t2">
        Connect external AI agents to BuildSync. Agents receive the model context you allow and can only <b className="text-t1">propose</b> changes. Every edit is previewed and needs your approval. Engineering output stays advisory until a licensed PE signs off.
      </p>

      <Group title="AI Agents" aside={<span className="text-[0.6875rem] text-t3">{connected.length} connected</span>}>
        <ul className="grid gap-3 md:grid-cols-2" data-testid="agent-grid">
          {AGENT_ORDER.map((id) => {
            const a = agents.find((x) => x.id === id)!;
            const m = AGENT_META[id];
            return (
              <li key={id} className="flex flex-col rounded-xl border border-line bg-panel-alt p-3.5" data-agent={id} data-connected={a.connected}>
                <div className="flex items-start gap-3">
                  <AgentLogo id={id} size={36} name={a.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-[0.875rem] font-semibold text-t1">{a.name}</h4>
                      {active === id && a.connected && <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-accent">Active</span>}
                    </div>
                    <div className="text-[0.6875rem] text-t3">{m.vendor}</div>
                  </div>
                  <Pill tone={a.connected ? "ok" : "neutral"} className="shrink-0">
                    <span className="size-1.5 rounded-full bg-current" /> {a.connected ? "Connected" : "Not Connected"}
                  </Pill>
                </div>
                <p className="mt-2.5 text-[0.75rem] leading-snug text-t2">{m.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.tags.map((t) => (
                    <span key={t} className="mono rounded border border-line px-1.5 py-px text-[0.625rem] text-t2">
                      {t}
                    </span>
                  ))}
                  {m.note && <span className="rounded border border-accent/40 px-1.5 py-px text-[0.625rem] text-accent">{m.note}</span>}
                </div>
                <div className="mt-3 flex flex-1 items-end gap-2 border-t border-soft pt-3">
                  {a.connected ? (
                    <>
                      <div className="mono min-w-0 flex-1 text-[0.6875rem] text-t2">
                        <div className="truncate">{a.maskedKey}</div>
                        <div className="text-t3">{a.model ?? "Auto"}</div>
                      </div>
                      <button className="btn" onClick={() => open(id)}>
                        Manage
                      </button>
                      <button className="btn btn-danger" disabled={busy === id} onClick={() => void disconnect(a)} aria-label={`Disconnect ${a.name}`}>
                        {busy === id && <Spinner size={12} />} Disconnect
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-primary ml-auto" onClick={() => open(id)} data-testid={`connect-${id}`}>
                      Connect
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Group>

      <Group title="Route Tasks to Agents">
        <div className="overflow-hidden rounded-lg border border-line" data-testid="routing-table">
          <table className="w-full text-[0.8125rem]">
            <thead className="bg-panel-alt">
              <tr className="label-xs text-left">
                <th className="px-4 py-2 font-semibold">Task</th>
                <th className="px-4 py-2 font-semibold">Agent</th>
              </tr>
            </thead>
            <tbody>
              {TASKS.map((t) => {
                const val = s.routing[t];
                const offline = val !== "active" && !agents.find((a) => a.id === val)?.connected;
                return (
                  <tr key={t} className="border-t border-soft">
                    <td className="px-4 py-2.5 text-t1">{TASK_LABEL[t]}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2.5">
                        <Select<AgentId | "active"> label={`Agent for ${TASK_LABEL[t]}`} className="!min-w-[11rem]" value={val} onChange={(v) => set((d) => (d.routing[t] = v))} options={[{ value: "active", label: "Active Agent" }, ...AGENT_ORDER.map((id) => ({ value: id as AgentId | "active", label: AGENT_META[id].name + (agents.find((a) => a.id === id)?.connected ? "" : " (Not Connected)") }))]} />
                        {offline && <Pill tone="warn">Falls back to active agent</Pill>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Group>

      <Group title="Use BuildSync from your own agent (MCP server)">
        <div className="rounded-xl border border-line bg-panel-alt p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[0.8125rem] font-medium text-t1">Expose This Project as an MCP Server</div>
              <p className="mt-0.5 text-[0.75rem] text-t3">Lets Claude, ChatGPT or Kimi read the model, run checks and propose edits from their own app.</p>
            </div>
            <Switch label="Expose This Project as an MCP Server" checked={s.mcp.enabled} onChange={(v) => set((d) => (d.mcp.enabled = v))} />
          </div>
          <div className={`mt-3 flex gap-2 transition-opacity ${s.mcp.enabled ? "" : "opacity-45"}`}>
            <input readOnly className="input mono" value={mcpUrl} aria-label="MCP Server URL" data-testid="mcp-url" />
            <button
              className="btn shrink-0"
              disabled={!s.mcp.enabled}
              onClick={() => {
                void navigator.clipboard?.writeText(mcpUrl).catch(() => {});
                app.getState().toast("MCP URL copied");
              }}
            >
              <Icon name="copy" size={13} /> Copy
            </button>
          </div>
          {!s.mcp.enabled && <p className="mt-1.5 text-[0.6875rem] text-t3">Turn the switch on, then press Apply to publish the endpoint.</p>}
        </div>
      </Group>

      <Group title="Other Integrations" aside={<Pill tone="neutral">Phase 2</Pill>}>
        <ul className="grid gap-3 md:grid-cols-2">
          {OTHER_INTEGRATIONS.map((o) => (
            <li key={o.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel-alt p-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg text-[0.75rem] font-bold text-white" style={{ background: o.color }} aria-hidden="true">
                {o.glyph}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.8125rem] font-medium text-t1">{o.name}</div>
                <div className="truncate text-[0.6875rem] text-t3">{o.description}</div>
              </div>
              <button
                className="btn !h-6 shrink-0 px-2.5 text-[0.6875rem]"
                disabled={notify.includes(o.id)}
                onClick={() => {
                  setNotify((l) => [...l, o.id]);
                  app.getState().toast(`We'll let you know when ${o.name} is ready`, "info");
                }}
              >
                {notify.includes(o.id) ? "On the List" : "Notify Me"}
              </button>
            </li>
          ))}
        </ul>
      </Group>

      <Hint>Security: keys are sent once to the back end and never kept in front-end state or local storage. This build simulates that flow.</Hint>

      {agentId && <ConnectDialog key={agentId} agentId={agentId} />}
    </div>
  );
}
