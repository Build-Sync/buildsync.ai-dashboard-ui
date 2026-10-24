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
