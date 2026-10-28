/**
 * components/shared/ButtonGuide.tsx
 *
 * WHAT   The Button Guide: every button of the ribbon, sorted by tab (in ribbon order) and panel, each with how it
 *        looks (a copy of the real button, large or small), what it does, where it is (Tab › Panel), its command and
 *        keyboard shortcut, and an eye that shows it on screen (switches to its tab and lights it, everything else
 *        greyed out). Each tab section opens with what that tab is for. Then the status-bar toggles, the window
 *        controls and the app bar. Search and tab chips narrow the list.
 * FOR    Settings → Button Guide (a page) and the BUTTONGUIDE command / Home → Help → Button Guide (a dialog in the
 *        workspace). `onShow` decides how to get back to the workspace before the spotlight (lib/store/app-store.ts)
 *        lights the control.
 * DEBUG  - "Show me where" lights the panel, not the button: the window is narrow and the panel is folded into
 *          one button (the spotlight says so); its buttons are inside that flyout.
 *        - A button has a thin description: it comes from ribbon.config.ts (`desc`), the same text as its tooltip.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useState, type ReactNode } from "react";
import { Icon, type IconKey } from "@/components/icons";
import { Kbd } from "@/components/ui/Kbd";
import { tip } from "@/components/ui/Tooltip";
import { RIBBON, type RibbonItem, type RibbonPanel, type RibbonTab } from "@/components/workspace/Ribbon/ribbon.config";
import { commandDisplay, findCommand } from "@/lib/commands";
import { shortcutOf, shortcutTargets } from "@/lib/keymap";
import { useApp } from "@/lib/store/app-provider";
import type { Spotlight } from "@/lib/store/app-store";
import type { RibbonTabId } from "@/lib/types";
import { usePlatform } from "@/lib/use-platform";
import { cn } from "@/lib/utils";

/** A row of the guide that is not a ribbon button. */
interface OtherRow {
  id: string;
  label: string;
  icon: IconKey;
  desc: string;
  where: string;
  selector: string;
  command?: string;
}

const STATUS: OtherRow[] = [
  { id: "sb-model", label: "MODEL", icon: "view3d", desc: "Model space (as opposed to a layout sheet)", where: "Status bar, left", selector: '[data-toggle="model"]', command: "MODEL" },
  { id: "sb-grid", label: "GRID", icon: "grid", desc: "Show the dot grid", where: "Status bar, left", selector: '[data-toggle="grid"]', command: "GRID" },
  { id: "sb-snap", label: "SNAP", icon: "snap", desc: "The cursor jumps to the grid spacing", where: "Status bar, left", selector: '[data-toggle="snap"]', command: "SNAP" },
  { id: "sb-ortho", label: "ORTHO", icon: "ortho", desc: "Keep lines straight: horizontal or vertical only (hold Shift to flip it while drawing)", where: "Status bar, left", selector: '[data-toggle="ortho"]', command: "ORTHO" },
  { id: "sb-polar", label: "POLAR", icon: "angle", desc: "Track at polar angles (15°, 30°, 45°, 90°); the ^ next to it picks the angle", where: "Status bar, left", selector: '[data-toggle="polar"]', command: "POLAR" },
  { id: "sb-osnap", label: "OSNAP", icon: "target", desc: "Snap to end points, midpoints, centres, intersections, perpendiculars and nearest; the ^ next to it picks which", where: "Status bar, left", selector: '[data-toggle="osnap"]', command: "OSNAP" },
  { id: "sb-otrack", label: "OTRACK", icon: "guides", desc: "Rest on a snap point, then move away: the cursor follows the line through it", where: "Status bar, left", selector: '[data-toggle="otrack"]', command: "OTRACK" },
  { id: "sb-3dosnap", label: "3DOSNAP", icon: "view3d", desc: "Snap to 3D geometry", where: "Status bar, left", selector: '[data-toggle="osnap3d"]', command: "3DOSNAP" },
  { id: "sb-dyn", label: "DYN", icon: "pointer", desc: "Dynamic input next to the cursor", where: "Status bar, left", selector: '[data-toggle="dyn"]', command: "DYN" },
  { id: "sb-lwt", label: "LWT", icon: "line", desc: "Show line weights", where: "Status bar, left", selector: '[data-toggle="lwt"]', command: "LWT" },
  { id: "sb-health", label: "Health score", icon: "activity", desc: "The plan health score; click to open the Health palette", where: "Status bar, right", selector: '[data-testid="health-chip"]', command: "HEALTH" },
  { id: "sb-save", label: "Save state", icon: "save", desc: "Saved or unsaved; click for the version history", where: "Status bar, right", selector: '[data-testid="save-state"]', command: "VERSIONS" },
];

const WINDOWS: OtherRow[] = [
  { id: "w-eye", label: "Eye (window size)", icon: "eyeHalf", desc: "Steps a window through its sizes: eye wide open = fully open, half closed = normal, closed = only its header", where: "Header of every window", selector: '[data-testid="dock-toggle-palettes"]' },
  { id: "w-edge", label: "Window edge", icon: "rulers", desc: "Drag the inner edge of a window to any width or height; double-click it for the normal size", where: "Between a window and the drawing", selector: '[data-testid="dock-edge-timeline"]' },
  { id: "w-grip", label: "Grip ⋮⋮", icon: "grip", desc: "Drag a window to the other side of the screen (or above / below the other bottom window); click for a menu", where: "Header of every window, left", selector: '[data-testid="dock-grip-explorer"]' },
  { id: "w-close", label: "Hide ×", icon: "close", desc: "Hide the window; View → Panels or View → Interfaces brings it back", where: "Header of every window, right", selector: '[data-testid="dock-close-palettes"]' },
  { id: "w-tabs", label: "Palette tabs", icon: "palettes", desc: "Click to open a palette, drag to reorder, × to close, + to bring a closed one back", where: "Top of the palettes", selector: '[aria-label="Palette Tabs"]' },
];

const APPBAR: OtherRow[] = [
  { id: "ab-menu", label: "Application menu (B)", icon: "open", desc: "New, open, save, import, export and recent projects", where: "App bar, far left", selector: "[data-app-button]" },
  { id: "ab-quick", label: "Quick access", icon: "save", desc: "New, Open, Save, Undo and Redo", where: "App bar, left", selector: '[aria-label="Quick Access"]' },
  { id: "ab-search", label: "Search", icon: "search", desc: "Find any command, setting or element by name", where: "App bar, middle", selector: '[aria-label="Search Commands and Settings"]', command: "FIND" },
  { id: "ab-help", label: "Help ?", icon: "help", desc: "The tutorial, this guide and the shortcuts", where: "App bar, right", selector: '[data-testid="help-button"]' },
  { id: "ab-gear", label: "Settings", icon: "settings", desc: "Every setting, including Help & Tutorial and this guide", where: "App bar, right", selector: '[data-testid="gear"]', command: "SETTINGS" },
];

/** A static copy of a ribbon button, so the guide shows exactly what to look for. */
function Look({ item }: { item: Pick<RibbonItem, "icon" | "label" | "size"> }) {
  if (item.size === "large")
    return (
      <span className="flex h-[3.6rem] w-[3.45rem] shrink-0 flex-col items-center justify-start gap-1 rounded-md border border-line bg-ribbon px-0.5 pt-1.5 text-center text-t1" aria-hidden="true">
        <Icon name={item.icon} size={24} strokeWidth={1.5} />
        <span className="line-clamp-2 text-[0.5625rem] font-medium leading-[1.1]">{item.label}</span>
      </span>
    );
  return (
    <span className="flex h-[1.4375rem] w-[7.5rem] shrink-0 items-center gap-1.5 rounded border border-line bg-ribbon px-1.5 text-[0.6875rem] text-t1" aria-hidden="true">
      <Icon name={item.icon} size={14} className="shrink-0 text-t2" />
      <span className="truncate">{item.label}</span>
    </span>
  );
}

/** One row: the look, the name, where it is, what it does, its command and shortcut, and the eye. */
function GuideRow({ look, label, desc, where, command, shortcut, onEye }: { look: ReactNode; label: string; desc: string; where: string; command?: string; shortcut: string; onEye: () => void }) {
  return (
    <li className="flex items-center gap-3 border-b border-soft/60 py-2 last:border-0" data-testid="guide-row">
      <div className="flex w-[7.75rem] shrink-0 justify-center">{look}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-[0.8125rem]">
          <span className="font-semibold text-t1">{label}</span>
          <span className="text-[0.6875rem] text-t3" data-testid="guide-where">
            {where}
          </span>
        </div>
        <p className="text-[0.75rem] leading-snug text-t2">{desc}</p>
        {(command || shortcut) && (
          <div className="mt-0.5 flex items-center gap-2 text-[0.6875rem] text-t3">
            {command && <span className="mono">Command: {commandDisplay(command)}</span>}
            {shortcut && <Kbd combo={shortcut} />}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onEye}
        className="grid size-8 shrink-0 place-items-center rounded-md border border-line text-t2 transition-colors hover:border-accent hover:text-accent"
        aria-label={`Show where ${label} is`}
        data-testid="guide-show"
        {...tip("Show me where", "Go to it on screen: everything else is greyed out")}
      >
        <Icon name="eyeWide" size={16} />
      </button>
    </li>
  );
}

/** Everything a shortcut can run (commands, and ribbon commands with an argument). */
const TARGETS = new Set(shortcutTargets());

/** The guide. `onShow` takes the user back to the workspace and lights the control. */
export function ButtonGuide({ onShow, compact = false }: { onShow: (s: Spotlight) => void; compact?: boolean }) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<RibbonTabId | "all" | "other">("all");
  const keys = useApp((s) => s.settings.shortcuts.keys);
  const platform = usePlatform();
  const t = q.trim().toLowerCase();
  const match = (...parts: (string | undefined)[]) => !t || parts.some((p) => p?.toLowerCase().includes(t));

  const sections = RIBBON.filter((tab) => only === "all" || only === tab.id).map((tab) => ({
    tab,
    panels: tab.panels
      .map((panel) => ({ panel, items: panel.items.filter((it) => match(it.label, it.desc, it.command, tab.label, panel.name)) }))
      .filter((p) => p.items.length),
  }));
  const total = sections.reduce((n, s) => n + s.panels.reduce((m, p) => m + p.items.length, 0), 0);
  const others = (rows: OtherRow[]) => rows.filter((r) => match(r.label, r.desc, r.where, r.command));

  // the shortcut in force for a button's command (its own or the default chord, lib/keymap.ts)
  const keyOf = (command: string) => {
    if (TARGETS.has(command)) return shortcutOf(command, keys, platform);
    const def = findCommand(command.split(" ")[0]) ?? findCommand(command);
    return def ? shortcutOf(def.name, keys, platform) : "";
  };
  const showItem = (tab: RibbonTab, panel: RibbonPanel, it: RibbonItem) =>
    onShow({
      selector: `#ribbon-panel [data-ribbon-item="${it.id}"]`,
      fallback: `#ribbon-panel [data-ribbon-panel="${panel.id}"]`,
      tab: tab.id,
      title: it.label,
      body: `${tab.label} tab › ${panel.name} panel. ${it.desc}.`,
    });

  const otherSection = (title: string, sub: string, rows: OtherRow[]) => {
    const list = others(rows);
    if (!list.length) return null;
    return (
      <section key={title} className="mb-4">
        <h3 className="text-[0.875rem] font-semibold text-t1">{title}</h3>
        <p className="mb-1 text-[0.75rem] text-t3">{sub}</p>
        <ul>
          {list.map((r) => (
            <GuideRow
              key={r.id}
              look={<Look item={{ icon: r.icon, label: r.label, size: "small" }} />}
              label={r.label}
              desc={r.desc}
              where={r.where}
              command={r.command}
              shortcut={r.command ? keyOf(r.command) : ""}
              onEye={() => onShow({ selector: r.selector, title: r.label, body: `${r.where}. ${r.desc}.` })}
            />
          ))}
        </ul>
      </section>
    );
  };

  return (
    <div className="flex min-h-0 flex-col gap-2" data-testid="button-guide">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Icon name="search" size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-t3" />
          <input className="input !pl-7" placeholder="Search buttons: offset, elevation, septic…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search Buttons" data-testid="guide-search" />
        </div>
        <span className="text-[0.6875rem] text-t3">{total} ribbon buttons</span>
      </div>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Guide Tabs">
        {(["all", ...RIBBON.map((r) => r.id), "other"] as const).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={only === id}
            onClick={() => setOnly(id)}
            className={cn("h-6 rounded-full border px-2.5 text-[0.6875rem]", only === id ? "border-accent bg-accent/15 text-t1" : "border-line text-t2 hover:text-t1")}
          >
            {id === "all" ? "All" : id === "other" ? "Status bar & windows" : RIBBON.find((r) => r.id === id)!.label}
          </button>
        ))}
      </div>
      <div className={cn("min-h-0 overflow-y-auto pr-1", compact ? "max-h-[60vh]" : "")}>
        {only !== "other" &&
          sections.map(({ tab, panels }) =>
            panels.length ? (
              <section key={tab.id} className="mb-4" data-testid={`guide-tab-${tab.id}`}>
                <h3 className="text-[0.9375rem] font-semibold text-t1">{tab.label} tab</h3>
                <p className="mb-1 text-[0.75rem] text-t2">{tab.purpose}</p>
                {panels.map(({ panel, items }) => (
                  <div key={panel.id} className="mb-1">
                    <div className="label-xs mt-2">{panel.name} panel</div>
                    <ul>
                      {items.map((it) => (
                        <GuideRow
                          key={it.id}
                          look={<Look item={it} />}
                          label={it.label}
                          desc={it.desc}
                          where={`${tab.label} › ${panel.name}${it.size === "large" ? " · large button" : ""}`}
                          command={it.command.startsWith("/") ? undefined : (it.cmdLabel ?? it.command)}
                          shortcut={it.command.startsWith("/") ? "" : keyOf(it.command)}
                          onEye={() => showItem(tab, panel, it)}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ) : null,
          )}
        {(only === "all" || only === "other") && (
          <>
            {otherSection("Status bar", "The bar at the bottom of the screen. It never moves.", STATUS)}
            {otherSection("Windows", "Controls every window (explorer, palettes, timeline, command line) has.", WINDOWS)}
            {otherSection("App bar", "The bar at the very top.", APPBAR)}
          </>
        )}
        {total === 0 && only !== "other" && <p className="py-6 text-center text-[0.8125rem] text-t3">No button matches “{q}”.</p>}
      </div>
    </div>
  );
}
