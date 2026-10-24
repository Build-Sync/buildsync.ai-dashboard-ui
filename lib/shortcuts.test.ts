/**
 * lib/shortcuts.test.ts
 *
 * WHAT   Unit tests for lib/shortcuts.ts: turning key presses into canonical combos on each OS, normalising
 *        spellings, printing combos for each OS (⇧⌘S vs Ctrl+Shift+S) and resolving which combos trigger a command.
 * FOR    `npm test`. These encode the cross-platform rules: ⌘ is the primary modifier on a Mac, the Mac delete key
 *        is Backspace, Option+letter and non-Latin layouts match by physical key, and Shift is ignored on punctuation.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bindingsOf, comboOf, defaultKey, formatCombo, normaliseCombo, type KeyEventLike } from "./shortcuts";

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
