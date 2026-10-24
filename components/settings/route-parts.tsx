import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { SETTINGS_PAGE_BY_ID, SETTINGS_PAGES } from "@/lib/settings-pages";
import { AGENT_IDS, type AgentId } from "@/lib/types";
import { AccountPane } from "./panes/Account";
import { AiSettingsPane } from "./panes/AiSettings";
import { DisplayPane } from "./panes/Display";
import { GeneralPane } from "./panes/General";
import { GridSnapPane } from "./panes/GridSnap";
import { IntegrationsPane } from "./panes/Integrations";
import { NotificationsPane } from "./panes/Notifications";
import { PermissionsPane } from "./panes/Permissions";
import { RenderingPane } from "./panes/Rendering";
import { ShortcutsPane } from "./panes/Shortcuts";
import { UnitsPane } from "./panes/Units";
import { SettingsFrame } from "./SettingsFrame";

/* Shared by the real /settings/* pages and the intercepted modal slots, so the logic exists once. */

export const isAgentId = (v: string | undefined): v is AgentId => !!v && (AGENT_IDS as readonly string[]).includes(v);

export function PaneFor({ slug }: { slug: string[] }): ReactNode {
  const [page, sub] = slug;
  switch (page) {
    case "units":
      return <UnitsPane />;
    case "grid-snap":
      return <GridSnapPane />;
    case "display":
      return <DisplayPane />;
    case "rendering":
      return <RenderingPane />;
    case "shortcuts":
      return <ShortcutsPane />;
    case "ai":
      return <AiSettingsPane />;
    case "integrations":
      return <IntegrationsPane agentId={isAgentId(sub) ? sub : undefined} />;
    case "notifications":
      return <NotificationsPane />;
    case "permissions":
      return <PermissionsPane />;
    case "account":
      return <AccountPane />;
    default:
      return <GeneralPane />;
  }
}

/** `/settings/**` → the validated slug, or a redirect / 404. `/settings` itself goes to General. */
export function checkSlug(slug: string[] | undefined): string[] {
  if (!slug?.length) redirect("/settings/general");
  const [page, sub, ...rest] = slug;
  const ok = !!SETTINGS_PAGE_BY_ID[page] && rest.length === 0 && (sub === undefined || (page === "integrations" && isAgentId(sub)));
  if (!ok) notFound();
  return slug;
}

/** Every settings URL, for static prerendering of the canonical route. */
export function settingsStaticParams(): { slug: string[] }[] {
  return [
    ...SETTINGS_PAGES.map((p) => ({ slug: [p.id] })),
    ...AGENT_IDS.map((id) => ({ slug: ["integrations", id] })),
  ];
}

/** Layout of the intercepting `@modal/(...)settings` route: the frame persists while pages change. */
export function SettingsModalLayout({ children }: { children: ReactNode }) {
  return <SettingsFrame mode="modal">{children}</SettingsFrame>;
}

/** Page of the canonical `/settings/[[...slug]]` route and of its intercepting twins in the @modal slots. */
export async function SettingsRoutePage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  return <PaneFor slug={checkSlug(slug)} />;
}
