/**
 * app/demo/page.tsx
 *
 * WHAT   The /demo page: picks the sample project (the residence, or the clinic with ?project=clinic-
 *        phase1-antigua), parses the URL query into workspace state and renders the Workspace in demo mode.
 * FOR    The no-signup demo of the whole product. Edits are never saved; a banner says so.
 * DEBUG  - Wrong project opens: query.project (lib/workspace-query.ts) decides; any value other than the clinic
 *          id gives the residence.
 *        - Switching sample projects must remount the workspace (key={project.id}); otherwise two projects
 *          would share one store.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { Metadata } from "next";
import { Workspace } from "@/components/workspace/Workspace";
import { CLINIC_PROJECT_ID, DEMO_PROJECT_ID } from "@/lib/mock-data";
import { getProject } from "@/lib/services/projects";
import { parseQuery } from "@/lib/workspace-query";

/** Title for the demo page. */
export const metadata: Metadata = { title: "Demo workspace" };

/* /demo: the full workspace with the sample project. No signup, edits aren't saved. */
export default async function DemoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = parseQuery(await searchParams);
  const id = query.project === CLINIC_PROJECT_ID ? CLINIC_PROJECT_ID : DEMO_PROJECT_ID;
  const project = (await getProject(id))!;
  // key: switching the sample project must remount the workspace so it gets its own store
  return <Workspace key={project.id} project={project} mode="demo" query={query} basePath="/demo" />;
}
