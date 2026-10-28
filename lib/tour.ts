/**
 * lib/tour.ts
 *
 * WHAT   The guided tour of the workspace, as data: one step per area of the screen (app bar, ribbon, each ribbon
 *        tab with what it is for, document tabs, Model Explorer, canvas, palettes, timeline, command line, status
 *        bar, the window controls and Help). Each step names the element to light up (a CSS selector), the ribbon
 *        tab to show first, a title and the text. tourSteps() builds the list from the ribbon tabs so the tour never
 *        goes out of date when a tab changes. Also whether a first-time visitor should be asked to take it.
 * FOR    components/workspace/Tour.tsx draws the steps (the rest of the screen dimmed at 70 %, a text box next to
 *        the lit area). Started from the first-run question, Home → Help → Tutorial, the ? in the app bar,
 *        Settings → Help & Tutorial, or the TUTORIAL command.
 * DEBUG  - A step lights nothing: its selector matches no element (a window may be hidden); the text box is then
 *          shown in the middle of the screen.
 *        - The first-run question keeps coming back: localStorage (bs.tour) is blocked.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { RibbonTabId } from "./types";

/** One step of the tour. */
export interface TourStep {
  id: string;
  /** the element(s) to light up, several joined by " || " (lit together); none = the text box in the middle */
  target?: string;
  /** the ribbon tab to switch to before lighting the target */
  tab?: RibbonTabId;
  title: string;
  body: string;
}

/** What the tour needs to know about a ribbon tab. */
export interface TourTab {
  id: RibbonTabId;
  label: string;
  purpose: string;
  panels: string[];
}

/** The steps of the tour, with one step per ribbon tab. */
export function tourSteps(tabs: TourTab[]): TourStep[] {
  const tabSteps: TourStep[] = tabs.map((t, i) => ({
    id: `tab-${t.id}`,
    target: `#tab-${t.id} || [data-testid="ribbon"]`,
    tab: t.id,
    title: `The ${t.label} tab`,
    body: `Tab ${i + 1} of ${tabs.length}. ${t.purpose} Its panels: ${t.panels.join(", ")}.`,
  }));
  return [
    {
      id: "welcome",
      title: "Welcome to BuildSync AI",
      body: "This short tour shows what each part of the screen is for. Use Next and Back (or the arrow keys); Skip or Esc ends it. You can take it again any time from Home → Help → Tutorial, the ? at the top right, or Settings → Help & Tutorial.",
    },
    {
      id: "appbar",
      target: '[data-testid="appbar"]',
      title: "The app bar",
      body: "The B button opens the application menu (new, open, save, import, export, recent projects). Next to it: New, Open, Save, Undo and Redo. In the middle, the search box finds any command, setting or element. On the right: the code jurisdiction, your AI agents, help (?), settings and your seat.",
    },
    {
      id: "tabs",
      target: '[data-testid="ribbon-tabs"]',
      title: "The ribbon tabs",
      body: `The tabs run left to right in the order you work: ${tabs.map((t) => t.label).join(" → ")}. Each tab groups its buttons into panels. The next steps show each tab and what it is for.`,
    },
    ...tabSteps,
    {
      id: "doctabs",
      target: '[data-testid="doc-tabs"]',
      title: "Open projects",
      body: "Every open project is a tab here, with the Start tab for recent projects and templates. Layout sheets (plans, elevations, sections) open as tabs under the drawing.",
    },
    {
      id: "explorer",
      target: '[data-testid="explorer"]',
      title: "The Model Explorer",
      body: "The project as a tree (site, building, levels, categories), the list of drawings (Views), layers, levels and the component library. Drag its tabs to reorder them; × on a tab closes it.",
    },
    {
      id: "viewport",
      target: '[data-testid="viewport"]',
      title: "The drawing",
      body: "Click to select, drag a box to select several, drag a selection to move it. The wheel zooms, the middle button pans. The ViewCube and the bar at the top switch views and levels; its chips show or hide room names and labels, and in 3D cut the house open (Cutaway) or show the foundation under it (Below Grade). The tool bar shows the options of the tool that is running.",
    },
    {
      id: "palettes",
      target: '[data-testid="palettes"]',
      title: "The palettes",
      body: "Properties of what you selected, the plan health score, compliance, cost, comments, issues, simulations, versions, the site map and linked projects. Each chip is a palette: drag to reorder, × to close, + to bring one back.",
    },
    {
      id: "windows",
      target: '[data-testid="palettes"] [data-testid="dock-toggle-palettes"]',
      title: "Window controls",
      body: "Every window has an eye: wide open = fully open, half closed = normal, closed = only its header. Drag a window's inner edge to any size; drag its ⋮⋮ grip to the other side of the screen; × hides it. View → Interfaces saves whole arrangements to switch between.",
    },
    {
      id: "timeline",
      target: '[data-testid="timeline"]',
      title: "The timeline",
      body: "The 4D schedule: phases, a Gantt chart and a time window (1, 3, 6 months) that shows the building as built on that day, with cost and crew. Drag its top edge to make it taller.",
    },
    {
      id: "cmdline",
      target: '[data-testid="cmdline"]',
      title: "The command line",
      body: "Type a command (LINE, WALL, 2D, OFFSET), a point (10,20 or @5<45) or a length while a tool runs. Anything else goes to your AI agent in plain English; its proposed edits wait here for Accept or Reject.",
    },
    {
      id: "statusbar",
      target: '[data-testid="statusbar"]',
      title: "The status bar",
      body: "Drafting aids: GRID, SNAP, ORTHO (straight lines), POLAR, OSNAP (snap to end points, midpoints …; the ^ next to it picks which), OTRACK. Then the cursor position, the level, the units, the health score and the save state. This bar never moves.",
    },
    {
      id: "help",
      target: '#ribbon-panel [data-ribbon-panel="help"]',
      tab: "home",
      title: "Help is one click away",
      body: "Home → Help: take this tour again, open the Button Guide (every button by tab: what it looks like, what it does and where it is) or the keyboard shortcuts. Every button has a shortcut (hover to see it): Alt with its letters pressed together, such as Alt+W for a wall or Alt+W+N for a window. Change any of them, up to 4 keys at once, or remove them in Settings → Shortcuts.",
    },
    {
      id: "done",
      title: "You are ready",
      body: "Start with Home → Draw or Building, or ask the AI in the command line. Hover over any button for a description of what it does.",
    },
  ];
}

/** Has this browser taken or skipped the tour? (true when storage is blocked, so a private window is not asked on every load) */
export function tourSeen(): boolean {
  try {
    return !!localStorage.getItem("bs.tour");
  } catch {
    return true;
  }
}
