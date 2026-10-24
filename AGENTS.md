<!--
AGENTS.md

WHAT   Instructions for AI coding agents that work in this repository. The block between the BEGIN / END markers
       below is written by `next dev`; everything outside it is the owner's.
FOR    Keeping future automated edits consistent with the owner's rules in "Project rules".

Author: Giordano Bertin-Maurice
Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
-->

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project rules (from the owner, Giordano Bertin-Maurice)

- **Authorship.** This code is the owner's intellectual property. Commits are authored by the owner. Do not add
  `Co-Authored-By`, `Claude-Session` or any other AI attribution trailer to commits, and no "generated with" lines to
  pull request descriptions or code.
- **Headers.** Every source file starts with a header comment giving its path, WHAT it does, what it is FOR, DEBUG
  hints, the author and the copyright line (copy the format from any file in `lib/`). Exported functions, components and
  types get a one-line doc comment. Keep both up to date when behaviour changes, and give every new file a header.
- **macOS, Windows and Linux.** The UI must work on all three. Never hard-code Ctrl or ⌘ in the UI: shortcuts are stored
  with "Ctrl" meaning the primary modifier and drawn per OS (`lib/platform.ts`, `lib/shortcuts.ts`, `components/ui/Kbd.tsx`).
- **Before committing:** `npm run typecheck`, `npm run lint`, `npm test` and `npm run e2e` (start the app first).
