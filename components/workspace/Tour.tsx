/**
 * components/workspace/Tour.tsx
 *
 * WHAT   The guided tour and the spotlight, drawn over the whole workspace:
 *        - FirstRunPrompt: a first-time visitor is asked whether to take the tour (Take the tour / Skip); either
 *          answer is remembered (localStorage bs.tour) and the tour stays one click away (Home → Help → Tutorial,
 *          the ? in the app bar, Settings → Help & Tutorial).
 *        - Tour: the steps of lib/tour.ts. Everything except the lit area is greyed out by a 70 % black layer that
 *          fits the screen; a text box beside the lit area explains it, with Back, Next and Skip (arrow keys and
 *          Esc work too). A step can switch the ribbon tab first.
 *        - SpotlightOverlay: the same look for one control (the Button Guide's "show me where"), with Got it.
 * FOR    Workspace.tsx renders <TourLayer/> once. The tour and the spotlight live in the app store (tour,
 *        spotlight) so Settings can start them for the workspace underneath.
 * DEBUG  - The lit hole is in the wrong place: rectangles are read after the tab switch (two animation frames)
 *          and again on resize; a target that is not on screen leaves the text box in the middle.
 *        - Clicks reach the app during the tour: the dim layer takes every pointer event on purpose.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import { useWsApi } from "@/lib/store/workspace-provider";
import { tourSeen, tourSteps } from "@/lib/tour";
import type { RibbonTabId } from "@/lib/types";
import { RIBBON } from "./Ribbon/ribbon.config";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 6;
const CARD_W = 360;

/** The union of the rectangles of the elements a selector list (" || ") matches on screen; null when none is. */
function rectOf(selector: string | undefined): Box | null {
  if (!selector) return null;
  let box: Box | null = null;
  for (const sel of selector.split("||").map((s) => s.trim())) {
    let el: Element | null = null;
    try {
      el = document.querySelector(sel);
    } catch {
      el = null;
    }
    const r = el?.getBoundingClientRect();
    if (!r || r.width < 1 || r.height < 1) continue;
    if (!box) box = { x: r.left, y: r.top, w: r.width, h: r.height };
    else {
      const x0 = Math.min(box.x, r.left);
      const y0 = Math.min(box.y, r.top);
      box = { x: x0, y: y0, w: Math.max(box.x + box.w, r.right) - x0, h: Math.max(box.y + box.h, r.bottom) - y0 };
    }
  }
  return box && { x: box.x - PAD, y: box.y - PAD, w: box.w + PAD * 2, h: box.h + PAD * 2 };
}

/** Where the text box goes: beside the lit area where it fits, inside a large area, or in the middle. */
function cardPos(r: Box | null, h: number): { left: number; top: number } {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const center = { left: (W - CARD_W) / 2, top: Math.max(12, (H - h) / 2) };
  if (!r) return center;
  const fits = (left: number, top: number) => left >= 8 && top >= 8 && left + CARD_W <= W - 8 && top + h <= H - 8;
  const cx = Math.min(Math.max(8, r.x + r.w / 2 - CARD_W / 2), W - CARD_W - 8);
  const cy = Math.min(Math.max(8, r.y + r.h / 2 - h / 2), H - h - 8);
  const tries = [
    { left: cx, top: r.y + r.h + 12 },
    { left: cx, top: r.y - h - 12 },
    { left: r.x + r.w + 12, top: cy },
    { left: r.x - CARD_W - 12, top: cy },
  ];
  for (const t of tries) if (fits(t.left, t.top)) return t;
  // a large area (the canvas): inside it, near its top-left corner
  return { left: Math.min(Math.max(8, r.x + 24), W - CARD_W - 8), top: Math.min(Math.max(8, r.y + 24), H - h - 8) };
}

/** Keeps the rectangle of a target up to date (after a tab switch, on resize). */
function useTargetRect(selector: string | undefined, tab: RibbonTabId | undefined, key: string): Box | null {
  const ws = useWsApi();
  const [rect, setRect] = useState<Box | null>(null);
  useLayoutEffect(() => {
    if (tab && ws.getState().tab !== tab) ws.getState().setTab(tab);
    if (ws.getState().doc === "start") ws.getState().setDoc("project");
    let f1 = 0;
    let f2 = 0;
    const read = () => setRect(rectOf(selector));
    // the tab switch renders first; read on the second frame
    f1 = requestAnimationFrame(() => (f2 = requestAnimationFrame(read)));
    const t = setTimeout(read, 260);
    window.addEventListener("resize", read);
    return () => {
      cancelAnimationFrame(f1);
      cancelAnimationFrame(f2);
      clearTimeout(t);
      window.removeEventListener("resize", read);
    };
  }, [selector, tab, key, ws]);
  return rect;
}

/** The 70 % black layer with a hole over the lit area, and the text box. */
function Dimmer({ rect, children, label, testid }: { rect: Box | null; children: ReactNode; label: string; testid: string }) {
  const card = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(220);
  // the text box's real height decides where it fits; a ResizeObserver reports it (also after the text changes)
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pos = typeof window === "undefined" ? { left: 0, top: 0 } : cardPos(rect, h);
  return (
    <div className="fixed inset-0 z-[120]" data-testid={testid} role="dialog" aria-modal="true" aria-label={label}>
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <mask id={`${testid}-mask`}>
            <rect width="100%" height="100%" fill="white" />
            {rect && <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={8} fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="#000" fillOpacity={0.7} mask={`url(#${testid}-mask)`} data-testid="tour-dim" />
        {rect && <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={8} fill="none" stroke="var(--accent)" strokeWidth={2.5} className="anim-pulse" data-testid="tour-hole" />}
      </svg>
      <div ref={card} className="anim-pop absolute rounded-xl border border-line bg-chrome p-4 text-t1 shadow-pop" style={{ left: pos.left, top: pos.top, width: CARD_W }} data-testid="tour-card">
        {children}
      </div>
    </div>
  );
}

/** The guided tour, one step at a time. The ribbon tab that was open comes back when the tour ends. */
function Tour({ step }: { step: number }) {
  const app = useAppApi();
  const ws = useWsApi();
  useEffect(() => {
    const tab = ws.getState().tab;
    return () => ws.getState().setTab(tab);
  }, [ws]);
  const steps = useMemo(() => tourSteps(RIBBON.map((t) => ({ id: t.id, label: t.label, purpose: t.purpose, panels: t.panels.map((p) => p.name) }))), []);
  const i = Math.min(step, steps.length - 1);
  const s = steps[i];
  const rect = useTargetRect(s.target, s.tab, s.id);
  const last = i === steps.length - 1;
  const next = () => (last ? app.getState().endTour("done") : app.getState().setTourStep(i + 1));
  const back = () => i > 0 && app.getState().setTourStep(i - 1);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") app.getState().endTour("skipped");
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  });

  return (
    <Dimmer rect={rect} label="Tutorial" testid="tour">
      <div className="mb-1 flex items-center gap-2">
        <Icon name="tutorial" size={15} className="text-accent" />
        <span className="label-xs">
          Tutorial · step {i + 1} of {steps.length}
        </span>
        <button className="ml-auto text-[0.6875rem] text-t3 hover:text-t1" onClick={() => app.getState().endTour("skipped")} data-testid="tour-skip">
          Skip tour
        </button>
      </div>
      <h2 className="text-[0.9375rem] font-semibold" data-testid="tour-title">
        {s.title}
      </h2>
      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-t2" data-testid="tour-body">
        {s.body}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex flex-1 gap-0.5" aria-hidden="true">
          {steps.map((x, k) => (
            <span key={x.id} className={k === i ? "h-1 w-3 rounded-full bg-accent" : "h-1 w-1 rounded-full bg-t3/50"} />
          ))}
        </div>
        <button className="btn !h-7 px-3 text-[0.75rem]" onClick={back} disabled={i === 0} data-testid="tour-back">
          Back
        </button>
        <button className="btn btn-primary !h-7 px-3 text-[0.75rem]" onClick={next} data-testid="tour-next" autoFocus>
          {last ? "Finish" : "Next"}
        </button>
      </div>
    </Dimmer>
  );
}

/** One control lit with a note (the Button Guide's "show me where"). */
function SpotlightOverlay() {
  const app = useAppApi();
  const sp = useApp((s) => s.spotlight)!;
  const main = useTargetRect(sp.selector, sp.tab, sp.selector);
  const [fallback, setFallback] = useState<Box | null>(null);
  useEffect(() => {
    // the main target may be folded away; look for the fallback once the main one had its chance
    const t = setTimeout(() => setFallback(sp.fallback ? rectOf(sp.fallback) : null), 320);
    return () => clearTimeout(t);
  }, [sp.fallback, sp.selector]);
  const rect = main ?? fallback;
  const folded = !main && !!fallback;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
      app.getState().setSpotlight(null);
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [app]);
  return (
    <Dimmer rect={rect} label="Where it is" testid="spotlight">
      <div className="mb-1 flex items-center gap-2">
        <Icon name="eyeWide" size={15} className="text-accent" />
        <span className="label-xs">Here it is</span>
      </div>
      <h2 className="text-[0.9375rem] font-semibold">{sp.title}</h2>
      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-t2">{sp.body}</p>
      {folded && <p className="mt-1.5 text-[0.75rem] text-warn">The window is narrow, so its panel is folded into one button: click that button to open the panel.</p>}
      {!rect && <p className="mt-1.5 text-[0.75rem] text-warn">It is not on screen right now (its window may be hidden: View → Interfaces).</p>}
      <div className="mt-3 flex justify-end">
        <button className="btn btn-primary !h-7 px-3 text-[0.75rem]" onClick={() => app.getState().setSpotlight(null)} data-testid="spotlight-ok" autoFocus>
          Got it
        </button>
      </div>
    </Dimmer>
  );
}

/** First visit: ask whether to take the tour. */
function FirstRunPrompt({ onDone }: { onDone: () => void }) {
  const app = useAppApi();
  return (
    <Dimmer rect={null} label="Take the tour?" testid="tour-prompt">
      <div className="flex items-center gap-2">
        <Icon name="tutorial" size={18} className="text-accent" />
        <h2 className="text-[0.9375rem] font-semibold">New to BuildSync AI?</h2>
      </div>
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-t2">Take a two-minute tour of the screen: what every area and every ribbon tab is for. You can skip it now and come back to it any time from Home → Help → Tutorial, the ? at the top right, or Settings → Help & Tutorial.</p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          className="btn !h-7 px-3 text-[0.75rem]"
          data-testid="tour-prompt-skip"
          onClick={() => {
            app.getState().endTour("skipped");
            onDone();
          }}
        >
          Skip for now
        </button>
        <button
          className="btn btn-primary !h-7 px-3 text-[0.75rem]"
          data-testid="tour-prompt-start"
          autoFocus
          onClick={() => {
            app.getState().startTour(0);
            onDone();
          }}
        >
          Take the tour
        </button>
      </div>
    </Dimmer>
  );
}

/** The tour, the spotlight and the first-run question, whichever is due. */
export function TourLayer() {
  const tour = useApp((s) => s.tour);
  const spotlight = useApp((s) => s.spotlight);
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    // after mount only: the server cannot read localStorage
    const t = setTimeout(() => setAsk(!tourSeen()), 600);
    return () => clearTimeout(t);
  }, []);
  if (tour) return <Tour step={tour.step} />;
  if (spotlight) return <SpotlightOverlay />;
  if (ask) return <FirstRunPrompt onDone={() => setAsk(false)} />;
  return null;
}
