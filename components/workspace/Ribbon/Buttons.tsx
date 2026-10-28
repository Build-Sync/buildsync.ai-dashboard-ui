/**
 * components/workspace/Ribbon/Buttons.tsx
 *
 * WHAT   The two ribbon button shapes: LargeButton (28 px icon with the label underneath) and SmallButton (icon
 *        and label inline, stacked three to a column). Active toggles get an accent fill; every button has a
 *        tooltip with title, description, shortcut and command, and carries data-ribbon-item (its id: the Button
 *        Guide's "Show me" and the tutorial light it) and data-command (e2e/buttons.mjs checks the command ran).
 * FOR    RibbonPanels.tsx. Their sizes are mirrored by the estimate constants in fit.ts (LARGE_COL, SMALL_MIN);
 *        if you change a button's width, update them too.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Icon } from "@/components/icons";
import { tip } from "@/components/ui/Tooltip";
import { commandDisplay } from "@/lib/commands";
import { shortcutOf } from "@/lib/keymap";
import { useApp } from "@/lib/store/app-provider";
import { usePlatform } from "@/lib/use-platform";
import { cn } from "@/lib/utils";
import type { RibbonItem } from "./ribbon.config";

/* Large: 28px icon with the label underneath. Small: stacked three to a column, icon + label inline.
 * Active toggles show an accent fill. */

interface BtnProps {
  item: RibbonItem;
  active: boolean;
  onRun: (command: string) => void;
}

/** The shortcut a ribbon command has now (the user's own or its default), for its tooltip. */
function useShortcut(command: string): string {
  const user = useApp((s) => s.settings.shortcuts.keys);
  const platform = usePlatform();
  return command.startsWith("/") ? "" : shortcutOf(command, user, platform);
}

/** Large ribbon button: big icon, label below. */
export function LargeButton({ item, active, onRun }: BtnProps) {
  const shortcut = useShortcut(item.command);
  return (
    <button
      type="button"
      aria-pressed={item.active ? active : undefined}
      aria-label={item.label}
      data-ribbon-item={item.id}
      data-command={item.command}
      onClick={() => onRun(item.command)}
      className={cn(
        "flex h-[4.5rem] w-[3.45rem] shrink-0 flex-col items-center justify-start gap-1 rounded-md border px-0.5 pt-1.5 text-center transition-colors",
        active ? "accent-soft border-accent/70 text-accent" : "border-transparent text-t1 hover:border-line hover:bg-t1/10",
      )}
      {...tip(item.label, item.desc, commandDisplay(item.cmdLabel ?? item.command), shortcut)}
    >
      <Icon name={item.icon} size={28} strokeWidth={1.5} className={active ? "text-accent" : "text-t1"} />
      <span className="line-clamp-2 text-[0.625rem] font-medium leading-[1.1]">{item.label}</span>
    </button>
  );
}

/** Small ribbon button: icon and label on one line. */
export function SmallButton({ item, active, onRun }: BtnProps) {
  const shortcut = useShortcut(item.command);
  return (
    <button
      type="button"
      aria-pressed={item.active ? active : undefined}
      data-ribbon-item={item.id}
      data-command={item.command}
      onClick={() => onRun(item.command)}
      className={cn(
        "flex h-[1.4375rem] w-full min-w-[4.9rem] items-center gap-1.5 rounded border px-1.5 text-left text-[0.6875rem] transition-colors",
        active ? "accent-soft border-accent/70 text-accent" : "border-transparent text-t1 hover:border-line hover:bg-t1/10",
      )}
      {...tip(item.label, item.desc, commandDisplay(item.cmdLabel ?? item.command), shortcut)}
    >
      <Icon name={item.icon} size={14} strokeWidth={1.7} className={cn("shrink-0", active ? "text-accent" : "text-t2")} />
      <span className="truncate">{item.label}</span>
    </button>
  );
}
