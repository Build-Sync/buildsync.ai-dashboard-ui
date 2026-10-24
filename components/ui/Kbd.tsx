/**
 * components/ui/Kbd.tsx
 *
 * WHAT   Two small components that show a keyboard shortcut in the user's own OS convention:
 *        `Kbd` is the boxed key-cap look, `ShortcutLabel` is plain inline text for menus. Both take the
 *        canonical combo ("Ctrl+Shift+S", where Ctrl means the primary modifier) and print "⇧⌘S" on a Mac
 *        or "Ctrl+Shift+S" on Windows and Linux.
 * FOR    Anywhere the UI mentions a shortcut: search box, app menu, context menu, Shortcuts settings.
 *        Never hard-code "Ctrl" or "⌘" in the UI; pass the canonical combo through these instead.
 * DEBUG  - Label looks like Windows on a Mac for a split second after load: expected, the server render
 *          cannot know the OS; `usePlatform` switches after hydration (lib/use-platform.ts).
 *        - Wrong glyphs: see `formatCombo` in lib/shortcuts.ts.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { usePlatform } from "@/lib/use-platform";
import { formatCombo } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/** The shortcut as text for this OS, for components that lay it out themselves. */
export function useShortcutText(combo: string | undefined): string {
  const platform = usePlatform();
  return combo ? formatCombo(combo, platform) : "";
}

/** Boxed key-cap, e.g. next to the search field. */
export function Kbd({ combo, className }: { combo: string; className?: string }) {
  const text = useShortcutText(combo);
  return <kbd className={cn("kbd", className)}>{text}</kbd>;
}

/** Plain monospace text, e.g. the right-hand column of a menu row. */
export function ShortcutLabel({ combo, className }: { combo: string; className?: string }) {
  const text = useShortcutText(combo);
  return <span className={cn("mono shrink-0 text-[0.625rem] text-t3", className)}>{text}</span>;
}
