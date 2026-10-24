/**
 * lib/services/agents.ts
 *
 * WHAT   Stub of the agent connection service: testConnection, connectAgent and disconnectAgent validate the
 *        request, wait a short time and return canned results, including a masked key.
 * FOR    Settings → Integrations and the Connect dialog. Security model: the API key goes to the back end once
 *        and is never kept in front-end state or storage; the UI only sees the masked value that comes back.
 *        Replace the bodies with real calls and keep the signatures.
 * DEBUG  - Test or Connect fails with a message: validate() checks the URL scheme (http / https), a required
 *          base URL for MCP or custom endpoints, and an API key of at least 8 characters.
 *        - Latency shown is derived from a hash of the agent id (deterministic mock).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { AGENT_META, MODEL_TIER_LABEL } from "../agents";
import type { AgentId, AgentModelTier, AuthMethod } from "../types";
import { hash, sleep } from "../utils";

/* Agent connection service stub.
 * Security model (spec §11.8): the key goes to the back end once and is never kept in
 * front-end state or local storage. The front end only ever sees the masked value the
 * back end returns. */

/** What the Connect dialog sends: agent, method, URL, key (sent once), tier, scopes. */
export interface ConnectRequest {
  agentId: AgentId;
  method: AuthMethod;
  baseUrl?: string;
  /** Sent once, never stored client-side. */
  apiKey?: string;
  tier: AgentModelTier;
  scopes: string[];
  customName?: string;
}

/** Outcome of testing a connection. */
export interface TestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

function validate(req: ConnectRequest): string | null {
  const meta = AGENT_META[req.agentId];
  if (req.method === "oauth") return null;
  if ((req.method === "mcp" || meta.needsBaseUrl) && !req.baseUrl?.trim()) return "Enter a base URL or endpoint.";
  if (req.baseUrl && !/^https?:\/\//i.test(req.baseUrl.trim())) return "The URL must start with http:// or https://.";
  if (req.method === "api-key" && !meta.keyOptional && !(req.apiKey && req.apiKey.trim().length >= 8)) {
    return "Enter an API key (at least 8 characters).";
  }
  return null;
}

/** Check a connection request without saving it. */
export async function testConnection(req: ConnectRequest): Promise<TestResult> {
  const err = validate(req);
  await sleep(380 + (hash(req.agentId) % 220));
  if (err) return { ok: false, latencyMs: 0, message: err };
  return {
    ok: true,
    latencyMs: 90 + (hash(`${req.agentId}:${req.method}`) % 170),
    message: "Connection verified",
  };
}

/** What the back end returns after connecting: only a masked key, never the key. */
export interface ConnectResult {
  maskedKey?: string;
  model: string;
  method: AuthMethod;
  baseUrl?: string;
}

/** Connect an agent; rejects with a readable message when the request is invalid. */
export async function connectAgent(req: ConnectRequest): Promise<ConnectResult> {
  const err = validate(req);
  await sleep(450);
  if (err) throw new Error(err);
  const meta = AGENT_META[req.agentId];
  let maskedKey: string | undefined;
  if (req.method === "api-key" && req.apiKey) {
    const k = req.apiKey.trim();
    maskedKey = `${meta.keyPrefix || k.slice(0, 3)}••••••••${k.slice(-4)}`;
  } else if (req.method === "oauth") {
    maskedKey = "OAuth session";
  } else if (req.method === "mcp") {
    maskedKey = "MCP endpoint";
  }
  return {
    maskedKey,
    model: MODEL_TIER_LABEL[req.tier],
    method: req.method,
    baseUrl: req.baseUrl?.trim() || meta.baseUrl,
  };
}

/** Disconnect an agent. */
export async function disconnectAgent(agentId: AgentId): Promise<void> {
  await sleep(200 + (hash(agentId) % 100));
}
