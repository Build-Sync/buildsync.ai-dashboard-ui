import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace/Workspace";
import { getProject } from "@/lib/services/projects";
import { parseQuery } from "@/lib/workspace-query";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { projectId } = await params;
  const project = await getProject(projectId);
  return { title: project?.name ?? "Project not found" };
}

/* The main CAD screen. UI state (tab, panel, explorer, view, section) comes from the URL query. */
export default async function ProjectPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const query = parseQuery(await searchParams);
  return <Workspace key={project.id} project={project} mode="app" query={query} basePath={`/app/projects/${project.id}`} />;
}
