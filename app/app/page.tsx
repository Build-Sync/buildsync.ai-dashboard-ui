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
