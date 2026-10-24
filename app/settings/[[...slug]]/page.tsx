import type { Metadata } from "next";
import { SettingsRoutePage, isAgentId, settingsStaticParams } from "@/components/settings/route-parts";
import { AGENT_META } from "@/lib/agents";
import { SETTINGS_PAGE_BY_ID } from "@/lib/settings-pages";

type Props = { params: Promise<{ slug?: string[] }> };

/* The canonical settings route (spec §8.1): /settings → /settings/general, /settings/<page>,
 * /settings/integrations/<agentId>. It is a catch-all because Next requires every intercepting route
 * (`@modal/(...)settings/[[...slug]]`) to have a canonical route of the same shape. */
export function generateStaticParams() {
  return settingsStaticParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [page, sub] = slug ?? [];
  if (page === "integrations" && isAgentId(sub)) return { title: `Connect ${AGENT_META[sub].name}` };
  return { title: SETTINGS_PAGE_BY_ID[page ?? "general"]?.title ?? "Settings" };
}

export default SettingsRoutePage;
