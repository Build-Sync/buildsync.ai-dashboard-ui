/**
 * app/settings/layout.tsx
 *
 * WHAT   Layout for /settings/*: wraps the page in SettingsFrame in page mode (full-screen settings with its
 *        own navigation) and sets the title template.
 * FOR    Used when a settings URL is opened directly or refreshed. From inside the workspace the same URLs are
 *        intercepted by the @modal slots and shown as a modal instead.
 * DEBUG  - Frame looks different from the modal: only the `mode` prop differs ("page" here, "modal" in route-
 *          parts.tsx).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SettingsFrame } from "@/components/settings/SettingsFrame";

/** Title template: "<page> · Settings · BuildSync AI". */
export const metadata: Metadata = { title: { default: "Settings", template: "%s · Settings · BuildSync AI" } };

/* /settings/* opened directly renders as a normal page. From the workspace, the same routes are
 * intercepted by the `@modal/(...)settings` slot and shown as a modal over the workspace. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsFrame mode="page">{children}</SettingsFrame>;
}
