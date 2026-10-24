import { blankProject, CLINIC, CLINIC_PROJECT_ID, DEMO_PROJECT_ID, RESIDENCE } from "../mock-data";
import type { Project } from "../types";

/* Project service stub. Swap for a real API; keep the signatures. */

export const KNOWN_PROJECT_IDS = [DEMO_PROJECT_ID, CLINIC_PROJECT_ID] as const;

export function isKnownProject(id: string): boolean {
  return (KNOWN_PROJECT_IDS as readonly string[]).includes(id) || /^untitled-\d+$/.test(id) || /^p2p-\d{3,4}-\d-\d(_5)?$/.test(id);
}

/** Prompt-to-Plan results are stateless: the id carries the parameters (p2p-<sqft>-<beds>-<baths>). */
function generatedProject(id: string, sqft: number, beds: number, baths: number): Project {
  const scale = sqft / 1536;
  const hard = Math.round(sqft * 255);
  const soft = Math.round(hard * 0.18);
  const land = 150_000;
  return {
    ...RESIDENCE,
    id,
    name: `Plan_${sqft}sf_${beds}BR`,
    fileName: `Plan_${sqft}sf_${beds}BR.bsd`,
    comments: [],
    issues: [],
    clashes: [],
    checks: RESIDENCE.checks.map((c) => ({ ...c, status: "pass" as const, fix: undefined, peReview: false })),
    cost: {
      ...RESIDENCE.cost,
      total: hard + soft + land,
      range: Math.round((hard + soft + land) * 0.06),
      hard,
      soft,
      land,
      basis: `Generated from a ${sqft} sf ${beds}-bed ${baths}-bath prompt · Miami-Dade HVHZ factor 1.18`,
      materials: RESIDENCE.cost.materials.map((m) => ({ ...m, cost: Math.round(m.cost * scale) })),
    },
    health: {
      ...RESIDENCE.health,
      score: 91,
      delta: 0,
      compliance: 96,
      structural: 90,
      cost: 88,
      schedule: 90,
      summary: "Starter plan passes the code, cost and structural pre-checks. Review it with a licensed PE before use.",
      ranges: {
        all: { score: 91, delta: 0, compliance: 96, structural: 90, cost: 88, schedule: 90 },
        "30d": { score: 91, delta: 0, compliance: 96, structural: 90, cost: 88, schedule: 90 },
        version: { score: 91, delta: 0, compliance: 96, structural: 90, cost: 88, schedule: 90 },
      },
    },
    versions: [{ id: "v0.1", label: "v0.1: generated from prompt", at: "Just now", by: "BuildSync AI" }],
  };
}

export async function getProject(id: string): Promise<Project | null> {
  if (id === DEMO_PROJECT_ID) return RESIDENCE;
  if (id === CLINIC_PROJECT_ID) return CLINIC;
  const m = /^untitled-(\d+)$/.exec(id);
  if (m) return blankProject(id, Number(m[1]));
  const g = /^p2p-(\d{3,4})-(\d)-(\d(?:_5)?)$/.exec(id);
  if (g) return generatedProject(id, Number(g[1]), Number(g[2]), Number(g[3].replace("_", ".")));
  return null;
}

export function planProjectId(sqft: number, beds: number, baths: number): string {
  return `p2p-${Math.round(sqft)}-${beds}-${String(baths).replace(".", "_")}`;
}

/** Display metadata for a project id without loading it (used by document tabs). */
export function projectLabel(id: string): { name: string; fileName: string } {
  if (id === DEMO_PROJECT_ID) return { name: "Residence_2BR", fileName: RESIDENCE.fileName };
  if (id === CLINIC_PROJECT_ID) return { name: "Clinic_Phase1", fileName: CLINIC.fileName };
  const m = /^untitled-(\d+)$/.exec(id);
  if (m) return { name: `Untitled_${m[1]}`, fileName: `Untitled_${m[1]}.bsd` };
  const g = /^p2p-(\d+)-(\d)-/.exec(id);
  if (g) return { name: `Plan_${g[1]}sf_${g[2]}BR`, fileName: `Plan_${g[1]}sf_${g[2]}BR.bsd` };
  return { name: id, fileName: `${id}.bsd` };
}
