"use client";

import { useMemo, type CSSProperties } from "react";
import { makeProjector, type Camera } from "@/lib/scene/camera";
import { planCutFor, planLevelsFor, renderScene } from "@/lib/scene/render";
import { PROJECT_SUN_HOUR, sunVector } from "@/lib/scene/sun";
import type { Sheet } from "@/lib/store/workspace-store";
import { useWs } from "@/lib/store/workspace-provider";
import type { LayerId } from "@/lib/types";
import { useScene } from "../hooks";
import { NorthArrow, PlanAnnotations, ViewportDefs } from "./Overlays";

/* Paper-space layout sheets: the same renderer, fixed cameras, inside a title block. */

const SHEET_W = 1100;
const SHEET_H = 710;
const DRAW = { x: 28, y: 28, w: 1044, h: 540 };

const PAPER: CSSProperties = {
  ["--vp-ink" as string]: "#1b2330",
  ["--vp-ink-dim" as string]: "#5a6578",
  ["--bg-viewport" as string]: "#ffffff",
};

const SUBTITLE: Record<Sheet["kind"], string> = {
  plan: "FLOOR PLAN · LEVEL 1",
  section: "BUILDING SECTION · A–A",
  structural: "STRUCTURAL FRAMING PLAN",
  elevation: "SOUTH ELEVATION",
};

export function SheetView({ sheet }: { sheet: Sheet }) {
  const scene = useScene();
  const project = useWs((s) => s.project);
  const colors = useWs((s) => s.colors);
  const hidden = useWs((s) => s.hidden);
  const layersState = useWs((s) => s.project.layers);
  const sectionY = useWs((s) => s.sectionY);

  const { svg, proj, isPlan } = useMemo(() => {
    const isPlan = sheet.kind === "plan" || sheet.kind === "structural";
    const cam: Camera = {
      bearing: 180,
      pitch: isPlan ? 90 : 0,
      zoom: isPlan ? 1.9 : 1.55,
      panX: 0,
      panY: isPlan ? 0 : 30,
      perspective: false,
    };
    const proj = makeProjector(cam, { w: DRAW.w, h: DRAW.h }, scene.center, scene.radius);
    const layers = Object.fromEntries(layersState.map((l) => [l.id, l.visible])) as Partial<Record<LayerId, boolean>>;
    const structural = new Set(scene.elements.filter((e) => e.system === "Structural" && e.category !== "Truss").map((e) => e.id));
    const out = renderScene({
      scene,
      proj,
      style: isPlan ? "shaded" : "shaded",
      plan: sheet.kind === "plan" ? { cutZ: planCutFor(scene, "level1"), levels: planLevelsFor("level1") } : sheet.kind === "structural" ? { cutZ: 9.4, levels: ["site", "foundation", "level1"] } : null,
      sectionY: sheet.kind === "section" ? sectionY : null,
      colors,
      layers: { ...layers, topography: false, landscape: false, site: false, furniture: sheet.kind === "plan" },
      hidden: new Set(hidden),
      isolated: sheet.kind === "structural" ? structural : null,
      phaseState: null,
      shadows: false,
      edges: true,
      tint: {},
      dimOthers: false,
      sun: sunVector(PROJECT_SUN_HOUR),
      ghostMep: false,
    });
    return { svg: out.svg, proj, isPlan };
  }, [scene, sheet.kind, layersState, colors, hidden, sectionY]);

  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-[#2a2f39] p-4" data-testid="sheet-view">
      <svg viewBox={`0 0 ${SHEET_W} ${SHEET_H}`} className="max-h-full max-w-full bg-white shadow-pop" style={{ ...PAPER, aspectRatio: `${SHEET_W} / ${SHEET_H}`, width: "min(100%, 1100px)" }} role="img" aria-label={`Sheet ${sheet.name}`}>
        <ViewportDefs />
        <rect x={10} y={10} width={SHEET_W - 20} height={SHEET_H - 20} fill="none" stroke="#1b2330" strokeWidth={1.5} />
        <clipPath id="sheet-clip">
          <rect x={DRAW.x} y={DRAW.y} width={DRAW.w} height={DRAW.h} />
        </clipPath>
        <g clipPath="url(#sheet-clip)">
          <rect x={DRAW.x} y={DRAW.y} width={DRAW.w} height={DRAW.h} fill="#fff" />
          <g transform={`translate(${DRAW.x} ${DRAW.y})`}>
            <g dangerouslySetInnerHTML={{ __html: svg }} />
            {isPlan && <PlanAnnotations scene={scene} proj={proj} level="level1" showGrid />}
            {isPlan && <NorthArrow proj={proj} x={DRAW.w - 40} y={42} />}
          </g>
        </g>
        <rect x={DRAW.x} y={DRAW.y} width={DRAW.w} height={DRAW.h} fill="none" stroke="#1b2330" strokeWidth={0.8} />

        {/* title block */}
        <g fontFamily="var(--font-data)" fill="#1b2330">
          <rect x={DRAW.x} y={DRAW.y + DRAW.h + 8} width={DRAW.w} height={SHEET_H - DRAW.y - DRAW.h - 26} fill="none" stroke="#1b2330" strokeWidth={0.8} />
          <line x1={760} x2={760} y1={DRAW.y + DRAW.h + 8} y2={SHEET_H - 18} stroke="#1b2330" strokeWidth={0.8} />
          <line x1={900} x2={900} y1={DRAW.y + DRAW.h + 8} y2={SHEET_H - 18} stroke="#1b2330" strokeWidth={0.8} />
          <text x={42} y={DRAW.y + DRAW.h + 34} fontSize={11} fill="#5a6578">PROJECT</text>
          <text x={42} y={DRAW.y + DRAW.h + 56} fontSize={18} fontWeight={600} fontFamily="var(--font-ui)">{project.name}</text>
          <text x={42} y={DRAW.y + DRAW.h + 78} fontSize={11} fill="#5a6578">{project.address || "No address"}</text>
          <text x={42} y={DRAW.y + DRAW.h + 100} fontSize={11}>{project.jurisdiction.name} · {project.jurisdiction.codeSet}</text>
          <text x={430} y={DRAW.y + DRAW.h + 34} fontSize={11} fill="#5a6578">SHEET</text>
          <text x={430} y={DRAW.y + DRAW.h + 58} fontSize={20} fontWeight={600} fontFamily="var(--font-ui)">{sheet.name}</text>
          <text x={430} y={DRAW.y + DRAW.h + 78} fontSize={11}>{SUBTITLE[sheet.kind]}</text>
          <text x={430} y={DRAW.y + DRAW.h + 100} fontSize={10} fill="#5a6578">SCALE 1/4&quot; = 1&apos;-0&quot; · DRAWN BY BUILDSYNC AI</text>
          <text x={774} y={DRAW.y + DRAW.h + 34} fontSize={11} fill="#5a6578">STATUS</text>
          <text x={774} y={DRAW.y + DRAW.h + 56} fontSize={12} fontWeight={700} fill="#b45309">AI-GENERATED</text>
          <text x={774} y={DRAW.y + DRAW.h + 72} fontSize={12} fontWeight={700} fill="#b45309">UNSTAMPED</text>
          <text x={774} y={DRAW.y + DRAW.h + 92} fontSize={9.5} fill="#5a6578">Requires PE review</text>
          <rect x={912} y={DRAW.y + DRAW.h + 18} width={142} height={88} fill="none" stroke="#5a6578" strokeDasharray="4 3" />
          <text x={983} y={DRAW.y + DRAW.h + 58} fontSize={10} textAnchor="middle" fill="#5a6578">PE SEAL</text>
          <text x={983} y={DRAW.y + DRAW.h + 74} fontSize={9} textAnchor="middle" fill="#5a6578">pending signature</text>
        </g>
      </svg>
    </div>
  );
}
