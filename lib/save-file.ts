/**
 * lib/save-file.ts
 *
 * WHAT   Saving files from the browser: saveFile (download text through a temporary link), saveCsv (a table as
 *        CSV), saveJson (a value as pretty JSON) and toCsv (rows to CSV text).
 * FOR    The schedule and quantity take-off tables (Modals/ReviewModals.tsx), the account data export (Settings
 *        → Account) and the shortcuts export (Settings → Shortcuts), so every download behaves the same on
 *        every OS.
 * OS     CSV gets a UTF-8 byte-order mark and CRLF line ends so Excel on Windows shows symbols like × and ″
 *        correctly (macOS Numbers and Excel read it too). The link is added to the page before clicking
 *        (Firefox) and the blob URL is revoked after 10 s, because Safari can cancel a download whose URL is
 *        revoked straight away.
 * DEBUG  - A downloaded CSV shows garbled characters: check that the BOM is still added (saveCsv → bom: true).
 *        - Nothing downloads: pop-up and download blockers act on the click; saveFile must run inside a user
 *          gesture (a click handler).
 *        - Unit tests for toCsv are in lib/save-file.test.ts; saveFile itself needs a browser.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
/** Options for saveFile. */
export interface SaveOptions {
  /** prefix a UTF-8 byte-order mark (needed for Excel on Windows to read non-ASCII CSV correctly) */
  bom?: boolean;
}

/** Download `content` as a file called `name`, through a temporary link (no server round trip). */
export function saveFile(name: string, content: string, mime: string, options: SaveOptions = {}): void {
  const blob = new Blob([options.bom ? `\uFEFF${content}` : content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  // Firefox ignores clicks on links that are not in the document
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari can cancel the download if the URL is revoked before the download has started
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Download a binary file (a PNG picture …) through a temporary link. */
export function saveBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Rows to CSV text: every cell quoted, quotes doubled, CRLF line ends (RFC 4180, what Excel expects). */
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(",")).join("\r\n");
}

/** Save table rows as a CSV file that opens correctly in Excel on Windows and Numbers / Excel on macOS. */
export function saveCsv(name: string, rows: string[][]): void {
  saveFile(name, toCsv(rows), "text/csv", { bom: true });
}

/** Save a value as pretty-printed JSON. */
export function saveJson(name: string, data: unknown): void {
  saveFile(name, JSON.stringify(data, null, 2), "application/json");
}
