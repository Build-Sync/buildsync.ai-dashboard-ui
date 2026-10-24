/**
 * next.config.ts
 *
 * WHAT   The Next.js configuration: opts out of Cache Components (this is an interactive mock-data workspace
 *        that renders dynamically), hides the dev badge that would sit on top of the command line, redirects
 *        /favicon.ico to /icon.svg, and routes CSS through Tailwind v4 for Turbopack.
 * FOR    `npm run dev`, `npm run build` and `npm start`. Next 16 differs from earlier versions: read
 *        node_modules/next/dist/docs before changing options.
 * DEBUG  - A request for /favicon.ico fails: browsers probe it after soft navigations; the redirect below sends
 *          them to the SVG icon.
 *        - Styles missing in dev or build: the Turbopack rule for *.css must keep the @tailwindcss/turbopack
 *          loader.
 *        - Unknown option errors after an upgrade: Next validates this file; check the docs for the installed
 *          version.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components restricts Date/Math.random and requires Suspense around request data.
  // This app is an interactive mock-data workspace, so it opts out and renders dynamically.
  cacheComponents: false,
  partialPrefetching: false,
  // the dev badge sits on top of the command line's close button
  devIndicators: false,
  // Browsers probe /favicon.ico after soft navigations while the <link rel="icon"> is swapped.
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon.svg", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
