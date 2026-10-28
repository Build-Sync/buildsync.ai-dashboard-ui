/**
 * components/workspace/Viewport/ViewportLabel.tsx
 *
 * WHAT   The label in the top-left of the canvas, [−][view name][visual style] and, in 2D, [level], each part a
 *        menu: the viewport menu (show ViewCube, navigation bar, UCS icon, rulers and labels; zoom extents; reset
 *        view), named views, visual styles (Wireframe, Shaded, Realistic, X-Ray), and the plan level (which
 *        storey, other storeys faded underneath, or all storeys side by side, the site plan and the topography on
 *        their sheets). Chips beside it switch room names (Rooms), place labels (Labels), furniture names
 *        (Furniture) and, in 3D, the Cutaway (the model cut 4 ft above the floor, so rooms and furniture show) and
 *        Below Grade (the ground see-through and the house faded, so the foundation shows). Inside a room (the room
 *        view) the view name is "Inside · <room>" and the Cutaway and Below Grade chips step aside.
 * FOR    Changing the view and style without the ribbon. The visual style set here is a per-project override
 *        (workspace store); the default comes from Settings → Rendering. Menu toggles write the display
 *        settings directly.
 * DEBUG  - The style label differs from Settings: a per-project override is in force (useEffectiveStyle).
 *        - A named view is not ticked: viewName comes from describeView(camera) and must equal an entry of
 *          VIEW_LIST.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useState } from "react";
import { anchorOf, Menu, MenuItem, MenuLabel, MenuSep, type Anchor } from "@/components/ui/Menu";
import { tip } from "@/components/ui/Tooltip";
import { describeView, NAMED_VIEWS } from "@/lib/scene/camera";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { VISUAL_STYLES, type VisualStyle } from "@/lib/types";
import { cn } from "@/lib/utils";
import { levelName, openView, planLevels } from "@/lib/views";
import { Icon, type IconKey } from "@/components/icons";
import { useEffectiveStyle, useScene } from "../hooks";

/* Viewport label (spec §10.7): [−] viewport menu · view name → named views · style → visual styles. */

const STYLE_LABEL: Record<VisualStyle, string> = { wireframe: "Wireframe", shaded: "Shaded", realistic: "Realistic", xray: "X-Ray" };
const VIEW_LIST = ["SW Isometric", "SE Isometric", "NE Isometric", "NW Isometric", "Top", "Bottom", "Front", "Back", "Left", "Right", "Floor Plan", "Elevation"];

type Which = "vp" | "view" | "style" | "level";

/** A switch beside the viewport label (Room names, Labels, Below Grade): lit when on. */
function Chip({ on, icon, text, testid, onClick, tipTitle, tipDesc, cmd }: { on: boolean; icon: IconKey; text: string; testid: string; onClick: () => void; tipTitle: string; tipDesc: string; cmd: string }) {
  return (
    <button
      className={cn("ml-1 flex items-center gap-1 rounded px-1.5 py-px text-[0.6875rem] transition-colors hover:bg-t1/10", on ? "text-t1" : "text-t3")}
      aria-pressed={on}
      data-testid={testid}
      onClick={onClick}
      {...tip(tipTitle, tipDesc, cmd)}
    >
      <Icon name={icon} size={12} className={on ? "text-accent" : undefined} />
      {text}
    </button>
  );
}

/** The bracketed viewport label with its three menus. */
export function ViewportLabel() {
  const ws = useWsApi();
  const app = useAppApi();
  const view = useWs((s) => s.view);
  const camera = useWs((s) => s.camera);
  const style = useEffectiveStyle();
  const display = useApp((s) => s.settings.display);
  const rulers = useWs((s) => s.rulers);
  const level = useWs((s) => s.plan.level);
  const planShow = useWs((s) => s.planShow);
  const labels = useWs((s) => s.labels);
  const roomLabels = useWs((s) => s.roomLabels);
  const belowGrade = useWs((s) => s.belowGrade);
  const cutaway = useWs((s) => s.cutaway);
  const furnLabels = useWs((s) => s.furnLabels);
  const insideRoom = useWs((s) => s.insideRoom);
  const scene = useScene();
  const inside = view === "3d" && camera.eye ? scene.rooms.find((r) => r.id === insideRoom) : undefined;
  const project = useWs((s) => s.project);
  const [open, setOpen] = useState<{ which: Which; anchor: Anchor } | null>(null);
  const close = () => setOpen(null);

  const btn = (which: Which, text: string, desc: string, cmd: string) => (
    <button
      key={which}
      className={cn("rounded px-1.5 py-px text-[0.6875rem] transition-colors hover:bg-t1/10 hover:text-t1", open?.which === which ? "bg-t1/10 text-t1" : "text-t2")}
      aria-haspopup="menu"
      aria-expanded={open?.which === which}
      onClick={(e) => setOpen({ which, anchor: anchorOf(e.currentTarget)! })}
      data-testid={`vp-${which}`}
      {...tip(which === "vp" ? "Viewport Menu" : which === "view" ? "Named Views" : which === "level" ? "Level" : "Visual Style", desc, cmd)}
    >
      {text}
    </button>
  );

  const viewName = view === "2d" ? "Floor Plan" : camera.eye ? `Inside · ${inside?.name ?? "the model"}` : describeView(camera);
  const setDisplay = (k: "showViewCube" | "showNavBar" | "showUcs") => app.getState().patchSettings((s) => (s.display[k] = !s.display[k]));

  return (
    <>
      <div className="mono absolute left-2 top-2 z-10 flex items-center rounded bg-chrome/70 px-0.5 py-px backdrop-blur" aria-label="Viewport Label">
        <span className="text-t3">[</span>
        {btn("vp", "−", "Viewport settings", "VPCONFIG")}
        <span className="text-t3">][</span>
        {btn("view", viewName, "Switch to a named view", "-VIEW")}
        <span className="text-t3">][</span>
        {btn("style", STYLE_LABEL[style], "Change the visual style", "VSCURRENT")}
        {view === "2d" && (
          <>
            <span className="text-t3">][</span>
            {btn("level", `${levelName({ project }, level)}${planShow === "below" ? " + below" : planShow === "all" ? " + all" : ""}`, "Which storey the plan shows, and other storeys faded underneath", "UNDERLAY")}
          </>
        )}
        <span className="text-t3">]</span>
        <Chip on={roomLabels} icon="roomName" text="Rooms" testid="room-labels-chip" onClick={() => ws.getState().patch({ roomLabels: !roomLabels })} tipTitle="Room Names" tipDesc="Show or hide room names and areas, in the plan, in 3D and on plan sheets" cmd="ROOMLABELS" />
        <Chip on={labels} icon="tag" text="Labels" testid="labels-chip" onClick={() => ws.getState().patch({ labels: !labels })} tipTitle="Labels" tipDesc="Show or hide place labels and the property line's bearings (also in 3D)" cmd="LABELS" />
        <Chip on={furnLabels} icon="sofa" text="Furniture" testid="furniture-labels-chip" onClick={() => ws.getState().patch({ furnLabels: !furnLabels })} tipTitle="Furniture Names" tipDesc="Show or hide the name of each piece of furniture, in the plan and in 3D" cmd="FURNLABELS" />
        {view === "3d" && !camera.eye && (
          <Chip on={cutaway} icon="sectionbox" text="Cutaway" testid="cutaway-chip" onClick={() => ws.getState().patch({ cutaway: !cutaway })} tipTitle="Cutaway" tipDesc="Cut the model 4 ft above the floor of the level you are on, like a dollhouse, so the rooms and furniture show in 3D" cmd="CUTAWAY" />
        )}
        {view === "3d" && !camera.eye && (
          <Chip on={belowGrade} icon="foundation" text="Below Grade" testid="below-grade-chip" onClick={() => ws.getState().patch({ belowGrade: !belowGrade })} tipTitle="Below Grade" tipDesc="See the foundation: the ground turns see-through and the house above it fades, so the footings, stem walls, slab and the septic system show" cmd="BELOWGRADE" />
        )}
      </div>

      <Menu anchor={open?.which === "vp" ? open.anchor : null} onClose={close} label="Viewport Menu">
        <MenuLabel>Viewport</MenuLabel>
        <MenuItem label="Show ViewCube" checked={display.showViewCube} onClick={() => setDisplay("showViewCube")} onClose={close} />
        <MenuItem label="Show Navigation Bar" checked={display.showNavBar} onClick={() => setDisplay("showNavBar")} onClose={close} />
        <MenuItem label="Show UCS Icon" checked={display.showUcs} onClick={() => setDisplay("showUcs")} onClose={close} />
        <MenuItem label="Show Rulers" checked={rulers} onClick={() => ws.getState().patch({ rulers: !rulers })} onClose={close} />
        <MenuItem label="Show Room Names" checked={roomLabels} onClick={() => ws.getState().patch({ roomLabels: !roomLabels })} onClose={close} />
        <MenuItem label="Show Labels" checked={labels} onClick={() => ws.getState().patch({ labels: !labels })} onClose={close} />
        {view === "3d" && <MenuItem label="Cutaway (see inside the rooms)" checked={cutaway} onClick={() => ws.getState().patch({ cutaway: !cutaway })} onClose={close} />}
        {view === "3d" && <MenuItem label="Show Below Grade (foundation)" checked={belowGrade} onClick={() => ws.getState().patch({ belowGrade: !belowGrade })} onClose={close} />}
        <MenuSep />
        <MenuItem label="Zoom Extents" icon="zoomext" hint="ZOOM E" onClick={() => ws.getState().zoomExtents()} onClose={close} />
        <MenuItem label="Reset View" icon="roof" onClick={() => ws.getState().homeView()} onClose={close} />
      </Menu>

      <Menu anchor={open?.which === "view" ? open.anchor : null} onClose={close} label="Named Views">
        {VIEW_LIST.map((v) => (
          <MenuItem
            key={v}
            label={v}
            checked={viewName === v || (view === "2d" && NAMED_VIEWS[v]?.plan && v === "Floor Plan")}
            onClick={() => ws.getState().goToNamedView(v)}
            onClose={close}
          />
        ))}
      </Menu>

      <Menu anchor={open?.which === "level" ? open.anchor : null} onClose={close} label="Plan Level">
        <MenuLabel>Floor plan</MenuLabel>
        {planLevels({ project }).map((l) => (
          <MenuItem key={l} label={levelName({ project }, l)} checked={level === l} onClick={() => ws.getState().setPlan({ level: l })} onClose={close} />
        ))}
        <MenuSep />
        <MenuLabel>Also show, faded</MenuLabel>
        <MenuItem label="Nothing (this level only)" checked={planShow === "level"} onClick={() => ws.getState().patch({ planShow: "level" })} onClose={close} />
        <MenuItem label="The level below" checked={planShow === "below"} onClick={() => ws.getState().patch({ planShow: "below" })} onClose={close} />
        <MenuItem label="All levels" checked={planShow === "all"} onClick={() => ws.getState().patch({ planShow: "all" })} onClose={close} />
        <MenuSep />
        <MenuItem label="All levels side by side…" icon="plan" hint="VIEWPLANS" onClick={() => openView(ws.getState(), { kind: "plans" })} onClose={close} />
        <MenuItem label="Site plan…" icon="terrain" onClick={() => openView(ws.getState(), { kind: "site" })} onClose={close} />
        <MenuItem label="Topography…" icon="grading" onClick={() => openView(ws.getState(), { kind: "topo" })} onClose={close} />
      </Menu>

      <Menu anchor={open?.which === "style" ? open.anchor : null} onClose={close} label="Visual Styles">
        {VISUAL_STYLES.map((v) => (
          <MenuItem key={v} label={STYLE_LABEL[v]} checked={style === v} onClick={() => ws.getState().setStyle(v)} onClose={close} />
        ))}
      </Menu>
    </>
  );
}
