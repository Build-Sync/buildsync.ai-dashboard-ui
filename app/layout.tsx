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

export const metadata: Metadata = {
  title: { default: "BuildSync AI", template: "%s · BuildSync AI" },
  description: "AI workspace for engineering plans: code checks, schedule, cost and stress tests in one CAD-style workspace.",
};

export const viewport: Viewport = {
  themeColor: "#0d1015",
  width: "device-width",
  initialScale: 1,
};

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
