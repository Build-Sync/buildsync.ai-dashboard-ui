/**
 * lib/save-file.test.ts
 *
 * WHAT   Unit tests for toCsv in lib/save-file.ts: quoting, CRLF line ends, commas, line breaks and non-ASCII
 *        text inside cells.
 * FOR    `npm test`. If Excel or Numbers mis-reads an export, add the failing cell content here before changing
 *        toCsv.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toCsv } from "./save-file";

describe("toCsv", () => {
  it("quotes every cell and doubles embedded quotes", () => {
    assert.equal(toCsv([["a", 'say "hi"']]), '"a","say ""hi"""');
  });

  it("ends rows with CRLF, as Excel and RFC 4180 expect", () => {
    assert.equal(toCsv([["a"], ["b"]]), '"a"\r\n"b"');
  });

  it("keeps commas, line breaks and non-ASCII text inside one cell", () => {
    assert.equal(toCsv([["1,5", "two\nlines", "4″ × 8′"]]), '"1,5","two\nlines","4″ × 8′"');
  });

  it("gives an empty string for no rows", () => {
    assert.equal(toCsv([]), "");
  });
});
