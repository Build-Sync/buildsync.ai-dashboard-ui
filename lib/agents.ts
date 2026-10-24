import type { Agent, AgentId, AuthMethod, TaskKind } from "./types";

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

export const AGENT_META: Record<AgentId, AgentMeta> = {
  claude: {
    id: "claude",
    name: "Claude",
    vendor: "Anthropic",
    color: "#D97757",
    glyph: "C",
    description: "Careful reasoning for code review, structural explanations and long plan sets.",
    methods: ["api-key", "oauth", "mcp"],
    tags: ["API key", "OAuth", "MCP"],
    needsBaseUrl: false,
    keyPrefix: "sk-ant-",
    note: "Default agent",
  },
  chatgpt: {
    id: "chatgpt",
    name: "ChatGPT",
    vendor: "OpenAI",
    color: "#10A37F",
    glyph: "G",
    description: "General-purpose agent, strong at estimating, quantity take-off and summaries.",
    methods: ["api-key", "oauth"],
    tags: ["API key", "OAuth"],
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
    tags: ["API key", "OpenAI-compatible"],
    baseUrl: "https://api.moonshot.ai/v1",
    needsBaseUrl: true,
    keyPrefix: "sk-",
    note: "OpenAI-compatible base URL",
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    vendor: "Google",
    color: "#8B6CF0",
    glyph: "Ge",
    description: "Multimodal agent that reads site photos, survey sheets and scanned plans.",
    methods: ["api-key"],
    tags: ["API key"],
    needsBaseUrl: false,
    keyPrefix: "AIza",
  },
  local: {
    id: "local",
    name: "Local model",
    vendor: "Ollama / LM Studio",
    color: "#586274",
    glyph: "L",
    description: "Runs on your machine. Nothing leaves your network. Key optional.",
    methods: ["api-key", "mcp"],
    tags: ["Local URL", "Key optional"],
    baseUrl: "http://localhost:11434/v1",
    needsBaseUrl: true,
    keyOptional: true,
    keyPrefix: "",
  },
  custom: {
    id: "custom",
    name: "Custom agent",
    vendor: "Any",
    color: "#C0507A",
    glyph: "+",
    description: "Bring any OpenAI-compatible endpoint or MCP server and give it a name.",
    methods: ["api-key", "mcp"],
    tags: ["Base URL", "MCP"],
    needsBaseUrl: true,
    keyPrefix: "",
    note: "User-defined name",
  },
};

export const AGENT_ORDER: AgentId[] = ["claude", "chatgpt", "kimi", "gemini", "local", "custom"];

export const METHOD_LABEL: Record<AuthMethod, string> = {
  "api-key": "API key",
  oauth: "Sign in (OAuth)",
  mcp: "MCP / endpoint URL",
};

export const MODEL_TIER_LABEL = { auto: "Auto", fast: "Fast", capable: "Most capable" } as const;

export const PERMISSION_SCOPES = [
  { id: "read-model", label: "Read model & selection", default: true },
  { id: "run-checks", label: "Run compliance & cost checks", default: true },
  { id: "edit-model", label: "Edit the model (always asks first)", default: false },
  { id: "read-files", label: "Read attached survey/geotech files", default: false },
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

export const TASK_LABEL: Record<TaskKind, string> = {
  compliance: "Compliance & code review",
  cost: "Cost estimation",
  p2p: "Prompt-to-Plan",
  stress: "Stress-test explanations",
  chat: "Command-line chat",
};

export const DEFAULT_ROUTING: Record<TaskKind, AgentId | "active"> = {
  compliance: "claude",
  cost: "chatgpt",
  p2p: "claude",
  stress: "chatgpt",
  chat: "active",
};

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
