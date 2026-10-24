"use client";

import { AgentLogo } from "@/components/ui/AgentLogo";
import { Menu, type Anchor } from "@/components/ui/Menu";
import { AGENT_META } from "@/lib/agents";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import { useRunner } from "../hooks";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

/* Agent menu: all agents. Connected ones are selectable; disconnected ones are greyed and open Connectors. */
export function AgentMenu({ anchor, onClose }: { anchor: Anchor | null; onClose: () => void }) {
  const app = useAppApi();
  const { ctx } = useRunner();
  const agents = useApp((s) => s.agents);
  const active = useApp((s) => s.activeAgentId);
  return (
    <Menu anchor={anchor} onClose={onClose} label="AI agents" width="17.5rem">
      <div className="label-xs px-3 pb-1 pt-1.5">Active agent</div>
      {agents.map((a) => {
        const meta = AGENT_META[a.id];
        return (
          <button
            key={a.id}
            role="menuitemradio"
            aria-checked={active === a.id}
            onClick={() => {
              onClose();
              if (a.connected) {
                app.getState().setActiveAgent(a.id);
                app.getState().log("ai", `→ ${meta.name} is now the active agent`);
                app.getState().toast(`${meta.name} is now the active agent`, "info");
              } else {
                ctx.router.push(`/settings/integrations/${a.id}`);
              }
            }}
            className={cn("flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-accent/15", !a.connected && "opacity-55")}
          >
            <AgentLogo id={a.id} size={22} />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.75rem] font-medium text-t1">{meta.name}</span>
              <span className="block truncate text-[0.625rem] text-t3">{a.connected ? `${meta.vendor} · ${a.model ?? "Auto"}` : "Not connected · click to connect"}</span>
            </span>
            {active === a.id && a.connected ? <Icon name="check" size={14} className="text-accent" /> : <span className={cn("size-1.5 rounded-full", a.connected ? "bg-ok" : "bg-t3")} />}
          </button>
        );
      })}
      <div className="mt-1 border-t border-soft pt-1">
        <button
          onClick={() => {
            onClose();
            ctx.router.push("/settings/integrations");
          }}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[0.75rem] text-accent hover:bg-accent/15"
        >
          <Icon name="plus" size={13} /> Manage connectors…
        </button>
      </div>
    </Menu>
  );
}
