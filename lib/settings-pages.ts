/**
 * lib/settings-pages.ts
 *
 * WHAT   The data behind Settings navigation: SETTINGS_PAGES (the 11 pages with id, label, icon, title,
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

/* Settings navigation (spec §11): 11 pages, each with an icon. Also feeds the app-bar search. */

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
];

/** The Settings pages indexed by id. */
export const SETTINGS_PAGE_BY_ID: Record<string, SettingsPage> = Object.fromEntries(SETTINGS_PAGES.map((p) => [p.id, p]));

/** Individual settings, searchable from the app bar. */
export const SETTINGS_ITEMS: { label: string; page: string }[] = [
  { label: "Language", page: "general" }, { label: "Auto-save", page: "general" }, { label: "Advisory banner on outputs", page: "general" },
  { label: "Default jurisdiction", page: "general" }, { label: "Start screen", page: "general" }, { label: "Check for updates", page: "general" },
  { label: "Measurement system", page: "units" }, { label: "Length precision", page: "units" }, { label: "Angle units", page: "units" },
  { label: "Area / volume units", page: "units" }, { label: "Currency", page: "units" }, { label: "Date format", page: "units" },
  { label: "Grid spacing", page: "grid-snap" }, { label: "Snap spacing", page: "grid-snap" }, { label: "Object snap modes", page: "grid-snap" },
  { label: "Ortho / Polar tracking", page: "grid-snap" }, { label: "Dynamic input", page: "grid-snap" },
  { label: "Theme", page: "display" }, { label: "Accent colour", page: "display" }, { label: "UI scale", page: "display" },
  { label: "Crosshair size", page: "display" }, { label: "Scroll gesture (mouse wheel, trackpad)", page: "display" }, { label: "Tooltips", page: "display" }, { label: "Model-space background", page: "display" },
  { label: "Default visual style", page: "rendering" }, { label: "Shadows", page: "rendering" }, { label: "Sun position", page: "rendering" },
  { label: "Anti-aliasing", page: "rendering" }, { label: "Render quality", page: "rendering" }, { label: "Edge display", page: "rendering" },
  { label: "Command aliases", page: "shortcuts" }, { label: "Keyboard shortcuts", page: "shortcuts" },
  { label: "Default agent", page: "ai" }, { label: "Share model context", page: "ai" }, { label: "Send project files to agents", page: "ai" },
  { label: "Response detail", page: "ai" }, { label: "Cite code sections", page: "ai" }, { label: "Clear AI history", page: "ai" },
  { label: "Connect an AI agent", page: "integrations" }, { label: "Route tasks to agents", page: "integrations" }, { label: "MCP server", page: "integrations" },
  { label: "Email notifications", page: "notifications" }, { label: "Invite a member", page: "permissions" }, { label: "PE license", page: "account" },
  { label: "Billing and invoices", page: "account" }, { label: "Two-factor authentication", page: "account" },
];
