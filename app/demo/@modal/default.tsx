/**
 * app/demo/@modal/default.tsx
 *
 * WHAT   The fallback for the @modal parallel slot on /demo: renders nothing.
 * FOR    Next.js requires a default.tsx in every parallel slot; it is used whenever the slot has no matching
 *        route (for example after a hard refresh of /demo).
 * DEBUG  - Build error "No default component was found for a parallel route": this file is missing or does not
 *          export a component.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
/** Renders nothing: no modal is open. */
export default function Default() {
  return null;
}
