/**
 * components/settings/panes/General.tsx
 *
 * WHAT   Settings → General: language, auto-save (with its interval), the advisory banner (locked on until a PE
 *        licence is verified), default jurisdiction, start screen and the update check.
 * FOR    The `settings.general` values (lib/settings.ts). Auto-save is carried out by
 *        components/workspace/Workspace.tsx; the start screen decides what /app opens (app/app/page.tsx,
 *        through the bs_start cookie).
 * DEBUG  - The advisory switch cannot be turned off: by design until selectVerified is true (a PE licence on
 *          the Account page).
 *        - Start screen has no effect: bs_start is written by AppStoreProvider only after the saved settings
 *          have loaded (lib/store/app-provider.tsx).
 *        - A value is not kept: panes edit a draft, which is saved only by Apply.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { Select, Switch } from "@/components/ui/controls";
import { JURISDICTIONS } from "@/lib/mock-data";
import { selectVerified } from "@/lib/store/app-store";
import { useApp } from "@/lib/store/app-provider";
import { Hint, Row, useDraft } from "../rows";

/** The Settings → General pane. */
export function GeneralPane() {
  const { s, set } = useDraft();
  const verified = useApp(selectVerified);
  const g = s.general;
  return (
    <div data-testid="pane-general">
      <Row label="Language" help="Interface language. Dates, numbers and AI responses follow it. Interface translation ships later.">
        <Select<"en" | "fr" | "es" | "ja"> label="Language" value={g.language} onChange={(v) => set((d) => (d.general.language = v))} options={[{ value: "en", label: "English" }, { value: "fr", label: "Français" }, { value: "es", label: "Español" }, { value: "ja", label: "日本語" }]} />
      </Row>
      <Row label="Auto-save" help="Saves the project in the background while you work. The demo workspace never saves.">
        <div className="flex items-center gap-3">
          <Select<1 | 2 | 5 | 10> label="Auto-save interval" disabled={!g.autosave} className="!min-w-[7rem]" value={g.autosaveMinutes} onChange={(v) => set((d) => (d.general.autosaveMinutes = v))} options={[1, 2, 5, 10].map((m) => ({ value: m as 1 | 2 | 5 | 10, label: `Every ${m} min` }))} />
          <Switch label="Auto-save" checked={g.autosave} onChange={(v) => set((d) => (d.general.autosave = v))} />
        </div>
      </Row>
      <Row label="Advisory banner on outputs" help={verified ? "Shows “AI-generated, unstamped” wherever results appear." : "Locked on until a PE license is verified on your account. Every AI output must carry the advisory banner."}>
        <div className="flex items-center gap-3">
          {!verified && (
            <Link href="/settings/account" className="flex items-center gap-1 text-[0.75rem] text-accent hover:underline">
              <Icon name="lock" size={12} /> Verify
            </Link>
          )}
          <Switch label="Advisory banner" checked={verified ? g.advisoryBanner : true} locked={!verified} onChange={(v) => set((d) => (d.general.advisoryBanner = v))} />
        </div>
      </Row>
      <Row label="Default jurisdiction" help="Code set used for new projects. Existing projects keep their own.">
        <Select<string> label="Default jurisdiction" className="!min-w-[16rem]" value={g.defaultJurisdiction ?? ""} onChange={(v) => set((d) => (d.general.defaultJurisdiction = v || null))} options={[{ value: "", label: "From project" }, ...JURISDICTIONS.map((j) => ({ value: j.name, label: `${j.name} · ${j.codeSet}` }))]} />
      </Row>
      <Row label="Start screen" help="What opens when you go to /app.">
        <Select<"start" | "last"> label="Start screen" value={g.startScreen} onChange={(v) => set((d) => (d.general.startScreen = v))} options={[{ value: "start", label: "Start tab" }, { value: "last", label: "Last project" }]} />
      </Row>
      <Row label="Check for updates" help="Look for new versions when the app starts.">
        <Switch label="Check for updates" checked={g.checkUpdates} onChange={(v) => set((d) => (d.general.checkUpdates = v))} />
      </Row>
      <Hint>Changes are previewed immediately and saved when you press Apply. Close discards them.</Hint>
    </div>
  );
}
