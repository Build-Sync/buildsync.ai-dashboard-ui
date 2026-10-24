/**
 * app/app/projects/[projectId]/@modal/(...)settings/[[...slug]]/page.tsx
 *
 * WHAT   Page of the intercepted settings route over a project. Re-exports SettingsRoutePage, which picks the
 *        settings pane (or the Connect dialog) from the URL segments.
 * FOR    Counterpart of app/demo/@modal/(...)settings/[[...slug]]/page.tsx; the canonical page for direct
 *        visits is app/settings/[[...slug]]/page.tsx.
 * DEBUG  - Wrong pane: see PaneFor / checkSlug in components/settings/route-parts.tsx.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
export { SettingsRoutePage as default } from "@/components/settings/route-parts";
