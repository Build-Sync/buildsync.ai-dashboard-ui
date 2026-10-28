/**
 * lib/agents.ts
 *
 * WHAT   Static facts about the AI agents the app can connect (Claude, ChatGPT, Kimi, Gemini, a local model, a
 *        custom endpoint): names, vendors, colours, supported connection methods, permission scopes, task
 *        routing defaults, and the list of future integrations.
 * FOR    The Integrations settings page, the agent selector, the Connect dialog and the AI routing service.
 *        initialAgents() gives the starting state (Claude and ChatGPT connected). Colours and letters are
 *        neutral tiles, not vendor logos.
 * DEBUG  - An agent card shows wrong text: edit AGENT_META.
 *        - Tasks go to the wrong agent: DEFAULT_ROUTING is the default; users change it in Settings →
 *          Integrations (settings.routing).
 *        - A new agent id must be added to AGENT_IDS in lib/types.ts, AGENT_META and AGENT_ORDER.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { Agent, AgentId, AuthMethod, TaskKind } from "./types";

/** Fixed description of an agent: name, vendor, colour, letter, connection methods and URL needs. */
export interface AgentMeta {
  id: AgentId;
  name: string;
  vendor: string;
  color: string;
  glyph: string;
  description: string;
  methods: AuthMethod[];
  /** Auth tags shown on the card */
  tags: string[];
  baseUrl?: string;
  /** Base URL is required for this agent regardless of method */
  needsBaseUrl: boolean;
  keyOptional?: boolean;
  keyPrefix: string;
  note?: string;
}

/** Metadata for every agent id. */
export const AGENT_META: Record<AgentId, AgentMeta> = {
  claude: {
    id: "claude",
    name: "Claude",
    vendor: "Anthropic",
    color: "#D97757",
    glyph: "C",
    description: "Careful reasoning for code review, structural explanations and long plan sets.",
    methods: ["api-key", "oauth", "mcp"],
    tags: ["API Key", "OAuth", "MCP"],
    needsBaseUrl: false,
    keyPrefix: "sk-ant-",
    note: "Default Agent",
  },
  chatgpt: {
    id: "chatgpt",
    name: "ChatGPT",
    vendor: "OpenAI",
    color: "#10A37F",
    glyph: "G",
    description: "General-purpose agent, strong at estimating, quantity take-off and summaries.",
    methods: ["api-key", "oauth"],
    tags: ["API Key", "OAuth"],
    needsBaseUrl: false,
    keyPrefix: "sk-",
  },
  kimi: {
    id: "kimi",
    name: "Kimi",
    vendor: "Moonshot AI",
    color: "#3B6BFF",
    glyph: "K",
    description: "Long-context agent for big drawing sets and specification documents.",
    methods: ["api-key", "mcp"],
    tags: ["API Key", "OpenAI-Compatible"],
    baseUrl: "https://api.moonshot.ai/v1",
    needsBaseUrl: true,
    keyPrefix: "sk-",
    note: "OpenAI-Compatible Base URL",
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    vendor: "Google",
    color: "#8B6CF0",
    glyph: "Ge",
    description: "Multimodal agent that reads site photos, survey sheets and scanned plans.",
    methods: ["api-key"],
    tags: ["API Key"],
    needsBaseUrl: false,
    keyPrefix: "AIza",
  },
  local: {
    id: "local",
    name: "Local Model",
    vendor: "Ollama / LM Studio",
    color: "#586274",
    glyph: "L",
    description: "Runs on your machine. Nothing leaves your network. Key optional.",
    methods: ["api-key", "mcp"],
    tags: ["Local URL", "Key Optional"],
    baseUrl: "http://localhost:11434/v1",
    needsBaseUrl: true,
    keyOptional: true,
    keyPrefix: "",
  },
  custom: {
    id: "custom",
    name: "Custom Agent",
    vendor: "Any",
    color: "#C0507A",
    glyph: "+",
    description: "Bring any OpenAI-compatible endpoint or MCP server and give it a name.",
    methods: ["api-key", "mcp"],
    tags: ["Base URL", "MCP"],
    needsBaseUrl: true,
    keyPrefix: "",
    note: "User-Defined Name",
  },
};

/** The order agents are listed in. */
export const AGENT_ORDER: AgentId[] = ["claude", "chatgpt", "kimi", "gemini", "local", "custom"];

/** Display name of each connection method. */
export const METHOD_LABEL: Record<AuthMethod, string> = {
  "api-key": "API Key",
  oauth: "Sign in (OAuth)",
  mcp: "MCP / Endpoint URL",
};

/** Display name of each model tier. */
export const MODEL_TIER_LABEL = { auto: "Auto", fast: "Fast", capable: "Most Capable" } as const;

/** What an agent may do, with the default for each scope. */
export const PERMISSION_SCOPES = [
  { id: "read-model", label: "Read Model & Selection", default: true },
  { id: "run-checks", label: "Run Compliance & Cost Checks", default: true },
  { id: "edit-model", label: "Edit the Model (Always Asks First)", default: false },
  { id: "read-files", label: "Read Attached Survey/Geotech Files", default: false },
] as const;

/** Initial connection state: Claude + ChatGPT connected (spec: "● 2 agents"). */
export function initialAgents(): Agent[] {
  return AGENT_ORDER.map((id) => {
    const m = AGENT_META[id];
    const connected = id === "claude" || id === "chatgpt";
    return {
      id,
      name: m.name,
      vendor: m.vendor,
      connected,
      maskedKey: connected ? (id === "claude" ? "sk-ant-••••••••3f9a" : "sk-••••••••c21d") : undefined,
      model: connected ? "Auto" : undefined,
      baseUrl: m.baseUrl,
      method: connected ? "api-key" : undefined,
      scopes: connected ? ["read-model", "run-checks"] : [],
    };
  });
}

/** Display name of each routable task. */
export const TASK_LABEL: Record<TaskKind, string> = {
  compliance: "Compliance & Code Review",
  cost: "Cost Estimation",
  p2p: "Prompt-to-Plan",
  stress: "Stress-Test Explanations",
  chat: "Command-Line Chat",
};

/** Which agent handles each task by default ("active" = the active agent). */
export const DEFAULT_ROUTING: Record<TaskKind, AgentId | "active"> = {
  compliance: "claude",
  cost: "chatgpt",
  p2p: "claude",
  stress: "chatgpt",
  chat: "active",
};

/** A planned integration shown as "Notify Me". */
export interface OtherIntegration {
  id: string;
  name: string;
  vendor: string;
  description: string;
  glyph: string;
  color: string;
}

/** Phase-2 integrations (spec §11.8 E). */
export const OTHER_INTEGRATIONS: OtherIntegration[] = [
  { id: "civil3d", name: "Autodesk Civil 3D", vendor: "Autodesk", glyph: "C3", color: "#0696D7", description: "Round-trip DWG, surfaces and alignments." },
  { id: "dronedeploy", name: "DroneDeploy", vendor: "DroneDeploy", glyph: "DD", color: "#2D7FF9", description: "Orthomosaics and point clouds as site underlays." },
  { id: "gmaps", name: "Google Maps", vendor: "Google", glyph: "Gm", color: "#34A853", description: "Place the plan on real terrain and imagery." },
  { id: "procore", name: "Procore", vendor: "Procore", glyph: "Pr", color: "#F47E20", description: "Sync RFIs, submittals and daily logs." },
  { id: "bluebeam", name: "Bluebeam", vendor: "Bluebeam", glyph: "Bb", color: "#1A73E8", description: "Markups and permit set review." },
  { id: "tbc", name: "Trimble Business Center", vendor: "Trimble", glyph: "Tb", color: "#005F9E", description: "Precision survey and machine control data." },
  { id: "propeller", name: "Propeller", vendor: "Propeller", glyph: "Pp", color: "#6C5CE7", description: "Drone survey progress and earthwork." },
  { id: "pix4d", name: "Pix4D", vendor: "Pix4D", glyph: "P4", color: "#00A3A1", description: "Photogrammetry and reality capture." },
];
