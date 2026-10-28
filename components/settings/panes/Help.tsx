/**
 * components/settings/panes/Help.tsx
 *
 * WHAT   Settings → Help & Tutorial: start the guided tour, ask the first-run question again next time, open the
 *        Button Guide and the keyboard shortcuts, and what each ribbon tab is for (in ribbon order).
 *        Settings → Button Guide: the whole Button Guide (components/shared/ButtonGuide.tsx) as a page.
 * FOR    Help that is one click away from Settings, as from Home → Help and the ? in the app bar. Starting the tour
 *        or "show me where" goes back to the workspace first (useToWorkspace).
 * DEBUG  - The tour does not start: it is drawn by the workspace (components/workspace/Tour.tsx). From a settings
 *          page opened on its own (no workspace behind it) this goes to /app first.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { ButtonGuide } from "@/components/shared/ButtonGuide";
import { RIBBON } from "@/components/workspace/Ribbon/ribbon.config";
import { TOUR_KEY } from "@/lib/store/app-store";
import { useAppApi } from "@/lib/store/app-provider";
import { Group, Row } from "../rows";

/** Leave Settings for the workspace (back to the one underneath, or /app), then run `after`. */
function useToWorkspace() {
  const router = useRouter();
  return (after: () => void) => {
    const behind = !!document.querySelector('[data-testid="workspace"]');
    if (behind) router.back();
    else router.push("/app");
    after();
  };
}

/** The Settings → Help & Tutorial pane. */
export function HelpPane() {
  const app = useAppApi();
  const go = useToWorkspace();
  return (
    <div data-testid="pane-help">
      <Row label="Tutorial" help="A guided tour of the screen: what every area and every ribbon tab is for. Everything else is greyed out while a part is explained; skip it any time.">
        <button className="btn btn-primary" data-testid="start-tutorial" onClick={() => go(() => app.getState().startTour(0))}>
          <Icon name="tutorial" size={14} /> Start the tutorial
        </button>
      </Row>
      <Row label="Ask Me at Start" help="Show the “Take the tour?” question again the next time the workspace opens.">
        <button
          className="btn"
          onClick={() => {
            try {
              localStorage.removeItem(TOUR_KEY);
              app.getState().toast("The tour question will show next time the workspace opens", "info");
            } catch {
              app.getState().toast("This browser blocks storage", "warn");
            }
          }}
        >
          Ask again
        </button>
      </Row>
      <Row label="Button Guide" help="Every button by tab: how it looks, what it does, where it is, and an eye that shows it on screen.">
        <Link href="/settings/buttons" className="btn">
          <Icon name="guide" size={14} /> Open the Button Guide
        </Link>
      </Row>
      <Row label="Keyboard Shortcuts" help="Every shortcut and command alias; change them in Settings → Shortcuts.">
        <Link href="/settings/shortcuts" className="btn">
          <Icon name="keyboard" size={14} /> Shortcuts
        </Link>
      </Row>
      <Group title="What each tab is for">
        <ol className="space-y-2 py-2" data-testid="tab-purposes">
          {RIBBON.map((t, i) => (
            <li key={t.id} className="flex gap-3 text-[0.8125rem]">
              <span className="mono w-5 shrink-0 text-right text-t3">{i + 1}</span>
              <div>
                <div className="font-semibold text-t1">{t.label}</div>
                <p className="text-t2">{t.purpose}</p>
                <p className="text-[0.75rem] text-t3">Panels: {t.panels.map((p) => p.name).join(", ")}</p>
              </div>
            </li>
          ))}
        </ol>
      </Group>
    </div>
  );
}

/** The Settings → Button Guide pane. */
export function ButtonsPane() {
  const app = useAppApi();
  const go = useToWorkspace();
  return (
    <div data-testid="pane-buttons" className="py-2">
      <ButtonGuide onShow={(sp) => go(() => app.getState().setSpotlight(sp))} />
    </div>
  );
}
