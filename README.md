# BuildSync AI: workspace UI

The desktop workspace for BuildSync AI, an AI-assisted engineering-plan tool, built as a CAD-style app after
AutoCAD's interface (ribbon, document tabs, model explorer, palettes, command line, status bar). This repo is
**the UI and the routing only**. Everything the product would normally fetch or compute is mock data behind
service functions (see [What is mocked](#what-is-mocked)).

Built from `buildsync-ai-overview.md` (the product spec). Section numbers like §10.4 below refer to it.

## Owner and licence

Copyright (c) 2026 **Giordano Bertin-Maurice**. All rights reserved. This is his intellectual property: author and
copyright notices are in the header of every source file, in `package.json`, in the page metadata and in
[`LICENSE`](LICENSE), which grants no licence to anyone without his written permission. Third-party packages and the
IBM Plex / Inter typefaces keep their own licences.

## Run it

Node 20.9 or newer. The commands are the same in macOS Terminal, Windows PowerShell or Command Prompt, and Linux shells.

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build
npm start            # serve the production build
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm test             # unit tests (milliseconds, no browser)
npm run e2e          # browser tests, see "Tests" below
```

Stack: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4, Zustand, lucide-react,
IBM Plex Sans / Mono and Inter (via Fontsource). No backend, no environment variables.

## macOS, Windows and Linux

The UI follows each operating system's conventions instead of assuming one. The full list is in
[`lib/platform.ts`](lib/platform.ts) and [`lib/shortcuts.ts`](lib/shortcuts.ts); the browser tests in
[`e2e/platform.mjs`](e2e/platform.mjs) run the real app as each OS.

**Keyboard.** Shortcuts are stored with "Ctrl" meaning the *primary* modifier, shown as ⌘ on a Mac and Ctrl elsewhere, so a
shortcuts file exported from Settings → Shortcuts works on every OS. Labels in menus, the search box and the Shortcuts page
are drawn per OS.

| Action | macOS | Windows / Linux |
|---|---|---|
| Search commands | ⌘K | Ctrl+K |
| Undo / Redo | ⌘Z / ⇧⌘Z | Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z also works) |
| Save / Save As | ⌘S / ⇧⌘S | Ctrl+S / Ctrl+Shift+S |
| New project | ⌘N, or ⌥⌘N when the browser keeps ⌘N | Ctrl+N, or Ctrl+Alt+N when the browser keeps Ctrl+N |
| Delete selection | the delete key (⌫) or fn⌫ | Del |
| Settings | ⌘, | Ctrl+, |
| Grid / Snap / Ortho / Polar / Object snap | F7 / F9 / F8 / F10 / F3 (hold fn on most Mac keyboards) | F7 / F9 / F8 / F10 / F3 |

Option+letter shortcuts and non-Latin keyboard layouts match by physical key, key presses that confirm an input-method
(IME) candidate never run commands, and the command line turns off auto-correct, auto-capitalisation and smart quotes.

**Mouse, trackpad and touch.**

| | |
|---|---|
| Orbit (3D) / pan (2D) | drag |
| Pan in 3D without a middle button | hold **Space** and drag, or use the hand tool; middle-drag also works |
| Zoom | mouse wheel, trackpad pinch (Safari included), or the zoom tool |
| Scroll behaviour | Settings → Display → *Scroll gesture*: Auto (wheel zooms, trackpad pans), Scroll zooms, or Scroll pans |
| Select / add to selection | click / Shift+click or ⌘+click (Mac) or Ctrl+click (Windows, Linux) |
| Selection window | Shift-, ⌘- (Mac) or Ctrl-drag (Windows, Linux) |
| Context menu | right-click, two-finger click, or ⌃+click on a Mac |
| Touch screens (Windows tablets and 2-in-1s, iPad) | one finger orbits or pans; two fingers pinch to zoom and pan |

**Appearance.** Theme can be Dark, Light, High contrast or **Match system**, which follows macOS Appearance, Windows
"app mode", GNOME/KDE dark mode and the OS "increase contrast" switch, live. Under Windows Contrast themes (forced
colours) the interface adopts the system palette and the drawing keeps its own colours. UI scale (90–125 %) covers
high-DPI and 150 %-scaled Windows displays. The typefaces are bundled, so text looks the same everywhere; each OS's
system font is the fallback. Scrollbars reserve their space on Windows and Linux so panels do not jump sideways.

**Downloads.** CSV tables (door / window schedule, quantity take-off) are saved as UTF-8 with a byte-order mark and CRLF line
ends, so Excel on Windows shows symbols such as × and ″ correctly, and macOS Numbers and Excel read them too. Every download
goes through `lib/save-file.ts`, which keeps the link in the page until the browser has started the download (Safari cancels
it otherwise) and clicks it from the document (Firefox needs that).

**Install it as an app.** The site ships a web app manifest and icons, so it can run in its own window with no browser
tabs: Chrome or Edge (address-bar *Install* button) on Windows, macOS and Linux, and Safari 17+ on macOS (*File → Add to
Dock*). Where the browser supports manifest shortcuts (the Windows jump list, for example) it offers the demo workspace and Settings. Browsers keep a few shortcuts for
themselves (Ctrl/⌘+N, +T, +W); use the alternates in the table above or the command line.

**Browsers.** Chrome and Edge 111+, Safari 16.4+, Firefox 128+ (the floor of Tailwind CSS v4). The suites ran on Chromium
with each OS emulated. I could not run Safari's or Firefox's own engines or real Mac / Windows hardware where this was
built: run `npm run e2e -- --browser=webkit` (Safari's engine) and `--browser=firefox` on your machines.

## Routes

| URL | What it is |
|---|---|
| `/` | Placeholder landing page with links in (the marketing site is out of scope). |
| `/demo` | The full workspace on a sample project, no sign-in, "You're in the demo" banner, edits are not saved. `?project=clinic-phase1-antigua` opens the second sample. |
| `/app` | Redirects to the last project you had open (cookie), else to the demo project. If *Settings → General → Start screen* is "Start tab" it adds `?doc=start`. |
| `/app/projects/[projectId]` | The workspace for a project. Sample ids: `residence-2br-miami`, `clinic-phase1-antigua`; `untitled-N` for new projects; `p2p-<sqft>-<beds>-<baths>` for Prompt-to-Plan results. Unknown id is a 404. |
| `/settings` | Redirects to `/settings/general`. |
| `/settings/{general,units,grid-snap,display,rendering,shortcuts,ai,integrations,notifications,permissions,account}` | The eleven settings pages. |
| `/settings/integrations/[agentId]` | The Connect / Manage dialog for an agent (`claude`, `chatgpt`, `kimi`, `gemini`, `local`, `custom`) over the Connectors page. |
| `/manifest.webmanifest` | The web app manifest (name, start page, icons, shortcuts). |

### Workspace state lives in the URL

`tab`, `panel`, `explorer`, `view`, `section` (plus `doc=start` and, on `/demo`, `project`) mirror the ribbon tab,
palette, explorer tab, 2D/3D, section cut and open document. Defaults are omitted, so
`/demo?tab=analyze&panel=stress-test&view=2d&section=1` is a shareable deep link and reload/back/forward restore it.
Writes use `history.replaceState`, so there is no server round trip and no history spam
(`lib/store/workspace-provider.tsx`, `lib/workspace-query.ts`).

### Settings is a modal over the workspace, and a page on its own

Opening settings from the workspace (gear, the agents chip, the account button, the `SETTINGS` command…) shows it as a
modal while the **URL changes to `/settings/…`** and the workspace stays mounted behind it. Loading or refreshing that
URL directly renders the same screens as a normal page.

* Intercepting routes: `app/demo/@modal/(...)settings/[[...slug]]` and
  `app/app/projects/[projectId]/@modal/(...)settings/[[...slug]]` render `SettingsFrame` in modal mode; the canonical
  `app/settings/[[...slug]]` renders it in page mode. All three share `components/settings/route-parts.tsx`.
* **Close** in the modal is `router.back()`, which returns to the exact workspace URL and state. Moving between settings
  pages and opening the Connect dialog use `replace`, so one Close always returns. On the standalone page Close goes to `/app`.
* Changes are a **draft**: theme, accent and UI scale preview live; **Apply** commits and persists to `localStorage`
  (`bs.settings`); **Close** discards. API keys are never stored: the Connect dialog keeps one in component state until it
  is sent, then keeps only a masked value.

## What is in the workspace

* **Chrome (§10.1–10.4, 10.11)**: app bar (menu, quick access, search, jurisdiction, agents chip, settings, seat), eight
  ribbon tabs with 42 panels and 178 tools, document tabs (Start + projects), status bar toggles, advisory pill.
  Panels fold into dropdown buttons as the window narrows, the way AutoCAD's ribbon does, and the full panel opens as a flyout.
* **Viewport (§10.6)**: an SVG model engine with orbit / pan / zoom, ViewCube, navigation bar, UCS icon, crosshair and
  dynamic input, window select, section cut, 2D plan with rooms / dimensions / door swings / grid bubbles, visual styles
  (realistic, shaded, wireframe, X-ray), layout sheets A-101 / A-201 / S-301 with a title block, and overlays for stress,
  wind / flood / seismic / fire, solar path and callouts.
* **Model Explorer (§10.5)**: model tree, layers, levels, library.
* **Palettes (§10.8)**: Properties, Health, Compliance, Cost, Comments, Issues, Simulation, Stress Test, Clash Detection,
  AI Analysis, Council. Result palettes carry the advisory footer.
* **Timeline dock (§10.9)**: phase tracker, Gantt (day / week / month), `1 mo` `3 mo` `6 mo` `Full` or custom windows that
  drive the viewport build state, the Cost palette, materials and crew, and a timelapse. It sits above the command line,
  collapsed by default; expand it with the chevron.
* **Command line (§10.10)**: 198 commands with aliases and default hotkeys. Known commands run locally; anything else goes to the
  active agent, which can only **propose** an edit: a preview diff with Accept / Reject, never a silent change.
* **Agents (§11.8)**: connect / manage / disconnect, task routing table, MCP endpoint, per-agent permissions.
* **Review and PE workflow**: Send to PE, audit trail, seal-pending sheets. Every AI output is labelled advisory and the
  banner cannot be turned off until a PE licence is verified.

## Code map and how the code is documented

```
app/                     routes (see above), globals.css (design tokens), layout, manifest, icons
components/workspace/    Workspace shell, AppBar, Ribbon/, ModelExplorer/, Viewport/, Palettes/, CommandLine/, Timeline, Modals/
components/settings/     SettingsFrame, route-parts, panes/ (one per page + ConnectDialog)
components/ui/           Menu, Modal, Tooltip, Toaster, Kbd, controls
lib/commands.ts          the command registry; ribbon, hotkeys, command line, context menu and search all resolve through it
lib/platform.ts, shortcuts.ts, input.ts, theme.ts   OS detection, shortcut matching/labels, wheel/trackpad rules, theme resolution
lib/scene/               scene builders, camera, painter's-algorithm renderer, sun
lib/services/            the mocked back end (projects, agents, ai, analysis)
lib/store/               app store (settings, agents, history…) and per-project workspace store
e2e/                     Playwright browser suites (below)
scripts/                 make-icons.mjs: renders the PNG icons from app/icon.svg
```

**Every file starts with a header** that says what the file does (`WHAT`), what it is for in the app (`FOR`), and where to
look when it misbehaves (`DEBUG`), followed by the author and copyright lines. Read the header first when tracking down a
fault; it names the neighbouring files and the invariants that must hold. Exported functions and components carry a
one-line description too. Config files carry the same notice in their own comment style (`#` in `.gitignore`, a `//` block
in `tsconfig.json`, an XML comment in `app/icon.svg`, a `"//"` note in `package.json`). `package-lock.json` is generated by
npm and cannot hold comments. In `AGENTS.md` the part between the Next.js markers is written by `next dev`; the owner's
rules (authorship, headers, cross-platform) are below it.

Design tokens (§12) are CSS variables in `app/globals.css`: dark by default, light and high-contrast via
`data-theme`. Sizes are `rem`, so the UI-scale setting (90–125 %) scales the whole chrome. `public/theme-boot.js` is a
blocking script that applies the saved theme, accent and scale before first paint.

## What is mocked

All of it sits behind async functions in `lib/services/` and `lib/commands.ts` (`askAgent`), so a real implementation
replaces the function body, not the UI:

* AI calls, task classification, routing and proposals (`lib/services/ai.ts`)
* Stress test, simulation, council, analysis, code compliance, Prompt-to-Plan (`lib/services/analysis.ts`)
* Agent connection tests and keys (`lib/services/agents.ts`)
* Projects and the building code database (`lib/services/projects.ts`, `lib/mock-data.ts`)
* File import, auth, payments, e-mail

Numbers on screen (costs, stress, code citations) are illustrative. Nothing here is engineering advice.

## Differences from the spec

* The spec's `(.)settings` interception convention intercepts the wrong URL here (the slot lives under `/demo` and under
  `/app/projects/[projectId]`, at different depths), so the root-relative `(...)settings` is used.
* Next.js 16 matches intercepted routes strictly, so the canonical settings route is one catch-all
  (`settings/[[...slug]]`) rather than a folder per page. URLs are the spec's.
* `cacheComponents` is off: this is an interactive mock-data app with request-time cookies and client clocks.
* Added: `doc=start` and (demo only) `project` query parameters; the ribbon panel collapse; the per-OS shortcut,
  gesture, theme ("Match system") and install-as-app support described above.
* The reference PNGs were not available, so layout follows the spec's text and design tokens.

## Tests

* **Unit tests** (`npm test`, about a second): the pure logic that differs per OS: platform detection, shortcut matching and
  labels, wheel / trackpad interpretation, theme resolution, CSV output (`lib/*.test.ts`).
* **Browser tests** (`npm run e2e`) drive a real browser against a running app, in three suites that can also be run alone
  (`npm run e2e:routing`, `e2e:workspace`, `e2e:platform`):
  **routing** (redirects, deep links, modal-over-workspace and page-mode settings, Close / back, 404s),
  **workspace** (every palette, every ribbon button including those inside collapsed panels, command line and AI proposals,
  hotkeys, context menu, document tabs, timeline, sheets, settings draft / Apply / persistence, Connect and Disconnect,
  Esc handling, blocked-storage fallback) and
  **platform** (the app run as macOS, Windows and Linux: labels, keys, selection modifiers, Space-pan, wheel, pinch,
  touch, Match system, forced colours, installability, IME, downloads).

```bash
npm run build && npm start               # or: npm run dev  (leave it running; open a second terminal)
npx playwright-core install chromium     # once; or pass --chromium=PATH to an installed Chrome / Chromium
npm run e2e -- --base=http://localhost:3000
```

Options work the same in every shell: `--base=URL`, `--chromium=PATH`, `--browser=chromium|webkit|firefox`,
`--out=DIR`, and a name filter such as `npm run e2e:workspace -- "ribbon,timeline"`. Screenshots go to `e2e/.shots/`.
A check also fails if the page logs a console error while it runs.

## Known issues

* Under `next dev` only, React logs "Encountered a script tag while rendering React component" on 404 pages: the not-found
  page re-renders the root layout on the client, and that layout contains the blocking theme script. It does not occur on
  real pages or in a production build.
* Browsers do not let a page override Ctrl/⌘+N, +T and +W, and macOS keeps F3, F4 and F11; the alternates above cover them.
* The viewport is a painter's-algorithm SVG renderer tuned for the two sample buildings (69 and 115 elements). It is
  not a general-purpose CAD renderer; a production build would put WebGL behind the same scene and camera interfaces.

---

Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
