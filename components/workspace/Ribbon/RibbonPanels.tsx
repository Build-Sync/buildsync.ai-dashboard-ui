/**
 * components/workspace/Ribbon/RibbonPanels.tsx
 *
 * WHAT   Renders the active ribbon tab's panels. Panels that do not fit the window width fold into one button
 *        each (right-most first), and the button opens the full panel as a flyout. An off-screen Measurer draws
 *        every panel expanded once to learn the real widths. Vertical wheel scrolling over the ribbon scrolls
 *        it sideways.
 * FOR    The strip under the ribbon tabs. Buttons call run(command) from useRunner; their accent-fill state
 *        comes from isActive(), which reads the workspace state.
 * DEBUG  - A button is lit or dark wrongly: isActive() interprets the item.active rules from ribbon.config.ts.
 *        - A panel is collapsed when there is room: see fit.ts (measured vs estimated widths).
 *        - The Measurer stays mounted: it is shown only until the widths for the current tab / look are cached.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { anchorOf, type Anchor } from "@/components/ui/Menu";
import { tip } from "@/components/ui/Tooltip";
import { useApp } from "@/lib/store/app-provider";
import { selectEffective } from "@/lib/store/app-store";
import { useResolvedTheme } from "@/lib/use-theme";
import { useWsShallow } from "@/lib/store/workspace-provider";
import type { WsState } from "@/lib/store/workspace-store";
import { cn } from "@/lib/utils";
import { useEffectiveStyle, useRunner } from "../hooks";
import { LargeButton, SmallButton } from "./Buttons";
import { Flyout } from "./Flyout";
import { collapsePlan, COLLAPSED_REM, estimatePanelRem, ribbonMetrics, useRibbonMetrics } from "./fit";
import { panelColumns, RIBBON_BY_ID, type RibbonItem, type RibbonPanel, type RibbonTab } from "./ribbon.config";

type RibbonState = Pick<WsState, "toggles" | "project" | "view" | "section" | "docks" | "camera" | "solar" | "rulers" | "guides" | "sectionBox" | "reviewMode" | "fullscreen" | "activeTool" | "labels" | "roomLabels" | "furnLabels" | "planShow" | "belowGrade" | "cutaway" | "mepLook">;

/** Does the item's accent-fill rule hold in the current workspace state? */
function isActive(item: RibbonItem, s: RibbonState, style: string): boolean {
  // tool buttons light up while their tool is the active one
  if (!item.active) return !!s.activeTool && s.activeTool === item.command.toUpperCase();
  const [kind, arg] = item.active.split(":");
  switch (kind) {
    case "toggle":
      return !!s.toggles[arg as keyof typeof s.toggles];
    case "layer":
      return !!s.project.layers.find((l) => l.id === arg)?.visible;
    case "view":
      return s.view === arg;
    case "style":
      return style === arg;
    case "section":
      return s.section;
    case "dock":
      return !!s.docks[arg as keyof typeof s.docks];
    case "persp":
      return s.camera.perspective;
    case "ortho3d":
      return !s.camera.perspective;
    case "flag":
      return !!(s as unknown as Record<string, unknown>)[arg];
    case "underlay":
      return s.planShow !== "level";
    case "look":
      return arg === "plumbing" ? s.mepLook.plumbing === "pipes" : s.mepLook.electrical === "wires";
    default:
      return false;
  }
}

interface PanelProps {
  panel: RibbonPanel;
  s: RibbonState;
  style: string;
  onRun: (command: string) => void;
}

/** The buttons of a panel plus its name underneath: shared by the in-line panel, the flyout and the measurer. */
function PanelBody({ panel, s, style, onRun }: PanelProps) {
  return (
    <>
      <div className="flex min-h-0 flex-1 items-start gap-0.5 pt-1">
        {panelColumns(panel.items).map((col, i) => (
          <div key={i} className={col[0].size === "large" ? "" : "flex flex-col gap-px pt-px"}>
            {col.map((it) =>
              it.size === "large" ? (
                <LargeButton key={it.id} item={it} active={isActive(it, s, style)} onRun={onRun} />
              ) : (
                <SmallButton key={it.id} item={it} active={isActive(it, s, style)} onRun={onRun} />
              ),
            )}
          </div>
        ))}
      </div>
      <div className="pb-0.5 pt-px text-center text-[0.625rem] leading-none text-t3">{panel.name}</div>
    </>
  );
}

function ExpandedPanel(props: PanelProps) {
  return (
    <section aria-label={props.panel.name} data-ribbon-panel={props.panel.id} className="flex shrink-0 flex-col border-r border-soft px-1">
      <PanelBody {...props} />
    </section>
  );
}

/** A panel folded to one button (AutoCAD-style); clicking opens the full panel as a flyout. */
function CollapsedPanel(props: PanelProps) {
  const { panel, onRun } = props;
  const btn = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const icon = (panel.items.find((i) => i.size === "large") ?? panel.items[0]).icon;

  return (
    <section aria-label={panel.name} data-ribbon-panel={panel.id} className="flex shrink-0 flex-col border-r border-soft px-1">
      <button
        ref={btn}
        type="button"
        data-ribbon-collapsed
        data-testid="ribbon-collapsed"
        aria-haspopup="true"
        aria-expanded={!!anchor}
        onClick={() => setAnchor((a) => (a ? null : anchorOf(btn.current)))}
        className={cn(
          "mt-1 flex h-[4.5rem] w-[4.25rem] shrink-0 flex-col items-center justify-start gap-1 rounded-md border px-0.5 pt-1.5 text-center transition-colors",
          anchor ? "accent-soft border-accent/70 text-accent" : "border-transparent text-t1 hover:border-line hover:bg-t1/10",
        )}
        {...tip(panel.name, `${panel.items.length} tools. Click to open this panel`)}
      >
        <Icon name={icon} size={28} strokeWidth={1.5} className={anchor ? "text-accent" : "text-t1"} />
        <span className="flex items-center gap-0.5 text-[0.625rem] font-medium leading-[1.1]">
          {panel.name}
          <Icon name="chevDown" size={9} strokeWidth={2.4} />
        </span>
      </button>
      {anchor && (
        <Flyout anchor={anchor} label={panel.name} onClose={close}>
          <PanelBody
            {...props}
            onRun={(c) => {
              close();
              onRun(c);
            }}
          />
        </Flyout>
      )}
    </section>
  );
}

/** Off-screen copy of the tab with every panel expanded, mounted only until its widths are cached. */
function Measurer({ tab, cacheKey, ...rest }: { tab: RibbonTab; cacheKey: string } & Omit<PanelProps, "panel">) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) ribbonMetrics.setNatural(cacheKey, Array.from(el.children, (c) => c.getBoundingClientRect().width));
  }, [cacheKey]);
  return (
    <div ref={ref} aria-hidden inert className="pointer-events-none invisible fixed left-0 top-0 -z-10 flex w-max">
      {tab.panels.map((p) => (
        <ExpandedPanel key={p.id} panel={p} {...rest} />
      ))}
    </div>
  );
}

/** The ribbon strip for the current tab, with width-based panel collapse. */
export const RibbonPanels = memo(function RibbonPanels() {
  const { run } = useRunner();
  const style = useEffectiveStyle();
  const s = useWsShallow((s) => ({
    tab: s.tab,
    toggles: s.toggles,
    project: s.project,
    view: s.view,
    section: s.section,
    docks: s.docks,
    camera: s.camera,
    solar: s.solar,
    rulers: s.rulers,
    guides: s.guides,
    sectionBox: s.sectionBox,
    reviewMode: s.reviewMode,
    fullscreen: s.fullscreen,
    activeTool: s.activeTool,
    labels: s.labels,
    roomLabels: s.roomLabels,
    furnLabels: s.furnLabels,
    planShow: s.planShow,
    belowGrade: s.belowGrade,
    cutaway: s.cutaway,
    mepLook: s.mepLook,
  }));
  // theme and UI scale change text widths, so cached panel widths are only valid for one look
  const themeSetting = useApp((a) => selectEffective(a).display.theme);
  const uiScale = useApp((a) => selectEffective(a).display.uiScale);
  const look = `${useResolvedTheme(themeSetting)}|${uiScale}`;
  const m = useRibbonMetrics();
  const rootRef = useRef<HTMLDivElement>(null);
  const tab = RIBBON_BY_ID[s.tab];

  const cacheKey = `${tab.id}|${look}|${m.fonts}`;
  const measured = m.natural[cacheKey];
  const widths = measured ?? tab.panels.map((p) => estimatePanelRem(p) * m.rem);
  const collapsed = collapsePlan(widths, m.container, COLLAPSED_REM * m.rem, tab.panels.map((p) => !!p.pin));

  // available width for panels, re-read on resize and whenever theme / scale change
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const read = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      ribbonMetrics.setContainer(el.clientWidth - 0.5 * rem - 2, rem);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [look]);

  // web fonts landing late change every label width
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    let alive = true;
    const stale = () => alive && ribbonMetrics.invalidate();
    void fonts.ready.then(stale);
    fonts.addEventListener("loadingdone", stale);
    return () => {
      alive = false;
      fonts.removeEventListener("loadingdone", stale);
    };
  }, []);

  return (
    <>
      <div
        ref={rootRef}
        id="ribbon-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tab.id}`}
        className="flex h-[var(--h-ribbon)] shrink-0 overflow-x-auto overflow-y-hidden border-b border-line bg-ribbon px-1"
        data-testid="ribbon"
        data-collapsed={tab.panels.filter((_, i) => collapsed[i]).map((p) => p.id).join(",")}
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
        }}
      >
        {tab.panels.map((p, i) =>
          collapsed[i] ? <CollapsedPanel key={p.id} panel={p} s={s} style={style} onRun={run} /> : <ExpandedPanel key={p.id} panel={p} s={s} style={style} onRun={run} />,
        )}
      </div>
      {!measured && <Measurer tab={tab} cacheKey={cacheKey} s={s} style={style} onRun={run} />}
    </>
  );
});
