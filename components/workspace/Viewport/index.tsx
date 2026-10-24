/**
 * components/workspace/Viewport/index.tsx
 *
 * WHAT   The centre area of the workspace: shows either the 3D / 2D model viewport (ModelViewport) or a paper-
 *        space sheet (SheetView), chosen by the workspace `layoutTab`, with the layout tabs underneath.
 * FOR    Mounted by Workspace.tsx between the Model Explorer and the palette dock.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useWs } from "@/lib/store/workspace-provider";
import { LayoutTabs } from "../LayoutTabs";
import { ModelViewport } from "./ModelViewport";
import { SheetView } from "./SheetView";

/** The canvas area: model or sheet, plus the layout tabs. */
export function ViewportArea() {
  const tab = useWs((s) => s.layoutTab);
  const sheets = useWs((s) => s.sheets);
  const sheet = sheets.find((s) => s.id === tab);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {sheet ? <SheetView sheet={sheet} /> : <ModelViewport />}
      <LayoutTabs />
    </div>
  );
}
