/**
 * components/settings/SettingsFrame.tsx
 *
 * WHAT   The Settings window: a left navigation of the 11 settings pages (accent bar on the active one), a
 *        title and subtitle, the active pane, and a Close / Apply footer with an "Unapplied changes" notice. It
 *        stays mounted while the user moves between pages, so the unapplied draft survives; the draft is
 *        discarded when the frame unmounts.
 * FOR    Both ways of opening settings: mode "modal" (the intercepting route over the workspace; Close =
 *        router.back(), which returns to the exact workspace state) and mode "page" (/settings/* opened
 *        directly; Close goes to /app).
 * OS     Esc closes the window. Its scroll area uses `gutter-stable` so the pane does not jump when a classic
 *        scrollbar (Windows, Linux) appears; macOS overlay scrollbars take no space.
 * DEBUG  - Close goes to the wrong place: close() uses router.back() in modal mode and router.push("/app") in
 *          page mode; check which mode the layout passes.
 *        - Apply stays disabled: `dirty` compares the draft with the saved settings (settingsEqual in
 *          lib/settings.ts).
 *        - Esc in a nested dialog closes the whole window: nested dialogs must carry data-nested
 *          (components/ui/Modal.tsx sets it) so the frame ignores that Esc.
 *        - Focus escapes the dialog: useFocusTrap(ref, mode === "modal") is what keeps Tab inside.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { SETTINGS_PAGES, SETTINGS_PAGE_BY_ID } from "@/lib/settings-pages";
import { settingsEqual } from "@/lib/settings";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "./useFocusTrap";

/* Settings frame (spec §11): left nav of 11 items (accent bar on the active one), right pane with an
 * H2 title + subtitle, footer Close / Apply.
 *
 *  - mode "modal": rendered through the intercepting route over the workspace. Close = router.back(),
 *    which returns to the exact workspace state. In-modal navigation uses replace so one Close is enough.
 *  - mode "page": /settings/* opened directly. Close goes to /app.
 *
 * This component lives in a layout, so it stays mounted while you move between settings pages and the
 * draft survives. It is discarded only when the frame unmounts (leaving settings). */
export function SettingsFrame({ mode, children }: { mode: "page" | "modal"; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const app = useAppApi();
  const draft = useApp((s) => s.draft);
  const settings = useApp((s) => s.settings);
  const ref = useRef<HTMLDivElement>(null);
  const dirty = !!draft && !settingsEqual(draft, settings);

  useFocusTrap(ref, mode === "modal");

  useEffect(() => {
    app.getState().beginEdit();
    return () => app.getState().discardDraft();
  }, [app]);

  const seg = pathname.split("/")[2] ?? "general";
  const page = SETTINGS_PAGE_BY_ID[seg] ?? SETTINGS_PAGES[0];

  const close = () => (mode === "modal" ? router.back() : router.push("/app"));
  const apply = () => {
    app.getState().applyDraft();
    app.getState().toast("Settings applied");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as HTMLElement | null)?.closest?.('[role="dialog"][data-nested]')) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const shell = (
    <div
      ref={ref}
      tabIndex={-1}
      role={mode === "modal" ? "dialog" : undefined}
      aria-modal={mode === "modal" ? true : undefined}
      aria-label="Settings"
      data-testid="settings-frame"
      data-mode={mode}
      className={cn("flex overflow-hidden bg-panel outline-none", mode === "modal" ? "anim-pop h-full w-full max-w-[74rem] rounded-xl border border-line shadow-pop" : "h-dvh w-full")}
    >
      <nav aria-label="Settings sections" className="flex w-[15rem] shrink-0 flex-col border-r border-line bg-panel-alt py-3">
        <div className="mb-2 flex items-center gap-2 px-4 pb-2">
          <span className="grid size-6 place-items-center rounded-md bg-accent text-[0.8125rem] font-bold text-on-accent">B</span>
          <span className="text-[0.9375rem] font-semibold text-t1">Settings</span>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {SETTINGS_PAGES.map((p) => {
            const active = p.id === page.id;
            return (
              <li key={p.id}>
                <Link
                  href={p.href}
                  replace={mode === "modal"}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 px-4 py-2 text-[0.8125rem] transition-colors",
                    active ? "bg-accent/12 font-medium text-t1 before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-r before:bg-accent" : "text-t2 hover:bg-t1/8 hover:text-t1",
                  )}
                >
                  <Icon name={p.icon} size={16} className={active ? "text-accent" : "text-t3"} />
                  {p.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-soft px-8 pb-4 pt-6">
          <h2 className="text-[1.25rem] font-semibold tracking-tight text-t1">{page.title}</h2>
          <p className="mt-1 text-[0.8125rem] text-t2">{page.subtitle}</p>
        </header>
        <div className="gutter-stable min-h-0 flex-1 overflow-y-auto px-8 py-5" data-testid="settings-pane">
          {children}
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-soft bg-panel-alt px-6 py-3">
          {dirty && (
            <span className="mr-auto flex items-center gap-1.5 text-[0.75rem] text-warn" role="status">
              <span className="size-1.5 rounded-full bg-warn" /> Unapplied changes
            </span>
          )}
          <button className="btn h-8 px-4" onClick={close} data-testid="settings-close">
            Close
          </button>
          <button className="btn btn-primary h-8 px-4" onClick={apply} disabled={!dirty} data-testid="settings-apply">
            Apply
          </button>
        </footer>
      </section>
    </div>
  );

  if (mode === "page") return <div className="min-h-dvh bg-app">{shell}</div>;
  return (
    <div
      className="anim-fade fixed inset-0 z-[70] flex items-center justify-center p-[2.5vh_2.5vw]"
      style={{ background: "var(--scrim)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {shell}
    </div>
  );
}
