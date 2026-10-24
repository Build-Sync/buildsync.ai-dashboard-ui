/**
 * lib/platform.test.ts
 *
 * WHAT   Unit tests for lib/platform.ts: OS detection from navigator values, the primary shortcut
 *        modifier per OS, the macOS Control+click rule and the IME-composition guard.
 * FOR    `npm test`. If a test fails after a browser update, print the real navigator.platform /
 *        navigator.userAgentData.platform values and add a case here before changing the classifier.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyPlatform, hasPrimaryModifier, isComposingKey, isMacSecondaryClick } from "./platform";

describe("classifyPlatform", () => {
  it("prefers Chromium's userAgentData.platform", () => {
    assert.equal(classifyPlatform({ userAgentData: { platform: "macOS" }, platform: "Win32" }), "mac");
    assert.equal(classifyPlatform({ userAgentData: { platform: "Windows" } }), "windows");
    assert.equal(classifyPlatform({ userAgentData: { platform: "Linux" } }), "linux");
    assert.equal(classifyPlatform({ userAgentData: { platform: "Chrome OS" } }), "linux");
  });

  it("falls back to navigator.platform", () => {
    assert.equal(classifyPlatform({ platform: "MacIntel" }), "mac");
    assert.equal(classifyPlatform({ platform: "Win32" }), "windows");
    assert.equal(classifyPlatform({ platform: "Win64" }), "windows");
    assert.equal(classifyPlatform({ platform: "Linux x86_64" }), "linux");
  });

  it("falls back to the user-agent string", () => {
    assert.equal(classifyPlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15" }), "mac");
    assert.equal(classifyPlatform({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }), "windows");
    assert.equal(classifyPlatform({ userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0" }), "linux");
    assert.equal(classifyPlatform({ userAgent: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36" }), "linux");
  });

  it("treats iPadOS and iOS as Apple (they use the Command key)", () => {
    assert.equal(classifyPlatform({ userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)" }), "mac");
  });

  it("does not mistake Darwin for Windows", () => {
    assert.equal(classifyPlatform({ platform: "Darwin" }), "mac");
  });

  it("returns other when nothing is known", () => {
    assert.equal(classifyPlatform({}), "other");
    assert.equal(classifyPlatform({ platform: "", userAgent: "" }), "other");
  });
});

describe("hasPrimaryModifier", () => {
  it("is Command on macOS", () => {
    assert.equal(hasPrimaryModifier({ ctrlKey: false, metaKey: true }, "mac"), true);
    assert.equal(hasPrimaryModifier({ ctrlKey: true, metaKey: false }, "mac"), false);
  });
  it("is Ctrl on Windows, Linux and unknown systems", () => {
    for (const p of ["windows", "linux", "other"] as const) {
      assert.equal(hasPrimaryModifier({ ctrlKey: true, metaKey: false }, p), true, p);
      assert.equal(hasPrimaryModifier({ ctrlKey: false, metaKey: true }, p), false, p);
    }
  });
});

describe("isMacSecondaryClick", () => {
  it("is Control + primary button on macOS only", () => {
    assert.equal(isMacSecondaryClick({ button: 0, ctrlKey: true, metaKey: false }, "mac"), true);
    assert.equal(isMacSecondaryClick({ button: 0, ctrlKey: false, metaKey: false }, "mac"), false);
    assert.equal(isMacSecondaryClick({ button: 2, ctrlKey: true, metaKey: false }, "mac"), false);
    assert.equal(isMacSecondaryClick({ button: 0, ctrlKey: true, metaKey: false }, "windows"), false);
  });
});

describe("isComposingKey", () => {
  it("detects IME composition in every browser's way", () => {
    assert.equal(isComposingKey({ isComposing: true }), true);
    assert.equal(isComposingKey({ nativeEvent: { isComposing: true } }), true);
    assert.equal(isComposingKey({ keyCode: 229 }), true); // Safari's confirming keydown
    assert.equal(isComposingKey({ keyCode: 13 }), false);
    assert.equal(isComposingKey({}), false);
  });
});
