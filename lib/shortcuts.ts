/**
 * lib/shortcuts.ts
 *
 * WHAT   Everything about keyboard shortcuts that is independent of React:
 *        - `comboOf`        turns a keydown into the canonical combo string ("Ctrl+Shift+S").
 *        - `normaliseCombo` puts any spelling of a combo into that same canonical form.
 *        - `formatCombo`    renders a canonical combo for the user's OS (⇧⌘S on a Mac, Ctrl+Shift+S elsewhere).
 *        - `bindingsOf`     lists every combo that triggers a command (platform default, alternates, user remap).
 * FOR    The hotkey hook (components/workspace/useHotkeys.ts), the Shortcuts settings page (recording and
 *        clash checks), and every place a shortcut is shown (components/ui/Kbd.tsx, menus).
 *
 * CONVENTIONS
 *   - In stored combos "Ctrl" means the PRIMARY modifier: ⌘ on macOS, Ctrl on Windows/Linux. This keeps one
 *     table of defaults and lets exported shortcut files work on any OS.
 *   - Canonical order is Ctrl+Alt+Shift+Key. "Alt" is Option (⌥) on a Mac.
 *   - Keys are matched by the character typed when it is plain ASCII, and by physical key position when it
 *     is not (Option+letter on a Mac produces symbols; Cyrillic/Greek layouts produce non-Latin letters).
 *
 * DEBUG  - A shortcut does nothing: log `comboOf(event)` and compare with `bindingsOf(...)`.
 *        - A Mac shortcut works with ⌃ instead of ⌘: `comboOf` ignores physical Control on macOS by design.
 *        - Shift is dropped for punctuation (Shift+/ is "?" on a US layout) so "Ctrl+/" works on all layouts.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { getPlatform, type Platform } from "./platform";

/** The KeyboardEvent fields `comboOf` reads (lets tests pass plain objects). */
export interface KeyEventLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const PUNCTUATION_CODES: Record<string, string> = {
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
};

/** Name of the physical key ("KeyZ" → "Z", "Digit1" → "1", "Comma" → ","), or null for others. */
function keyFromCode(code: string | undefined): string | null {
  if (!code) return null;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (digit) return digit[1];
  return PUNCTUATION_CODES[code] ?? null;
}

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph", "OS", "CapsLock", "NumLock", "Fn", "FnLock"]);

function keyName(e: KeyEventLike, platform: Platform): string {
  const k = e.key;
  if (k === " ") return "Space";
  if (k === "Escape") return "Esc";
  // The key labelled "delete" on a Mac keyboard sends Backspace and is that platform's delete key.
  if (k === "Backspace") return platform === "mac" ? "Delete" : "Backspace";
  if (k.length !== 1) return k; // F1…, Enter, Tab, Delete, ArrowUp, Home…
  const asciiPrintable = /^[\x21-\x7e]$/.test(k);
  // ⌥ changes the character on macOS, and non-Latin layouts type non-ASCII letters: use the physical key.
  if (!asciiPrintable || (e.altKey && platform === "mac")) return keyFromCode(e.code) ?? k.toUpperCase();
  return k.toUpperCase();
}

/**
 * Canonical combo for a key press, or "" when the press is not a usable shortcut (a bare modifier,
 * a dead key, an IME composition, or the non-primary Control/Windows key). AltGr layouts (which report
 * Ctrl+Alt) still work: the physical key names the shortcut, and typing contexts are guarded elsewhere.
 */
export function comboOf(e: KeyEventLike, platform: Platform = getPlatform()): string {
  if (MODIFIER_KEYS.has(e.key) || e.key === "Unidentified" || e.key === "Process") return "";
  const mac = platform === "mac";
  // Physical Control on a Mac (emacs-style editing, ⌃-click) and the Windows/Super key elsewhere are not shortcut modifiers.
  if (mac ? e.ctrlKey : e.metaKey) return "";
  const primary = mac ? e.metaKey : e.ctrlKey;
  // A dead key (Option+N on a Mac is the tilde accent) is a plain accent while typing, but with ⌘ or Alt held the
  // physical key is what the user means, e.g. ⌥⌘N.
  const dead = e.key === "Dead" ? (primary || e.altKey ? keyFromCode(e.code) : null) : undefined;
  if (dead === null) return "";
  const key = dead ?? keyName(e, platform);
  const parts: string[] = [];
  if (primary) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  // Shift is part of the symbol for punctuation (Shift+/ types "?"), so only count it for letters, digits and named keys.
  if (e.shiftKey && (key.length > 1 || /^[A-Z0-9]$/.test(key))) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

/** Canonical spelling of named keys, keyed by lower case, so "arrowup" and "PAGEDOWN" read as the real KeyboardEvent names. */
const NAMED_KEYS: Record<string, string> = {
  esc: "Esc",
  escape: "Esc",
  del: "Delete",
  delete: "Delete",
  space: "Space",
  enter: "Enter",
  return: "Enter",
  tab: "Tab",
  backspace: "Backspace",
  home: "Home",
  end: "End",
  insert: "Insert",
  pageup: "PageUp",
  pagedown: "PageDown",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
};

/** Put any spelling of a combo ("cmd+shift+s", "Ctrl+Shift+S", "Option+N") into canonical form. */
export function normaliseCombo(s: string): string {
  let ctrl = false;
  let alt = false;
  let shift = false;
  let key = "";
  for (const raw of s.split("+")) {
    const p = raw.trim();
    if (!p) continue;
    if (/^(ctrl|control|cmd|command|meta|mod|primary)$/i.test(p)) ctrl = true;
    else if (/^(alt|option|opt)$/i.test(p)) alt = true;
    else if (/^shift$/i.test(p)) shift = true;
    else if (p.length === 1) key = p.toUpperCase();
    else if (/^f\d{1,2}$/i.test(p)) key = p.toUpperCase();
    else key = NAMED_KEYS[p.toLowerCase()] ?? p[0].toUpperCase() + p.slice(1);
  }
  return [ctrl && "Ctrl", alt && "Alt", shift && "Shift", key].filter(Boolean).join("+");
}

const MAC_KEY_GLYPHS: Record<string, string> = {
  Delete: "⌫",
  Backspace: "⌫",
  Enter: "↩",
  Tab: "⇥",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

const OTHER_KEY_LABELS: Record<string, string> = {
  Delete: "Del",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

/**
 * Display form of a canonical combo for an OS. Macs follow Apple's convention (⌃⌥⇧⌘ glyphs, no
 * separators, ⌘ for the primary modifier); other systems spell the keys out ("Ctrl+Shift+S").
 */
export function formatCombo(combo: string, platform: Platform = getPlatform()): string {
  const norm = normaliseCombo(combo);
  if (!norm) return "";
  const tokens = norm.split("+");
  const key = tokens[tokens.length - 1];
  const mods = tokens.slice(0, -1);
  if (platform === "mac") {
    const glyphs = [mods.includes("Alt") && "⌥", mods.includes("Shift") && "⇧", mods.includes("Ctrl") && "⌘"].filter(Boolean).join("");
    return glyphs + (MAC_KEY_GLYPHS[key] ?? key);
  }
  return [...mods, OTHER_KEY_LABELS[key] ?? key].join("+");
}

/** The fields of a command definition that carry default keys. */
export interface KeyedCommand {
  name: string;
  key?: string;
  /** replaces `key` on macOS (e.g. Redo is ⇧⌘Z there, Ctrl+Y elsewhere) */
  macKey?: string;
  /** extra combos that also trigger the command on every platform */
  altKeys?: readonly string[];
}

/** The default combo shown for a command on this OS ("" if it has none). */
export function defaultKey(def: KeyedCommand, platform: Platform): string {
  return (platform === "mac" ? def.macKey : undefined) ?? def.key ?? "";
}

/**
 * Every canonical combo that triggers a command. A user remap (Settings → Shortcuts) replaces the
 * defaults entirely; an empty remap means "no shortcut". Without one: the platform default plus alternates.
 */
export function bindingsOf(def: KeyedCommand, user: Record<string, string>, platform: Platform): string[] {
  if (def.name in user) return user[def.name] ? [normaliseCombo(user[def.name])] : [];
  return Array.from(new Set([defaultKey(def, platform), ...(def.altKeys ?? [])].filter(Boolean).map(normaliseCombo)));
}
