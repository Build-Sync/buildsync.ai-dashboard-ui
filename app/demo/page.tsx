import type { Metadata } from "next";
import { Workspace } from "@/components/workspace/Workspace";
import { CLINIC_PROJECT_ID, DEMO_PROJECT_ID } from "@/lib/mock-data";
import { getProject } from "@/lib/services/projects";
import { parseQuery } from "@/lib/workspace-query";

export const metadata: Metadata = { title: "Demo workspace" };

/* /demo: the full workspace with the sample project. No signup, edits aren't saved. */
export default async function DemoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = parseQuery(await searchParams);
  const id = query.project === CLINIC_PROJECT_ID ? CLINIC_PROJECT_ID : DEMO_PROJECT_ID;
  const project = (await getProject(id))!;
  // key: switching the sample project must remount the workspace so it gets its own store
  return <Workspace key={project.id} project={project} mode="demo" query={query} basePath="/demo" />;
}
