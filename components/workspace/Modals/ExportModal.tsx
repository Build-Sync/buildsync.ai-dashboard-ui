/**
 * components/workspace/Modals/ExportModal.tsx
 *
 * WHAT   Export (app menu → Export, command EXPORT): real files, made in the browser:
 *        - PDF: the drawing on screen (the model view or the open sheet) printed on its own; choose "Save as PDF" in
 *          the print dialog (every browser and OS has it);
 *        - Render: a PNG picture of the drawing on screen, at twice the screen resolution;
 *        - DWG: a DXF of the active plan (the open format AutoCAD reads; DWG itself is closed), lib/exporters.ts;
 *        - IFC: the whole model as IFC4 for Revit, ArchiCAD and BIM viewers;
 *        - Report: an HTML report of the project (health, checks, issues, cost, schedule, site) to read or print.
 *        Every file carries the "AI-generated, unstamped" mark.
 * FOR    Sending the work to people and tools outside BuildSync. Downloads go through lib/save-file.ts.
 * DEBUG  - The PNG has black text or wrong colours: the drawing's CSS variables are copied into the picture
 *          (inlineVars); a variable that is not found falls back to its default.
 *        - The PDF shows the whole app: the print CSS (app/globals.css, [data-print-area]) hides everything else.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/controls";
import { sceneOf } from "@/lib/draw/scene-of";
import { reportHtml, writeDxf, writeIfc } from "@/lib/exporters";
import { saveBlob, saveFile } from "@/lib/save-file";
import { planLevelsFor } from "@/lib/scene/render";
import type { LevelKey } from "@/lib/scene/types";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn, fmtMoney } from "@/lib/utils";

const FORMATS: { id: string; label: string; desc: string }[] = [
  { id: "pdf", label: "PDF", desc: "The drawing on screen (model view or the open sheet), printed on its own: pick “Save as PDF” in the print dialog." },
  { id: "render", label: "Render", desc: "A PNG picture of the drawing on screen, at twice the screen resolution." },
  { id: "dwg", label: "DWG", desc: "A DXF of the active plan, in feet: AutoCAD, BricsCAD and LibreCAD open it (DWG is AutoCAD's closed format)." },
  { id: "ifc", label: "IFC", desc: "The whole model as IFC4, in metres, for Revit, ArchiCAD and BIM viewers." },
  { id: "report", label: "Report", desc: "An HTML report: project, plan health, code checks, issues, clashes, cost, schedule, site and soil." },
];

/** The drawing on screen: the open sheet, or the model view. */
function drawingSvg(): SVGSVGElement | null {
  return document.querySelector<SVGSVGElement>('[data-testid="sheet-view"] svg[role="img"]') ?? document.querySelector<SVGSVGElement>('[data-testid="viewport"] svg');
}

/** The SVG's markup with every CSS variable replaced by its value, so it draws the same outside the page. */
function inlineVars(svg: SVGSVGElement): string {
  const cs = getComputedStyle(svg);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const r = svg.getBoundingClientRect();
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(Math.round(r.width)));
  clone.setAttribute("height", String(Math.round(r.height)));
  if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${Math.round(r.width)} ${Math.round(r.height)}`);
  const bg = cs.getPropertyValue("--bg-viewport").trim() || getComputedStyle(svg.parentElement ?? svg).backgroundColor || "#ffffff";
  const text = new XMLSerializer().serializeToString(clone).replace(/var\((--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_, name: string, fb?: string) => cs.getPropertyValue(name).trim() || fb?.trim() || "#888");
  // a background so the PNG is not transparent
  return text.replace(/^<svg([^>]*)>/, `<svg$1><rect width="100%" height="100%" fill="${bg}"/>`);
}

/** A PNG of the drawing on screen. */
async function renderPng(): Promise<Blob> {
  const svg = drawingSvg();
  if (!svg) throw new Error("There is no drawing on screen.");
  const r = svg.getBoundingClientRect();
  const url = URL.createObjectURL(new Blob([inlineVars(svg)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((ok, bad) => {
      img.onload = () => ok();
      img.onerror = () => bad(new Error("The drawing could not be turned into a picture."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(r.width * 2);
    canvas.height = Math.round(r.height * 2);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, r.width, r.height);
    return await new Promise<Blob>((ok, bad) => canvas.toBlob((b) => (b ? ok(b) : bad(new Error("PNG encoding failed"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The Export dialog. */
export function ExportModal({ format: initial }: { format?: string }) {
  const ws = useWsApi();
  const app = useAppApi();
  const project = useWs((s) => s.project);
  const currency = useApp((s) => s.settings.units.currency);
  const [fmt, setFmt] = useState(FORMATS.some((f) => f.id === initial?.toLowerCase()) ? initial!.toLowerCase() : "pdf");
  const [busy, setBusy] = useState(false);
  const close = () => ws.getState().closeModal();
  const base = project.fileName.replace(/\.bsd$/i, "");

  const go = async () => {
    setBusy(true);
    const s = ws.getState();
    const log = (text: string) => app.getState().log("ok", `✓ ${text} · AI-generated, unstamped`);
    try {
      if (fmt === "pdf") {
        close();
        // the print CSS shows only the drawing; the dialog has to be gone before the browser takes its picture
        await new Promise((r) => setTimeout(r, 120));
        window.print();
        log(`Printed ${project.name} (choose “Save as PDF” to keep it)`);
        return;
      }
      if (fmt === "render") {
        saveBlob(`${base}.png`, await renderPng());
        log(`Exported ${base}.png`);
      } else if (fmt === "dwg") {
        const scene = sceneOf(s);
        const levels: LevelKey[] = planLevelsFor(s.plan.level).filter((l) => l !== "site");
        saveFile(`${base}.dxf`, writeDxf(scene, levels, (scene.drafts ?? []).filter((d) => levels.includes(d.level) || d.level === "site")), "application/dxf");
        log(`Exported ${base}.dxf (the ${s.plan.level} plan, feet)`);
      } else if (fmt === "ifc") {
        saveFile(`${base}.ifc`, writeIfc(sceneOf(s), project), "application/x-step");
        log(`Exported ${base}.ifc (IFC4, metres)`);
      } else {
        saveFile(`${base}-report.html`, reportHtml(project, sceneOf(s), (n) => fmtMoney(n, currency), new Date().toLocaleString()), "text/html");
        log(`Exported ${base}-report.html`);
      }
      app.getState().toast("Exported");
      close();
    } catch (e) {
      app.getState().toast(e instanceof Error ? e.message : "Export failed", "bad");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Export"
      subtitle="PDF · Render (PNG) · DWG (as DXF) · IFC · Report"
      onClose={close}
      width="30rem"
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void go()} data-testid="export-go">
            {busy && <Spinner size={13} />} {fmt === "pdf" ? "Print / Save as PDF" : "Export"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Export Format">
        {FORMATS.map((f) => (
          <button key={f.id} role="radio" aria-checked={fmt === f.id} onClick={() => setFmt(f.id)} data-testid={`export-${f.id}`} className={cn("rounded-lg border py-2 text-[0.75rem] font-medium uppercase transition-colors", fmt === f.id ? "border-accent bg-accent/10 text-t1" : "border-line text-t2 hover:border-t3")}>
            {f.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[0.8125rem] text-t1">{FORMATS.find((f) => f.id === fmt)?.desc}</p>
      <p className="mt-2 text-[0.75rem] text-t2">
        Every export carries the “AI-generated, unstamped” mark. Life-safety and load-bearing sheets are flagged <b className="text-warn">Requires PE Review</b> until a licensed PE signs.
      </p>
    </Modal>
  );
}
