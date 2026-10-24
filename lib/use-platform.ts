/**
 * lib/use-platform.ts
 *
 * WHAT   The React hook for the user's OS: `usePlatform()` returns "mac" | "windows" | "linux" | "other".
 * FOR    Components that show OS-specific text (shortcut labels in menus, the Shortcuts settings page).
 *        Kept apart from lib/platform.ts so that file stays free of React and importable from server code.
 *
 * HOW    useSyncExternalStore with a server snapshot of "other": the server HTML and the first client render
 *        agree, then React re-renders with the real OS, so there is no hydration mismatch. For one frame a
 *        Mac shows Windows-style labels; that is expected.
 * DEBUG  Labels never switch to the Mac form: `getPlatform()` in lib/platform.ts returned "other"; log
 *        navigator.platform and navigator.userAgentData?.platform.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useSyncExternalStore } from "react";
import { getPlatform, type Platform } from "./platform";

const noopSubscribe = () => () => {}; // the OS cannot change while a page is open

/**
 * The user's desktop OS ("mac", "windows", "linux" or "other"); "other" on the server and first render,
 * then the real value.
 */
export function usePlatform(): Platform {
  return useSyncExternalStore(noopSubscribe, getPlatform, () => "other");
}
