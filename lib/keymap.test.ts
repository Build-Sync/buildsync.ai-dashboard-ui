/**
 * lib/keymap.test.ts
 *
 * WHAT   Unit tests of lib/keymap.ts: every ribbon button and every command has a keyboard shortcut; no two share
 *        one (in any key order, on Windows, Linux or a Mac); every default is a usable chord (at most 4 keys, not
 *        one the browser keeps); the user's own shortcuts replace the defaults and an empty one removes it; and
 *        the saved settings bring every remap back on the next load (blank ones included).
 * FOR    `npm test`. Catches a new command that has no shortcut, or a default that collides with another.
 * DEBUG  - "no shortcut for X": add X to DEFAULT_CHORDS (Alt + its alias letters, unused by anything else).
 *        - "X and Y share": change one of the two in DEFAULT_CHORDS; chords match in any key order.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RIBBON } from "../components/workspace/Ribbon/ribbon.config";
import { DEFAULT_CHORDS, allBindings, clashOf, shortcutOf, shortcutTargets, targetBindings } from "./keymap";
import { chordId, chordProblem } from "./shortcuts";
import { mergeSettings } from "./settings";

const PLATFORMS = ["windows", "linux", "mac"] as const;

describe("the default shortcuts", () => {
  it("give every ribbon button and every command a shortcut", () => {
    for (const p of PLATFORMS) {
      for (const t of RIBBON) for (const panel of t.panels) for (const it of panel.items) if (!it.command.startsWith("/")) assert.ok(shortcutOf(it.command, {}, p), `no shortcut for ${t.label} › ${it.label} (${it.command}) on ${p}`);
      for (const target of shortcutTargets()) assert.ok(shortcutOf(target, {}, p), `no shortcut for ${target} on ${p}`);
    }
  });

  it("never give two things the same chord, in any key order", () => {
    for (const p of PLATFORMS) {
      const seen = new Map<string, string>();
      for (const b of allBindings({}, p)) {
        const id = chordId(b.combo);
        const other = seen.get(id);
        assert.ok(!other || other === b.target, `${other} and ${b.target} share ${b.combo} on ${p}`);
        seen.set(id, b.target);
      }
    }
  });

  it("are usable chords: at most 4 keys, nothing the browser or the OS keeps", () => {
    for (const [target, combo] of Object.entries(DEFAULT_CHORDS)) assert.equal(chordProblem(combo), null, `${target}: ${combo}`);
  });

  it("keep one-key chords for the commonest tools", () => {
    assert.equal(shortcutOf("LINE", {}, "windows"), "Alt+L");
    assert.equal(shortcutOf("WALL", {}, "windows"), "Alt+W");
    assert.equal(shortcutOf("WINDOW", {}, "windows"), "Alt+W+N");
    assert.equal(shortcutOf("QSAVE", {}, "windows"), "Ctrl+S", "a command's own key comes first");
    assert.equal(shortcutOf("-VIEW TOP", {}, "windows"), "Alt+V+T", "ribbon commands with an argument have their own");
  });
});

describe("people's own shortcuts", () => {
  it("replace the default, and an empty one leaves the command without a shortcut", () => {
    assert.deepEqual(targetBindings("WALL", { WALL: "ctrl+alt+shift+w" }, "windows"), ["Ctrl+Alt+Shift+W"]);
    assert.deepEqual(targetBindings("WALL", { WALL: "" }, "windows"), []);
    assert.deepEqual(targetBindings("QSAVE", { QSAVE: "" }, "windows"), []);
  });

  it("find what already uses a chord, ignoring the command being changed", () => {
    assert.equal(clashOf("Alt+N+W", {}, "windows"), "WINDOW");
    assert.equal(clashOf("Alt+W+N", {}, "windows", "WINDOW"), null);
    assert.equal(clashOf("Alt+W+N", { WINDOW: "" }, "windows"), null, "a removed shortcut is free again");
    assert.equal(clashOf("Alt+Shift+Q", {}, "windows"), null);
  });
});

describe("saved shortcuts", () => {
  it("come back on the next load, blank ones included, and nothing else is let in", () => {
    const loaded = mergeSettings({ shortcuts: { keys: { WALL: "Alt+Shift+Q+K", LINE: "", BAD: 7 }, aliases: { WALL: "WW" } }, display: { nonsense: true } });
    assert.deepEqual(loaded.shortcuts.keys, { WALL: "Alt+Shift+Q+K", LINE: "" });
    assert.deepEqual(loaded.shortcuts.aliases, { WALL: "WW" });
    assert.deepEqual(targetBindings("LINE", loaded.shortcuts.keys, "windows"), []);
  });
});

