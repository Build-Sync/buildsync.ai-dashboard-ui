/**
 * scripts/check-portable.mjs
 *
 * WHAT   Finds what works on Windows and macOS but breaks on Linux (or the other way round) before CI does:
 *        - an import whose path differs only in letter case from the file on disk ("./viewport" for
 *          "Viewport/"): Windows and macOS ignore case, Linux does not, so `next build` fails there;
 *        - an import that resolves to nothing;
 *        - two files in one folder whose names differ only in case (one overwrites the other on Windows / macOS);
 *        - npm scripts that only run in one shell (rm -rf, cp, export VAR=, set VAR=, backslash paths …);
 *        - text files committed with Windows (CRLF) line ends where .gitattributes asks for LF.
 * FOR    `npm run check:portable`, run in CI on Linux, macOS and Windows (.github/workflows/ci.yml) and before
 *        committing. Exits 1 and lists every problem with its file.
 * DEBUG  - "case mismatch": rename the import (or the file) so they match exactly, letter for letter.
 *        - A false "missing" for an asset served from public/: only paths starting with "." or "@/" are checked.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRS = ["app", "components", "lib", "e2e", "scripts"];
const CODE = /\.(ts|tsx|js|mjs|cjs|jsx)$/;
const TEXT = /\.(ts|tsx|js|mjs|cjs|jsx|json|css|md|svg|yml|yaml|txt)$/;
const EXTS = ["", ".ts", ".tsx", ".js", ".mjs", ".jsx", ".json", ".css", "/index.ts", "/index.tsx", "/index.js"];
const problems = [];
const rel = (p) => relative(ROOT, p).split(sep).join("/");

/** Every file under a folder (no node_modules, no build output). */
function walk(dir, out = []) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  const lower = new Map();
  for (const n of names) {
    const k = n.toLowerCase();
    if (lower.has(k)) problems.push(`case clash: ${rel(join(dir, lower.get(k)))} and ${rel(join(dir, n))} differ only in letter case`);
    lower.set(k, n);
    if (n === "node_modules" || n === ".next" || n === ".shots" || n.startsWith(".git")) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Does this absolute path exist with exactly this letter case, segment by segment? */
function existsExact(abs) {
  const parts = relative(ROOT, abs).split(sep).filter(Boolean);
  let cur = ROOT;
  for (const part of parts) {
    let names;
    try {
      names = readdirSync(cur);
    } catch {
      return { exists: false };
    }
    if (names.includes(part)) {
      cur = join(cur, part);
      continue;
    }
    const other = names.find((n) => n.toLowerCase() === part.toLowerCase());
    return other ? { exists: true, exact: false, actual: rel(join(cur, other)) } : { exists: false };
  }
  return { exists: true, exact: true };
}

const files = SOURCE_DIRS.flatMap((d) => walk(join(ROOT, d)));
const SPEC = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/g;

for (const file of files.filter((f) => CODE.test(f))) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(SPEC)) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (!spec || !(spec.startsWith(".") || spec.startsWith("@/"))) continue;
    if (spec.includes("${")) continue;
    const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : resolve(dirname(file), spec);
    let found = null;
    for (const ext of EXTS) {
      const r = existsExact(base + ext);
      if (r.exists) {
        found = r;
        if (r.exact) break;
      }
    }
    if (!found) problems.push(`missing: ${rel(file)} imports "${spec}", which does not exist`);
    else if (!found.exact) problems.push(`case mismatch: ${rel(file)} imports "${spec}" but the file is ${found.actual} (Linux is case-sensitive)`);
  }
}

// line ends: the repository asks for LF (.gitattributes); a CRLF file is a Windows editor setting slipping in
for (const file of [...files, join(ROOT, "package.json"), join(ROOT, "README.md")].filter((f) => TEXT.test(f))) {
  if (readFileSync(file, "utf8").includes("\r\n")) problems.push(`CRLF line ends: ${rel(file)} (the repository uses LF; see .gitattributes)`);
}

// npm scripts must run the same in sh (Linux, macOS) and cmd / PowerShell (Windows)
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const SHELL_ONLY = [/\brm\s+-rf?\b/, /\bcp\s+-/, /\bmv\s/, /^\s*export\s+\w+=/, /\bset\s+\w+=/, /\\\\/, /\bcmd\s+\/c\b/i, /\bpowershell\b/i, /\$\{?\w+\}?/, /&&\s*$/];
for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
  for (const re of SHELL_ONLY) if (re.test(cmd)) problems.push(`npm script "${name}" uses shell-specific syntax (${re}): ${cmd}`);
}

if (problems.length) {
  console.error(`Portability check: ${problems.length} problem(s)\n` + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log(`Portability check: ${files.length} files OK (import case, missing imports, case clashes, line ends, npm scripts)`);
