/**
 * e2e/run-all.mjs
 *
 * WHAT   Runs the seven browser suites (routing, workspace, tools, layout, site, buttons, platform) one after another, passing every
 *        command-line argument (--base=…, --chromium=…, a name filter) on to each, and exits non-zero if any
 *        suite failed. Prints a one-line verdict per suite at the end.
 * FOR    `npm run e2e`. A chained npm script (a && b && c) would only forward trailing arguments to the last
 *        command, so this small runner does the forwarding for all of them, on every operating system.
 *
 * DEBUG  A suite crashes before printing results: run it alone (`npm run e2e:routing`) to see its full output.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const suites = ["routing", "workspace", "tools", "layout", "site", "buttons", "platform"];
const forwarded = process.argv.slice(2);
const results = [];

for (const name of suites) {
  console.log(`\n━━ ${name} ━━`);
  const file = fileURLToPath(new URL(`./${name}.mjs`, import.meta.url));
  const r = spawnSync(process.execPath, [file, ...forwarded], { stdio: "inherit" });
  results.push({ name, ok: r.status === 0 });
}

console.log("\n" + results.map((r) => `${r.ok ? "PASS" : "FAIL"}  ${r.name}`).join("\n"));
process.exit(results.every((r) => r.ok) ? 0 : 1);
