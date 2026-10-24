/**
 * app/demo/@modal/(...)settings/[[...slug]]/page.tsx
 *
 * WHAT   Page of the intercepted settings route over /demo. Re-exports SettingsRoutePage, which picks the
 *        settings pane (or the Connect dialog) from the URL segments.
 * FOR    Together with the canonical app/settings/[[...slug]]/page.tsx it gives the same screens as a modal
 *        (here) and as a normal page (there). It is a catch-all because Next.js needs the intercepting route
 *        and its canonical route to have the same shape.
 * DEBUG  - Wrong pane: see PaneFor / checkSlug in components/settings/route-parts.tsx; unknown slugs call
 *          notFound().
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
export { SettingsRoutePage as default } from "@/components/settings/route-parts";
