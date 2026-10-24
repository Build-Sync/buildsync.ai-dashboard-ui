/* Domain types for the BuildSync AI workspace (spec §14, extended). */

/* ── URL-mirrored workspace state ─────────────────────────────────────── */
export const RIBBON_TAB_IDS = [
  "home",
  "insert",
  "annotate",
  "analyze",
  "collaborate",
  "ai",
  "view",
  "manage",
] as const;
export type RibbonTabId = (typeof RIBBON_TAB_IDS)[number];

export const PALETTE_IDS = [
  "properties",
  "health",
  "compliance",
  "cost",
  "comments",
  "issues",
  "simulation",
  "stress-test",
  "clash",
  "ai-analysis",
  "council",
] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

export const EXPLORER_IDS = ["model", "layers", "levels", "library"] as const;
export type ExplorerId = (typeof EXPLORER_IDS)[number];

export const VIEW_MODES = ["3d", "2d"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const VISUAL_STYLES = ["wireframe", "shaded", "realistic", "xray"] as const;
export type VisualStyle = (typeof VISUAL_STYLES)[number];

/* ── agents ───────────────────────────────────────────────────────────── */
export const AGENT_IDS = ["claude", "chatgpt", "kimi", "gemini", "local", "custom"] as const;
export type AgentId = (typeof AGENT_IDS)[number];
export type AuthMethod = "api-key" | "oauth" | "mcp";
export type AgentModelTier = "auto" | "fast" | "capable";

export interface Agent {
  id: AgentId;
  name: string;
  vendor: string;
  connected: boolean;
  /** Only ever a masked value returned by the (mock) back end. */
  maskedKey?: string;
  model?: string;
  baseUrl?: string;
  method?: AuthMethod;
  scopes: string[];
}

export type TaskKind = "compliance" | "cost" | "p2p" | "stress" | "chat";

/* ── seats ────────────────────────────────────────────────────────────── */
export type Seat = "student" | "engineer" | "government";

/* ── project data ─────────────────────────────────────────────────────── */
export interface Jurisdiction {
  name: string;
  codeSet: string;
}

export interface Level {
  id: string;
  name: string;
  /** elevation in feet relative to Level 1 */
  elevation: number;
  label: string;
}

export const LAYER_IDS = [
  "topography",
  "site",
  "foundation",
  "walls",
  "roof",
  "electrical",
  "plumbing",
  "hvac",
  "fire",
  "interior",
  "landscape",
  "furniture",
  "callouts",
] as const;
export type LayerId = (typeof LAYER_IDS)[number];

export interface Layer {
  id: LayerId;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
}

export type CheckStatus = "pass" | "review" | "fail";

export interface CodeCheck {
  id: string;
  group: "Structural" | "Egress & Accessibility" | "Energy" | "Fire";
  rule: string;
  section: string;
  status: CheckStatus;
  elements: string[];
  /** Suggested fix shown when a check does not pass. */
  fix?: string;
  /** Requires licensed PE review (life-safety / load-bearing). */
  peReview?: boolean;
}

export type Severity = "critical" | "high" | "medium" | "low";
export type IssueStatus = "open" | "in-progress" | "resolved";

export interface Issue {
  id: string;
  severity: Severity;
  title: string;
  location: string;
  elementId?: string;
  assignee: string;
  status: IssueStatus;
  due: string;
  resolution?: string;
}

export interface Clash {
  id: string;
  kind: "HARD" | "SOFT";
  a: string;
  b: string;
  level: string;
  fix: string;
  elementIds: string[];
}

export interface CommentReply {
  id: string;
  author: string;
  text: string;
  at: string;
}

export interface Comment {
  id: string;
  author: string;
  text: string;
  at: string;
  resolved: boolean;
  elementId?: string;
  replies: CommentReply[];
  attachments: string[];
  history: string[];
}

export interface Task {
  name: string;
  start: string;
  end: string;
  trade: string;
  /** hard-cost share of this task, USD */
  cost?: number;
  crew?: number;
  materials?: { name: string; qty: number; unit: string }[];
}

export interface Phase {
  name: string;
  start: string;
  end: string;
  /** scene build-state key; see lib/scene */
  key?: string;
  tasks: Task[];
}

export type StageStatus = "done" | "active" | "upcoming";
export interface Stage {
  name: string;
  status: StageStatus;
  percent: number;
  openTasks: number;
  openIssues: number;
  approvals: number;
}

export interface CostModel {
  total: number;
  range: number;
  hard: number;
  soft: number;
  land: number;
  basis: string;
  materials: { name: string; cost: number }[];
  workforce: { trade: string; headcount: number; months: number }[];
}

export type HealthRange = "all" | "30d" | "version";
export interface HealthSnapshot {
  score: number;
  delta: number;
  compliance: number;
  structural: number;
  cost: number;
  schedule: number;
}
export interface HealthModel extends HealthSnapshot {
  summary: string;
  ranges: Record<HealthRange, HealthSnapshot>;
}

export type SceneKind = "residence" | "clinic" | "blank";

export interface Project {
  id: string;
  name: string;
  fileName: string;
  jurisdiction: Jurisdiction;
  address: string;
  client: string;
  architect: string;
  engineer: string;
  sceneKind: SceneKind;
  levels: Level[];
  layers: Layer[];
  issues: Issue[];
  clashes: Clash[];
  checks: CodeCheck[];
  cost: CostModel;
  schedule: Phase[];
  stages: Stage[];
  health: HealthModel;
  comments: Comment[];
  /** ISO date construction begins; the schedule's day 0 */
  startDate: string;
  versions: { id: string; label: string; at: string; by: string }[];
}

export interface RecentProject {
  id: string;
  name: string;
  jurisdiction: string;
  openedAt: string;
}

/* ── timeline window ──────────────────────────────────────────────────── */
export type TimelinePreset = "1mo" | "3mo" | "6mo" | "full" | "custom";
export interface TimelineWindow {
  preset: TimelinePreset;
  /** day offsets from project start; [from, to] */
  from: number;
  to: number;
}

/* ── command line ─────────────────────────────────────────────────────── */
export type HistoryKind = "cmd" | "ok" | "ai" | "warn" | "info";
export interface HistoryLine {
  id: string;
  kind: HistoryKind;
  text: string;
}

export interface Proposal {
  id: string;
  agentId: AgentId;
  title: string;
  /** preview diff rows */
  changes: { target: string; from: string; to: string }[];
  costDelta?: number;
  elementIds: string[];
  /** effect applied on Accept */
  effect: "walls-concrete" | "steel-frame" | "add-beam" | "generic";
}

/* ── members / permissions ────────────────────────────────────────────── */
export type Role = "owner" | "engineer" | "pe-reviewer" | "contributor" | "viewer";
export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  license?: string;
  jurisdiction?: string;
}

/* ── toasts ───────────────────────────────────────────────────────────── */
export interface Toast {
  id: string;
  text: string;
  tone: "ok" | "info" | "warn" | "bad";
}
