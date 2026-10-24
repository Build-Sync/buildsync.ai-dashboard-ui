# BuildSync AI: workspace UI

The desktop workspace for BuildSync AI, an AI-assisted engineering-plan tool, built as a CAD-style app after
AutoCAD's interface (ribbon, document tabs, model explorer, palettes, command line, status bar). This repo is
**the UI and the routing only**. Everything the product would normally fetch or compute is mock data behind
service functions (see [What is mocked](#what-is-mocked)).

Built from `buildsync-ai-overview.md` (the product spec). Section numbers like §10.4 below refer to it.

## Run it

Node 20.9+.

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm start
npm run typecheck && npm run lint
```

Stack: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4, Zustand, lucide-react,
IBM Plex Sans / Mono and Inter (via Fontsource). No backend, no environment variables.

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
* **Command line (§10.10)**: 198 commands with aliases and default hotkeys (`F3` OSNAP, `F7` GRID, `F8` ORTHO,
  `F9` SNAP, `Ctrl+K` search, `Ctrl+Z`/`Ctrl+Y`, `Ctrl+/` shortcuts…). Known commands run locally; anything else goes to the
  active agent, which can only **propose** an edit: a preview diff with Accept / Reject, never a silent change.
* **Agents (§11.8)**: connect / manage / disconnect, task routing table, MCP endpoint, per-agent permissions.
* **Review and PE workflow**: Send to PE, audit trail, seal-pending sheets. Every AI output is labelled advisory and the
  banner cannot be turned off until a PE licence is verified.

## Code map

```
app/                     routes (see above), globals.css (design tokens), layout
components/workspace/    Workspace shell, AppBar, Ribbon/, ModelExplorer/, Viewport/, Palettes/, CommandLine/, Timeline, Modals/
components/settings/     SettingsFrame, route-parts, panes/ (one per page + ConnectDialog)
components/ui/           Menu, Modal, Tooltip, Toaster, controls
lib/commands.ts          the command registry; ribbon, hotkeys, command line, context menu and search all resolve through it
lib/scene/               scene builders, camera, painter's-algorithm renderer, sun
lib/services/            the mocked back end (projects, agents, ai, analysis)
lib/store/               app store (settings, agents, history…) and per-project workspace store
e2e/                     Playwright suites (below)
```

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
* Added: `doc=start` and (demo only) `project` query parameters; the ribbon panel collapse above.
* The reference PNGs were not available, so layout follows the spec's text and design tokens.

## Browser tests

`e2e/` holds two Playwright suites that drive a real browser against a running app: **routing** (redirects, deep links,
modal-over-workspace and page-mode settings, Close / back behaviour, 404s) and **workspace** (every palette, every ribbon
button including those inside collapsed panels, command line and AI proposals, hotkeys, context menu, document tabs,
timeline, sheets, settings draft / Apply / persistence, Connect and Disconnect, blocked-storage fallback).

```bash
npm run build && npm start &              # or: npm run dev
npx playwright-core install chromium      # or set CHROMIUM_PATH to an installed Chrome/Chromium
BASE=http://localhost:3000 npm run e2e
```

`node e2e/workspace.mjs "ribbon,timeline"` runs only checks whose names contain those fragments; screenshots go to
`e2e/.shots/`. A check also fails if the page logs a console error while it runs.

## Known issues

* Under `next dev` only, React logs "Encountered a script tag while rendering React component" on 404 pages: the not-found
  page re-renders the root layout on the client, and that layout contains the blocking theme script. It does not occur on
  real pages or in a production build.
* The viewport is a painter's-algorithm SVG renderer tuned for the two sample buildings (69 and 115 elements). It is
  not a general-purpose CAD renderer; a production build would put WebGL behind the same scene and camera interfaces.
