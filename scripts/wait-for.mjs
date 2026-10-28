/**
 * scripts/wait-for.mjs
 *
 * WHAT   Waits until a URL answers (any HTTP status below 500), polling every second, or gives up after a
 *        number of seconds: `node scripts/wait-for.mjs http://localhost:3000 120`.
 * FOR    CI and local test runs on any OS: start the app in the background, wait for it, then run the browser
 *        tests. Plain Node, so it works the same in bash, zsh, PowerShell and cmd (no curl or sleep needed).
 * DEBUG  - It times out: the app did not start; run `npm start` in the foreground to see its error.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
const [url = "http://localhost:3000", seconds = "120"] = process.argv.slice(2);
const until = Date.now() + Number(seconds) * 1000;

while (Date.now() < until) {
  try {
    const r = await fetch(url, { redirect: "manual" });
    if (r.status < 500) {
      console.log(`${url} is up (${r.status})`);
      process.exit(0);
    }
  } catch {
    /* not listening yet */
  }
  await new Promise((r) => setTimeout(r, 1000));
}
console.error(`${url} did not answer within ${seconds} s`);
process.exit(1);
