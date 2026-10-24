/**
 * app/app/page.tsx
 *
 * WHAT   Server component for /app: reads the bs_last_project and bs_start cookies and redirects to
 *        /app/projects/<id>, which is the last open project (or the demo project if there is none or it is
 *        unknown), adding ?doc=start when Settings → General → Start screen is "Start tab".
 * FOR    The entry point of the signed-in product; people bookmark /app.
 * DEBUG  - Always lands on the demo project: bs_last_project is written by components/workspace/Workspace.tsx
 *          in app mode only; check the cookie and isKnownProject(id).
 *        - Start tab never opens: bs_start is written by AppStoreProvider once the saved settings have loaded
 *          (lib/store/app-provider.tsx).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_PROJECT_ID } from "@/lib/mock-data";
import { isKnownProject } from "@/lib/services/projects";

/* /app → the last open project, or the demo project. Honours Settings → General → Start screen. */
export default async function AppIndex() {
  const jar = await cookies();
  const last = jar.get("bs_last_project")?.value;
  const target = last && isKnownProject(last) ? last : DEMO_PROJECT_ID;
  const startTab = jar.get("bs_start")?.value === "start";
  redirect(`/app/projects/${target}${startTab ? "?doc=start" : ""}`);
}
