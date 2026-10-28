/**
 * components/settings/panes/ConnectDialog.tsx
 *
 * WHAT   The Connect / Manage dialog for one AI agent: connection method (API key, OAuth or MCP), base URL
 *        where needed, API key, default model tier, permission scopes, a Test connection button and Connect /
 *        Save / Disconnect.
 * FOR    Opened by the route /settings/integrations/[agentId]. Security: the key is kept only in this
 *        component's local state and cleared as soon as it is sent; it never reaches the store, URL or local
 *        storage.
 * DEBUG  - Connect stays disabled or errors: connectAgent / testConnection in lib/services/agents.ts validate
 *          the request (mock) and return the error text shown here.
 *        - Close must go back to /settings/integrations: close() uses router.replace so history stays short.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { AgentLogo } from "@/components/ui/AgentLogo";
import { Modal } from "@/components/ui/Modal";
import { Checkbox, Segmented, Spinner } from "@/components/ui/controls";
import { AGENT_META, METHOD_LABEL, MODEL_TIER_LABEL, PERMISSION_SCOPES } from "@/lib/agents";
import { connectAgent, disconnectAgent, testConnection, type ConnectRequest, type TestResult } from "@/lib/services/agents";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import type { AgentId, AgentModelTier, AuthMethod } from "@/lib/types";

/* Connect / Manage dialog — /settings/integrations/[agentId] (spec §11.8 B).
 * Security: the key lives only in this component's local state and is cleared the moment it is sent. */
export function ConnectDialog({ agentId }: { agentId: AgentId }) {
  const router = useRouter();
  const app = useAppApi();
  const meta = AGENT_META[agentId];
  const agent = useApp((s) => s.agents.find((a) => a.id === agentId))!;
  const managing = agent.connected;

  const [method, setMethod] = useState<AuthMethod>(agent.method ?? meta.methods[0]);
  const [baseUrl, setBaseUrl] = useState(agent.baseUrl ?? meta.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [replaceKey, setReplaceKey] = useState(!managing);
  const [tier, setTier] = useState<AgentModelTier>(agent.model === "Fast" ? "fast" : agent.model === "Most Capable" ? "capable" : "auto");
  const [scopes, setScopes] = useState<string[]>(agent.scopes.length ? agent.scopes : PERMISSION_SCOPES.filter((p) => p.default).map((p) => p.id));
  const [name, setName] = useState(agentId === "custom" && managing ? agent.name : "");
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showUrl = meta.needsBaseUrl || method === "mcp";
  const showKey = method === "api-key";
  const close = () => router.replace("/settings/integrations");

  const req = useMemo<ConnectRequest>(
    () => ({ agentId, method, baseUrl: showUrl ? baseUrl : undefined, apiKey: showKey && replaceKey ? apiKey : managing ? "existing-key" : undefined, tier, scopes, customName: name }),
    [agentId, method, baseUrl, showUrl, showKey, replaceKey, apiKey, managing, tier, scopes, name],
  );

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    setError(null);
    setTest(await testConnection(req));
    setTesting(false);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await connectAgent(req);
      setApiKey(""); // the key is never kept in front-end state
      app.getState().connectAgent(agentId, { maskedKey: managing && !replaceKey ? agent.maskedKey : res.maskedKey, model: res.model, method: res.method, baseUrl: res.baseUrl, scopes, name: agentId === "custom" ? name : undefined });
      const label = agentId === "custom" && name.trim() ? name.trim() : meta.name;
      app.getState().toast(managing ? `${label} updated` : `${label} connected`);
      app.getState().log("ok", `✓ ${label} ${managing ? "settings saved" : "connected"} (${METHOD_LABEL[res.method]}, ${res.model})`);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect.");
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    await disconnectAgent(agentId);
    app.getState().disconnectAgent(agentId);
    app.getState().toast(`${meta.name} disconnected`, "info");
    app.getState().log("warn", `⚠ ${meta.name} disconnected`);
    close();
  };

  return (
    <Modal
      title={managing ? `Manage ${agent.name}` : `Connect ${meta.name}`}
      subtitle={`${meta.vendor} · agents receive the model context you allow and can only propose changes.`}
      onClose={close}
      z={80}
      width="34rem"
      footer={
        <>
          {managing && (
            <button className="btn btn-danger mr-auto" onClick={disconnect} disabled={busy}>
              Disconnect
            </button>
          )}
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy} data-testid="connect-submit">
            {busy && <Spinner size={13} />} {managing ? "Save Changes" : "Connect"}
          </button>
        </>
      }
    >
      <div className="space-y-4" data-testid="connect-dialog">
        <div className="flex items-center gap-3">
          <AgentLogo id={agentId} size={40} />
          <div>
            <div className="text-[0.9375rem] font-semibold text-t1">{meta.name}</div>
            <p className="text-[0.75rem] text-t2">{meta.description}</p>
          </div>
        </div>

        {agentId === "custom" && (
          <label className="block">
            <span className="label-xs">Agent Name</span>
            <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Firm assistant" />
          </label>
        )}

        <div>
          <span className="label-xs">Connection Method</span>
          <div className="mt-1.5">
            <Segmented<AuthMethod> label="Connection Method" value={method} onChange={(m) => { setMethod(m); setTest(null); }} options={(["api-key", "oauth", "mcp"] as AuthMethod[]).map((m) => ({ value: m, label: m === "api-key" ? "API Key" : m === "oauth" ? "Sign in (OAuth)" : "MCP / Endpoint URL", disabled: !meta.methods.includes(m) }))} />
          </div>
        </div>

        {showUrl && (
          <label className="block">
            <span className="label-xs">Base URL</span>
            <input className="input mono mt-1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={meta.baseUrl ?? "https://…"} aria-label="Base URL" />
            {meta.baseUrl && <span className="mt-1 block text-[0.6875rem] text-t3">Prefilled for {meta.name}. Change it only if you use a proxy.</span>}
          </label>
        )}

        {showKey && (
          <div>
            <label htmlFor="api-key" className="label-xs">
              API Key{meta.keyOptional ? " (optional)" : ""}
            </label>
            {managing && !replaceKey ? (
              <div className="mt-1 flex items-center gap-2">
                <input id="api-key" className="input mono" value={agent.maskedKey ?? ""} readOnly aria-label="Stored Key (Masked)" />
                <button className="btn shrink-0" onClick={() => setReplaceKey(true)}>
                  Replace
                </button>
              </div>
            ) : (
              <input id="api-key" type="password" autoComplete="off" className="input mono mt-1" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={meta.keyPrefix ? `${meta.keyPrefix}…` : "Paste key"} />
            )}
            <p className="mt-1 flex items-center gap-1.5 text-[0.6875rem] text-t3">
              <Icon name="lock" size={11} /> Stored encrypted, never shown again. BuildSync only displays a masked value.
            </p>
          </div>
        )}

        {method === "oauth" && <p className="rounded-md bg-t1/5 px-3 py-2 text-[0.75rem] text-t2">You&apos;ll be sent to {meta.vendor} to sign in and approve access. (Mocked here: no redirect happens.)</p>}

        <div>
          <span className="label-xs">Default Model</span>
          <div className="mt-1.5">
            <Segmented<AgentModelTier> label="Default Model" value={tier} onChange={setTier} options={[{ value: "auto", label: `${MODEL_TIER_LABEL.auto} (recommended)` }, { value: "fast", label: MODEL_TIER_LABEL.fast }, { value: "capable", label: MODEL_TIER_LABEL.capable }]} />
          </div>
        </div>

        <fieldset>
          <legend className="label-xs mb-1.5">Permissions</legend>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {PERMISSION_SCOPES.map((p) => (
              <Checkbox key={p.id} label={p.label} checked={scopes.includes(p.id)} onChange={(v) => setScopes((l) => (v ? [...l, p.id] : l.filter((x) => x !== p.id)))} />
            ))}
          </div>
        </fieldset>

        <div>
          <button className="btn" onClick={runTest} disabled={testing} data-testid="test-connection">
            {testing ? <Spinner size={13} /> : <Icon name="webhook" size={13} />} Test Connection
          </button>
          {test && (
            <div role="status" className={`anim-fade mt-2 flex items-center gap-2 rounded-md border px-3 py-2 text-[0.75rem] ${test.ok ? "border-ok/40 bg-ok/10 text-ok" : "border-bad/40 bg-bad/10 text-bad"}`} data-testid="test-result">
              <Icon name={test.ok ? "ok" : "fail"} size={14} />
              {test.ok ? `✓ Connection verified — latency ${test.latencyMs} ms` : test.message}
            </div>
          )}
          {error && (
            <p role="alert" className="mt-2 text-[0.75rem] text-bad">
              {error}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
