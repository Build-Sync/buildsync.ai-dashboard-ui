/**
 * lib/theme.test.ts
 *
 * WHAT   Unit tests for lib/theme.ts: how the Theme setting, including "Match System", resolves into the theme drawn.
 * FOR    `npm test`. Keep in step with the plain-JS copy of the rule in public/theme-boot.js.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("passes explicit choices through whatever the OS prefers", () => {
    for (const t of ["dark", "light", "hc"] as const) assert.equal(resolveTheme(t, { light: t !== "light", moreContrast: true }), t);
  });
  it("system follows the OS colour scheme", () => {
    assert.equal(resolveTheme("system", { light: false, moreContrast: false }), "dark");
    assert.equal(resolveTheme("system", { light: true, moreContrast: false }), "light");
  });
  it("system lets the OS increase-contrast switch win over light and dark", () => {
    assert.equal(resolveTheme("system", { light: true, moreContrast: true }), "hc");
    assert.equal(resolveTheme("system", { light: false, moreContrast: true }), "hc");
  });
});
