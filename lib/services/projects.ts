/**
 * lib/services/projects.ts
 *
 * WHAT   Stub of the project service: isKnownProject, getProject (the sample residence, cottage and clinic,
 *        "untitled-N" blank projects, "community-N" shared parcels and generated "p2p-<sqft>-<beds>-<baths>"
 *        plans), planProjectId and projectLabel (names for tabs without loading the project).
 * FOR    The route pages (app/app/projects/[projectId], app/demo) and the document tabs. Prompt-to-Plan results
 *        are stateless: the project id carries the parameters, so the plan can be rebuilt from the URL. Swap
 *        for a real API and keep the signatures.
 * DEBUG  - A project URL gives 404: getProject returns null for ids that match none of the patterns.
 *        - A generated plan has odd numbers: generatedProject derives everything from sqft, beds and baths.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { blankProject, CLINIC, CLINIC_PROJECT_ID, COTTAGE, COTTAGE_PROJECT_ID, DEMO_PROJECT_ID, RESIDENCE } from "../mock-data";
import type { Project } from "../types";

/* Project service stub. Swap for a real API; keep the signatures. */

/** Ids of the sample projects. */
export const KNOWN_PROJECT_IDS = [DEMO_PROJECT_ID, COTTAGE_PROJECT_ID, CLINIC_PROJECT_ID] as const;

/** True for the sample projects, blank "untitled-N" ones, generated plans and communities. */
export function isKnownProject(id: string): boolean {
  return (KNOWN_PROJECT_IDS as readonly string[]).includes(id) || /^(untitled|community)-\d+$/.test(id) || /^p2p-\d{3,4}-\d-\d(_5)?$/.test(id);
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

/** Load a project by id, or null when the id is unknown. */
export async function getProject(id: string): Promise<Project | null> {
  return projectById(id);
}

/** The same, synchronously (the sample data lives in the bundle): linked projects are read this way in the browser. */
export function projectById(id: string): Project | null {
  if (id === DEMO_PROJECT_ID) return RESIDENCE;
  if (id === COTTAGE_PROJECT_ID) return COTTAGE;
  if (id === CLINIC_PROJECT_ID) return CLINIC;
  const m = /^untitled-(\d+)$/.exec(id);
  if (m) return blankProject(id, Number(m[1]));
  const c = /^community-(\d+)$/.exec(id);
  if (c) return communityProject(id, Number(c[1]));
  const g = /^p2p-(\d{3,4})-(\d)-(\d(?:_5)?)$/.exec(id);
  if (g) return generatedProject(id, Number(g[1]), Number(g[2]), Number(g[3].replace("_", ".")));
  return null;
}

/** A community: an empty parcel that links (or merges) other projects onto one site (Insert → Community). */
function communityProject(id: string, n: number): Project {
  const p = blankProject(id, n);
  return {
    ...p,
    name: `Community_${n}`,
    fileName: `Community_${n}.bsd`,
    health: { ...p.health, summary: "A shared parcel: link two or more projects to see them together. Each stays its own project and updates here when it is saved." },
    versions: [{ id: "v0.1", label: "v0.1 — new community", at: "Just now", by: "You" }],
  };
}

/** The id for a generated plan with these parameters. */
export function planProjectId(sqft: number, beds: number, baths: number): string {
  return `p2p-${Math.round(sqft)}-${beds}-${String(baths).replace(".", "_")}`;
}

/** Display metadata for a project id without loading it (used by document tabs). */
export function projectLabel(id: string): { name: string; fileName: string } {
  if (id === DEMO_PROJECT_ID) return { name: "Residence_2BR", fileName: RESIDENCE.fileName };
  if (id === COTTAGE_PROJECT_ID) return { name: "Cottage_2BR", fileName: COTTAGE.fileName };
  if (id === CLINIC_PROJECT_ID) return { name: "Clinic_Phase1", fileName: CLINIC.fileName };
  const m = /^untitled-(\d+)$/.exec(id);
  if (m) return { name: `Untitled_${m[1]}`, fileName: `Untitled_${m[1]}.bsd` };
  const c = /^community-(\d+)$/.exec(id);
  if (c) return { name: `Community_${c[1]}`, fileName: `Community_${c[1]}.bsd` };
  const g = /^p2p-(\d+)-(\d)-/.exec(id);
  if (g) return { name: `Plan_${g[1]}sf_${g[2]}BR`, fileName: `Plan_${g[1]}sf_${g[2]}BR.bsd` };
  return { name: id, fileName: `${id}.bsd` };
}
