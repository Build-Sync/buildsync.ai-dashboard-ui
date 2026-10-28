/**
 * lib/shortcuts.test.ts
 *
 * WHAT   Unit tests for lib/shortcuts.ts: turning key presses into canonical combos on each OS, normalising
 *        spellings, printing combos for each OS (⇧⌘S vs Ctrl+Shift+S), resolving which combos trigger a command, and
 *        chords of up to 4 keys: their identity in any order, the rules they must follow, following held keys, and
 *        telling a finished chord from one that may still grow.
 * FOR    `npm test`. These encode the cross-platform rules: ⌘ is the primary modifier on a Mac, the Mac delete key
 *        is Backspace, Option+letter and non-Latin layouts match by physical key, and Shift is ignored on punctuation.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChordTracker, bindingsOf, chordId, chordProblem, comboOf, comboParts, defaultKey, formatCombo, matchChord, normaliseCombo, type KeyEventLike } from "./shortcuts";

const ev = (key: string, mods: Partial<Pick<KeyEventLike, "ctrlKey" | "metaKey" | "altKey" | "shiftKey">> = {}, code?: string): KeyEventLike => ({
  key,
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("comboOf on Windows and Linux", () => {
  for (const p of ["windows", "linux"] as const) {
    it(`uses Ctrl as the primary modifier (${p})`, () => {
      assert.equal(comboOf(ev("z", { ctrlKey: true }, "KeyZ"), p), "Ctrl+Z");
      assert.equal(comboOf(ev("S", { ctrlKey: true, shiftKey: true }, "KeyS"), p), "Ctrl+Shift+S");
      assert.equal(comboOf(ev(",", { ctrlKey: true }, "Comma"), p), "Ctrl+,");
    });
    it(`ignores the Windows/Super key (${p})`, () => {
      assert.equal(comboOf(ev("z", { metaKey: true }, "KeyZ"), p), "");
    });
    it(`keeps Backspace distinct from Delete (${p})`, () => {
      assert.equal(comboOf(ev("Backspace"), p), "Backspace");
      assert.equal(comboOf(ev("Delete"), p), "Delete");
    });
  }

  it("names function keys, Escape and Space", () => {
    assert.equal(comboOf(ev("F8", {}, "F8"), "windows"), "F8");
    assert.equal(comboOf(ev("Escape"), "windows"), "Esc");
    assert.equal(comboOf(ev(" ", {}, "Space"), "windows"), "Space");
  });

  it("ignores bare modifier presses and IME / unidentified keys", () => {
    for (const k of ["Control", "Shift", "Alt", "Meta", "AltGraph", "CapsLock", "Unidentified", "Process"]) assert.equal(comboOf(ev(k), "windows"), "", k);
  });

  it("drops Shift for punctuation so Ctrl+/ works on layouts where / needs Shift", () => {
    assert.equal(comboOf(ev("/", { ctrlKey: true, shiftKey: true }, "Digit7"), "windows"), "Ctrl+/");
  });

  it("matches non-Latin layouts by physical key", () => {
    assert.equal(comboOf(ev("я", { ctrlKey: true }, "KeyZ"), "windows"), "Ctrl+Z");
  });

  it("matches Ctrl+Alt combos on AltGr layouts by physical key", () => {
    assert.equal(comboOf(ev("ń", { ctrlKey: true, altKey: true }, "KeyN"), "windows"), "Ctrl+Alt+N");
  });
});

describe("comboOf on macOS", () => {
  it("uses Command as the primary modifier and writes it as Ctrl", () => {
    assert.equal(comboOf(ev("z", { metaKey: true }, "KeyZ"), "mac"), "Ctrl+Z");
    assert.equal(comboOf(ev("Z", { metaKey: true, shiftKey: true }, "KeyZ"), "mac"), "Ctrl+Shift+Z");
    assert.equal(comboOf(ev(",", { metaKey: true }, "Comma"), "mac"), "Ctrl+,");
  });

  it("ignores physical Control (emacs-style editing keys, Control+click)", () => {
    assert.equal(comboOf(ev("z", { ctrlKey: true }, "KeyZ"), "mac"), "");
  });

  it("treats the Backspace key (labelled delete) as Delete", () => {
    assert.equal(comboOf(ev("Backspace"), "mac"), "Delete");
    assert.equal(comboOf(ev("Delete"), "mac"), "Delete");
  });

  it("matches Option+letter by physical key, since Option changes the character", () => {
    assert.equal(comboOf(ev("∂", { altKey: true }, "KeyD"), "mac"), "Alt+D");
    assert.equal(comboOf(ev("Ω", { altKey: true, shiftKey: true }, "KeyZ"), "mac"), "Alt+Shift+Z");
  });

  it("recovers ⌥⌘N when the Option+N dead key is reported", () => {
    assert.equal(comboOf(ev("Dead", { metaKey: true, altKey: true }, "KeyN"), "mac"), "Ctrl+Alt+N");
  });

  it("does not turn a plain dead key (typing an accent) into a shortcut", () => {
    assert.equal(comboOf(ev("Dead", {}, "KeyE"), "mac"), "");
  });
});

describe("normaliseCombo", () => {
  it("accepts any spelling and orders modifiers Ctrl, Alt, Shift", () => {
    assert.equal(normaliseCombo("cmd+shift+s"), "Ctrl+Shift+S");
    assert.equal(normaliseCombo("Shift+Ctrl+S"), "Ctrl+Shift+S");
    assert.equal(normaliseCombo("Option+N"), "Alt+N");
    assert.equal(normaliseCombo("Ctrl+Shift+Alt+x"), "Ctrl+Alt+Shift+X");
    assert.equal(normaliseCombo("ctrl+,"), "Ctrl+,");
  });
  it("normalises named keys", () => {
    assert.equal(normaliseCombo("del"), "Delete");
    assert.equal(normaliseCombo("escape"), "Esc");
    assert.equal(normaliseCombo("f8"), "F8");
    assert.equal(normaliseCombo("Ctrl+arrowup"), "Ctrl+ArrowUp");
    assert.equal(normaliseCombo("shift+PAGEDOWN"), "Shift+PageDown");
  });
  it("is idempotent", () => {
    for (const c of ["Ctrl+Shift+S", "F8", "Ctrl+Alt+N", "Delete", "Ctrl+/"]) assert.equal(normaliseCombo(normaliseCombo(c)), c);
  });
});

describe("formatCombo", () => {
  it("uses Apple glyphs on macOS in Control-Option-Shift-Command order", () => {
    assert.equal(formatCombo("Ctrl+Shift+S", "mac"), "⇧⌘S");
    assert.equal(formatCombo("Ctrl+Alt+N", "mac"), "⌥⌘N");
    assert.equal(formatCombo("Ctrl+Alt+Shift+Z", "mac"), "⌥⇧⌘Z");
    assert.equal(formatCombo("Ctrl+,", "mac"), "⌘,");
    assert.equal(formatCombo("Delete", "mac"), "⌫");
    assert.equal(formatCombo("F8", "mac"), "F8");
    assert.equal(formatCombo("Esc", "mac"), "Esc");
  });
  it("spells keys out on Windows, Linux and unknown systems", () => {
    for (const p of ["windows", "linux", "other"] as const) {
      assert.equal(formatCombo("Ctrl+Shift+S", p), "Ctrl+Shift+S", p);
      assert.equal(formatCombo("Delete", p), "Del", p);
      assert.equal(formatCombo("Ctrl+Alt+N", p), "Ctrl+Alt+N", p);
    }
  });
  it("returns an empty string for no combo", () => {
    assert.equal(formatCombo("", "mac"), "");
  });
});

describe("defaultKey and bindingsOf", () => {
  const redo = { name: "REDO", key: "Ctrl+Y", macKey: "Ctrl+Shift+Z", altKeys: ["Ctrl+Shift+Z"] };
  const fullscreen = { name: "FULL", key: "F11", macKey: "" };
  const plain = { name: "GRID", key: "F7" };

  it("uses macKey on macOS, key elsewhere; macKey '' means no shortcut", () => {
    assert.equal(defaultKey(redo, "mac"), "Ctrl+Shift+Z");
    assert.equal(defaultKey(redo, "windows"), "Ctrl+Y");
    assert.equal(defaultKey(fullscreen, "mac"), "");
    assert.equal(defaultKey(fullscreen, "windows"), "F11");
    assert.equal(defaultKey(plain, "mac"), "F7");
  });

  it("lists the default plus alternates, without duplicates", () => {
    assert.deepEqual(bindingsOf(redo, {}, "windows"), ["Ctrl+Y", "Ctrl+Shift+Z"]);
    assert.deepEqual(bindingsOf(redo, {}, "mac"), ["Ctrl+Shift+Z"]);
    assert.deepEqual(bindingsOf(fullscreen, {}, "mac"), []);
  });

  it("lets a user remap replace the defaults entirely, and an empty one remove them", () => {
    assert.deepEqual(bindingsOf(redo, { REDO: "ctrl+alt+r" }, "windows"), ["Ctrl+Alt+R"]);
    assert.deepEqual(bindingsOf(redo, { REDO: "" }, "windows"), []);
  });
});

describe("chords of several keys", () => {
  it("keeps the keys in the order written but compares them in any order", () => {
    assert.equal(normaliseCombo("alt+w+a"), "Alt+W+A");
    assert.equal(normaliseCombo("A+Alt+W+W"), "Alt+A+W");
    assert.equal(chordId("Alt+W+A"), chordId("Alt+A+W"));
    assert.notEqual(chordId("Alt+W+A"), chordId("Alt+Shift+W+A"));
    assert.deepEqual(comboParts("Shift+Ctrl+Alt+K"), { mods: ["Ctrl", "Alt", "Shift"], keys: ["K"] });
  });

  it("prints several keys for each OS", () => {
    assert.equal(formatCombo("Alt+W+N", "windows"), "Alt+W+N");
    assert.equal(formatCombo("Alt+W+N", "mac"), "⌥W+N");
    assert.equal(formatCombo("Ctrl+Alt+Shift+K", "mac"), "⌥⇧⌘K");
  });

  it("allows up to 4 keys, one key with Ctrl, and no bare letters", () => {
    for (const ok of ["Alt+L", "Alt+W+N", "Alt+R+E+C", "Ctrl+Alt+Shift+K", "Shift+F3", "F7", "Delete", "Alt+Shift+2"]) assert.equal(chordProblem(ok), null, ok);
    assert.equal(chordProblem("Alt+Shift+W+A"), null, "four keys is the most, and allowed");
    assert.match(chordProblem("Alt+Shift+W+A+N")!, /at most 4/);
    assert.match(chordProblem("Ctrl+A+B")!, /one other key/);
    assert.match(chordProblem("W")!, /plain letters/);
    assert.match(chordProblem("Q+W")!, /plain letters/);
    assert.match(chordProblem("Alt")!, /at least one key/);
    assert.match(chordProblem("Ctrl+W")!, /browser or the operating system/);
    assert.match(chordProblem("Alt+F4")!, /browser or the operating system/);
  });

  const press = (key: string, code: string, mods: Partial<Pick<KeyEventLike, "ctrlKey" | "metaKey" | "altKey" | "shiftKey">> = {}) => ev(key, mods, code);

  it("follows the keys held down, in any order, and forgets them when let go", () => {
    const t = new ChordTracker();
    assert.equal(t.down(press("Alt", "AltLeft", { altKey: true }), "windows"), "");
    assert.equal(t.down(press("w", "KeyW", { altKey: true }), "windows"), "Alt+W");
    assert.equal(t.down(press("n", "KeyN", { altKey: true }), "windows"), "Alt+W+N");
    t.up({ key: "w", code: "KeyW" });
    assert.equal(t.count, 1);
    assert.equal(t.down(press("a", "KeyA", { altKey: true }), "windows"), "Alt+N+A");
    t.reset();
    assert.equal(t.count, 0);
  });

  it("on a Mac reads Option+letters by physical key, and takes one key with ⌘", () => {
    const t = new ChordTracker();
    assert.equal(t.down(press("∑", "KeyW", { altKey: true }), "mac"), "Alt+W");
    assert.equal(t.down(press("˜", "KeyN", { altKey: true }), "mac"), "Alt+W+N");
    t.reset();
    assert.equal(t.down(press("s", "KeyS", { metaKey: true }), "mac"), "Ctrl+S");
    // macOS never reports S let go while ⌘ is held: the next key is a chord of its own
    assert.equal(t.down(press("z", "KeyZ", { metaKey: true }), "mac"), "Ctrl+Z");
    t.up({ key: "Meta", code: "MetaLeft" });
    assert.equal(t.count, 0);
  });

  it("runs a chord at once unless a longer one may still follow", () => {
    const b = [
      { target: "LINE", combo: "Alt+L" },
      { target: "LABELS", combo: "Alt+L+B" },
      { target: "WINDOW", combo: "Alt+W+N" },
      { target: "QSAVE", combo: "Ctrl+S" },
    ];
    assert.deepEqual(matchChord("Alt+L", b), { exact: "LINE", longer: true });
    assert.deepEqual(matchChord("Alt+B+L", b), { exact: "LABELS", longer: false });
    assert.deepEqual(matchChord("Alt+N+W", b), { exact: "WINDOW", longer: false });
    assert.deepEqual(matchChord("Alt+W", b), { exact: null, longer: true });
    assert.deepEqual(matchChord("Ctrl+S", b), { exact: "QSAVE", longer: false });
    assert.deepEqual(matchChord("Alt+Shift+L", b), { exact: null, longer: false });
  });
});

