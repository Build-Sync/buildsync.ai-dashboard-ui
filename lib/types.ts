/**
 * lib/types.ts
 *
 * WHAT   The domain types shared by the whole app: ids of ribbon tabs, palettes, explorer tabs, views and
 *        visual styles; AI agents and task kinds; the project (levels, layers, code checks, issues, clashes,
 *        comments, schedule, cost, health); the command-line history and agent proposals; members and roles;
 *        toasts.
 * FOR    Everything imports its data shapes from here, so a field is added in one place. The *_IDS constants
 *        are the single source of truth for the URL query values (lib/workspace-query.ts) and for the tab lists
 *        in the UI.
 * DEBUG  - TypeScript rejects a palette, tab or view id: add it to the matching *_IDS array here, and to the
 *          component that renders it.
 *        - Mock data does not match a type: lib/mock-data.ts builds the sample projects against these
 *          interfaces.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
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
/** Id of a ribbon tab. */
export type RibbonTabId = (typeof RIBBON_TAB_IDS)[number];

/** Ids of the right-hand palettes, in tab order. */
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
/** Id of a right-hand palette. */
export type PaletteId = (typeof PALETTE_IDS)[number];

/** Ids of the Model Explorer tabs. */
export const EXPLORER_IDS = ["model", "layers", "levels", "library"] as const;
/** Id of a Model Explorer tab. */
export type ExplorerId = (typeof EXPLORER_IDS)[number];

/** The two ways to look at the model. */
export const VIEW_MODES = ["3d", "2d"] as const;
/** "3d" model view or "2d" floor plan. */
export type ViewMode = (typeof VIEW_MODES)[number];

/** Visual styles of the viewport. */
export const VISUAL_STYLES = ["wireframe", "shaded", "realistic", "xray"] as const;
/** How the model is drawn: wireframe, shaded, realistic or x-ray. */
export type VisualStyle = (typeof VISUAL_STYLES)[number];

/* ── agents ───────────────────────────────────────────────────────────── */
export const AGENT_IDS = ["claude", "chatgpt", "kimi", "gemini", "local", "custom"] as const;
/** Id of a supported AI agent. */
export type AgentId = (typeof AGENT_IDS)[number];
/** How an agent is connected: API key, OAuth sign-in or an MCP endpoint. */
export type AuthMethod = "api-key" | "oauth" | "mcp";
/** Which model tier an agent uses. */
export type AgentModelTier = "auto" | "fast" | "capable";

/** An AI agent and its connection state. Never holds a secret: the key is only a masked value. */
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

/** Kinds of work that can be routed to a particular agent. */
export type TaskKind = "compliance" | "cost" | "p2p" | "stress" | "chat";

/* ── seats ────────────────────────────────────────────────────────────── */
export type Seat = "student" | "engineer" | "government";

/* ── project data ─────────────────────────────────────────────────────── */
export interface Jurisdiction {
  name: string;
  codeSet: string;
}

/** One floor of a project, with its elevation in feet relative to Level 1. */
export interface Level {
  id: string;
  name: string;
  /** elevation in feet relative to Level 1 */
  elevation: number;
  label: string;
}

/** Ids of the model layers. */
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
/** Id of a model layer. */
export type LayerId = (typeof LAYER_IDS)[number];

/** A model layer: name, colour, visibility and lock. */
export interface Layer {
  id: LayerId;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
}

/** Result of a code check. */
export type CheckStatus = "pass" | "review" | "fail";

/** One code-compliance check with the section cited, its status and a suggested fix. */
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

/** How serious an issue is. */
export type Severity = "critical" | "high" | "medium" | "low";
/** Where an issue is in its life cycle. */
export type IssueStatus = "open" | "in-progress" | "resolved";

/** A tracked problem pinned to a model element. */
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

/** A hard or soft clash between two elements, with a recommended fix. */
export interface Clash {
  id: string;
  kind: "HARD" | "SOFT";
  a: string;
  b: string;
  level: string;
  fix: string;
  elementIds: string[];
}

/** A reply inside a comment thread. */
export interface CommentReply {
  id: string;
  author: string;
  text: string;
  at: string;
}

/** A comment thread, optionally pinned to a model element. */
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

/** A scheduled task: trade, dates, cost, crew and materials. */
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

/** A group of scheduled tasks; `key` links it to a build phase in the 3D scene. */
export interface Phase {
  name: string;
  start: string;
  end: string;
  /** scene build-state key; see lib/scene */
  key?: string;
  tasks: Task[];
}

/** Progress state of a project stage. */
export type StageStatus = "done" | "active" | "upcoming";
/** A project stage in the phase tracker, with progress and open items. */
export interface Stage {
  name: string;
  status: StageStatus;
  percent: number;
  openTasks: number;
  openIssues: number;
  approvals: number;
}

/** Estimated cost: total, range, hard / soft / land split, materials and workforce. */
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

/** Period a health score covers. */
export type HealthRange = "all" | "30d" | "version";
/** A 0-100 Plan Health Score with its four sub-scores. */
export interface HealthSnapshot {
  score: number;
  delta: number;
  compliance: number;
  structural: number;
  cost: number;
  schedule: number;
}
/** The health score now, with a summary and a snapshot per period. */
export interface HealthModel extends HealthSnapshot {
  summary: string;
  ranges: Record<HealthRange, HealthSnapshot>;
}

/** Which 3D scene a project uses. */
export type SceneKind = "residence" | "clinic" | "blank";

/**
 * Everything about one project: details, levels, layers, checks, issues, clashes, cost, schedule, health
 * and comments.
 */
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

/** A project listed in the recent-projects lists. */
export interface RecentProject {
  id: string;
  name: string;
  jurisdiction: string;
  openedAt: string;
}

/* ── timeline window ──────────────────────────────────────────────────── */
export type TimelinePreset = "1mo" | "3mo" | "6mo" | "full" | "custom";
/** A time window on the schedule, in day offsets from the project start. */
export interface TimelineWindow {
  preset: TimelinePreset;
  /** day offsets from project start; [from, to] */
  from: number;
  to: number;
}

/* ── command line ─────────────────────────────────────────────────────── */
export type HistoryKind = "cmd" | "ok" | "ai" | "warn" | "info";
/** One line of the command-line history. */
export interface HistoryLine {
  id: string;
  kind: HistoryKind;
  text: string;
}

/** An edit proposed by an AI agent, with a preview diff. Applied only when the user accepts. */
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
/** A team member with a role; PE reviewers also carry a licence number and jurisdiction. */
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
