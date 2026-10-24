/**
 * app/app/projects/[projectId]/@modal/(...)settings/layout.tsx
 *
 * WHAT   Layout of the intercepted settings route over a project. Re-exports SettingsModalLayout, which wraps
 *        every settings screen in the modal frame.
 * FOR    Counterpart of app/demo/@modal/(...)settings/layout.tsx for /app/projects/[projectId]; (...)
 *        intercepts /settings/* from the app root.
 * DEBUG  - See app/demo/@modal/(...)settings/layout.tsx; both re-export the same component so behaviour cannot
 *          drift.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
export { SettingsModalLayout as default } from "@/components/settings/route-parts";
