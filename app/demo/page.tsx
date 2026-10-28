/**
 * app/demo/page.tsx
 *
 * WHAT   The /demo page: picks the project from ?project= (a sample: the residence, the cottage or the clinic, a
 *        blank one or a community; the residence by default), parses the URL query into workspace state and
 *        renders the Workspace in demo mode.
 * FOR    The no-signup demo of the whole product. Work is saved in this browser only; a banner says so.
 * DEBUG  - Wrong project opens: query.project (lib/workspace-query.ts) decides; an id isKnownProject does not
 *          accept gives the residence.
 *        - Switching sample projects must remount the workspace (key={project.id}); otherwise two projects
 *          would share one store.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { Metadata } from "next";
import { Workspace } from "@/components/workspace/Workspace";
import { DEMO_PROJECT_ID } from "@/lib/mock-data";
import { getProject, isKnownProject } from "@/lib/services/projects";
import { parseQuery } from "@/lib/workspace-query";

/** Title for the demo page. */
export const metadata: Metadata = { title: "Demo Workspace" };

/* /demo: the full workspace with the sample project. No signup, edits aren't saved. */
export default async function DemoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = parseQuery(await searchParams);
  // any sample project, a blank one or a community; anything else falls back to the sample residence
  const id = query.project && isKnownProject(query.project) ? query.project : DEMO_PROJECT_ID;
  const project = (await getProject(id)) ?? (await getProject(DEMO_PROJECT_ID))!;
  // key: switching the sample project must remount the workspace so it gets its own store
  return <Workspace key={project.id} project={project} mode="demo" query={query} basePath="/demo" />;
}
