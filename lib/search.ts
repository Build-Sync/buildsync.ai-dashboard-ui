/**
 * lib/search.ts
 *
 * WHAT   The app-bar search: one index built from the ribbon buttons, all commands, the Settings pages and
 *        individual settings, plus the elements of the open scene, with fuzzy scoring (lib/utils.ts fuzzy) and
 *        the action to run for each result.
 * FOR    SearchBox.tsx calls searchAll(query, scene). Choosing a result runs a command, opens a settings page
 *        or zooms to an element.
 * DEBUG  - A command is missing from the results: it must be in the ribbon (ribbon.config.ts) or COMMANDS
 *          (lib/commands.ts).
 *        - A setting is missing: add it to SETTINGS_ITEMS in lib/settings-pages.ts.
 *        - Elements only match from 2 characters; topography is excluded.
 *        - The static part of the index is built once and cached in `cached`.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { IconKey } from "@/components/icons";
import { RIBBON } from "@/components/workspace/Ribbon/ribbon.config";
import { COMMANDS, runCommand, type CommandCtx } from "./commands";
import type { Scene } from "./scene";
import { SETTINGS_ITEMS, SETTINGS_PAGES, SETTINGS_PAGE_BY_ID } from "./settings-pages";
import { fuzzy } from "./utils";

/* App-bar search: fuzzy over every command, settings page/item and model element (spec §10.1). */

/** One search hit: what it is, how it scores and what to run when chosen. */
export interface SearchResult {
  id: string;
  kind: "command" | "setting" | "element";
  title: string;
  subtitle: string;
  icon: IconKey;
  score: number;
  run: (c: CommandCtx) => void;
}

interface Entry {
  id: string;
  kind: SearchResult["kind"];
  title: string;
  subtitle: string;
  icon: IconKey;
  keys: string[];
  run: (c: CommandCtx) => void;
}

let cached: Entry[] | null = null;

function staticIndex(): Entry[] {
  if (cached) return cached;
  const out: Entry[] = [];
  const seen = new Set<string>();
  for (const tab of RIBBON) {
    for (const p of tab.panels) {
      for (const it of p.items) {
        const key = `${it.command}|${it.label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: `cmd:${tab.id}:${p.id}:${it.id}`,
          kind: "command",
          title: it.label,
          subtitle: `${tab.label} › ${p.name} · ${(it.cmdLabel ?? it.command).toUpperCase()}`,
          icon: it.icon,
          keys: [it.command, it.cmdLabel ?? "", it.desc],
          run: (c) => void runCommand(c, it.command),
        });
      }
    }
  }
  const inRibbon = new Set(out.map((e) => e.keys[0].split(" ")[0].toUpperCase()));
  for (const d of COMMANDS) {
    if (inRibbon.has(d.name.split(" ")[0].toUpperCase())) continue;
    out.push({ id: `cmd:${d.name}`, kind: "command", title: d.title, subtitle: `${d.group} · ${d.name}`, icon: "search", keys: [d.name, ...(d.aliases ?? []), d.desc], run: (c) => void runCommand(c, d.name) });
  }
  for (const p of SETTINGS_PAGES) {
    out.push({ id: `set:${p.id}`, kind: "setting", title: p.title, subtitle: "Settings", icon: p.icon, keys: [p.label, p.subtitle], run: (c) => c.router.push(p.href) });
  }
  for (const s of SETTINGS_ITEMS) {
    const page = SETTINGS_PAGE_BY_ID[s.page];
    out.push({ id: `setitem:${s.page}:${s.label}`, kind: "setting", title: s.label, subtitle: `Settings › ${page.label}`, icon: page.icon, keys: [page.label], run: (c) => c.router.push(page.href) });
  }
  cached = out;
  return out;
}

/** Search commands, settings and scene elements; best matches first, at most `limit`. */
export function searchAll(query: string, scene: Scene | null, limit = 9): SearchResult[] {
  const q = query.trim();
  const entries = staticIndex();
  const scored: SearchResult[] = [];
  const push = (e: Entry) => {
    let best = fuzzy(q, e.title) * 2;
    for (const k of e.keys) best = Math.max(best, fuzzy(q, k));
    if (best > 0) scored.push({ id: e.id, kind: e.kind, title: e.title, subtitle: e.subtitle, icon: e.icon, score: best, run: e.run });
  };
  entries.forEach(push);
  if (scene && q.length >= 2) {
    for (const el of scene.elements) {
      const s = Math.max(fuzzy(q, el.name), fuzzy(q, el.id) * 1.5);
      if (s > 0 && el.layer !== "topography") {
        scored.push({
          id: `el:${el.id}`,
          kind: "element",
          title: el.name,
          subtitle: `Element · ${el.id}`,
          icon: "target",
          score: s * 0.8,
          run: (c) => c.ws.getState().focusElements([el.id]),
        });
      }
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/** Example queries shown when the box is empty. */
export const SEARCH_SUGGESTIONS = ["STRESS", "Section cut", "2D plan", "Compliance", "Connectors", "Units", "Theme"];
