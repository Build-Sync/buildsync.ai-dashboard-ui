/**
 * lib/ground.ts
 *
 * WHAT   The kinds of ground a site can have (lawn, dirt, clay, loam, sand, gravel, rock) and what each means:
 *        - how it looks: the colour of its surface and of its cut face, and a texture drawn on the surface in 3D;
 *        - what it is: the soil classes it stands for (USCS), a presumptive allowable bearing pressure from the
 *          code table (FBC-R Table R401.4.1, the same values as IBC Table 1806.2), a typical percolation rate,
 *          and how a septic drain field and the footings fare in it.
 *        groundOf(project) is the project's ground (project.ground, lawn when not set); groundNotes() writes the
 *        lines the Material Analysis report adds when no soil report is attached.
 * FOR    The ground picker (Site palette → Ground, the GROUND command, Insert → Site → Ground Type), the 3D
 *        renderer (lib/scene/render.ts `ground`), the elevation and section sheets (the ground under the finished
 *        grade line) and the reports (lib/reports.ts).
 * DEBUG  - The ground keeps its old colour: choosing a type writes its surface colour into the Topography
 *          colour slot (Appearance), which can then be changed by hand; see setGround in lib/commands.ts.
 *        - The numbers are presumptive values for a code check, not a survey: a soil report (Insert → Soil Data)
 *          always governs, and the reports say so.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { Project } from "./types";

/** The kinds of ground. */
export const GROUND_TYPES = ["lawn", "dirt", "clay", "loam", "sand", "gravel", "rock"] as const;
/** One kind of ground. */
export type GroundType = (typeof GROUND_TYPES)[number];

/** The texture drawn on the ground's surface in 3D (an SVG pattern in components/workspace/Viewport/Overlays.tsx). */
export type GroundPattern = "grass" | "speckle" | "clods" | "loam" | "sand" | "gravel" | "rock";

/** What a kind of ground looks like and what it means for the building. */
export interface GroundSpec {
  id: GroundType;
  label: string;
  /** one line on what it is */
  desc: string;
  /** colour of the surface (written into the Topography colour slot when chosen) */
  top: string;
  /** colour of the ground's cut face (sides of the site block, sections) */
  side: string;
  pattern: GroundPattern;
  /** the Unified Soil Classification groups it stands for */
  uscs: string;
  /** presumptive allowable bearing pressure, psf (FBC-R Table R401.4.1 / IBC Table 1806.2) */
  bearing: number;
  /** typical percolation rate, minutes per inch (low = drains fast); null where it does not apply */
  perc: [number, number] | null;
  /** how a septic drain field fares */
  septic: string;
  /** what the footings need */
  footing: string;
}

/** Every kind of ground, in the order the picker shows them. */
export const GROUNDS: Record<GroundType, GroundSpec> = {
  lawn: {
    id: "lawn",
    label: "Lawn (topsoil)",
    desc: "Grass on a few inches of topsoil over silty or sandy soil",
    top: "#4d6a52",
    side: "#6b5742",
    pattern: "grass",
    uscs: "ML, CL (topsoil stripped under the building)",
    bearing: 1500,
    perc: [10, 30],
    septic: "usually fine for a conventional drain field; confirm with a perc test",
    footing: "strip the topsoil and organics under the footings and slab",
  },
  dirt: {
    id: "dirt",
    label: "Dirt (bare earth)",
    desc: "Bare, unclassified earth or graded fill",
    top: "#8a6a4c",
    side: "#6b5742",
    pattern: "speckle",
    uscs: "unclassified: use the lowest table value until it is tested",
    bearing: 1500,
    perc: [15, 45],
    septic: "unknown until tested: a perc test decides the drain field size",
    footing: "compact fill to 95% (modified Proctor) under footings and slab, in lifts of 12\" or less",
  },
  clay: {
    id: "clay",
    label: "Clay soil",
    desc: "Fine, sticky soil that holds water and swells when wet",
    top: "#9a6b4b",
    side: "#7d5236",
    pattern: "clods",
    uscs: "CL, CH (lean and fat clay)",
    bearing: 1500,
    perc: [60, 120],
    septic: "drains slowly (60+ min/in): a conventional drain field usually fails; expect a mound or an engineered system",
    footing: "check for expansive clay (FBC-R R403.1.8): footings below the zone of seasonal moisture change, or a post-tensioned slab",
  },
  loam: {
    id: "loam",
    label: "Loam",
    desc: "A mix of sand, silt and clay: dark, crumbly garden soil",
    top: "#5e4a36",
    side: "#4f3d2c",
    pattern: "loam",
    uscs: "ML, SM, SC (silt and sand mixes)",
    bearing: 1500,
    perc: [10, 30],
    septic: "good for a conventional drain field (10–30 min/in)",
    footing: "remove the organic topsoil under footings; bear on the firm subsoil",
  },
  sand: {
    id: "sand",
    label: "Sandy soil",
    desc: "Loose, gritty soil that drains fast",
    top: "#d2b98a",
    side: "#b69a68",
    pattern: "sand",
    uscs: "SW, SP, SM (sand and silty sand)",
    bearing: 2000,
    perc: [1, 10],
    septic: "drains fast: good for a drain field, but under 1 min/in needs a sand filter to treat the effluent",
    footing: "compact loose sand before pouring; keep footings 12\" below grade at least",
  },
  gravel: {
    id: "gravel",
    label: "Gravel",
    desc: "Sandy gravel and stone",
    top: "#a7a19a",
    side: "#7f786f",
    pattern: "gravel",
    uscs: "GW, GP (well and poorly graded gravel)",
    bearing: 3000,
    perc: [0.5, 5],
    septic: "drains too fast to treat effluent: lined trenches or a sand filter",
    footing: "good bearing: standard footings, no special treatment",
  },
  rock: {
    id: "rock",
    label: "Rock (limestone)",
    desc: "Sedimentary rock (limestone, sandstone) at or near the surface",
    top: "#bdb6a6",
    side: "#8f877a",
    pattern: "rock",
    uscs: "sedimentary and foliated rock",
    bearing: 4000,
    perc: null,
    septic: "no conventional drain field: rock does not percolate; an above-ground or engineered system",
    footing: "footings can bear on sound rock; trenching needs a rock saw or hammer",
  },
};

/** The ground a project has (lawn when it was never chosen). */
export function groundOf(project: Pick<Project, "ground">): GroundSpec {
  return GROUNDS[project.ground ?? "lawn"] ?? GROUNDS.lawn;
}

/** Read a ground type from what someone typed ("clay", "Sandy soil", "LOAM"); null when it is none of them. */
export function parseGround(text: string): GroundType | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const hit = GROUND_TYPES.find((g) => g === t || GROUNDS[g].label.toLowerCase().startsWith(t) || (t.length >= 3 && g.startsWith(t.slice(0, 4))));
  if (hit) return hit;
  if (/grass|topsoil|turf/.test(t)) return "lawn";
  if (/earth|soil|fill/.test(t)) return "dirt";
  if (/stone|limestone|bedrock/.test(t)) return "rock";
  return null;
}

/** The lines the reports add about the ground when there is no soil report (presumptive values only). */
export function groundNotes(g: GroundSpec): string[] {
  const perc = g.perc ? `${g.perc[0]}–${g.perc[1]} min/in` : "does not percolate";
  return [
    `Ground: ${g.label} (${g.uscs}): presumptive allowable bearing ${g.bearing.toLocaleString("en-US")} psf (FBC-R Table R401.4.1)${g.bearing < 2000 ? `; 24" continuous footings carry about ${(g.bearing * 2).toLocaleString("en-US")} plf` : ""}. Footings: ${g.footing}.`,
    `Septic in ${g.label.toLowerCase()} (typical perc ${perc}): ${g.septic}. A perc test and a soil report govern.`,
  ];
}
