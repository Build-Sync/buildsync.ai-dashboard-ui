/**
 * app/app/projects/[projectId]/page.tsx
 *
 * WHAT   The workspace page for one project: loads it with getProject, shows the 404 page for an unknown id,
 *        parses the URL query (tab, panel, explorer, view, section) and renders the Workspace in app mode.
 * FOR    The main screen of the product. generateMetadata sets the browser tab title to the project name.
 * DEBUG  - 404 for a project that should exist: lib/services/projects.ts (isKnownProject / getProject) decides
 *          which ids are valid.
 *        - Switching between projects must remount the workspace (key={project.id}) so each project gets its
 *          own store.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace/Workspace";
import { getProject } from "@/lib/services/projects";
import { parseQuery } from "@/lib/workspace-query";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Browser-tab title: the project's name, or "Project Not Found". */
export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { projectId } = await params;
  const project = await getProject(projectId);
  return { title: project?.name ?? "Project Not Found" };
}

/* The main CAD screen. UI state (tab, panel, explorer, view, section) comes from the URL query. */
export default async function ProjectPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const query = parseQuery(await searchParams);
  return <Workspace key={project.id} project={project} mode="app" query={query} basePath={`/app/projects/${project.id}`} />;
}
