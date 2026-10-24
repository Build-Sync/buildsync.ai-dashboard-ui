/**
 * app/layout.tsx
 *
 * WHAT   The root layout wrapped around every page: loads the bundled fonts and the global stylesheet, puts the
 *        blocking theme script in <head>, and mounts the app-wide providers (settings and agents store, tooltip
 *        layer, toasts). Also declares the page metadata (title, author, install-as-app tags) and the viewport
 *        theme colour.
 * FOR    Next.js App Router root layout. Every route, including /demo, /app and /settings/*, renders inside it.
 * DEBUG  - Flash of the wrong theme on load: the <script src="/theme-boot.js"> in <head> must stay a plain
 *          blocking script (see public/theme-boot.js).
 *        - Fonts look different: the @fontsource imports at the top are the only font loading; the fallbacks
 *          are in globals.css.
 *        - A hook error from a provider: AppStoreProvider (lib/store/app-provider.tsx) must wrap everything
 *          that calls useApp().
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource-variable/inter";
import "./globals.css";
import { Toaster } from "@/components/ui/Toaster";
import { TooltipLayer } from "@/components/ui/Tooltip";
import { AppStoreProvider } from "@/lib/store/app-provider";
import { THEME_COLOR } from "@/lib/theme";

/**
 * Page metadata: title template, description, author (Giordano Bertin-Maurice) and the tags that let
 * browsers install the site as an app.
 */
export const metadata: Metadata = {
  title: { default: "BuildSync AI", template: "%s · BuildSync AI" },
  description: "AI workspace for engineering plans: code checks, schedule, cost and stress tests in one CAD-style workspace.",
  applicationName: "BuildSync AI",
  authors: [{ name: "Giordano Bertin-Maurice" }],
  creator: "Giordano Bertin-Maurice",
  // lets Safari on macOS ("Add to Dock") and iOS install it as an app with this name
  appleWebApp: { capable: true, title: "BuildSync AI" },
  // keep Safari from turning drawing dimensions such as "800 sf" into phone-number links
  formatDetection: { telephone: false, email: false, address: false },
};

/**
 * Viewport settings and the initial theme colour; ThemeApplier updates the theme-color tag when the theme
 * changes.
 */
export const viewport: Viewport = {
  themeColor: THEME_COLOR.dark, // ThemeApplier updates it when the theme changes
  width: "device-width",
  initialScale: 1,
};

/** Wraps every page in the document shell, the theme boot script and the app-wide providers. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the boot script sets data-theme / --accent / --ui-scale before first paint
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* A plain blocking script: next/script's beforeInteractive is queued behind the async Next
            bootstrap in the App Router, which would paint the dark theme first and then flip. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-boot.js" />
      </head>
      <body>
        <AppStoreProvider>
          {children}
          <TooltipLayer />
          <Toaster />
        </AppStoreProvider>
      </body>
    </html>
  );
}
