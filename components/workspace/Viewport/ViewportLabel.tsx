/**
 * components/workspace/Viewport/ViewportLabel.tsx
 *
 * WHAT   The label in the top-left of the canvas, [−][view name][visual style], each part a menu: the viewport
 *        menu (show ViewCube, navigation bar, UCS icon and rulers; zoom extents; reset view), named views, and
 *        visual styles (Wireframe, Shaded, Realistic, X-Ray).
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
import { useEffectiveStyle } from "../hooks";

/* Viewport label (spec §10.7): [−] viewport menu · view name → named views · style → visual styles. */

const STYLE_LABEL: Record<VisualStyle, string> = { wireframe: "Wireframe", shaded: "Shaded", realistic: "Realistic", xray: "X-Ray" };
const VIEW_LIST = ["SW Isometric", "SE Isometric", "NE Isometric", "NW Isometric", "Top", "Bottom", "Front", "Back", "Left", "Right", "Floor Plan", "Elevation"];

type Which = "vp" | "view" | "style";

/** The bracketed viewport label with its three menus. */
export function ViewportLabel() {
  const ws = useWsApi();
  const app = useAppApi();
  const view = useWs((s) => s.view);
  const camera = useWs((s) => s.camera);
  const style = useEffectiveStyle();
  const display = useApp((s) => s.settings.display);
  const rulers = useWs((s) => s.rulers);
  const [open, setOpen] = useState<{ which: Which; anchor: Anchor } | null>(null);
  const close = () => setOpen(null);

  const btn = (which: Which, text: string, desc: string, cmd: string) => (
    <button
      key={which}
      className={cn("rounded px-1.5 py-px text-[0.6875rem] transition-colors hover:bg-t1/10 hover:text-t1", open?.which === which ? "bg-t1/10 text-t1" : "text-t2")}
      aria-haspopup="menu"
      aria-expanded={open?.which === which}
      onClick={(e) => setOpen({ which, anchor: anchorOf(e.currentTarget)! })}
      {...tip(which === "vp" ? "Viewport menu" : which === "view" ? "Named views" : "Visual style", desc, cmd)}
    >
      {text}
    </button>
  );

  const viewName = view === "2d" ? "Floor Plan" : describeView(camera);
  const setDisplay = (k: "showViewCube" | "showNavBar" | "showUcs") => app.getState().patchSettings((s) => (s.display[k] = !s.display[k]));

  return (
    <>
      <div className="mono absolute left-2 top-2 z-10 flex items-center rounded bg-chrome/70 px-0.5 py-px backdrop-blur" aria-label="Viewport label">
        <span className="text-t3">[</span>
        {btn("vp", "−", "Viewport settings", "VPCONFIG")}
        <span className="text-t3">][</span>
        {btn("view", viewName, "Switch to a named view", "-VIEW")}
        <span className="text-t3">][</span>
        {btn("style", STYLE_LABEL[style], "Change the visual style", "VSCURRENT")}
        <span className="text-t3">]</span>
      </div>

      <Menu anchor={open?.which === "vp" ? open.anchor : null} onClose={close} label="Viewport menu">
        <MenuLabel>Viewport</MenuLabel>
        <MenuItem label="Show ViewCube" checked={display.showViewCube} onClick={() => setDisplay("showViewCube")} onClose={close} />
        <MenuItem label="Show navigation bar" checked={display.showNavBar} onClick={() => setDisplay("showNavBar")} onClose={close} />
        <MenuItem label="Show UCS icon" checked={display.showUcs} onClick={() => setDisplay("showUcs")} onClose={close} />
        <MenuItem label="Show rulers" checked={rulers} onClick={() => ws.getState().patch({ rulers: !rulers })} onClose={close} />
        <MenuSep />
        <MenuItem label="Zoom extents" icon="zoomext" hint="ZOOM E" onClick={() => ws.getState().zoomExtents()} onClose={close} />
        <MenuItem label="Reset view" icon="roof" onClick={() => ws.getState().homeView()} onClose={close} />
      </Menu>

      <Menu anchor={open?.which === "view" ? open.anchor : null} onClose={close} label="Named views">
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

      <Menu anchor={open?.which === "style" ? open.anchor : null} onClose={close} label="Visual styles">
        {VISUAL_STYLES.map((v) => (
          <MenuItem key={v} label={STYLE_LABEL[v]} checked={style === v} onClick={() => ws.getState().setStyle(v)} onClose={close} />
        ))}
      </Menu>
    </>
  );
}
