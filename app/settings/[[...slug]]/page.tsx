/**
 * app/settings/[[...slug]]/page.tsx
 *
 * WHAT   The canonical settings route: /settings redirects to /settings/general, /settings/<page> shows one of
 *        the eleven panes, and /settings/integrations/<agentId> shows the Connect dialog over the Connectors
 *        pane. Statically generated for every valid URL.
 * FOR    A catch-all because Next.js requires each intercepting route (@modal/(...)settings/[[...slug]]) to
 *        have a canonical route of the same shape.
 * DEBUG  - 404 on a valid pane: settingsStaticParams and checkSlug in components/settings/route-parts.tsx list
 *          the valid URLs.
 *        - Wrong tab title: generateMetadata below reads lib/settings-pages.ts and lib/agents.ts.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
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

/** Tab title: the pane's title, or "Connect <agent>" for the integrations dialog. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [page, sub] = slug ?? [];
  if (page === "integrations" && isAgentId(sub)) return { title: `Connect ${AGENT_META[sub].name}` };
  return { title: SETTINGS_PAGE_BY_ID[page ?? "general"]?.title ?? "Settings" };
}

export default SettingsRoutePage;
