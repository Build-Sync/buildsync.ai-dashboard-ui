/**
 * eslint.config.mjs
 *
 * WHAT   The ESLint setup: Next.js core-web-vitals rules and the Next.js TypeScript rules, with build output
 *        and generated files ignored.
 * FOR    `npm run lint`. Keep it passing before committing.
 * DEBUG  - A rule from react-hooks flags an effect: fix the dependency list or add a one-line eslint-disable
 *          comment that says why.
 *        - Generated folders are linted: add them to globalIgnores below.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
