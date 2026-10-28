/**
 * components/ui/Tooltip.tsx
 *
 * WHAT   The tooltip system. tip(title, description, command, shortcut) returns data attributes that components
 *        spread onto a button; one delegated pointer listener in <TooltipLayer/> shows a fixed-position bubble 250 ms
 *        after hovering (60 ms when moving between neighbouring buttons) in the format Title / description /
 *        "Shortcut: Alt+W" / "Command: NAME" (the shortcut drawn for this OS).
 * FOR    Every ribbon button, toolbar icon and status-bar item. Settings → Display → Tooltips chooses off,
 *        basic (no command line) or extended. Mounted once in app/layout.tsx.
 * DEBUG  - No tooltip on an element: it needs a data-tip attribute (spread {...tip("Title", "Description",
 *          "COMMAND")}).
 *        - Bubble clipped: it is position:fixed and flips above the target near the bottom edge; check for an
 *          ancestor with a CSS transform.
 *        - Touch input never shows tooltips by design (pointerType "touch" is ignored).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { getPlatform } from "@/lib/platform";
import { formatCombo } from "@/lib/shortcuts";
import { useApp } from "@/lib/store/app-provider";

/* Tooltip format (spec §9): Title / one-line description / `Command: NAME`.
 * One delegated listener serves every button. The bubble is position:fixed so panels
 * and scroll containers can never clip it. */

/** The data attributes that tip() returns, to spread onto an element. */
export interface TipProps {
  "data-tip": string;
  "data-tip-desc"?: string;
  "data-tip-cmd"?: string;
  "data-tip-key"?: string;
}

/**
 * Data attributes for a tooltip: spread them on an element, e.g. <button {...tip("Wall", "Draw a wall",
 * "WALL")}>.
 */
export function tip(title: string, desc?: string, cmd?: string, shortcut?: string): TipProps {
  const p: TipProps = { "data-tip": title };
  if (desc) p["data-tip-desc"] = desc;
  if (cmd) p["data-tip-cmd"] = cmd;
  if (shortcut) p["data-tip-key"] = shortcut;
  return p;
}

interface Shown {
  title: string;
  desc?: string;
  cmd?: string;
  /** the shortcut, canonical ("Alt+W+N"): drawn for this OS */
  combo?: string;
  x: number;
  y: number;
  above: boolean;
}

const DELAY = 250;

/** Listens for hover over any [data-tip] element and shows its tooltip bubble. */
export function TooltipLayer() {
  const mode = useApp((s) => s.settings.display.tooltips);
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHidden = useRef(0);
  const target = useRef<Element | null>(null);
  const bubble = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (mode === "off") return;
    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    const hide = () => {
      clear();
      target.current = null;
      setShown((cur) => {
        if (cur) lastHidden.current = Date.now();
        return null;
      });
    };
    const show = (el: Element) => {
      const r = el.getBoundingClientRect();
      const title = el.getAttribute("data-tip") ?? "";
      if (!title) return;
      const below = r.bottom + 6;
      const above = below + 74 > window.innerHeight;
      setShown({
        title,
        desc: el.getAttribute("data-tip-desc") ?? undefined,
        cmd: el.getAttribute("data-tip-cmd") ?? undefined,
        combo: el.getAttribute("data-tip-key") ?? undefined,
        x: r.left,
        y: above ? r.top - 6 : below,
        above,
      });
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = (e.target as Element | null)?.closest?.("[data-tip]");
      if (!el) {
        if (target.current) hide();
        return;
      }
      if (el === target.current) return;
      clear();
      target.current = el;
      // moving between neighbouring buttons: reappear quickly
      const quick = Date.now() - lastHidden.current < 350;
      timer.current = setTimeout(() => show(el), quick ? 60 : DELAY);
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      clear();
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, [mode]);

  // keep the bubble inside the viewport horizontally
  useEffect(() => {
    const el = bubble.current;
    if (!el || !shown) return;
    const w = el.offsetWidth;
    const max = window.innerWidth - w - 8;
    if (shown.x > max) el.style.left = `${Math.max(8, max)}px`;
  }, [shown]);

  if (mode === "off" || !shown) return null;
  return (
    <div
      ref={bubble}
      role="tooltip"
      className="anim-fade pointer-events-none fixed z-[100] max-w-[17rem] rounded-md border border-line bg-chrome px-2.5 py-1.5 text-[0.6875rem] shadow-pop"
      style={{ left: shown.x, top: shown.y, transform: shown.above ? "translateY(-100%)" : undefined }}
    >
      <div className="font-semibold text-t1">{shown.title}</div>
      {shown.desc && <div className="mt-0.5 text-t2">{shown.desc}</div>}
      {shown.combo && (
        <div className="mt-1 text-[0.625rem]">
          <span className="text-t3">Shortcut: </span>
          <kbd className="kbd">{formatCombo(shown.combo, getPlatform())}</kbd>
        </div>
      )}
      {mode === "extended" && shown.cmd && (
        <div className="mono mt-1 text-[0.625rem] text-accent">
          <span className="text-t3">Command: </span>
          {shown.cmd}
        </div>
      )}
    </div>
  );
}
