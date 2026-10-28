/**
 * lib/shortcuts.ts
 *
 * WHAT   Everything about keyboard shortcuts that is independent of React:
 *        - `comboOf`        turns a keydown into the canonical combo string ("Ctrl+Shift+S").
 *        - `normaliseCombo` puts any spelling of a combo into that same canonical form.
 *        - `formatCombo`    renders a canonical combo for the user's OS (⇧⌘S on a Mac, Ctrl+Shift+S elsewhere).
 *        - `bindingsOf`     lists every combo that triggers a command (platform default, alternates, user remap).
 *        - Chords: a shortcut can be up to 4 keys pressed at once, modifiers included ("Alt+W+A", "Ctrl+Alt+Shift+K",
 *          "Alt+R+E+C"). `chordId` is the order-free identity two chords are compared by; `ChordTracker` follows
 *          which keys are held; `matchChord` says whether the held keys run a command now, or may still grow into
 *          a longer chord (then the shorter one runs when the keys are let go); `chordProblem` says why a chord
 *          cannot be used (too many keys, a bare letter, a combination the browser or the OS keeps).
 * FOR    The hotkey hook (components/workspace/useHotkeys.ts), the Shortcuts settings page (recording and
 *        clash checks), and every place a shortcut is shown (components/ui/Kbd.tsx, menus).
 *
 * CONVENTIONS
 *   - In stored combos "Ctrl" means the PRIMARY modifier: ⌘ on macOS, Ctrl on Windows/Linux. This keeps one
 *     table of defaults and lets exported shortcut files work on any OS.
 *   - Canonical order is Ctrl+Alt+Shift+Key(s). "Alt" is Option (⌥) on a Mac. The keys of a chord keep the order
 *     they were written in (Alt+W+A reads like the alias WA) but match in any order.
 *   - A chord with Ctrl (⌘) takes one other key only: macOS does not report a key let go while ⌘ is held, so a
 *     second key could not be followed there; use Alt or Shift for chords of several keys.
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

/** Put any spelling of a combo ("cmd+shift+s", "Ctrl+Shift+S", "Option+N", "alt+w+a") into canonical form. */
export function normaliseCombo(s: string): string {
  const { mods, keys } = comboParts(s);
  return [...mods, ...keys].join("+");
}

const MOD_ORDER = ["Ctrl", "Alt", "Shift"] as const;

/** The modifiers (canonical order) and the other keys (in the order written, each once) of a combo. */
export function comboParts(s: string): { mods: string[]; keys: string[] } {
  let ctrl = false;
  let alt = false;
  let shift = false;
  const keys: string[] = [];
  for (const raw of s.split("+")) {
    const p = raw.trim();
    if (!p) continue;
    let key = "";
    if (/^(ctrl|control|cmd|command|meta|mod|primary)$/i.test(p)) ctrl = true;
    else if (/^(alt|option|opt)$/i.test(p)) alt = true;
    else if (/^shift$/i.test(p)) shift = true;
    else if (p.length === 1) key = p.toUpperCase();
    else if (/^f\d{1,2}$/i.test(p)) key = p.toUpperCase();
    else key = NAMED_KEYS[p.toLowerCase()] ?? p[0].toUpperCase() + p.slice(1);
    if (key && !keys.includes(key)) keys.push(key);
  }
  const mods = MOD_ORDER.filter((m) => (m === "Ctrl" ? ctrl : m === "Alt" ? alt : shift));
  return { mods: [...mods], keys };
}

/** The identity of a chord, the same whatever order its keys are written or pressed in ("Alt+W+A" = "Alt+A+W"). */
export function chordId(combo: string): string {
  const { mods, keys } = comboParts(combo);
  return [...mods, ...[...keys].sort()].join("+");
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
  const { mods, keys } = comboParts(combo);
  if (!keys.length) return "";
  if (platform === "mac") {
    const glyphs = [mods.includes("Alt") && "⌥", mods.includes("Shift") && "⇧", mods.includes("Ctrl") && "⌘"].filter(Boolean).join("");
    return glyphs + keys.map((k) => MAC_KEY_GLYPHS[k] ?? k).join("+");
  }
  return [...mods, ...keys.map((k) => OTHER_KEY_LABELS[k] ?? k)].join("+");
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

/* ── chords: up to 4 keys at once ─────────────────────────────────────── */

/** The most keys a shortcut may have, modifiers included. */
export const MAX_CHORD_KEYS = 4;

/**
 * Combinations the browser or the operating system keeps for itself (closing the tab or window, quitting, switching
 * apps): a page never sees them, so they cannot be shortcuts. "Ctrl" is ⌘ on a Mac.
 */
export const RESERVED_COMBOS: readonly string[] = [
  "Ctrl+W", "Ctrl+T", "Ctrl+N", "Ctrl+Q", "Ctrl+Shift+N", "Ctrl+Shift+T", "Ctrl+Shift+W", "Ctrl+Shift+Q", "Ctrl+Tab", "Ctrl+Shift+Tab",
  "Alt+F4", "Alt+Tab", "Alt+Space", "Ctrl+Alt+Delete", "Ctrl+H", "Ctrl+M",
];

const NAMED_ALONE = /^(F\d{1,2}|Delete|Insert|Home|End|PageUp|PageDown|Esc)$/;

/** Why a combo cannot be a shortcut, or null when it can. */
export function chordProblem(combo: string): string | null {
  const { mods, keys } = comboParts(combo);
  if (!keys.length) return "Press at least one key besides Ctrl, Alt and Shift.";
  if (mods.length + keys.length > MAX_CHORD_KEYS) return `A shortcut can have at most ${MAX_CHORD_KEYS} keys.`;
  if (mods.includes("Ctrl") && keys.length > 1) return "With Ctrl (⌘ on a Mac) a shortcut takes one other key; use Alt or Shift for several keys at once.";
  if (!mods.length && !keys.every((k) => NAMED_ALONE.test(k))) return "Add Ctrl, Alt or Shift: plain letters, digits and punctuation are for typing commands.";
  if (!mods.length && keys.length > 1) return "Add Ctrl, Alt or Shift to a combination of several keys.";
  const id = chordId(combo);
  if (RESERVED_COMBOS.some((r) => chordId(r) === id)) return `${normaliseCombo(combo)} is kept by the browser or the operating system.`;
  return null;
}

/** The non-modifier key of a key event, as shortcuts name it ("W", "F8", "Delete"), or "" for a modifier. */
export function keyOfEvent(e: KeyEventLike, platform: Platform = getPlatform()): string {
  const c = comboOf(e, platform);
  return c ? comboParts(c).keys[0] ?? "" : "";
}

/**
 * Follows the keys held down, so a press can be read as a chord of several keys. Feed it every keydown and keyup;
 * `down` returns the combo held now ("Alt+W+A"), or "" when the press is not a usable shortcut. Call `reset` when the
 * window loses focus (keys let go elsewhere are never reported).
 */
export class ChordTracker {
  private held: { code: string; key: string }[] = [];

  /** A key went down: the combo held now, its keys in the order they went down. */
  down(e: KeyEventLike, platform: Platform = getPlatform()): string {
    const single = comboOf(e, platform);
    if (!single) return "";
    const { mods, keys } = comboParts(single);
    const key = keys[0];
    const code = e.code || key;
    // macOS does not report keys let go while ⌘ is held: with ⌘ only the key just pressed counts
    if (mods.includes("Ctrl")) this.held = [];
    if (!this.held.some((h) => h.code === code)) this.held.push({ code, key });
    const all = this.held.map((h) => h.key);
    return [...mods, ...all.filter((k, i) => all.indexOf(k) === i)].join("+");
  }

  /** A key went up. Letting go of ⌘ / the Windows key forgets every held key (see above). */
  up(e: { key: string; code?: string }): void {
    if (e.key === "Meta" || e.key === "OS") {
      this.held = [];
      return;
    }
    const code = e.code || "";
    this.held = this.held.filter((h) => (code ? h.code !== code : h.key !== e.key.toUpperCase()));
  }

  /** Forget everything held (the window lost focus). */
  reset(): void {
    this.held = [];
  }

  /** How many keys besides the modifiers are held. */
  get count(): number {
    return this.held.length;
  }
}

/** One shortcut: what it runs and its combo. */
export interface Binding {
  target: string;
  combo: string;
}

/**
 * What the keys held now mean: `exact` is the target bound to exactly this chord (or null); `longer` is true when a
 * chord with the same modifiers and more keys exists, so the press may still grow (run `exact` when the keys are let
 * go instead of now).
 */
export function matchChord(combo: string, bindings: readonly Binding[]): { exact: string | null; longer: boolean } {
  const { mods, keys } = comboParts(combo);
  const id = chordId(combo);
  let exact: string | null = null;
  let longer = false;
  for (const b of bindings) {
    if (!exact && chordId(b.combo) === id) exact = b.target;
    if (!longer) {
      const o = comboParts(b.combo);
      if (o.mods.join("+") === mods.join("+") && o.keys.length > keys.length && keys.every((k) => o.keys.includes(k))) longer = true;
    }
  }
  return { exact, longer };
}
