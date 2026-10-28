/**
 * components/settings/panes/AiSettings.tsx
 *
 * WHAT   Settings → AI Settings: default agent (only connected agents are offered), the locked "always preview
 *        changes" switch, share model context, send project files, response detail, cite code sections, and
 *        Clear AI history with a two-step confirmation.
 * FOR    The `settings.ai` values and the command-line history held in the app store.
 * DEBUG  - The default-agent list is empty: no agent is connected; connect one on the Integrations page.
 *        - Clear history is disabled: the command-line history is already empty.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useState } from "react";
import { AgentLogo } from "@/components/ui/AgentLogo";
import { Select, Switch } from "@/components/ui/controls";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import type { AgentId } from "@/lib/types";
import { Row, useDraft } from "../rows";

/** The Settings → AI Settings pane. */
export function AiSettingsPane() {
  const { s, set } = useDraft();
  const app = useAppApi();
  const agents = useApp((st) => st.agents);
  const history = useApp((st) => st.history.length);
  const connected = agents.filter((a) => a.connected);
  const [confirm, setConfirm] = useState(false);
  const a = s.ai;
  return (
    <div data-testid="pane-ai">
      <Row label="Default Agent" help="Answers command-line questions unless a task is routed elsewhere. Only connected agents are listed.">
        <div className="flex items-center gap-2.5">
          {connected.find((x) => x.id === a.defaultAgent) && <AgentLogo id={a.defaultAgent} size={22} />}
          <Select<AgentId> label="Default Agent" className="!min-w-[11rem]" value={connected.some((x) => x.id === a.defaultAgent) ? a.defaultAgent : (connected[0]?.id ?? "claude")} disabled={!connected.length} onChange={(v) => set((d) => (d.ai.defaultAgent = v))} options={connected.length ? connected.map((x) => ({ value: x.id, label: x.name })) : [{ value: "claude", label: "No Agent Connected" }]} />
        </div>
      </Row>
      <Row label="Always Preview Changes" help="Agents never edit the model without your approval. Every proposal shows a preview diff first.">
        <Switch label="Always Preview Changes" checked locked onChange={() => {}} />
      </Row>
      <Row label="Share Model Context" help="Send the selection, level, view and jurisdiction with each prompt so answers are specific.">
        <Switch label="Share Model Context" checked={a.shareContext} onChange={(v) => set((d) => (d.ai.shareContext = v))} />
      </Row>
      <Row label="Send Project Files to Agents" help="Off keeps drawings and survey data on BuildSync. Agents then only see structured model context.">
        <Switch label="Send Project Files to Agents" checked={a.sendFiles} onChange={(v) => set((d) => (d.ai.sendFiles = v))} />
      </Row>
      <Row label="Response Detail" help="Show all calculations is best for review; Concise is best for quick questions.">
        <Select<"concise" | "standard" | "full"> label="Response Detail" value={a.detail} onChange={(v) => set((d) => (d.ai.detail = v))} options={[{ value: "concise", label: "Concise" }, { value: "standard", label: "Standard" }, { value: "full", label: "Show All Calculations" }]} />
      </Row>
      <Row label="Cite Code Sections" help="Add the code section and edition to compliance answers.">
        <Switch label="Cite Code Sections" checked={a.citeCode} onChange={(v) => set((d) => (d.ai.citeCode = v))} />
      </Row>
      <Row label="Clear AI History" help={`${history} line${history === 1 ? "" : "s"} in the command-line log. This can't be undone.`}>
        {confirm ? (
          <div className="flex items-center gap-2">
            <span className="text-[0.75rem] text-t2">Clear everything?</span>
            <button className="btn" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                app.getState().clearHistory();
                app.getState().toast("AI history cleared");
                setConfirm(false);
              }}
            >
              Clear
            </button>
          </div>
        ) : (
          <button className="btn btn-danger" disabled={!history} onClick={() => setConfirm(true)}>
            Clear History
          </button>
        )}
      </Row>
    </div>
  );
}
