import type { Project, SceneKind } from "../types";
import { buildBlank, buildClinic } from "./clinic";
import { signedArea } from "./builder";
import { buildResidence } from "./residence";
import type { Category, LevelKey, Scene, SceneElement } from "./types";

export * from "./types";

const cache = new Map<SceneKind, Scene>();

export function getScene(kind: SceneKind): Scene {
  let s = cache.get(kind);
  if (!s) {
    s = kind === "residence" ? buildResidence() : kind === "clinic" ? buildClinic() : buildBlank();
    cache.set(kind, s);
  }
  return s;
}

/* ── element details (Properties palette) ─────────────────────────────── */
export interface ElementDetails {
  general: [string, string][];
  geometry: [string, string][];
  material: [string, string][];
  structural: [string, string][];
  cost: { material: number; labor: number; total: number };
}

const LEVEL_LABEL: Record<LevelKey, string> = {
  site: "Site",
  foundation: "Foundation",
  level1: "Level 1",
  level2: "Level 2",
  roof: "Roof",
};
export const levelLabel = (k: LevelKey) => LEVEL_LABEL[k];

function elementVolume(scene: Scene, el: SceneElement): number {
  let v = 0;
  for (const key of el.keys) {
    const p = scene.prisms.find((q) => q.key === key);
    if (!p) continue;
    v += Math.abs(signedArea(p.poly)) * (p.a1 - p.a0);
  }
  return v;
}

const num = (n: number, d = 2) => n.toFixed(d);

const GRADES: Partial<Record<Category, string>> = {
  Wall: "ASTM C90, f'm 2000 psi",
  Partition: "ASTM C645 studs, 20 ga.",
  Slab: "f'c 4000 psi",
  Column: "f'c 4000 psi, Gr. 60 rebar",
  Beam: "f'c 4000 psi, Gr. 60 rebar",
  Foundation: "f'c 4000 psi",
  Footing: "f'c 4000 psi",
  Roof: "Class A, TAS 100 (HVHZ)",
  Truss: "SYP No. 2, MSR 2100",
  Door: "ASTM E1886/E1996",
  Window: "ASTM E1886/E1996",
};
const FINISH: Partial<Record<Category, string>> = {
  Wall: "Smooth stucco, elastomeric paint",
  Partition: "Level 4 gypsum, eggshell paint",
  Slab: "Power-trowel, sealed",
  Roof: "Terracotta barrel tile",
  Door: "Factory primed",
  Window: "Bronze anodized",
};
const MAKER: Partial<Record<Category, string>> = {
  Wall: "Local CMU supplier",
  Slab: "Ready-mix (Miami-Dade)",
  Roof: "Eagle / Boral class",
  Door: "PGT-class impact",
  Window: "PGT-class impact",
  Truss: "Regional truss plant",
};

/** [material $/unit, labor $/unit] by category; unit chosen in `quantity`. */
const RATES: Record<Category, [number, number]> = {
  Wall: [11.5, 9],
  Partition: [3.2, 4.1],
  Door: [780, 360],
  Window: [1050, 430],
  Column: [210, 260],
  Beam: [22, 18],
  Slab: [5.5, 3.5],
  Roof: [9, 7],
  Truss: [310, 120],
  Stair: [3800, 2400],
  Foundation: [38, 26],
  Footing: [38, 26],
  Topography: [0, 0],
  Furniture: [450, 80],
  Fixture: [620, 340],
  Landscape: [120, 90],
  Paving: [6.2, 4.8],
};

export function elementDetails(scene: Scene, el: SceneElement, rename?: string): ElementDetails {
  const dx = el.max[0] - el.min[0];
  const dy = el.max[1] - el.min[1];
  const dz = el.max[2] - el.min[2];
  const length = Math.max(dx, dy);
  const thick = Math.min(dx, dy);
  const vol = elementVolume(scene, el);
  const along = dx >= dy ? "x" : "y";
  const planArea = dx * dy;
  const faceArea = length * dz;

  let qty: number;
  switch (el.category) {
    case "Wall":
    case "Partition":
      qty = Math.max(faceArea - 0, 1);
      break;
    case "Slab":
    case "Roof":
    case "Paving":
      qty = Math.max(planArea, 1);
      break;
    case "Beam":
    case "Foundation":
    case "Footing":
      qty = Math.max(length, 1);
      break;
    default:
      qty = 1;
  }
  const [mRate, lRate] = RATES[el.category];
  const material = Math.round(mRate * qty);
  const labor = Math.round(lRate * qty);

  const bearing = el.loadBearing;
  const designLoad = bearing ? 1.8 + ((el.id.length * 7) % 9) / 10 : 0;
  const capacity = bearing ? designLoad * (2.05 + ((el.id.length * 3) % 5) / 10) : 0;

  return {
    general: [
      ["Name", rename ?? el.name],
      ["ID", el.id],
      ["Category", el.category],
      ["Level", LEVEL_LABEL[el.level]],
      ["System", el.system],
    ],
    geometry: [
      ["Length", `${num(length)} ft`],
      ["Height", `${num(dz)} ft`],
      ["Thickness", `${num(thick)} ft`],
      ["Area", `${num(el.category === "Slab" || el.category === "Roof" || el.category === "Paving" ? planArea : faceArea, 1)} sf`],
      ["Volume", `${num(vol / 27, 2)} cy`],
      ["X / Y / Z", `${num(el.min[0], 1)}, ${num(el.min[1], 1)}, ${num(el.min[2], 1)}`],
      ["Rotation", `${along === "x" ? "0" : "90"}°`],
    ],
    material: [
      ["Material", el.material],
      ["Grade", GRADES[el.category] ?? "—"],
      ["Finish", FINISH[el.category] ?? "—"],
      ["Manufacturer", MAKER[el.category] ?? "—"],
    ],
    structural: bearing
      ? [
          ["Design load", `${num(designLoad, 1)} kip/ft`],
          ["Capacity", `${num(capacity, 1)} kip/ft`],
          ["Safety factor", num(capacity / designLoad, 2)],
          ["Wind rating", "175 mph (HVHZ)"],
        ]
      : [
          ["Design load", "—"],
          ["Capacity", "—"],
          ["Safety factor", "—"],
          ["Wind rating", "—"],
        ],
    cost: { material, labor, total: material + labor },
  };
}

/* ── model tree ───────────────────────────────────────────────────────── */
export interface TreeNode {
  id: string;
  label: string;
  /** shown in brackets */
  count?: number;
  elementIds?: string[];
  layer?: string;
  children?: TreeNode[];
  kind?: "root" | "group" | "category" | "element";
}

const CAT_GROUPS: [string, Category[]][] = [
  ["Walls", ["Wall", "Partition"]],
  ["Doors", ["Door"]],
  ["Windows", ["Window"]],
  ["Columns", ["Column"]],
  ["Beams", ["Beam"]],
  ["Slabs", ["Slab"]],
  ["Stairs", ["Stair"]],
];

export function buildModelTree(scene: Scene, project: Project): TreeNode[] {
  const els = scene.elements;
  const ids = (list: SceneElement[]) => list.map((e) => e.id);
  const node = (id: string, label: string, list: SceneElement[], extra: Partial<TreeNode> = {}): TreeNode => ({
    id,
    label,
    count: list.length,
    elementIds: ids(list),
    kind: "category",
    ...extra,
  });

  const siteEls = els.filter((e) => e.level === "site");
  const site: TreeNode = {
    id: "site",
    label: "Site",
    kind: "group",
    elementIds: ids(siteEls),
    children: [
      node("site-topo", "Topography", siteEls.filter((e) => e.category === "Topography"), { layer: "topography" }),
      node("site-land", "Landscape & paving", siteEls.filter((e) => e.category === "Landscape" || e.category === "Paving"), { layer: "landscape" }),
      { id: "site-trees", label: "Trees", count: scene.trees.length, kind: "category" as const, layer: "site" },
    ].filter((n) => (n.count ?? 0) > 0),
  };

  const levelNode = (key: LevelKey, label: string): TreeNode | null => {
    const lv = els.filter((e) => e.level === key && e.layer !== "topography" && e.layer !== "landscape");
    if (!lv.length) return null;
    const children: TreeNode[] = [];
    for (const [name, cats] of CAT_GROUPS) {
      const sub = lv.filter((e) => cats.includes(e.category));
      if (sub.length) children.push(node(`${key}-${name}`, name, sub));
    }
    const fur = lv.filter((e) => e.category === "Furniture" || e.category === "Fixture");
    if (fur.length) children.push(node(`${key}-furn`, "Furniture & fixtures", fur));
    return { id: key, label, kind: "group", count: lv.length, elementIds: ids(lv), children };
  };

  const foundation = levelNode("foundation", "Foundation");
  const l1 = levelNode("level1", "Level 1");
  const l2 = levelNode("level2", "Level 2");
  const roofEls = els.filter((e) => e.level === "roof");
  const roof: TreeNode | null = roofEls.length
    ? {
        id: "roof",
        label: "Roof",
        kind: "group",
        count: roofEls.length,
        elementIds: ids(roofEls),
        children: [
          node("roof-surf", "Roof surfaces", roofEls.filter((e) => e.category === "Roof")),
          node("roof-wall", "Gable walls", roofEls.filter((e) => e.category === "Wall")),
          node("roof-truss", "Trusses", roofEls.filter((e) => e.category === "Truss")),
        ].filter((n) => (n.count ?? 0) > 0),
      }
    : null;

  const building = els.filter((e) => e.level !== "site");
  const disc: TreeNode[] = [
    node("sys-struct", "Structural", building.filter((e) => e.system === "Structural"), { kind: "group" }),
    node("sys-arch", "Architectural", building.filter((e) => e.system === "Architectural"), { kind: "group" }),
    {
      id: "sys-mep",
      label: "MEP",
      kind: "group",
      count: scene.runs.length + scene.devices.length,
      children: (["electrical", "plumbing", "hvac", "fire"] as const).map((k) => ({
        id: `mep-${k}`,
        label: k === "hvac" ? "HVAC" : k[0].toUpperCase() + k.slice(1),
        kind: "category" as const,
        layer: k,
        count: scene.runs.filter((r) => r.kind === k).length + scene.devices.filter((d) => d.kind === k).length,
      })),
    },
    node("sys-furn", "Furniture", building.filter((e) => e.category === "Furniture" || e.category === "Fixture"), { kind: "group", layer: "furniture" }),
  ];

  const levels = [foundation, l1, l2, roof].filter((n): n is TreeNode => !!n);
  const buildingNode: TreeNode = {
    id: "building",
    label: "Building",
    kind: "group",
    count: building.length,
    elementIds: ids(building),
    children: [...levels, ...disc.filter((d) => (d.count ?? 0) > 0)],
  };

  return [
    {
      id: "project",
      label: project.name,
      kind: "root",
      children: [site, buildingNode],
    },
  ];
}

/** Distinct materials used in the scene, with the elements that use them. */
export function materialUsage(scene: Scene): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  const bucket = (el: SceneElement): string => {
    const m = el.material.toLowerCase();
    if (m.includes("cmu") || m.includes("concrete") || m.includes("slab")) return "Concrete";
    if (m.includes("steel")) return "Steel";
    if (m.includes("syp") || m.includes("lumber") || m.includes("hardwood") || m.includes("wood")) return "Wood";
    if (m.includes("glass") || m.includes("glaz")) return "Glass";
    if (m.includes("brick")) return "Brick";
    if (m.includes("alumin")) return "Aluminum";
    if (m.includes("insul")) return "Insulation";
    if (m.includes("gypsum")) return "Gypsum";
    if (m.includes("tile") || m.includes("ceramic") || m.includes("pavers") || m.includes("vitreous")) return "Tile";
    return "Custom";
  };
  for (const el of scene.elements) {
    const k = bucket(el);
    (map[k] ??= []).push(el.id);
  }
  return map;
}
