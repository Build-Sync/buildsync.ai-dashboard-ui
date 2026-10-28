/**
 * lib/settings-pages.ts
 *
 * WHAT   The data behind Settings navigation: SETTINGS_PAGES (the 13 pages, Help & Tutorial and Button Guide last, with id, label, icon, title,
 *        subtitle and href), SETTINGS_PAGE_BY_ID, and SETTINGS_ITEMS (individual settings by name, with the
 *        page that holds each).
 * FOR    The settings left navigation and headings (SettingsFrame), URL validation (components/settings/route-
 *        parts.tsx) and the app-bar search (lib/search.ts), which can jump to a single setting.
 * DEBUG  - A setting cannot be found with the search box: add it to SETTINGS_ITEMS with its page id.
 *        - Wrong heading or a missing nav item: edit SETTINGS_PAGES; the nav, the header and the URL check all
 *          read from it.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { IconKey } from "@/components/icons";

/* Settings navigation (spec §11): 13 pages, each with an icon. Also feeds the app-bar search. */

/** One page of the Settings window. */
export interface SettingsPage {
  id: string;
  label: string;
  icon: IconKey;
  title: string;
  subtitle: string;
  href: string;
}

/** The 11 Settings pages in navigation order. */
export const SETTINGS_PAGES: SettingsPage[] = [
  { id: "general", label: "General", icon: "settings", title: "General", subtitle: "Language, auto-save, advisory banner and start screen.", href: "/settings/general" },
  { id: "units", label: "Units", icon: "units", title: "Units", subtitle: "Measurement system, precision, currency and date format.", href: "/settings/units" },
  { id: "grid-snap", label: "Grid & Snap", icon: "gridsnap", title: "Grid & Snap", subtitle: "Grid spacing, snap, object-snap modes and tracking.", href: "/settings/grid-snap" },
  { id: "display", label: "Display", icon: "monitor", title: "Display", subtitle: "Theme, accent colour, UI scale, crosshair, scroll gesture and tooltips.", href: "/settings/display" },
  { id: "rendering", label: "Rendering", icon: "realistic", title: "Rendering", subtitle: "Visual style, shadows, sun position, anti-aliasing and quality.", href: "/settings/rendering" },
  { id: "shortcuts", label: "Shortcuts", icon: "keyboard", title: "Shortcuts", subtitle: "Command aliases and keyboard shortcuts.", href: "/settings/shortcuts" },
  { id: "ai", label: "AI Settings", icon: "aisettings", title: "AI Settings", subtitle: "Default agent, context sharing, response detail and history.", href: "/settings/ai" },
  { id: "integrations", label: "Integrations", icon: "connectors", title: "Integrations / Connectors", subtitle: "Connect AI agents, route tasks and expose BuildSync over MCP.", href: "/settings/integrations" },
  { id: "notifications", label: "Notifications", icon: "bell", title: "Notifications", subtitle: "Choose what reaches you in the app and by email.", href: "/settings/notifications" },
  { id: "permissions", label: "Permissions", icon: "perms", title: "Permissions", subtitle: "Roles, members and PE reviewer credentials.", href: "/settings/permissions" },
  { id: "account", label: "Account", icon: "account", title: "Account", subtitle: "Profile, seat, PE credentials, billing and security.", href: "/settings/account" },
  { id: "help", label: "Help & Tutorial", icon: "tutorial", title: "Help & Tutorial", subtitle: "The guided tour, what each ribbon tab is for, and where to find help.", href: "/settings/help" },
  { id: "buttons", label: "Button Guide", icon: "guide", title: "Button Guide", subtitle: "Every button by tab: how it looks, what it does and where it is.", href: "/settings/buttons" },
];

/** The Settings pages indexed by id. */
export const SETTINGS_PAGE_BY_ID: Record<string, SettingsPage> = Object.fromEntries(SETTINGS_PAGES.map((p) => [p.id, p]));

/** Individual settings, searchable from the app bar. */
export const SETTINGS_ITEMS: { label: string; page: string }[] = [
  { label: "Language", page: "general" }, { label: "Auto-Save", page: "general" }, { label: "Advisory Banner on Outputs", page: "general" },
  { label: "Default Jurisdiction", page: "general" }, { label: "Start Screen", page: "general" }, { label: "Check for Updates", page: "general" },
  { label: "Measurement System", page: "units" }, { label: "Length Precision", page: "units" }, { label: "Angle Units", page: "units" },
  { label: "Area / Volume Units", page: "units" }, { label: "Currency", page: "units" }, { label: "Date Format", page: "units" },
  { label: "Grid Spacing", page: "grid-snap" }, { label: "Snap Spacing", page: "grid-snap" }, { label: "Object Snap Modes", page: "grid-snap" },
  { label: "Ortho / Polar Tracking", page: "grid-snap" }, { label: "Dynamic Input", page: "grid-snap" },
  { label: "Theme", page: "display" }, { label: "Accent Colour", page: "display" }, { label: "UI Scale", page: "display" },
  { label: "Crosshair Size", page: "display" }, { label: "Scroll Gesture (Mouse Wheel, Trackpad)", page: "display" }, { label: "Tooltips", page: "display" }, { label: "Model-Space Background", page: "display" },
  { label: "Default Visual Style", page: "rendering" }, { label: "Shadows", page: "rendering" }, { label: "Sun Position", page: "rendering" },
  { label: "Anti-Aliasing", page: "rendering" }, { label: "Render Quality", page: "rendering" }, { label: "Edge Display", page: "rendering" },
  { label: "Command Aliases", page: "shortcuts" }, { label: "Keyboard Shortcuts", page: "shortcuts" },
  { label: "Default Agent", page: "ai" }, { label: "Share Model Context", page: "ai" }, { label: "Send Project Files to Agents", page: "ai" },
  { label: "Response Detail", page: "ai" }, { label: "Cite Code Sections", page: "ai" }, { label: "Clear AI History", page: "ai" },
  { label: "Connect an AI Agent", page: "integrations" }, { label: "Route Tasks to Agents", page: "integrations" }, { label: "MCP Server", page: "integrations" },
  { label: "Email Notifications", page: "notifications" }, { label: "Invite a Member", page: "permissions" }, { label: "PE License", page: "account" },
  { label: "Billing and Invoices", page: "account" }, { label: "Two-Factor Authentication", page: "account" },
  { label: "Tutorial", page: "help" }, { label: "What Each Tab Is For", page: "help" }, { label: "Button Guide", page: "buttons" },
];
