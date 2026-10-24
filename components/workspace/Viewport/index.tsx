"use client";

import { useWs } from "@/lib/store/workspace-provider";
import { LayoutTabs } from "../LayoutTabs";
import { ModelViewport } from "./ModelViewport";
import { SheetView } from "./SheetView";

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
