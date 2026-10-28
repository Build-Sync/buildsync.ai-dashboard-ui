/**
 * lib/mock-data.ts
 *
 * WHAT   All sample content for the UI build: three sample projects (Residence_2BR_Miami, a two-storey house;
 *        Cottage_2BR_1BA, a one-storey two-bedroom, one-bath house with a septic system; Clinic_Phase1_Antigua)
 *        with their checks, issues, clashes, comments, schedule, cost and health; a blank starter project; the
 *        recent-projects list, templates, jurisdictions and team members.
 * FOR    The data layer that stands in for a back end (lib/services/projects.ts hands these out). Code section
 *        numbers, costs and names are placeholders, not engineering advice.
 * DEBUG  - A project shows wrong numbers: edit RESIDENCE or CLINIC here; the status bar score is
 *          project.health.score.
 *        - A layer is hidden at start: LAYER_DEFS sets the initial visibility (electrical, plumbing, HVAC and
 *          fire start off).
 *        - New projects: blankProject(id, n) builds "Untitled_n".
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type {
  Clash,
  CodeCheck,
  Comment,
  CostModel,
  HealthModel,
  Issue,
  Layer,
  LayerId,
  Level,
  Member,
  Phase,
  Project,
  RecentProject,
  Stage,
} from "./types";

/* All data in this file is illustrative mock content for the UI build.
 * Code section numbers, costs and names are placeholders, not engineering advice. */

/** Id of the sample residence (also the /demo project). */
export const DEMO_PROJECT_ID = "residence-2br-miami";
/** Id of the sample clinic. */
export const CLINIC_PROJECT_ID = "clinic-phase1-antigua";
/** Id of the sample one-storey cottage (two bedrooms, one bath). */
export const COTTAGE_PROJECT_ID = "cottage-2br-1ba";

/* ── layers ───────────────────────────────────────────────────────────── */
const LAYER_DEFS: { id: LayerId; name: string; color: string; visible: boolean }[] = [
  { id: "topography", name: "Topography", color: "#4d6a52", visible: true },
  { id: "site", name: "Site / Trees", color: "#3f8a4e", visible: true },
  { id: "utilities", name: "Site Utilities (septic, wells)", color: "#8d8a7c", visible: true },
  { id: "foundation", name: "Foundation", color: "#8f9bb0", visible: true },
  { id: "walls", name: "Walls", color: "#c9ced8", visible: true },
  { id: "roof", name: "Roof", color: "#b4604a", visible: true },
  { id: "electrical", name: "Electrical", color: "#f4c542", visible: false },
  { id: "plumbing", name: "Plumbing", color: "#3fb6e8", visible: false },
  { id: "hvac", name: "HVAC", color: "#9fb4c8", visible: false },
  { id: "fire", name: "Fire", color: "#ef5b5b", visible: false },
  { id: "interior", name: "Interior", color: "#e6e1d6", visible: true },
  { id: "landscape", name: "Landscape", color: "#5fae6a", visible: true },
  { id: "civil", name: "Roads & Drainage", color: "#8b919b", visible: true },
  { id: "furniture", name: "Furniture", color: "#a28a6c", visible: true },
  { id: "callouts", name: "Callouts / Documentation", color: "#e7eaef", visible: true },
  { id: "drafting", name: "Drafting", color: "#cfd6e2", visible: true },
  { id: "annotation", name: "Annotations", color: "#f0c63c", visible: true },
];

/** A fresh copy of the model layers (none locked). */
export function makeLayers(): Layer[] {
  return LAYER_DEFS.map((l) => ({ ...l, locked: false }));
}

const STD_LEVELS: Level[] = [
  { id: "roof", name: "Roof", elevation: 19.5, label: "+19.5" },
  { id: "level2", name: "Level 2", elevation: 9.75, label: "+9.75" },
  { id: "level1", name: "Level 1", elevation: 0, label: "±0.0" },
  { id: "foundation", name: "Foundation", elevation: -2.5, label: "−2.5" },
  { id: "site", name: "Site", elevation: -4, label: "−4.0" },
];

/* ── Residence_2BR_Miami ──────────────────────────────────────────────── */
const residenceChecks: CodeCheck[] = [
  { id: "CK-01", group: "Structural", rule: "Wind design pressures (components & cladding)", section: "FBC-B §1609.1.1", status: "pass", elements: ["W-L1-S", "W-L1-W", "W-L2-S", "W-L2-E"] },
  { id: "CK-02", group: "Structural", rule: "Roof-to-wall uplift connections", section: "FBC-B §1620 (HVHZ)", status: "review", elements: ["R-01", "R-02", "W-L2-W"], peReview: true, fix: "Specify hurricane clips rated ≥ 1,200 lb uplift at 24\" o.c. and attach the product approval (NOA)." },
  { id: "CK-03", group: "Structural", rule: "Opening protection — impact-rated glazing", section: "FBC-B §1609.2", status: "review", elements: ["WN-203", "WN-208"], fix: "Add Miami-Dade NOA numbers for the Level 2 north windows." },
  { id: "CK-04", group: "Structural", rule: "Soil bearing & footing width", section: "FBC-B §1806.2", status: "pass", elements: ["F-FT-S", "F-FT-N", "F-FT-W", "F-FT-E"] },
  { id: "CK-05", group: "Structural", rule: "Floor beam deflection limit L/360", section: "FBC-B §1604.3.1", status: "fail", elements: ["B-L1-M1"], peReview: true, fix: "Increase B-L1-M1 depth from 8\" to 10\" or add a mid-span post. Re-run the stress test after the change." },
  { id: "CK-06", group: "Egress & Accessibility", rule: "Egress door clear width ≥ 32\"", section: "FBC-R §R311.2", status: "pass", elements: ["D-101", "D-102"] },
  { id: "CK-07", group: "Egress & Accessibility", rule: "Stair riser ≤ 7¾\" and tread ≥ 10\"", section: "FBC-R §R311.7.5", status: "pass", elements: ["ST-01"] },
  { id: "CK-08", group: "Egress & Accessibility", rule: "Stair headroom ≥ 6'-8\" at landing", section: "FBC-R §R311.7.2", status: "review", elements: ["ST-01", "SL-L2"], fix: "Headroom at the landing measures 6'-6\". Raise the Level 2 slab soffit or move the landing 8\"." },
  { id: "CK-09", group: "Egress & Accessibility", rule: "Emergency escape opening in sleeping rooms", section: "FBC-R §R310.1", status: "pass", elements: ["WN-106", "WN-201"] },
  { id: "CK-10", group: "Energy", rule: "Ceiling insulation R-38 (Zone 1)", section: "FBC-EC §R402.1.2", status: "pass", elements: ["R-01", "R-02"] },
  { id: "CK-11", group: "Energy", rule: "Window U-factor / SHGC", section: "FBC-EC §R402.1.2", status: "review", elements: ["WN-101", "WN-102", "WN-103"], fix: "Two windows list SHGC 0.40; Zone 1 requires ≤ 0.25." },
  { id: "CK-12", group: "Energy", rule: "Air leakage ≤ 5 ACH50", section: "FBC-EC §R402.4.1.2", status: "pass", elements: [] },
  { id: "CK-13", group: "Energy", rule: "Duct sealing and testing", section: "FBC-EC §R403.3", status: "pass", elements: [] },
  { id: "CK-14", group: "Fire", rule: "Smoke alarms in each sleeping room", section: "FBC-R §R314.3", status: "pass", elements: ["FU-BED1", "FU-BED2"] },
  { id: "CK-15", group: "Fire", rule: "Residential sprinkler system (NFPA 13D)", section: "FBC-R §R313.2", status: "pass", elements: [] },
  { id: "CK-16", group: "Fire", rule: "Exterior wall fire rating near lot line", section: "FBC-R §R302.1", status: "pass", elements: ["W-L1-W", "W-L2-W"] },
  { id: "CK-17", group: "Fire", rule: "Carbon-monoxide alarm outside sleeping areas", section: "FBC-R §R315.1", status: "fail", elements: ["P-L2-2"], fix: "Add a CO alarm in the Level 2 landing outside Bedroom 2." },
];

const residenceIssues: Issue[] = [
  { id: "IS-101", severity: "critical", title: "Floor beam B-L1-M1 exceeds deflection limit", location: "Level 1 · Grid A–B / 2", elementId: "B-L1-M1", assignee: "R. Okafor", status: "open", due: "2027-01-08", },
  { id: "IS-102", severity: "high", title: "Hurricane clip schedule missing uplift rating", location: "Roof · West eave", elementId: "R-01", assignee: "M. Chen", status: "in-progress", due: "2027-01-12" },
  { id: "IS-103", severity: "high", title: "CO alarm missing on Level 2 landing", location: "Level 2 · Landing", elementId: "P-L2-2", assignee: "D. Patel", status: "open", due: "2027-01-15" },
  { id: "IS-104", severity: "medium", title: "Stair headroom 6'-6\" at mid landing", location: "Level 1 · Stair hall", elementId: "ST-01", assignee: "M. Chen", status: "in-progress", due: "2027-01-20" },
  { id: "IS-105", severity: "medium", title: "Window SHGC above Zone 1 limit", location: "Level 1 · South façade", elementId: "WN-101", assignee: "D. Patel", status: "open", due: "2027-01-22" },
  { id: "IS-106", severity: "low", title: "Door schedule tag mismatch (D-103 vs D-104)", location: "Level 1 · Bath", elementId: "D-104", assignee: "You", status: "resolved", due: "2026-12-18", resolution: "Tags renumbered; schedule regenerated." },
  { id: "IS-107", severity: "low", title: "Dimension chain missing at entry door", location: "Level 1 · Entry", elementId: "D-101", assignee: "You", status: "resolved", due: "2026-12-10", resolution: "Added 3'-0\" door dimension." },
  { id: "IS-108", severity: "medium", title: "Vent stack penetrates Level 2 slab without sleeve", location: "Level 2 · Storage", elementId: "SL-L2", assignee: "R. Okafor", status: "open", due: "2027-01-25" },
];

const residenceClashes: Clash[] = [
  { id: "CL-01", kind: "HARD", a: "Supply trunk H-L1 (12\")", b: "Floor beam B-L1-M1", level: "Level 1", fix: "Drop the trunk 4\" below the beam soffit or split into two 8\" ducts.", elementIds: ["B-L1-M1"] },
  { id: "CL-02", kind: "HARD", a: "Vent stack P-VENT (3\")", b: "Floor slab SL-L2", level: "Level 2", fix: "Add a 4\" Schedule 40 sleeve with fire-stop collar.", elementIds: ["SL-L2"] },
  { id: "CL-03", kind: "SOFT", a: "Bath door D-104 swing", b: "Vanity FX-VAN", level: "Level 1", fix: "Swing clearance 28\" < 30\" required. Reverse swing or use a pocket door.", elementIds: ["D-104", "FX-VAN"] },
  { id: "CL-04", kind: "SOFT", a: "Stair guardrail GR-201", b: "Loft sofa FU-LSOF", level: "Level 2", fix: "Move the sofa 24\" east for guard clearance.", elementIds: ["GR-201", "FU-LSOF"] },
  { id: "CL-05", kind: "HARD", a: "Sprinkler riser FP-RISER", b: "Tie column C-A1", level: "Level 1", fix: "Shift the riser 6\" east of the column face.", elementIds: ["C-A1"] },
];

const residenceCost: CostModel = {
  total: 643_500,
  range: 38_600,
  hard: 392_000,
  soft: 71_500,
  land: 180_000,
  basis: "Class 4 estimate · RSMeans 2026 · Miami-Dade HVHZ factor 1.18",
  materials: [
    { name: "Concrete & CMU", cost: 118_400 },
    { name: "Roofing & Framing", cost: 71_200 },
    { name: "Windows & Doors (Impact)", cost: 58_900 },
    { name: "MEP Systems", cost: 62_800 },
    { name: "Finishes & Fixtures", cost: 49_300 },
  ],
  workforce: [
    { trade: "Masons", headcount: 7, months: 2.5 },
    { trade: "Concrete Crew", headcount: 6, months: 2 },
    { trade: "Carpenters", headcount: 5, months: 2.5 },
    { trade: "Roofers", headcount: 4, months: 1 },
    { trade: "Electricians", headcount: 3, months: 1.5 },
    { trade: "Plumbers", headcount: 3, months: 1.2 },
    { trade: "HVAC Techs", headcount: 2, months: 1 },
    { trade: "Finishers", headcount: 6, months: 2.5 },
  ],
};

const residenceSchedule: Phase[] = [
  {
    name: "Site Prep & Excavation",
    key: "site",
    start: "2027-01-11",
    end: "2027-02-08",
    tasks: [
      { name: "Clearing & Survey Stake-Out", start: "2027-01-11", end: "2027-01-15", trade: "Survey", cost: 6_500, crew: 3, materials: [{ name: "Stakes & Lath", qty: 400, unit: "ea" }] },
      { name: "Excavation & Grading", start: "2027-01-18", end: "2027-02-05", trade: "Earthwork", cost: 21_000, crew: 5, materials: [{ name: "Structural Fill", qty: 120, unit: "cy" }] },
    ],
  },
  {
    name: "Foundation",
    key: "foundation",
    start: "2027-02-08",
    end: "2027-03-08",
    tasks: [
      { name: "Footing Rebar & Formwork", start: "2027-02-08", end: "2027-02-19", trade: "Concrete", cost: 24_500, crew: 6, materials: [{ name: "Rebar #5", qty: 3.2, unit: "ton" }, { name: "Lumber Forms", qty: 1_800, unit: "bf" }] },
      { name: "Footing & Stem-Wall Pour", start: "2027-02-22", end: "2027-03-01", trade: "Concrete", cost: 31_000, crew: 7, materials: [{ name: "Concrete 4000 psi", qty: 52, unit: "cy" }] },
      { name: "Slab on Grade", start: "2027-03-02", end: "2027-03-08", trade: "Concrete", cost: 18_500, crew: 6, materials: [{ name: "Concrete 4000 psi", qty: 18, unit: "cy" }, { name: "Welded Wire Mesh", qty: 1_200, unit: "sf" }] },
    ],
  },
  {
    name: "Structure — Level 1",
    key: "structure1",
    start: "2027-03-08",
    end: "2027-04-19",
    tasks: [
      { name: "CMU Walls, Level 1", start: "2027-03-08", end: "2027-03-31", trade: "Masonry", cost: 52_000, crew: 7, materials: [{ name: "CMU 8\"", qty: 2_100, unit: "ea" }, { name: "Grout", qty: 14, unit: "cy" }] },
      { name: "Tie Columns & Bond Beam", start: "2027-03-24", end: "2027-04-07", trade: "Concrete", cost: 22_500, crew: 5, materials: [{ name: "Concrete 4000 psi", qty: 16, unit: "cy" }, { name: "Rebar #6", qty: 1.4, unit: "ton" }] },
      { name: "Level 2 Slab & Floor Beams", start: "2027-04-08", end: "2027-04-19", trade: "Concrete", cost: 38_000, crew: 8, materials: [{ name: "Concrete 4000 psi", qty: 24, unit: "cy" }, { name: "Rebar #5", qty: 2.1, unit: "ton" }] },
    ],
  },
  {
    name: "Structure — Level 2",
    key: "structure2",
    start: "2027-04-19",
    end: "2027-05-24",
    tasks: [
      { name: "CMU Walls, Level 2", start: "2027-04-19", end: "2027-05-10", trade: "Masonry", cost: 44_000, crew: 7, materials: [{ name: "CMU 8\"", qty: 1_900, unit: "ea" }, { name: "Grout", qty: 12, unit: "cy" }] },
      { name: "Tie Columns & Bond Beam", start: "2027-05-06", end: "2027-05-24", trade: "Concrete", cost: 24_000, crew: 5, materials: [{ name: "Concrete 4000 psi", qty: 14, unit: "cy" }] },
    ],
  },
  {
    name: "Roof",
    key: "roof",
    start: "2027-05-24",
    end: "2027-06-28",
    tasks: [
      { name: "Trusses & Sheathing", start: "2027-05-24", end: "2027-06-11", trade: "Carpentry", cost: 36_000, crew: 5, materials: [{ name: "Roof Trusses", qty: 16, unit: "ea" }, { name: "Plywood 5/8\"", qty: 1_050, unit: "sf" }] },
      { name: "Underlayment & Tile", start: "2027-06-11", end: "2027-06-28", trade: "Roofing", cost: 41_000, crew: 4, materials: [{ name: "Concrete Tile", qty: 1_020, unit: "sf" }] },
    ],
  },
  {
    name: "Envelope",
    key: "envelope",
    start: "2027-06-14",
    end: "2027-07-26",
    tasks: [
      { name: "Impact Windows & Doors", start: "2027-06-14", end: "2027-07-02", trade: "Glazing", cost: 58_900, crew: 4, materials: [{ name: "Impact Windows", qty: 15, unit: "ea" }, { name: "Impact Doors", qty: 2, unit: "ea" }] },
      { name: "Stucco & Waterproofing", start: "2027-07-05", end: "2027-07-26", trade: "Plaster", cost: 27_500, crew: 6, materials: [{ name: "Stucco", qty: 3_900, unit: "sf" }] },
      { name: "Interior Framing", start: "2027-07-05", end: "2027-07-19", trade: "Carpentry", cost: 14_000, crew: 4, materials: [{ name: "Metal Studs", qty: 1_400, unit: "lf" }] },
    ],
  },
  {
    name: "MEP Rough-In",
    key: "mep",
    start: "2027-07-19",
    end: "2027-09-06",
    tasks: [
      { name: "Electrical Rough-In", start: "2027-07-19", end: "2027-08-16", trade: "Electrical", cost: 24_000, crew: 3, materials: [{ name: "Wire & Conduit", qty: 6_500, unit: "lf" }] },
      { name: "Plumbing Rough-In", start: "2027-07-26", end: "2027-08-13", trade: "Plumbing", cost: 19_500, crew: 3, materials: [{ name: "PVC / PEX", qty: 1_600, unit: "lf" }] },
      { name: "HVAC Ductwork & Air Handler", start: "2027-08-09", end: "2027-08-30", trade: "HVAC", cost: 16_800, crew: 2, materials: [{ name: "Duct", qty: 380, unit: "lf" }] },
      { name: "Fire Sprinkler (NFPA 13D)", start: "2027-08-23", end: "2027-09-06", trade: "Fire", cost: 8_500, crew: 2 },
    ],
  },
  {
    name: "Finishes",
    key: "finishes",
    start: "2027-09-06",
    end: "2027-11-15",
    tasks: [
      { name: "Drywall & Paint", start: "2027-09-06", end: "2027-10-04", trade: "Finishers", cost: 21_000, crew: 6, materials: [{ name: "Gypsum Board", qty: 5_400, unit: "sf" }] },
      { name: "Tile & Flooring", start: "2027-09-27", end: "2027-10-18", trade: "Finishers", cost: 17_500, crew: 4, materials: [{ name: "Tile", qty: 1_100, unit: "sf" }] },
      { name: "Cabinets & Fixtures", start: "2027-10-11", end: "2027-11-15", trade: "Finishers", cost: 16_000, crew: 4 },
    ],
  },
  {
    name: "Inspections & CO",
    start: "2027-11-15",
    end: "2027-12-06",
    tasks: [{ name: "Final Inspections & Certificate of Occupancy", start: "2027-11-15", end: "2027-12-06", trade: "Permitting", cost: 3_500, crew: 2 }],
  },
];

const residenceStages: Stage[] = [
  { name: "Concept", status: "done", percent: 100, openTasks: 0, openIssues: 0, approvals: 0 },
  { name: "Design", status: "done", percent: 100, openTasks: 0, openIssues: 0, approvals: 0 },
  { name: "Engineering", status: "active", percent: 82, openTasks: 4, openIssues: 3, approvals: 1 },
  { name: "Analysis", status: "active", percent: 55, openTasks: 3, openIssues: 2, approvals: 0 },
  { name: "Documentation", status: "upcoming", percent: 12, openTasks: 6, openIssues: 0, approvals: 1 },
  { name: "Approval", status: "upcoming", percent: 0, openTasks: 2, openIssues: 0, approvals: 2 },
  { name: "Construction", status: "upcoming", percent: 0, openTasks: 12, openIssues: 0, approvals: 0 },
];

const residenceHealth: HealthModel = {
  score: 82,
  delta: 4,
  compliance: 80,
  structural: 74,
  cost: 91,
  schedule: 88,
  summary:
    "Strongest areas are Cost (91) and Schedule (88). Structural (74) is the weakest: one floor beam fails the deflection limit and the roof-to-wall connections still need PE review.",
  ranges: {
    all: { score: 82, delta: 4, compliance: 80, structural: 74, cost: 91, schedule: 88 },
    "30d": { score: 82, delta: 9, compliance: 80, structural: 74, cost: 91, schedule: 88 },
    version: { score: 82, delta: 4, compliance: 80, structural: 74, cost: 91, schedule: 88 },
  },
};

const residenceComments: Comment[] = [
  {
    id: "CM-1",
    author: "Maya Chen",
    text: "Can we confirm the beam under the kitchen is sized for the island load? The deflection check looks tight.",
    at: "2 h ago",
    resolved: false,
    elementId: "B-L1-M1",
    replies: [{ id: "CR-1", author: "R. Okafor", text: "Agreed — I'll rerun the stress test with the 30 psf live load case.", at: "1 h ago" }],
    attachments: [],
    history: ["Created by Maya Chen", "Reply by R. Okafor"],
  },
  {
    id: "CM-2",
    author: "Dev Patel",
    text: "@Maya the NOA numbers for the north windows are attached. Still need the SHGC sheet.",
    at: "Yesterday",
    resolved: false,
    elementId: "WN-203",
    replies: [],
    attachments: ["NOA-north-windows.pdf"],
    history: ["Created by Dev Patel", "Attachment added"],
  },
  {
    id: "CM-3",
    author: "You",
    text: "Pinned the roof clip detail here so the roofer sees it in the 3D model.",
    at: "2 days ago",
    resolved: false,
    elementId: "R-01",
    replies: [],
    attachments: ["clip-detail.png"],
    history: ["Created by You"],
  },
  {
    id: "CM-4",
    author: "M. Chen",
    text: "Entry step height updated to 6\" to meet the threshold requirement.",
    at: "3 days ago",
    resolved: true,
    elementId: "ST-ENT",
    replies: [],
    attachments: [],
    history: ["Created by M. Chen", "Resolved by You"],
  },
];

/** The sample two-bedroom house in Miami. */
export const RESIDENCE: Project = {
  id: DEMO_PROJECT_ID,
  name: "Residence_2BR_Miami",
  fileName: "Residence_2BR.bsd",
  jurisdiction: { name: "Miami-Dade, FL", codeSet: "FBC 8th Ed. · HVHZ" },
  address: "1420 SW 27th Ave, Miami, FL 33145",
  client: "Alvarez Family Trust",
  architect: "Studio Marais Architects",
  engineer: "R. Okafor, PE",
  sceneKind: "residence",
  levels: STD_LEVELS,
  layers: makeLayers(),
  issues: residenceIssues,
  clashes: residenceClashes,
  checks: residenceChecks,
  cost: residenceCost,
  schedule: residenceSchedule,
  stages: residenceStages,
  health: residenceHealth,
  comments: residenceComments,
  startDate: "2027-01-11",
  // approximate spot for the sample address; a 50 × 100 ft lot around the house (set the real one in the Site palette)
  site: { lat: 25.7593, lon: -80.2378, north: 0, source: "sample", boundary: [[-13, -36], [37, -36], [37, 64], [-13, 64]] },
  versions: [
    { id: "v1.4", label: "v1.4 — current", at: "Today, 10:42", by: "You" },
    { id: "v1.3", label: "v1.3 — added stair and L2 partitions", at: "Yesterday, 16:05", by: "M. Chen" },
    { id: "v1.2", label: "v1.2 — foundation revised for soil report", at: "3 days ago", by: "R. Okafor" },
    { id: "v1.1", label: "v1.1 — first compliance pass", at: "1 week ago", by: "You" },
    { id: "v1.0", label: "v1.0 — imported concept plan", at: "2 weeks ago", by: "You" },
  ],
};

/* ── Cottage_2BR_1BA (one storey, two bedrooms, one bath, septic) ─────── */
const COTTAGE_LEVELS: Level[] = [
  { id: "roof", name: "Roof", elevation: 9, label: "+9.0" },
  { id: "level1", name: "Level 1", elevation: 0, label: "±0.0" },
  { id: "foundation", name: "Foundation", elevation: -2.5, label: "−2.5" },
  { id: "site", name: "Site", elevation: -4, label: "−4.0" },
];

const cottageChecks: CodeCheck[] = [
  { id: "CK-01", group: "Structural", rule: "Wind design pressures (components & cladding)", section: "FBC-R §R301.2.1", status: "pass", elements: ["W-L1-S", "W-L1-N", "W-L1-W", "W-L1-E"] },
  { id: "CK-02", group: "Structural", rule: "Footing size for the soil bearing (24\" × 12\" continuous)", section: "FBC-R §R403.1", status: "pass", elements: ["F-FT-S", "F-FT-N", "F-FT-W", "F-FT-E"] },
  { id: "CK-03", group: "Structural", rule: "Roof-to-wall uplift connectors", section: "FBC-R §R802.11", status: "review", elements: ["R-01", "R-02", "B-L1-W", "B-L1-E"], peReview: true, fix: "Specify a connector rated ≥ 600 lb uplift at every truss and attach the product approval." },
  { id: "CK-04", group: "Structural", rule: "Porch post footings and uplift anchors", section: "FBC-R §R407.3", status: "pass", elements: ["F-PIER-1", "F-PIER-2", "PO-P1", "PO-P2"] },
  { id: "CK-05", group: "Structural", rule: "Thickened slab under bearing walls", section: "FBC-R §R506.2", status: "pass", elements: ["F-TS-1", "F-TS-2"] },
  { id: "CK-06", group: "Egress & Accessibility", rule: "Emergency escape opening in each bedroom", section: "FBC-R §R310.1", status: "pass", elements: ["WN-103", "WN-104", "WN-107", "WN-110"] },
  { id: "CK-07", group: "Egress & Accessibility", rule: "Egress door clear width ≥ 32\"", section: "FBC-R §R311.2", status: "pass", elements: ["D-101", "D-102"] },
  { id: "CK-08", group: "Energy", rule: "Ceiling insulation R-38", section: "FBC-EC §R402.1.2", status: "pass", elements: ["R-01", "R-02"] },
  { id: "CK-09", group: "Energy", rule: "Window SHGC ≤ 0.25 (Zone 2)", section: "FBC-EC §R402.1.2", status: "review", elements: ["WN-101", "WN-102"], fix: "The front windows list SHGC 0.30. Choose a low-e glass with SHGC ≤ 0.25." },
  { id: "CK-10", group: "Fire", rule: "Smoke alarms in each bedroom and the hall", section: "FBC-R §R314.3", status: "pass", elements: [] },
  { id: "CK-11", group: "Structural", rule: "Septic tank ≥ 5 ft from the building", section: "FAC 64E-6.005", status: "pass", elements: ["SEP-TANK"] },
  { id: "CK-12", group: "Structural", rule: "Drain field ≥ 75 ft from a private well", section: "FAC 64E-6.005", status: "review", elements: ["SEP-FIELD"], fix: "No well is on the site plan yet. Locate the well (or confirm city water) and keep it 75 ft from the drain field." },
  { id: "CK-13", group: "Structural", rule: "Septic tank capacity for 2 bedrooms ≥ 900 gal", section: "FAC 64E-6.008", status: "pass", elements: ["SEP-TANK"] },
];

/** The sample one-storey house: two bedrooms, one bath, a full foundation and a septic system. */
export const COTTAGE: Project = {
  id: COTTAGE_PROJECT_ID,
  name: "Cottage_2BR_1BA",
  fileName: "Cottage_2BR.bsd",
  jurisdiction: { name: "Orange County, FL", codeSet: "FBC 8th Ed." },
  address: "2207 Lake Pickett Rd, Orlando, FL 32820",
  client: "J. & R. Moreno",
  architect: "Studio Marais Architects",
  engineer: "R. Okafor, PE",
  sceneKind: "cottage",
  levels: COTTAGE_LEVELS,
  layers: makeLayers(),
  issues: [
    { id: "IS-301", severity: "high", title: "Roof-to-wall connector schedule missing", location: "Roof · eaves", elementId: "R-01", assignee: "R. Okafor", status: "in-progress", due: "2027-02-05" },
    { id: "IS-302", severity: "medium", title: "Front window SHGC above the Zone 2 limit", location: "Level 1 · South façade", elementId: "WN-101", assignee: "D. Patel", status: "open", due: "2027-02-10" },
    { id: "IS-303", severity: "medium", title: "Locate the private well 75 ft from the drain field", location: "Site · back yard", elementId: "SEP-FIELD", assignee: "You", status: "open", due: "2027-02-12" },
    { id: "IS-304", severity: "low", title: "Porch post base detail", location: "Front porch", elementId: "PO-P1", assignee: "M. Chen", status: "resolved", due: "2027-01-20", resolution: "Detail 3/S-201 added." },
  ],
  clashes: [{ id: "CL-01", kind: "SOFT", a: "Water heater FX-WH", b: "Laundry door D-105 swing", level: "Level 1", fix: "Move the water heater 6\" east or reverse the door swing.", elementIds: ["FX-WH", "D-105"] }],
  checks: cottageChecks,
  cost: {
    total: 318_400,
    range: 22_300,
    hard: 214_900,
    soft: 30_500,
    land: 73_000,
    basis: "Class 4 estimate · Central Florida unit rates 2026 · includes the septic system",
    materials: [
      { name: "Concrete & CMU", cost: 62_400 },
      { name: "Roofing & Framing", cost: 34_800 },
      { name: "Windows & Doors", cost: 26_900 },
      { name: "MEP Systems", cost: 38_600 },
      { name: "Septic System", cost: 11_800 },
      { name: "Finishes & Fixtures", cost: 40_400 },
    ],
    workforce: [
      { trade: "Masons", headcount: 5, months: 1.5 },
      { trade: "Concrete Crew", headcount: 5, months: 1 },
      { trade: "Carpenters", headcount: 4, months: 1.5 },
      { trade: "Septic Contractor", headcount: 3, months: 0.5 },
      { trade: "Electricians", headcount: 2, months: 1 },
      { trade: "Plumbers", headcount: 2, months: 1 },
      { trade: "Finishers", headcount: 4, months: 2 },
    ],
  },
  schedule: [
    { name: "Site Prep & Septic", key: "site", start: "2027-03-01", end: "2027-03-26", tasks: [{ name: "Clearing & Stake-Out", start: "2027-03-01", end: "2027-03-05", trade: "Survey", cost: 4_200, crew: 3 }, { name: "Septic Tank & Drain Field", start: "2027-03-08", end: "2027-03-26", trade: "Septic Contractor", cost: 11_800, crew: 3, materials: [{ name: "Septic Tank 1,000 gal", qty: 1, unit: "ea" }, { name: "Washed Gravel", qty: 38, unit: "cy" }] }] },
    { name: "Foundation", key: "foundation", start: "2027-03-15", end: "2027-04-09", tasks: [{ name: "Footings, Stem Walls & Piers", start: "2027-03-15", end: "2027-03-31", trade: "Concrete", cost: 21_500, crew: 5, materials: [{ name: "Concrete 3000 psi", qty: 24, unit: "cy" }, { name: "Rebar #5", qty: 1.2, unit: "ton" }] }, { name: "Slab on Grade", start: "2027-04-01", end: "2027-04-09", trade: "Concrete", cost: 12_400, crew: 5, materials: [{ name: "Concrete 3000 psi", qty: 14, unit: "cy" }] }] },
    { name: "Walls", key: "structure1", start: "2027-04-12", end: "2027-05-14", tasks: [{ name: "CMU Walls & Tie Columns", start: "2027-04-12", end: "2027-05-07", trade: "Masonry", cost: 38_000, crew: 5 }, { name: "Bond Beam", start: "2027-05-05", end: "2027-05-14", trade: "Concrete", cost: 9_800, crew: 4 }] },
    { name: "Roof", key: "roof", start: "2027-05-17", end: "2027-06-11", tasks: [{ name: "Trusses & Sheathing", start: "2027-05-17", end: "2027-05-31", trade: "Carpentry", cost: 18_600, crew: 4 }, { name: "Shingles & Porch Roof", start: "2027-06-01", end: "2027-06-11", trade: "Roofing", cost: 12_200, crew: 3 }] },
    { name: "Envelope & MEP", key: "mep", start: "2027-06-07", end: "2027-07-23", tasks: [{ name: "Windows & Doors", start: "2027-06-07", end: "2027-06-18", trade: "Glazing", cost: 26_900, crew: 3 }, { name: "MEP Rough-In", start: "2027-06-21", end: "2027-07-23", trade: "MEP", cost: 38_600, crew: 4 }] },
    { name: "Finishes", key: "finishes", start: "2027-07-26", end: "2027-09-17", tasks: [{ name: "Drywall, Paint, Floors & Cabinets", start: "2027-07-26", end: "2027-09-17", trade: "Finishers", cost: 40_400, crew: 5 }] },
    { name: "Inspections & CO", start: "2027-09-20", end: "2027-10-01", tasks: [{ name: "Final Inspections & Septic Approval", start: "2027-09-20", end: "2027-10-01", trade: "Permitting", cost: 2_100, crew: 2 }] },
  ],
  stages: [
    { name: "Concept", status: "done", percent: 100, openTasks: 0, openIssues: 0, approvals: 0 },
    { name: "Design", status: "done", percent: 100, openTasks: 0, openIssues: 0, approvals: 0 },
    { name: "Engineering", status: "active", percent: 70, openTasks: 3, openIssues: 2, approvals: 1 },
    { name: "Analysis", status: "active", percent: 40, openTasks: 2, openIssues: 1, approvals: 0 },
    { name: "Documentation", status: "upcoming", percent: 10, openTasks: 5, openIssues: 0, approvals: 1 },
    { name: "Approval", status: "upcoming", percent: 0, openTasks: 2, openIssues: 0, approvals: 2 },
    { name: "Construction", status: "upcoming", percent: 0, openTasks: 9, openIssues: 0, approvals: 0 },
  ],
  health: {
    score: 87,
    delta: 3,
    compliance: 86,
    structural: 84,
    cost: 92,
    schedule: 88,
    summary: "A simple one-storey plan on a full foundation. Cost (92) is strongest; the roof-to-wall connectors still need PE review and the well location must be confirmed against the drain field.",
    ranges: {
      all: { score: 87, delta: 3, compliance: 86, structural: 84, cost: 92, schedule: 88 },
      "30d": { score: 87, delta: 5, compliance: 86, structural: 84, cost: 92, schedule: 88 },
      version: { score: 87, delta: 3, compliance: 86, structural: 84, cost: 92, schedule: 88 },
    },
  },
  comments: [
    { id: "CM-1", author: "R. Okafor", text: "Thickened slab under both hall walls: they carry the ceiling joists at mid-span.", at: "Today", resolved: false, elementId: "F-TS-1", replies: [], attachments: [], history: ["Created by R. Okafor"] },
    { id: "CM-2", author: "You", text: "Septic permit application sent with the 12 min/in perc test.", at: "Yesterday", resolved: false, elementId: "SEP-TANK", replies: [], attachments: ["perc-test.pdf"], history: ["Created by You"] },
  ],
  startDate: "2027-03-01",
  // approximate spot for the sample address; a 60 × 110 ft lot with the septic field in the back yard
  site: { lat: 28.5653, lon: -81.176, north: 0, source: "sample", boundary: [[-16, -30], [44, -30], [44, 80], [-16, 80]] },
  versions: [
    { id: "v0.3", label: "v0.3 — current", at: "Today, 08:40", by: "You" },
    { id: "v0.2", label: "v0.2 — septic system and porch added", at: "2 days ago", by: "M. Chen" },
    { id: "v0.1", label: "v0.1 — concept plan", at: "1 week ago", by: "You" },
  ],
};

/* ── Clinic_Phase1_Antigua ────────────────────────────────────────────── */
const clinicChecks: CodeCheck[] = [
  { id: "CK-01", group: "Structural", rule: "Wind design — Caribbean basic wind speed", section: "CUBiC Pt 2 §2.4", status: "pass", elements: ["W-L1-S", "W-L1-E"] },
  { id: "CK-02", group: "Structural", rule: "Roof slab uplift anchorage", section: "CUBiC Pt 2 §3.1", status: "review", elements: ["R-01"], peReview: true, fix: "Add roof-to-wall dowel schedule at the parapet." },
  { id: "CK-03", group: "Structural", rule: "Foundation bearing on coralline limestone", section: "CUBiC Pt 2 §5.2", status: "pass", elements: ["F-FT-S"] },
  { id: "CK-04", group: "Egress & Accessibility", rule: "Accessible route and ramp slope ≤ 1:12", section: "ABBC §11.3", status: "pass", elements: ["PV-RAMP", "PV-LAND"] },
  { id: "CK-05", group: "Egress & Accessibility", rule: "Exam room door clear width ≥ 34\"", section: "ABBC §11.5", status: "fail", elements: ["D-105", "D-106", "D-107"], fix: "Widen exam room doors from 3'-2\" to 3'-6\"." },
  { id: "CK-06", group: "Energy", rule: "Cross-ventilation / natural lighting", section: "ABBC §7.2", status: "pass", elements: ["WN-105", "WN-106"] },
  { id: "CK-07", group: "Fire", rule: "Exit signage and emergency lighting", section: "ABBC §9.4", status: "review", elements: ["D-102"], fix: "Add an exit sign over the staff exit." },
  { id: "CK-08", group: "Fire", rule: "Fire extinguisher spacing", section: "ABBC §9.1", status: "pass", elements: [] },
];

/** The sample clinic in Antigua. */
export const CLINIC: Project = {
  id: CLINIC_PROJECT_ID,
  name: "Clinic_Phase1_Antigua",
  fileName: "Clinic_Phase1.bsd",
  jurisdiction: { name: "Antigua & Barbuda", codeSet: "ABBC · CUBiC (pilot)" },
  address: "Fort Road, St. John's, Antigua",
  client: "Ministry of Health",
  architect: "Caribe Design Group",
  engineer: "T. Williams, PE",
  sceneKind: "clinic",
  levels: [
    { id: "roof", name: "Roof", elevation: 11, label: "+11.0" },
    { id: "level1", name: "Level 1", elevation: 0, label: "±0.0" },
    { id: "foundation", name: "Foundation", elevation: -2.5, label: "−2.5" },
    { id: "site", name: "Site", elevation: -4, label: "−4.0" },
  ],
  layers: makeLayers(),
  issues: [
    { id: "IS-201", severity: "high", title: "Exam room doors below accessible width", location: "Level 1 · Exam 1–3", elementId: "D-105", assignee: "T. Williams", status: "open", due: "2027-02-02" },
    { id: "IS-202", severity: "medium", title: "Exit sign missing at staff exit", location: "Level 1 · North", elementId: "D-102", assignee: "J. Harris", status: "in-progress", due: "2027-02-10" },
    { id: "IS-203", severity: "medium", title: "Parapet dowel schedule incomplete", location: "Roof", elementId: "R-PAR", assignee: "T. Williams", status: "open", due: "2027-02-14" },
    { id: "IS-204", severity: "low", title: "Canopy post base plate detail", location: "Entry", elementId: "CAN-P1", assignee: "You", status: "resolved", due: "2027-01-12", resolution: "Detail 4/S-301 added." },
  ],
  clashes: [
    { id: "CL-01", kind: "SOFT", a: "Supply trunk H-1", b: "Roof beam B-L1-MID", level: "Level 1", fix: "Route the trunk 6\" below the beam soffit.", elementIds: ["B-L1-MID"] },
    { id: "CL-02", kind: "HARD", a: "Sprinkler main FP-1", b: "Roof beam B-L1-MID", level: "Level 1", fix: "Notch-free coring through beam web is not allowed. Re-route under the beam.", elementIds: ["B-L1-MID"] },
  ],
  checks: clinicChecks,
  cost: {
    total: 1_284_000,
    range: 96_300,
    hard: 962_000,
    soft: 142_000,
    land: 180_000,
    basis: "Class 4 estimate · Regional unit rates 2026 · Antigua import factor 1.32",
    materials: [
      { name: "Concrete & CMU", cost: 286_000 },
      { name: "Roofing & Waterproofing", cost: 118_000 },
      { name: "Windows & Doors", cost: 96_500 },
      { name: "MEP Systems", cost: 214_000 },
      { name: "Medical Fit-Out", cost: 168_000 },
    ],
    workforce: [
      { trade: "Masons", headcount: 8, months: 3 },
      { trade: "Concrete Crew", headcount: 6, months: 2.5 },
      { trade: "Electricians", headcount: 4, months: 2 },
      { trade: "Plumbers", headcount: 4, months: 2 },
      { trade: "Finishers", headcount: 7, months: 3 },
    ],
  },
  schedule: [
    { name: "Site Prep", key: "site", start: "2027-03-01", end: "2027-03-29", tasks: [{ name: "Clearing & Grading", start: "2027-03-01", end: "2027-03-26", trade: "Earthwork", cost: 38_000, crew: 6 }] },
    { name: "Foundation", key: "foundation", start: "2027-03-29", end: "2027-04-30", tasks: [{ name: "Footings & Stem Walls", start: "2027-03-29", end: "2027-04-23", trade: "Concrete", cost: 96_000, crew: 8 }, { name: "Slab on Grade", start: "2027-04-19", end: "2027-04-30", trade: "Concrete", cost: 44_000, crew: 7 }] },
    { name: "Structure", key: "structure1", start: "2027-04-30", end: "2027-06-25", tasks: [{ name: "CMU Walls & Columns", start: "2027-04-30", end: "2027-06-11", trade: "Masonry", cost: 168_000, crew: 9 }, { name: "Bond Beam", start: "2027-06-07", end: "2027-06-25", trade: "Concrete", cost: 38_000, crew: 6 }] },
    { name: "Roof", key: "roof", start: "2027-06-25", end: "2027-07-30", tasks: [{ name: "Roof Slab & Membrane", start: "2027-06-25", end: "2027-07-30", trade: "Concrete", cost: 122_000, crew: 8 }] },
    { name: "Envelope & MEP", key: "mep", start: "2027-07-12", end: "2027-09-24", tasks: [{ name: "Windows & Doors", start: "2027-07-12", end: "2027-08-06", trade: "Glazing", cost: 96_500, crew: 5 }, { name: "MEP Rough-In", start: "2027-08-02", end: "2027-09-24", trade: "MEP", cost: 214_000, crew: 9 }] },
    { name: "Finishes", key: "finishes", start: "2027-09-24", end: "2027-11-26", tasks: [{ name: "Finishes & Medical Fit-Out", start: "2027-09-24", end: "2027-11-26", trade: "Finishers", cost: 146_000, crew: 10 }] },
  ],
  stages: [
    { name: "Concept", status: "done", percent: 100, openTasks: 0, openIssues: 0, approvals: 0 },
    { name: "Design", status: "done", percent: 100, openTasks: 0, openIssues: 0, approvals: 0 },
    { name: "Engineering", status: "active", percent: 64, openTasks: 5, openIssues: 3, approvals: 1 },
    { name: "Analysis", status: "upcoming", percent: 20, openTasks: 4, openIssues: 0, approvals: 0 },
    { name: "Documentation", status: "upcoming", percent: 0, openTasks: 8, openIssues: 0, approvals: 1 },
    { name: "Approval", status: "upcoming", percent: 0, openTasks: 3, openIssues: 0, approvals: 3 },
    { name: "Construction", status: "upcoming", percent: 0, openTasks: 14, openIssues: 0, approvals: 0 },
  ],
  health: {
    score: 74,
    delta: -2,
    compliance: 70,
    structural: 78,
    cost: 76,
    schedule: 72,
    summary: "Structural (78) holds up. Compliance (70) is the weakest area: exam-room door widths fail the accessibility rule.",
    ranges: {
      all: { score: 74, delta: -2, compliance: 70, structural: 78, cost: 76, schedule: 72 },
      "30d": { score: 74, delta: 6, compliance: 70, structural: 78, cost: 76, schedule: 72 },
      version: { score: 74, delta: -2, compliance: 70, structural: 78, cost: 76, schedule: 72 },
    },
  },
  comments: [
    {
      id: "CM-1",
      author: "J. Harris",
      text: "Ministry wants a second accessible WC. Can the lab store convert?",
      at: "Today",
      resolved: false,
      replies: [],
      attachments: [],
      history: ["Created by J. Harris"],
    },
  ],
  startDate: "2027-03-01",
  // approximate spot on Fort Road; an irregular lot with the parking apron at the front
  site: { lat: 17.1325, lon: -61.8462, north: 0, source: "sample", boundary: [[-20, -36], [70, -36], [74, 58], [-20, 52]] },
  versions: [
    { id: "v0.6", label: "v0.6 — current", at: "Today, 09:10", by: "You" },
    { id: "v0.5", label: "v0.5 — added canopy and ramp", at: "2 days ago", by: "T. Williams" },
  ],
};

/** Starter project used for "New Project" tabs. */
export function blankProject(id: string, n: number): Project {
  return {
    id,
    name: `Untitled_${n}`,
    fileName: `Untitled_${n}.bsd`,
    jurisdiction: { name: "Miami-Dade, FL", codeSet: "FBC 8th Ed. · HVHZ" },
    address: "",
    client: "",
    architect: "",
    engineer: "",
    sceneKind: "blank",
    levels: STD_LEVELS,
    layers: makeLayers(),
    issues: [],
    clashes: [],
    checks: [],
    cost: { total: 0, range: 0, hard: 0, soft: 0, land: 0, basis: "No model yet", materials: [], workforce: [] },
    schedule: [],
    stages: [
      { name: "Concept", status: "active", percent: 5, openTasks: 3, openIssues: 0, approvals: 0 },
      { name: "Design", status: "upcoming", percent: 0, openTasks: 0, openIssues: 0, approvals: 0 },
      { name: "Engineering", status: "upcoming", percent: 0, openTasks: 0, openIssues: 0, approvals: 0 },
      { name: "Analysis", status: "upcoming", percent: 0, openTasks: 0, openIssues: 0, approvals: 0 },
      { name: "Documentation", status: "upcoming", percent: 0, openTasks: 0, openIssues: 0, approvals: 0 },
      { name: "Approval", status: "upcoming", percent: 0, openTasks: 0, openIssues: 0, approvals: 0 },
      { name: "Construction", status: "upcoming", percent: 0, openTasks: 0, openIssues: 0, approvals: 0 },
    ],
    health: {
      score: 0,
      delta: 0,
      compliance: 0,
      structural: 0,
      cost: 0,
      schedule: 0,
      summary: "Draw or import a plan, or use Prompt to Plan, to generate a Plan Health Score.",
      ranges: {
        all: { score: 0, delta: 0, compliance: 0, structural: 0, cost: 0, schedule: 0 },
        "30d": { score: 0, delta: 0, compliance: 0, structural: 0, cost: 0, schedule: 0 },
        version: { score: 0, delta: 0, compliance: 0, structural: 0, cost: 0, schedule: 0 },
      },
    },
    comments: [],
    startDate: "2027-01-11",
    versions: [{ id: "v0.1", label: "v0.1 — new project", at: "Just now", by: "You" }],
  };
}

/** Projects shown as recent on the Start page and in the application menu. */
export const RECENT_PROJECTS: RecentProject[] = [
  { id: RESIDENCE.id, name: RESIDENCE.name, jurisdiction: RESIDENCE.jurisdiction.name, openedAt: "Today" },
  { id: COTTAGE.id, name: COTTAGE.name, jurisdiction: COTTAGE.jurisdiction.name, openedAt: "Today" },
  { id: CLINIC.id, name: CLINIC.name, jurisdiction: CLINIC.jurisdiction.name, openedAt: "Yesterday" },
  { id: "school-annex-nassau", name: "School_Annex_Nassau", jurisdiction: "Nassau, Bahamas", openedAt: "Oct 12" },
  { id: "duplex-orlando", name: "Duplex_Orlando", jurisdiction: "Orange County, FL", openedAt: "Oct 3" },
  { id: "warehouse-kingston", name: "Warehouse_Kingston", jurisdiction: "Kingston, Jamaica", openedAt: "Sep 27" },
];

/** Project templates shown on the Start page. */
export const TEMPLATES = [
  { id: "tpl-res", name: "Single-Family Residence", desc: "2 levels · gable roof · CMU" },
  { id: "tpl-clinic", name: "Light Commercial / Clinic", desc: "1 level · flat roof · accessible entry" },
  { id: "tpl-site", name: "Site Plan Only", desc: "Terrain, setbacks and utilities" },
  { id: "tpl-blank", name: "Blank Project", desc: "Empty model with Miami-Dade code set" },
];

/** Jurisdictions and code sets that can be chosen. */
export const JURISDICTIONS = [
  { name: "Miami-Dade, FL", codeSet: "FBC 8th Ed. · HVHZ" },
  { name: "Broward, FL", codeSet: "FBC 8th Ed. · HVHZ" },
  { name: "Orange County, FL", codeSet: "FBC 8th Ed." },
  { name: "Antigua & Barbuda", codeSet: "ABBC · CUBiC (pilot)" },
  { name: "Nassau, Bahamas", codeSet: "Bahamas Building Code" },
  { name: "Kingston, Jamaica", codeSet: "Jamaica National Building Code" },
  { name: "San Juan, PR", codeSet: "PR Building Code 2018" },
];

/** The team a new session starts with. */
export const INITIAL_MEMBERS: Member[] = [
  { id: "m1", name: "Demo User", email: "demo@buildsync.example", role: "owner" },
  { id: "m2", name: "Maya Chen", email: "maya.chen@studiomarais.example", role: "engineer" },
  { id: "m3", name: "R. Okafor", email: "r.okafor@okafor-eng.example", role: "pe-reviewer", license: "PE-84213", jurisdiction: "Florida" },
  { id: "m4", name: "Dev Patel", email: "dev.patel@studiomarais.example", role: "contributor" },
  { id: "m5", name: "Alvarez Family Trust", email: "client@alvarez.example", role: "viewer" },
];
