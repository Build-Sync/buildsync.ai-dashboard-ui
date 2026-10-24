import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SettingsFrame } from "@/components/settings/SettingsFrame";

export const metadata: Metadata = { title: { default: "Settings", template: "%s · Settings · BuildSync AI" } };

/* /settings/* opened directly renders as a normal page. From the workspace, the same routes are
 * intercepted by the `@modal/(...)settings` slot and shown as a modal over the workspace. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsFrame mode="page">{children}</SettingsFrame>;
}
