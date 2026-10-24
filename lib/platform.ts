/**
 * lib/platform.ts
 *
 * WHAT   Works out which desktop OS the browser runs on (macOS, Windows, Linux) and answers the
 *        few questions the UI needs that differ between them: which key is the "primary" shortcut
 *        modifier (⌘ on a Mac, Ctrl elsewhere), whether a click is a macOS secondary click
 *        (Control+click), and whether a key press belongs to an IME composition.
 * FOR    Keyboard shortcuts (lib/shortcuts.ts, components/workspace/useHotkeys.ts), shortcut labels
 *        (components/ui/Kbd.tsx) and mouse/trackpad handling in the viewport. This file has no React in it
 *        so server modules may import it; components use the `usePlatform` hook in lib/use-platform.ts.
 * DEBUG  - Wrong labels or modifiers: check `classifyPlatform` with the browser's navigator values.
 *        - Hydration warnings about shortcut text: render labels through `usePlatform`, which returns "other"
 *          on the server; never read `navigator` during render directly.
 *        - Tests emulate an OS by overriding `navigator.platform` / `navigator.userAgentData`
 *          before the page loads (see e2e/platform.mjs).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
/** "other" is used on the server (the OS is unknown there) and for anything unrecognised. */
export type Platform = "mac" | "windows" | "linux" | "other";

/** The parts of `navigator` we read, so tests can pass plain objects. */
export interface NavigatorLike {
  userAgentData?: { platform?: string };
  platform?: string;
  userAgent?: string;
}

function fromString(v: string): Platform | null {
  // "Darwin" contains "win", so macOS must be tested before Windows; Windows is anchored.
  if (/mac|darwin|iphone|ipad|ipod|ios/i.test(v)) return "mac";
  if (/^win|windows/i.test(v)) return "windows";
  if (/linux|cros|chrome os|x11|android|bsd/i.test(v)) return "linux";
  return null;
}

/**
 * Classify the host OS. Chromium's `userAgentData.platform` is the most reliable signal, then the
 * legacy `navigator.platform` ("MacIntel", "Win32", "Linux x86_64"), then the user-agent string.
 * iPadOS in desktop mode reports "MacIntel", which is right here: it uses ⌘ shortcuts too.
 */
export function classifyPlatform(nav: NavigatorLike): Platform {
  return fromString(nav.userAgentData?.platform ?? "") ?? fromString(nav.platform ?? "") ?? fromString(nav.userAgent ?? "") ?? "other";
}

let cached: Platform | undefined;

/** Platform of the current browser; "other" during server rendering. Safe to call anywhere. */
export function getPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  return (cached ??= classifyPlatform(navigator as NavigatorLike));
}

/** Test hook: forget the cached value after a test overrides `navigator`. */
export function resetPlatformCache() {
  cached = undefined;
}

interface Modifiers {
  ctrlKey: boolean;
  metaKey: boolean;
}

/** The shortcut modifier users expect: ⌘ on macOS, Ctrl on Windows and Linux. */
export function hasPrimaryModifier(e: Modifiers, platform: Platform = getPlatform()): boolean {
  return platform === "mac" ? e.metaKey : e.ctrlKey;
}

/** macOS turns Control+click into a right click (a `contextmenu` event follows, no normal click). */
export function isMacSecondaryClick(e: Modifiers & { button: number }, platform: Platform = getPlatform()): boolean {
  return platform === "mac" && e.button === 0 && e.ctrlKey;
}

/**
 * True while an input method (Japanese, Chinese, Korean, dead-key accents…) is composing text. The
 * Enter or arrow key that confirms a candidate must not also run a command. Safari reports
 * `isComposing: false` on the confirming keydown but sets keyCode 229, hence both checks.
 */
export function isComposingKey(e: { isComposing?: boolean; keyCode?: number; nativeEvent?: { isComposing?: boolean } }): boolean {
  return !!(e.isComposing || e.nativeEvent?.isComposing || e.keyCode === 229);
}
