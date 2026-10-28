/**
 * lib/settings.ts
 *
 * WHAT   The user settings: the Settings type (general, units, grid & snap, display, rendering, shortcuts, AI,
 *        routing, MCP, notifications), DEFAULT_SETTINGS, ACCENTS, the notification events, and the helpers to
 *        clone, merge stored values over the defaults, and compare settings.
 * FOR    The app store keeps the saved copy and an editable draft (lib/store/app-store.ts); the Settings window
 *        edits the draft. Only non-secret settings live here and are saved to localStorage (key bs.settings):
 *        API keys never do.
 * DEBUG  - A new setting is missing for returning users: mergeSettings() fills new keys from the defaults, so
 *          add the default here.
 *        - Settings do not persist: storage may be blocked (private window); the app then runs on defaults.
 *        - Apply stays disabled: settingsEqual compares the draft with the saved copy by value.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { DEFAULT_ROUTING } from "./agents";
import type { ScrollGesture } from "./input";
import type { ThemeSetting } from "./theme";
import type { AgentId, TaskKind, VisualStyle } from "./types";
import type { DateFormat, MeasureSystem } from "./utils";

/* User settings (spec §11). Non-secret only: API keys never live here. */

/** Ids of the notification events users can switch on or off. */
export type NotifEvent =
  | "issue-assigned"
  | "pe-review"
  | "mention"
  | "analysis-done"
  | "agent-connection"
  | "weekly-digest";

/** The notification events with their default in-app and e-mail state. */
export const NOTIF_EVENTS: { id: NotifEvent; label: string; inApp: boolean; email: boolean }[] = [
  { id: "issue-assigned", label: "Issue Assigned to Me", inApp: true, email: true },
  { id: "pe-review", label: "PE Review Requested / Completed", inApp: true, email: true },
  { id: "mention", label: "Comment Mention", inApp: true, email: true },
  { id: "analysis-done", label: "Simulation / Analysis Finished", inApp: true, email: true },
  { id: "agent-connection", label: "Agent Connected / Disconnected", inApp: true, email: true },
  { id: "weekly-digest", label: "Weekly Project Digest", inApp: false, email: true },
];

/** Object-snap modes. */
export type OsnapMode = "endpoint" | "midpoint" | "center" | "intersection" | "perpendicular" | "nearest";

/** All user settings. */
export interface Settings {
  general: {
    language: "en" | "fr" | "es" | "ja";
    autosave: boolean;
    autosaveMinutes: 1 | 2 | 5 | 10;
    advisoryBanner: boolean;
    defaultJurisdiction: string | null;
    startScreen: "start" | "last";
    checkUpdates: boolean;
  };
  units: {
    system: MeasureSystem;
    precision: 0 | 1 | 2 | 3;
    angle: "degrees" | "radians" | "grads";
    areaVolume: "imperial" | "metric";
    currency: "USD" | "XCD" | "EUR" | "ANG";
    dateFormat: DateFormat;
  };
  gridSnap: {
    gridSpacing: string;
    majorEvery: number;
    snapSpacing: string;
    osnap: Record<OsnapMode, boolean>;
    ortho: boolean;
    polar: boolean;
    polarAngle: 15 | 30 | 45 | 90;
    dynInput: boolean;
  };
  display: {
    theme: ThemeSetting;
    accent: string;
    uiScale: 90 | 100 | 110 | 125;
    crosshairSize: number;
    /** what the scroll wheel / two-finger scroll does in the viewport (auto = zoom for a mouse wheel, pan for a trackpad) */
    scrollGesture: ScrollGesture;
    showViewCube: boolean;
    showNavBar: boolean;
    showUcs: boolean;
    tooltips: "off" | "basic" | "extended";
    /** null = theme default */
    background: string | null;
  };
  rendering: {
    visualStyle: VisualStyle;
    shadows: boolean;
    sunPosition: "project" | "custom";
    sunHour: number;
    antialiasing: "off" | "2x" | "4x";
    quality: "draft" | "standard" | "high";
    edges: boolean;
  };
  shortcuts: {
    /** command → alias typed on the command line */
    aliases: Record<string, string>;
    /** command → keyboard shortcut */
    keys: Record<string, string>;
  };
  ai: {
    defaultAgent: AgentId;
    shareContext: boolean;
    sendFiles: boolean;
    detail: "concise" | "standard" | "full";
    citeCode: boolean;
  };
  routing: Record<TaskKind, AgentId | "active">;
  mcp: { enabled: boolean };
  notifications: Record<NotifEvent, { inApp: boolean; email: boolean }>;
}

/** The preset accent colours. */
export const ACCENTS = ["#4C8DFF", "#3ECF8E", "#F0A940", "#EF5B5B", "#8B6CF0", "#2CC4D6", "#E86AB5"] as const;

/** Settings for a new user. */
export const DEFAULT_SETTINGS: Settings = {
  general: {
    language: "en",
    autosave: true,
    autosaveMinutes: 2,
    advisoryBanner: true,
    defaultJurisdiction: null,
    startScreen: "last",
    checkUpdates: true,
  },
  units: {
    system: "imperial",
    precision: 2,
    angle: "degrees",
    areaVolume: "imperial",
    currency: "USD",
    dateFormat: "MM/DD/YYYY",
  },
  gridSnap: {
    gridSpacing: "1'-0\"",
    majorEvery: 10,
    snapSpacing: '6"',
    osnap: { endpoint: true, midpoint: true, center: false, intersection: true, perpendicular: false, nearest: false },
    ortho: true,
    polar: false,
    polarAngle: 45,
    dynInput: true,
  },
  display: {
    theme: "dark",
    accent: "#4C8DFF",
    uiScale: 100,
    crosshairSize: 100,
    scrollGesture: "auto",
    showViewCube: true,
    showNavBar: true,
    showUcs: true,
    tooltips: "extended",
    background: null,
  },
  rendering: {
    visualStyle: "realistic",
    shadows: true,
    sunPosition: "project",
    sunHour: 15,
    antialiasing: "4x",
    quality: "standard",
    edges: true,
  },
  shortcuts: { aliases: {}, keys: {} },
  ai: {
    defaultAgent: "claude",
    shareContext: true,
    sendFiles: false,
    detail: "standard",
    citeCode: true,
  },
  routing: { ...DEFAULT_ROUTING },
  mcp: { enabled: false },
  notifications: Object.fromEntries(NOTIF_EVENTS.map((e) => [e.id, { inApp: e.inApp, email: e.email }])) as Settings["notifications"],
};

/** Deep copy of settings (used to start a draft). */
export function cloneSettings(s: Settings): Settings {
  return JSON.parse(JSON.stringify(s)) as Settings;
}

/** Deep-merge stored settings over the defaults so new keys never break old payloads. */
export function mergeSettings(stored: unknown): Settings {
  const base = cloneSettings(DEFAULT_SETTINGS);
  const walk = (target: Record<string, unknown>, src: Record<string, unknown>) => {
    for (const key of Object.keys(src)) {
      const sv = src[key];
      const tv = target[key];
      // the user's shortcut and alias maps are free-form (one entry per command they changed): keep every entry,
      // or every remap would be lost on reload (the defaults hold none to walk into)
      if ((key === "aliases" || key === "keys") && sv && typeof sv === "object" && !Array.isArray(sv)) {
        target[key] = Object.fromEntries(Object.entries(sv as Record<string, unknown>).filter(([, v]) => typeof v === "string"));
        continue;
      }
      if (sv && typeof sv === "object" && !Array.isArray(sv) && tv && typeof tv === "object" && !Array.isArray(tv)) {
        walk(tv as Record<string, unknown>, sv as Record<string, unknown>);
      } else if (sv !== undefined && key in target) {
        target[key] = sv;
      }
    }
  };
  if (stored && typeof stored === "object") walk(base as unknown as Record<string, unknown>, stored as Record<string, unknown>);
  return base;
}

/** True when two settings objects hold the same values. */
export function settingsEqual(a: Settings, b: Settings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** localStorage key under which the settings are saved. */
export const SETTINGS_STORAGE_KEY = "bs.settings";
