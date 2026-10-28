/**
 * lib/services/analysis.ts
 *
 * WHAT   Stubs of the analysis services: stress test (runStressTest), disaster simulation (runSimulation),
 *        Agent Council (convene), AI analysis recommendations (runAiAnalysis), Prompt-to-Plan (generatePlan)
 *        and the compliance re-check (recheckCompliance). All output is deterministic mock data returned after
 *        a short delay.
 * FOR    The Stress Test, Simulation, Council, AI Analysis and Compliance palettes and the Prompt to Plan
 *        dialog, through the workspace store actions. The result shapes are what the UI renders, so a real
 *        service must return the same shapes.
 * DEBUG  - Results change between runs: they should not; every number derives from a hash of the inputs
 *          (lib/utils.ts hash).
 *        - A new scenario type needs an entry in SIM_TYPES (label, unit, range) and a case in runSimulation.
 *        - Everything here is advisory mock output; no engineering calculation is real.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { getScene } from "../scene";
import type { AgentId, Project } from "../types";
import { clamp, hash, sleep } from "../utils";

/* Analysis service stubs: stress test, disaster simulation, council, AI analysis,
 * Prompt-to-Plan. All output is deterministic mock data produced after a short delay. */

/* ── stress test ──────────────────────────────────────────────────────── */
export const LOAD_CASES = [
  { id: "dead-live", label: "Dead + Live (1.2D + 1.6L)" },
  { id: "wind", label: "Wind (ASCE 7 · 175 mph)" },
  { id: "seismic", label: "Seismic (Site Class D)" },
  { id: "combined", label: "Combined (Wind + Live)" },
] as const;
/** Id of a stress-test load case. */
export type LoadCaseId = (typeof LOAD_CASES)[number]["id"];

/** Environmental conditions for a stress test. */
export const CONDITIONS = [
  { id: "normal", label: "Normal Service" },
  { id: "hurricane", label: "Hurricane Exposure C" },
  { id: "flood", label: "Flood — 3 ft Stillwater" },
  { id: "fire", label: "Fire Exposure — 1 h" },
] as const;
/** Id of a stress-test condition. */
export type ConditionId = (typeof CONDITIONS)[number]["id"];

/** Mesh densities for a stress test. */
export const MESHES = [
  { id: "coarse", label: "Coarse (Fast)" },
  { id: "medium", label: "Medium" },
  { id: "fine", label: "Fine (Slow)" },
] as const;
/** Id of a mesh density. */
export type MeshId = (typeof MESHES)[number]["id"];

/** Stress-test inputs: element, load case, condition and mesh. */
export interface StressSetup {
  elementId: string;
  loadCase: LoadCaseId;
  condition: ConditionId;
  mesh: MeshId;
}

/** Stress-test output: stress, strain, deflection, safety factor, load and the calculation. */
export interface StressResult {
  setup: StressSetup;
  maxStress: number;
  allowable: number;
  strain: number;
  deflection: number;
  limit: number;
  safetyFactor: number;
  maxLoad: number;
  failurePoints: { id: string; label: string; ksi: number }[];
  criticalAreas: string[];
  recommendation: string;
  fixable: boolean;
  /** stress-point id → ksi, drives the viewport heat spots */
  points: Record<string, number>;
  calc: string[];
}

const CASE_K: Record<LoadCaseId, number> = { "dead-live": 1, wind: 1.12, seismic: 0.86, combined: 1.22 };
const COND_K: Record<ConditionId, number> = { normal: 1, hurricane: 1.15, flood: 0.92, fire: 1.07 };
const MESH_K: Record<MeshId, number> = { coarse: 0.94, medium: 1, fine: 1.03 };
const ALLOWABLE_KSI = 4.2;

const LIMIT_BY_CATEGORY: Record<string, number> = { Beam: 0.6, Slab: 0.75, Wall: 0.9, Roof: 1.1, Truss: 1.1, Column: 0.5 };

/** Run a (mock) stress test. */
export async function runStressTest(project: Project, setup: StressSetup): Promise<StressResult> {
  const scene = getScene(project.sceneKind);
  const k = CASE_K[setup.loadCase] * COND_K[setup.condition] * MESH_K[setup.mesh];
  await sleep(setup.mesh === "fine" ? 1400 : setup.mesh === "medium" ? 900 : 500);

  const points: Record<string, number> = {};
  for (const sp of scene.stress) points[sp.id] = Math.round(sp.ksi * k * 100) / 100;
  const whole = setup.elementId === "all";
  const el = whole ? null : scene.elementById[setup.elementId];
  const own = scene.stress.filter((sp) => sp.elementId === setup.elementId);

  let maxStress: number;
  if (whole) maxStress = Math.max(0, ...Object.values(points));
  else if (own.length) maxStress = Math.max(...own.map((sp) => points[sp.id]));
  else maxStress = Math.round((1.2 + (hash(setup.elementId) % 22) / 10) * k * 100) / 100;

  const category = el?.category ?? "Beam";
  const limit = LIMIT_BY_CATEGORY[category] ?? 0.6;
  const baseDefl = setup.elementId === "B-L1-M1" ? 0.92 : 0.1 + (hash(setup.elementId + "d") % 30) / 100;
  const deflection = Math.round((whole ? 0.92 : baseDefl) * k * 100) / 100;
  const safetyFactor = Math.round((ALLOWABLE_KSI / Math.max(maxStress, 0.01)) * 100) / 100;
  const strain = Math.round((maxStress / 29_000) * 100 * 1000) / 1000;
  const failing = scene.stress
    .filter((sp) => (whole || sp.elementId === setup.elementId) && points[sp.id] > ALLOWABLE_KSI)
    .map((sp) => ({ id: sp.id, label: sp.label, ksi: points[sp.id] }))
    .sort((a, b) => b.ksi - a.ksi);
  const critical = [...scene.stress]
    .filter((sp) => whole || sp.elementId === setup.elementId || points[sp.id] > 3.5)
    .sort((a, b) => points[b.id] - points[a.id])
    .slice(0, 4)
    .map((sp) => `${sp.label} · ${points[sp.id].toFixed(1)} ksi`);

  const failsLimit = safetyFactor < 1 || deflection > limit;
  const name = el?.name ?? "the structure";
  const recommendation = failsLimit
    ? `Increase ${name} depth from 8" to 10" or add a mid-span post to bring the safety factor above 1.25.`
    : `No change needed. ${name[0].toUpperCase() + name.slice(1)} has ${Math.round((safetyFactor - 1) * 100)}% margin against the allowable stress.`;

  const w = 1.34 * k;
  const M = (w * 18 * 18) / 8;
  const calc = [
    "σ = M · c / I   (bending stress at the extreme fibre)",
    `M = w·L² / 8 = ${w.toFixed(2)} kip/ft × (18 ft)² / 8 = ${M.toFixed(1)} kip·ft`,
    `σ_max = ${maxStress.toFixed(2)} ksi   vs   F_allow = ${ALLOWABLE_KSI.toFixed(2)} ksi   →   SF = ${safetyFactor.toFixed(2)}`,
    `Δ = 5·w·L⁴ / (384·E·I) = ${deflection.toFixed(2)} in   vs   limit L/360 = ${limit.toFixed(2)} in`,
    `Load combination: ${LOAD_CASES.find((c) => c.id === setup.loadCase)?.label}; conditions: ${CONDITIONS.find((c) => c.id === setup.condition)?.label}`,
  ];

  return {
    setup,
    maxStress,
    allowable: ALLOWABLE_KSI,
    strain,
    deflection,
    limit,
    safetyFactor,
    maxLoad: Math.round(w * 18 * 1.55 * 10) / 10,
    failurePoints: failing,
    criticalAreas: critical,
    recommendation,
    fixable: failsLimit,
    points,
    calc,
  };
}

/* ── disaster simulation ──────────────────────────────────────────────── */
export const SIM_TYPES = [
  { id: "hurricane", label: "Hurricane Wind", unit: "mph", min: 80, max: 250, step: 5, def: 200 },
  { id: "seismic", label: "Seismic", unit: "g PGA", min: 0.05, max: 1, step: 0.05, def: 0.3 },
  { id: "flood", label: "Flood / Storm Surge", unit: "ft", min: 1, max: 15, step: 0.5, def: 4 },
  { id: "fire", label: "Fire Spread", unit: "MW", min: 0.5, max: 20, step: 0.5, def: 5 },
  { id: "thermal", label: "Thermal", unit: "°F Δ", min: 10, max: 60, step: 1, def: 35 },
  { id: "energy", label: "Energy", unit: "kBtu/sf·yr", min: 15, max: 90, step: 1, def: 42 },
  { id: "lighting", label: "Lighting", unit: "lux", min: 50, max: 1000, step: 10, def: 300 },
  { id: "water", label: "Water", unit: "in/hr rain", min: 1, max: 12, step: 0.5, def: 4 },
] as const;
/** Id of a disaster-simulation scenario type. */
export type SimType = (typeof SIM_TYPES)[number]["id"];

/** Simulation inputs: type, intensity, direction and duration. */
export interface SimSetup {
  type: SimType;
  intensity: number;
  /** compass bearing the hazard comes FROM, degrees */
  direction: number;
  /** minutes */
  duration: number;
}

/** One labelled result value of a simulation. */
export interface SimMetric {
  label: string;
  value: string;
  tone: "ok" | "warn" | "bad";
}

/** Simulation output: metrics, risk, failure points and the calculation. */
export interface SimResult {
  setup: SimSetup;
  metrics: SimMetric[];
  roofUplift?: number;
  capacity?: number;
  breachRisk: number;
  failurePoints: { label: string; detail: string }[];
  calc: string[];
  headline: string;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
/** Compass point name (N, NE …) for a bearing. */
export const compassName = (deg: number) => COMPASS[Math.round(((deg % 360) / 45)) % 8];

/** Run a (mock) disaster simulation. */
export async function runSimulation(setup: SimSetup): Promise<SimResult> {
  await sleep(750);
  const from = compassName(setup.direction);
  const toneOf = (risk: number): SimMetric["tone"] => (risk > 40 ? "bad" : risk > 15 ? "warn" : "ok");

  if (setup.type === "hurricane") {
    const V = setup.intensity;
    const Kz = 0.9;
    const Kzt = 1;
    const Kd = 0.85;
    const q = 0.00256 * Kz * Kzt * Kd * V * V;
    const GCp = -1.6;
    const GCpi = 0.18;
    const p = q * (GCp - GCpi);
    const uplift = Math.abs(p);
    const capacity = 125;
    const dc = uplift / capacity;
    const durationBump = Math.min(setup.duration / 60, 6) * 1.5;
    const risk = Math.round(clamp(((dc - 0.75) / 0.6) * 100 + durationBump, 2, 98));
    const fails: SimResult["failurePoints"] = [];
    if (dc > 0.85) fails.push({ label: `${from} eave clip row`, detail: `Uplift ${uplift.toFixed(0)} psf vs ${capacity} psf clip capacity (R-01)` });
    if (dc > 1.0) fails.push({ label: "Windward Windows", detail: "Debris-impact zone: WN-104, WN-105, WN-204, WN-205" });
    if (dc > 1.1) fails.push({ label: "Ridge Cap and Gable Overhang", detail: "Edge zone 3 suction exceeds fastener pull-out" });
    if (dc > 1.3) fails.push({ label: "Sliding Patio Door D-102", detail: "Design pressure exceeds the product approval rating" });
    return {
      setup,
      headline: `${V} mph from the ${from}: ${dc > 1 ? "roof uplift exceeds clip capacity" : "within design capacity"}`,
      roofUplift: Math.round(uplift),
      capacity,
      breachRisk: risk,
      metrics: [
        { label: "Velocity Pressure q", value: `${q.toFixed(1)} psf`, tone: "ok" },
        { label: "Roof Uplift (Edge Zone)", value: `${uplift.toFixed(0)} psf`, tone: dc > 1 ? "bad" : dc > 0.85 ? "warn" : "ok" },
        { label: "Clip Capacity", value: `${capacity} psf`, tone: "ok" },
        { label: "Breach Risk", value: `${risk}%`, tone: toneOf(risk) },
      ],
      failurePoints: fails,
      calc: [
        "q_z = 0.00256 · K_z · K_zt · K_d · V²",
        `q_z = 0.00256 × ${Kz.toFixed(2)} × ${Kzt.toFixed(2)} × ${Kd.toFixed(2)} × ${V}² = ${q.toFixed(1)} psf`,
        "p = q_z · (GC_p − GC_pi)",
        `p = ${q.toFixed(1)} × (${GCp.toFixed(2)} − ${GCpi.toFixed(2)}) = ${p.toFixed(1)} psf (uplift)`,
        `Demand/capacity = ${uplift.toFixed(0)} / ${capacity} = ${dc.toFixed(2)} ${dc > 1 ? "✗" : "✓"}`,
        `Exposure C, Risk Cat II, wind from the ${from}, duration ${setup.duration} min`,
      ],
    };
  }

  const i = setup.intensity;
  const t = hash(setup.type) % 7;
  let risk = 0;
  const metrics: SimMetric[] = [];
  const fails: SimResult["failurePoints"] = [];
  const calc: string[] = [];
  let headline = "";
  switch (setup.type) {
    case "seismic": {
      const Cs = 0.5 * i;
      const W = 310;
      const V = Cs * W;
      const drift = 0.6 + i * 2.4;
      risk = Math.round(clamp((drift - 1.4) * 45, 2, 95));
      headline = `${i.toFixed(2)} g: ${drift > 2 ? "drift exceeds 2%" : "drift acceptable"}`;
      metrics.push({ label: "Base Shear V", value: `${V.toFixed(0)} kip`, tone: "ok" }, { label: "Story Drift", value: `${drift.toFixed(2)}%`, tone: drift > 2 ? "bad" : drift > 1.5 ? "warn" : "ok" }, { label: "Failure Risk", value: `${risk}%`, tone: toneOf(risk) });
      calc.push("V = C_s · W", `V = ${Cs.toFixed(2)} × ${W} kip = ${V.toFixed(0)} kip`, `Story drift Δ/h = ${drift.toFixed(2)}% (limit 2.0%)`);
      if (drift > 1.8) fails.push({ label: "Level 1 CMU Walls, West", detail: "Shear cracking at openings WN-104/WN-105" });
      break;
    }
    case "flood": {
      const press = 62.4 * i;
      risk = Math.round(clamp((i - 1.5) * 12 + t, 2, 95));
      headline = `${i} ft stillwater: ${i > 1 ? "Level 1 floods" : "no floor impact"}`;
      metrics.push({ label: "Hydrostatic Pressure", value: `${press.toFixed(0)} psf`, tone: press > 250 ? "bad" : "warn" }, { label: "Floor Above Surge", value: `${(1 - i).toFixed(1)} ft`, tone: i > 1 ? "bad" : "ok" }, { label: "Damage Risk", value: `${risk}%`, tone: toneOf(risk) });
      calc.push("p = γ · h", `p = 62.4 pcf × ${i} ft = ${press.toFixed(0)} psf`);
      if (i > 1) fails.push({ label: "Level 1 Slab and Finishes", detail: "Inundated; electrical panel MDP below flood line" });
      break;
    }
    case "fire": {
      risk = Math.round(clamp(i * 4 + t, 2, 95));
      headline = `${i} MW fire: spread ${Math.round(60 / Math.max(i, 1))} min between rooms`;
      metrics.push({ label: "Heat Release", value: `${i} MW`, tone: "warn" }, { label: "Room-to-Room Spread", value: `${Math.round(60 / Math.max(i, 1))} min`, tone: i > 8 ? "bad" : "ok" }, { label: "Egress Time Margin", value: `${Math.max(2, 14 - Math.round(i))} min`, tone: i > 10 ? "bad" : "ok" });
      calc.push("Design fire t²: Q = α·t²", `Time to flashover ≈ ${Math.round(60 / Math.max(i, 1))} min`);
      if (i > 6) fails.push({ label: "Stair Hall", detail: "Smoke layer reaches the landing before egress completes" });
      break;
    }
    default: {
      risk = Math.round(clamp(i % 17 + t, 2, 60));
      headline = `${setup.type[0].toUpperCase() + setup.type.slice(1)} analysis complete at ${i}`;
      metrics.push({ label: "Peak Response", value: `${(i * 1.7).toFixed(1)}`, tone: "ok" }, { label: "Risk", value: `${risk}%`, tone: toneOf(risk) });
      calc.push(`Response = ${i} × 1.7 = ${(i * 1.7).toFixed(1)}`);
    }
  }
  return { setup, metrics, breachRisk: risk, failurePoints: fails, calc, headline };
}

/* ── council ──────────────────────────────────────────────────────────── */
export const COUNCIL_ROLES = ["Structural Engineer", "Cost Estimator", "Code Reviewer", "Project Manager"] as const;
/** Roles the Agent Council assigns. */
export type CouncilRole = (typeof COUNCIL_ROLES)[number];
/** How an agent voted. */
export type Vote = "support" | "conditional" | "oppose";

/** One agent's role, vote and reasoning. */
export interface CouncilCard {
  role: CouncilRole;
  agentId: AgentId;
  vote: Vote;
  argument: string;
}
/** The Council's cards and overall outcome. */
export interface CouncilResult {
  question: string;
  cards: CouncilCard[];
  tally: Record<Vote, number>;
  verdict: string;
}

const STEEL: Record<CouncilRole, [Vote, string]> = {
  "Structural Engineer": ["support", "Steel gives higher uplift capacity at the connections and removes the L/360 beam problem without deepening sections."],
  "Cost Estimator": ["oppose", "Adds about $41,000 (+10% hard cost) plus galvanizing. CMU with tie columns is cheaper in this market."],
  "Code Reviewer": ["conditional", "Acceptable under FBC HVHZ if every connection has a Miami-Dade NOA and members are hot-dip galvanized for the coastal exposure."],
  "Project Manager": ["conditional", "Adds roughly three weeks of fabrication lead time, and a steel erector must be added to the crew plan."],
};

const GENERIC: Record<Vote, string[]> = {
  support: ["This improves the plan against the current checks and the cost impact is small.", "Benefits outweigh the risk; I would proceed with a PE review."],
  conditional: ["Workable, but only if we confirm the details with a licensed PE first.", "I support it provided the schedule and permit impact are confirmed."],
  oppose: ["The downside to cost and schedule is larger than the gain I can quantify.", "This creates a new compliance risk I can't justify yet."],
};

/** Put a question to several agents and collect their votes. */
export async function convene(question: string, agents: AgentId[]): Promise<CouncilResult> {
  await sleep(900);
  const steel = /steel/i.test(question);
  const cards: CouncilCard[] = COUNCIL_ROLES.map((role, i) => {
    let vote: Vote;
    let argument: string;
    if (steel) {
      [vote, argument] = STEEL[role];
    } else {
      const h = hash(`${question}|${role}`);
      vote = (["support", "conditional", "oppose"] as const)[h % 3];
      argument = GENERIC[vote][(h >> 3) % GENERIC[vote].length];
    }
    return { role, agentId: agents[i % agents.length], vote, argument };
  });
  const tally: Record<Vote, number> = { support: 0, conditional: 0, oppose: 0 };
  cards.forEach((c) => (tally[c.vote] += 1));
  const top = (Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0]) as Vote;
  const verdict =
    top === "support"
      ? "Council recommends proceeding."
      : top === "conditional"
        ? "Council leans yes, with conditions to confirm before accepting."
        : "Council recommends against it for now.";
  return { question, cards, tally, verdict };
}

/* ── AI analysis recommendations ──────────────────────────────────────── */
export type RecCategory = "design" | "structural" | "material" | "cost-saving" | "constructability" | "code" | "efficiency" | "error";
/** One AI-analysis recommendation with cost and impact. */
export interface Recommendation {
  id: string;
  category: RecCategory;
  title: string;
  detail: string;
  costDelta?: number;
  impact?: string;
  elementId?: string;
}

/** Display name of each recommendation category. */
export const REC_LABEL: Record<RecCategory, string> = {
  design: "Design",
  structural: "Structural",
  material: "Material",
  "cost-saving": "Cost Saving",
  constructability: "Constructability",
  code: "Code",
  efficiency: "Efficiency",
  error: "Detected Error",
};

/** Run a (mock) AI design review. */
export async function runAiAnalysis(project: Project): Promise<Recommendation[]> {
  await sleep(800);
  if (project.sceneKind === "blank") return [];
  if (project.sceneKind === "clinic") {
    return [
      { id: "R1", category: "code", title: "Widen exam room doors to 3'-6\"", detail: "Current 3'-2\" doors fail the accessibility width rule (ABBC §11.5).", costDelta: 2_100, impact: "Fixes 1 failing check", elementId: "D-105" },
      { id: "R2", category: "cost-saving", title: "Use precast lintels at windows", detail: "Replaces cast-in-place lintels on 11 openings.", costDelta: -9_800, impact: "−1 week" },
      { id: "R3", category: "efficiency", title: "Cross-ventilate the corridor", detail: "Operable clerestory on the north wall cuts cooling load about 8%.", costDelta: 3_400, impact: "−8% energy" },
      { id: "R4", category: "error", title: "Sprinkler main clashes with roof beam", detail: "Hard clash CL-02. Re-route under the beam web.", elementId: "B-L1-MID" },
    ];
  }
  return [
    { id: "R1", category: "error", title: "Floor beam B-L1-M1 fails deflection", detail: "Δ = 0.92\" vs the 0.60\" limit. Deepen to 10\" or add a mid-span post.", costDelta: 2_900, impact: "Fixes 1 failing check", elementId: "B-L1-M1" },
    { id: "R2", category: "structural", title: "Add a second hurricane clip row at the west eave", detail: "Edge-zone suction reaches 106 psf at 175 mph. A second row restores the margin.", costDelta: 1_600, impact: "+12% uplift margin", elementId: "R-01" },
    { id: "R3", category: "cost-saving", title: "Swap tile roof for standing-seam metal", detail: "Lighter roof reduces truss and connection demands.", costDelta: -14_200, impact: "−3 days" },
    { id: "R4", category: "material", title: "Specify galvanized rebar at stem walls", detail: "Coastal chloride exposure. Extends service life of the footing.", costDelta: 3_100, impact: "+25 yr durability" },
    { id: "R5", category: "code", title: "Move the L2 landing CO alarm", detail: "Place it within 10 ft of Bedroom 2 (FBC-R §R315.1).", impact: "Fixes 1 failing check", elementId: "P-L2-2" },
    { id: "R6", category: "constructability", title: "Pour the L2 slab and beams in one phase", detail: "Saves a crane mobilisation and one cure window.", costDelta: -4_800, impact: "−4 days" },
    { id: "R7", category: "design", title: "Swap the stair headroom conflict", detail: "Raise the soffit by 8\" at the landing to reach 6'-8\".", costDelta: 900, impact: "Fixes 1 review item", elementId: "ST-01" },
    { id: "R8", category: "efficiency", title: "Right-size the AHU to 2.5 ton", detail: "Load calc supports a smaller unit with the new window SHGC.", costDelta: -1_700, impact: "−11% energy" },
  ];
}

/* ── Prompt-to-Plan ───────────────────────────────────────────────────── */
export interface GeneratedPlan {
  title: string;
  sqft: number;
  beds: number;
  baths: number;
  rooms: { name: string; area: number }[];
  cost: number;
  months: number;
  checksPassed: number;
  checksTotal: number;
  structural: string;
  notes: string[];
}

/** Turn a description like "800 sq ft 2-bed 1-bath" into a starter plan summary. */
export async function generatePlan(prompt: string): Promise<GeneratedPlan> {
  await sleep(1100);
  const sq = /(\d[\d,]*)\s*(?:sq|sf|square)/i.exec(prompt);
  const bd = /(\d)\s*-?\s*(?:bed|br|bedroom)/i.exec(prompt);
  const ba = /(\d(?:\.5)?)\s*-?\s*(?:bath|ba)\b/i.exec(prompt);
  const sqft = clamp(sq ? Number(sq[1].replace(/,/g, "")) : 800, 300, 6000);
  const beds = clamp(bd ? Number(bd[1]) : 2, 0, 6);
  const baths = ba ? Number(ba[1]) : 1;
  const living = Math.round(sqft * 0.26);
  const kitchen = Math.round(sqft * 0.14);
  const bath = Math.round(sqft * 0.08 * Math.max(baths, 1));
  const bedArea = Math.round((sqft - living - kitchen - bath - sqft * 0.1) / Math.max(beds, 1));
  const rooms = [
    { name: "Living / Dining", area: living },
    { name: "Kitchen", area: kitchen },
    ...Array.from({ length: beds }, (_, i) => ({ name: `Bedroom ${i + 1}`, area: bedArea })),
    { name: baths === 1 ? "Bath" : `${baths} baths`, area: bath },
    { name: "Circulation / Utility", area: Math.round(sqft * 0.1) },
  ];
  return {
    title: `${sqft.toLocaleString("en-US")} sf · ${beds}-bed · ${baths}-bath`,
    sqft,
    beds,
    baths,
    rooms,
    cost: Math.round(sqft * 255),
    months: Math.max(4, Math.round(sqft / 110)),
    checksPassed: 14,
    checksTotal: 14,
    structural: "Wind, bearing and deflection pre-checks pass.",
    notes: [
      "Single level, gable roof, 8\" CMU on stem-wall foundation.",
      "Compliance run against the project jurisdiction code set.",
      "AI-generated, unstamped. A licensed PE must review before use.",
    ],
  };
}

/* ── compliance re-check ──────────────────────────────────────────────── */
export async function recheckCompliance(project: Project): Promise<{ pass: number; review: number; fail: number }> {
  await sleep(900);
  const out = { pass: 0, review: 0, fail: 0 };
  project.checks.forEach((c) => (out[c.status] += 1));
  return out;
}
