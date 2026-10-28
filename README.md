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
npm run check:portable  # what would break on Linux but not on Windows / macOS
```

### Linux

Linux is a first-class platform, the same as macOS and Windows. On Ubuntu / Debian, Fedora or Arch:

```bash
# Node 20.9 or newer, e.g. with nvm (https://github.com/nvm-sh/nvm):  nvm install 22
npm ci
npm run dev                                      # http://localhost:3000
npx playwright-core install --with-deps chromium  # once, for the browser tests (installs the system libraries too)
npm run build && npm start &                     # in a second terminal or in the background
node scripts/wait-for.mjs http://localhost:3000/demo 120
npm run e2e -- --base=http://localhost:3000
```

Every npm script is plain Node, so it runs the same in bash, zsh, PowerShell and cmd. Things that differ on Linux and
are guarded: file names are case-sensitive (`npm run check:portable` fails when an import's letter case does not match
the file), text files are LF everywhere (`.gitattributes`), and the browser tests start Chromium with `--no-sandbox` so
they run in containers. CI (`.github/workflows/ci.yml`) runs the portability check, typecheck, lint, unit tests and the
production build on Ubuntu, macOS and Windows, and every browser suite on Ubuntu.

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
| Ortho for one point while drawing | hold ⇧ | hold Shift |

Option+letter shortcuts and non-Latin keyboard layouts match by physical key, key presses that confirm an input-method
(IME) candidate never run commands, and the command line turns off auto-correct, auto-capitalisation and smart quotes.

**Mouse, trackpad and touch.**

| | |
|---|---|
| Select | click; drag on empty space for a **window** (left to right: what is fully inside) or a **crossing** (right to left: whatever it touches) |
| Move | drag a selected element (or any element: it is selected first); joined walls stretch, doors and windows go with their wall, rooms re-find their walls; Esc while dragging puts it back |
| Reshape | drag a grip (the squares on a selected wall's ends, a line's points, a slab's corners); what is joined at that point follows |
| Orbit (3D) / pan (2D) | **Alt + drag**, the navigation bar's Orbit / Pan tools, or middle-drag (Shift + middle-drag orbits) |
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
| `/demo` | The full workspace on a sample project, no sign-in, "You're in the demo" banner; your work is saved in this browser only (no account). `?project=clinic-phase1-antigua` opens the second sample. |
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

* **Chrome (§10.1–10.4, 10.11)**: app bar (menu, quick access, search, jurisdiction, agents chip, help, settings, seat),
  nine ribbon tabs in the order you work (**Home, Insert, Systems, Annotate, View, Analyze, AI, Collaborate, Manage**) with 49
  panels and 241 buttons, document tabs (Start + projects), status bar toggles, advisory pill. Panels fold into dropdown
  buttons as the window narrows, the way AutoCAD's ribbon does, and the full panel opens as a flyout; Home → Help and
  View → Panels are pinned and never fold. Every button's tooltip says what it does.
* **Viewport (§10.6)**: an SVG model engine with orbit / pan / zoom, ViewCube, navigation bar, UCS icon, crosshair and
  dynamic input, window select, section cut, 2D plan with rooms / dimensions / door swings / grid bubbles, visual styles
  (realistic, shaded, wireframe, X-ray), layout sheets A-101 / A-201 / S-301 with a title block, and overlays for stress,
  wind / flood / seismic / fire, solar path and callouts.
* **Model Explorer (§10.5)**: model tree, layers, levels, library. Each tab keeps its scroll position (opening and
  closing nodes, or a visit to another tab, leaves the tree where it was).
* **Palettes (§10.8)**: Properties, Health, Compliance, Cost, Comments, Issues, Simulation, Stress Test, Clash Detection,
  AI Analysis, Council. Result palettes carry the advisory footer.
* **Timeline dock (§10.9)**: phase tracker, Gantt (day / week / month), `1 mo` `3 mo` `6 mo` `Full` or custom windows that
  drive the viewport build state, the Cost palette, materials and crew, and a timelapse. It sits above the command line,
  header only by default; open it with its eye, or drag its top edge to the height you want.
* **Command line (§10.10)**: 256 commands with aliases, each with a keyboard shortcut. Known commands run locally; anything else goes to the
  active agent, which can only **propose** an edit: a preview diff with Accept / Reject, never a silent change.
* **Agents (§11.8)**: connect / manage / disconnect, task routing table, MCP endpoint, per-agent permissions.
* **Review and PE workflow**: Send to PE, audit trail, seal-pending sheets. Every AI output is labelled advisory and the
  banner cannot be turned off until a PE licence is verified.

## Drawing and editing tools

Every button on the Home, Insert, Systems, Annotate and Collaborate tabs that draws, places, measures or edits runs a real tool
(`lib/draw/`). Click points in the viewport, or type them in the command line: `x,y` · `@dx,dy` · `@distance<angle` · a
bare distance (in the direction of the cursor) · a surveyor's bearing and distance (`N45°30'E 120`) · `C` closes · `U`
removes the last point · `R` makes a boundary tool a rectangle · Enter, a double click or a right click finishes the
object · Esc cancels. Points snap the way AutoCAD's do (see "Snapping" below). Options (wall type and height, door type, slab
thickness, duct height, note text, fillet radius, array rows and columns …) are in the tool bar over the viewport. In 3D a
click lands on the active level's plane, so draw in the 2D plan when you need precision. Every change is one undo step.

| Tab / panel | Tools |
|---|---|
| Home → Draw | `LINE` `PLINE` `RECTANG` `CIRCLE` `ARC` `SPLINE` `HATCH` (click inside a shape, a room or walls) |
| Home → Building | `WALL` (chains, `C` closes) · `DOOR` `WINDOW` (click a wall: the opening is cut there, with the door swing in plan) · `SLAB` `ROOF` `STAIR` `COLUMN` `BEAM` `RAMP` (1:12) · `ROOM` (click inside walls or a closed shape: name and area) |
| Home → Structure | `FOUNDATION` (below grade: dashed in plan, solid in Section / X-ray) · `FRAMING` (studs or joists on a clicked host) · `TRUSS` (under a clicked roof) · `BRACE` · `CONNECT` (a joint between two clicked members) |
| Home → MEP | `ELEC` `PLUMB` `HVAC` `FIXT` `EQUIP` place fixtures from the catalogue (below) · `FIRE` (sprinkler head, alarm) · `DUCT` `PIPE` `TRAY` (runs; the layer is switched on for you) · `WIRE` and `PIPECONNECT` connect fixtures (below) |
| Systems → Lighting & Power, Plumbing & Air | About 45 fixtures, each built from its parts (a plan symbol and a 3D piece):<br>• lights: ceiling light, recessed can, pendant, sconce, outdoor light, ceiling fan with light<br>• switches (single, 3-way, dimmer) and outlets (duplex, GFCI, 240 V)<br>• smoke / CO detector, thermostat, exhaust fan, panel, meter, solar inverter, home battery, EV charger, generator<br>• vanity and sink, double vanity, pedestal sink, toilet, bathtub, freestanding tub, glass shower, kitchen sink, faucet, utility sink, washer box<br>• water heater (tank or tankless), hose bib, floor drain, water supply, drain stack<br>• AC condenser, mini-split, air handler, diffuser, return grille<br>One click places a piece: wall pieces (switches, outlets, sinks, toilets, tubs …) snap to the nearest wall face and turn to face the room; ceiling pieces hang from the ceiling. `LIGHT` `SWITCH` `OUTLET` `CEILINGFAN` `SMOKEDETECTOR` `THERMOSTAT` `INVERTER` `SINK` `FAUCET` `TOILET` `TUB` `SHOWER` `WATERHEATER` `ACUNIT` start the tool with that piece picked; the tool bar picks any other, its height and its turn. `SOLARPANEL`: click a roof slope (the array follows its pitch) or the ground (racked); rows, panels per row, each panel's width, length and watts in the tool bar (and later in Properties → Size). |
| Systems → Connect | `WIRE`: click a switch (or the panel, an outlet), then each light, fan or outlet it feeds. `PIPECONNECT`: click the water heater (hot), the water supply (cold) or the drain stack (waste), then each fixture; a fixture that takes no such water is refused (a toilet gets no hot water). Wires and supply pipes run up into the ceiling and across; drains run under the slab, falling 1/4" per foot to the stack. `PIPEVIEW` and `WIREVIEW` (also View → Display) switch between drawing lines (dotted plumbing, dashed electrical, a switch leg as an arc on plans) and the pipes and cables themselves at their size (cold blue, hot red, drains brown; power yellow, switched legs white). Select a switch and turn it on (`SWITCHON`, or the switch in Properties → Connections): the lights it feeds glow, in 2D and 3D. Properties → Connections lists a fixture's wires and pipes (click one to select the other end, × takes it out) and what it still needs. Deleting a fixture deletes its wires and pipes. |
| Home → Modify (right after Draw, as in AutoCAD) | `MOVE` `ROTATE` `OFFSET` (large buttons) · `COPY` `MIRROR` `SCALE` `TRIM` `EXTEND` `FILLET` `CHAMFER` `ARRAY` `SPLIT` `JOIN` `ALIGN` on drawn items and on the built-in elements of the sample buildings · **Quarter turns**: `ROTATE90` (Alt+Shift+R, clockwise) and `ROTATE90CCW` (Alt+Shift+L) turn the selection about its centre, and are on the right-click menu; while a placing tool runs (furniture, fixtures, a pool, a sign …) they turn the piece it puts down next, as typing `R` does |
| Properties → Size | Everything you drew shows its sizes in the Properties palette as numbers to type over (a pool's length and depth, a fence's height, a road's width, a piece's width and turn …), with ↺ ↻ quarter-turn buttons. A solar array shows its rows, panels per row, each panel's width, length and watts, and the array's total (20 panels · 9.0 kW); its name follows. |
| Home → Properties | `CHTYPE` (wall, door, window, slab, roof, column, beam, stair types) · `CHMAT` (material and colour) · `CHDIM` (sizes of what you drew) · `ATTACH` `DETACH` |
| Home → Layers | `LAYER` `ISOLATE` `LAYLCK` `GROUP` `UNGROUP` |
| Home → Measure | `DIST` `AREA` `VOLUME` `ANGLE` `ELEV` `ID` `CLEAR` (the result is written to the command line and drawn on the model until Esc) |
| Insert | `FURN` `FIXT LIB` `MEPLIB` `STRLIB` (place a part; or drag a component from the Model Explorer → Library) · `IMAGE` (with a width) `TEXT` `NOTE` · Site → `GEOLOCATE` (Site Location) `PROPLINE` (Property Line) `SITEFROMMAP` (Site from Map) · `PDFATTACH` with a PNG / JPG places it as an underlay to trace |
| Insert → Furniture | `FURN`: about 30 pieces in seven groups:<br>• living: sofas, armchair, tables, TV unit, bookshelf, rug, lamp<br>• bedroom: twin, full, queen and king beds, nightstand, dresser, wardrobe<br>• dining: tables with chairs, stools<br>• kitchen: fridge, range, dishwasher, island, cabinets<br>• office, laundry and outdoor pieces<br>Pick one in the tool bar or the Library tab (or type `FURN BED-QUEEN`), then click in the 2D plan or the 3D view. `R` turns it 90°. Each piece is built from its parts, so the plan draws its symbol (a sofa's cushions, a bed's pillows and duvet, a table with its chairs) and 3D shows the piece. Drag a piece from the Library onto the view to drop it there. |
| Insert → Site Objects | `PLACE` (Place by Measure: pick a shed, pool, tree, bush, boulders, flower bed, septic tank or pad, type its size and how far east and north of a corner of the building it goes, and its turn; a preview shows it) · `SHED` (gable, lean-to or flat roof) `POOL` (rectangle, oval, freeform or L; length, width, depth and the deck around it; its shell is below grade) `TREE` (shade, palm, pine) `BUSH` (green or flowering) `FLOWERS` (mulch and flowering clumps in the colours you pick) `ROCK` (a boulder or a cluster) `GRAVEL` (gravel or river rock) `FENCE` (a fence or garden wall drawn by its line, `C` closes it round a yard: wood privacy, picket, chain link, wrought iron, vinyl or a masonry wall with a cap and piers, at its usual height or yours) `SEPTIC` (tank, lids, sewer line, distribution box and drain-field trenches, buried) by clicking |
| Systems → Roads & Drainage | `ROAD` (by its centre line: asphalt, double yellow or dashed centre line, edge lines, curb and gutter, sidewalks on one side or both) · `SIDEWALK` (joints every 5 ft) · `SIGN` (stop, yield, speed limit, street names, no parking, one way) · `SIGNAL` (a traffic light on a mast arm) · `DRAIN` (a curb inlet with its catch basin, an area drain, a trench drain) · `GUTTER` (click a roof: gutters along its eaves, downspouts, kick-outs and splash blocks). They are on the **Roads & Drainage** layer. |
| Insert → Import / Projects | `ATTACH` DXF · `IMPORT` / `TERRAIN` survey points (CSV, PNEZD, LandXML, LAS) · `DRONE` orthophoto or LAS · `SOIL` report · an `.ifc` file in any of them (see "Importing and exporting") · `XREF` Link Project, `COMMUNITY`, `LINKS` (see "Projects together") |
| Annotate | `DIM` `LEADER` `TAG` `SECTIONLINE` `ELEVMARK` `DETAIL` `GRIDLINE` · `LABEL` (Place Label: names a place, shown on the plan and standing up in 3D) |
| Collaborate | `MARKUP` `PIN` |
| Edit (menu, shortcuts) | `Ctrl/⌘+C` `X` `V` `D` copy, cut, paste, duplicate · `Del` · `Ctrl/⌘+Z` `Y` undo and redo · `Ctrl/⌘+G` group |

How it works: drawn things are `DrawnItem`s in the workspace store; `composeScene` (lib/draw/compose.ts) turns them into
the same prisms, runs, devices and elements the sample buildings use, so selection, Properties, the Model Explorer,
schedules, quantity take-off, section cuts and X-ray all work on them. Walls are cut around their doors and windows;
stairs and ramps are built from steps; moving a built-in element stores a transform (`xf`) instead of editing the model.
Moving with the mouse (see the mouse table): connected things adjust, the way Revit keeps joined walls joined. Drawn
items that share a point with what moved follow it (walls, beams, lines, polylines, slabs, roofs, dimensions …); a wall
whose end moved keeps its doors and windows where they were (or drops one that no longer fits). For the sample
buildings, what sits inside a moved wall (windows, doors, columns, the bond beam) moves with it, and what touches it
(the walls that end at it, partitions, the slab, footings) stretches; a sample door or window dragged on its own slides
along its wall, which is re-cut. Rooms and hatches made with a click re-find their boundary after every change. The roof
does not follow walls moved under it yet.

Limits: a built-in element with gable or roof pieces (extruded along Y) can be moved, scaled, mirrored along an axis or
turned 180°, not rotated freely; doors and windows only slide along their wall; the renderer is still the SVG painter
described under "Known issues".

### Snapping (as in AutoCAD)

* **OSNAP** (F3) locks the cursor onto end points, midpoints, centres, intersections, the perpendicular foot from the
  last point, and the nearest point on a line, of what you drew and of the building (wall centre lines and element
  outlines). A yellow marker in AutoCAD's shape (square, triangle, circle, X, ⊥, hourglass) shows where, with its name
  beside it. The small arrow next to **OSNAP** in the status bar ticks which snaps are on (also Settings → Grid & Snap).
* **ORTHO** (F8) keeps lines horizontal or vertical from the last point; **holding Shift while drawing flips it** for that
  point. **POLAR** (F10) steps the angle; the arrow next to it picks 15°, 30°, 45° or 90°. A dotted guide shows the line
  being followed, with its length and angle.
* **OTRACK** (object snap tracking): rest the cursor on a snap point (a midpoint, say) for half a second and it is
  acquired (a green cross); moving away, the cursor locks to the horizontal or vertical through it, or to where the
  guides of two acquired points cross. That is how a line starts level with, or straight above, the middle of a wall.

## Views, labels and the site

* **Views** (Model Explorer → Views, like Revit's Project Browser): every drawing in one list. Floor Plans (each storey,
  and **All Levels** side by side on one sheet), Site (**Site Plan**, **Topography**), Elevations (N, S, E, W), Sections,
  3D views and all sheets. A click shows it: a floor plan switches the model tab to 2D at that level; the others open
  their sheet, made the first time and reused after that.
* **Both storeys in 2D**: the level menu in the viewport label (2D) or *Show in 2D* under the floor plans draws the level
  below (on the ground floor: the one above) or every other storey faded under the active one; `UNDERLAY` steps through.
* **Topography** sheet: the ground between contours shaded by height with a legend, the contour heights, finished grade,
  the building footprint and the property line.
* **Labels and room names**: Annotate → Place Label (`LABEL`) names a place (type the name in the tool bar, then click).
  Labels and room names show on the plan and stand up on stems in 3D, each with its own switch:
  * **Rooms**: the chip in the viewport label, View → Display → Room Names, or `ROOMLABELS`. It hides or shows room names
    and areas in 2D, in 3D and on the plan sheets.
  * **Labels**: the chip, View → Display → Labels, or `LABELS`, for place labels and the property line's bearings.
  * **Furniture**: the chip, View → Display → Furniture Names, or `FURNLABELS` (off at first), for the name of each piece
    of furniture on the plan and above it in 3D.
* **Seeing inside and under the house in 3D** (chips in the viewport label, also on the View tab):
  * **Cutaway** (`CUTAWAY`): cuts the model 4 ft above the floor of the level you are on, like a dollhouse, so the rooms and
    furniture show. It turns on by itself when you place furniture in 3D.
  * **Below Grade** (`BELOWGRADE`): the ground turns see-through and the house above it fades, so the whole foundation
    shows under it: footings, stem walls, slab, thickened footings, piers, and the septic system.
  * Looking up from under the ground (the Bottom view) sees through it as well.
  * The pipes, wires and ducts of the storey you are on stay in the Cutaway (they run in its ceiling and under its slab).
* **Standing inside a room** (the room view): double-click a room's name, on the plan or in 3D, and you stand inside it at
  eye height, looking across it, in perspective (also View → Walk, `3DWALK`, or `WALKIN KITCHEN`).
  * Drag to look around, up at the ceiling and down at the floor; scroll to widen or narrow the view; the arrow keys walk
    and turn (Shift + ← → steps sideways).
  * Go from room to room as in Street View: the other rooms of the storey show as markers (click one to go there), the bar
    at the foot has the previous and next room (`NEXTROOM`, `PREVROOM`) and a list of the building's rooms, and a
    double-click on the floor walks you to that spot. The camera glides there.
  * **Room to Room button** in the top bar (`WALKIN`, also `ROOMTOROOM`): the rooms of the whole project sorted by
    building, and inside a building by storey from the ground up. A project with one house lists that house; a community
    lists each linked or merged house under its own name. Click a room to stand in it; while you are inside, the room is
    ticked and the menu starts with Leave the Room. Next and Previous Room stay in the building you are in, going up the
    storeys; a building picker in the bar at the foot (shown when there is more than one building) takes you to another
    house, and `WALKIN Residence_2BR_Miami STUDY` names the building and the room.
  * Inside, the rooms get ceilings, and a drag never moves a wall. A click still selects, and the tools still work.
  * Esc (once nothing else is selected or running), Leave, a named view or `LEAVEROOM` takes you back to the 3D view you
    were in.
* **Pipes and wires** (View → Display → Pipes, Wires; `PIPEVIEW`, `WIREVIEW`): plumbing as dotted lines or as the pipes,
  electrical as dashed lines or as the cables, in 2D, 3D and on plan sheets. See "Systems → Connect" above.
* **Site Location** (Insert → Site, `GEOLOCATE`): the Site palette pins the model's base point to a latitude and
  longitude: find the address (OpenStreetMap search), paste coordinates (`25.7593, -80.2378` or `25°45'33"N 80°14'16"W`),
  or take this device's position; and set the angle to true north. A live map (satellite with road names, or streets)
  shows the property line, the building and a ¼, ½, 1 or 2 mile radius; buttons open the same place in **Google Maps**
  (pin or satellite), **Google Earth** and OpenStreetMap, download a **KML** (property line, corners, radius) and copy the
  coordinates. The samples sit at approximate spots for their addresses.
* **Ground type** (Insert → Site → Ground Type, `GROUND CLAY`, the Site palette → Ground, or the ground's Properties):
  * The kinds are lawn, dirt (bare earth or fill), clay, loam, sand, gravel and rock.
  * Each has its own colour and texture on the ground in 3D, and its own cut face. Elevation and section sheets show it
    under the grade line, with its name.
  * Each carries the presumptive values of the code table (FBC-R Table R401.4.1): bearing pressure, and what it means for
    the footings (expansive clay, for example) and for a septic drain field (perc rate).
  * Material Analysis reports these values when no soil report is attached. A soil report always governs (`lib/ground.ts`).
* **Site from Map** (Insert → Site, `SITEFROMMAP`, or the Site palette → Site from the Map): from the site's coordinates,
  the ground around the lot comes from public elevation data (AWS Terrain Tiles, made from USGS 3DEP / SRTM, about
  10–30 m apart). It becomes contours every foot on the plan, the topography sheet and the site plan. The height above sea
  level at the building is kept and noted on the sheets. The satellite photo (Esri World Imagery) is laid under the plan
  at its true size to trace from (north-up plans only). Google's maps and elevation need a paid API key, so these free
  sources are used. Public data shows the lie of the land, **not a survey**; the sheets say so.
* **Property Line** (Insert → Site, `PROPLINE`): click the corners over an uploaded site plan (Insert → PDF / Image with a
  PNG or JPG, placed at the real width you type), or type each course as a bearing and distance (`N45°30'E 120`). The plan,
  the 3D view and the site sheets draw it survey-style with each side's bearing and length, numbered corners and the lot
  area; the Site palette lists every corner's northing, easting, latitude and longitude (all editable), the courses, area
  and perimeter, and exports them as CSV. Everything is undoable and saved with the project (`project.site`, lib/geo.ts).

## Elevations, sections and the site plan

* **Elevation** (View → Elevations & Sections, or Annotate → Markers), in four ways (the Type in the tool bar):
  * **Two points at any angle**: click (or type) two points in 2D or 3D, then the side to look at. A diagonal elevation
    opens on its own sheet. Type an angle (`<30` holds the direction) or a length in the tool bar, or `@60<30`.
  * **Circular**: a centre and a radius (click, or type it) and a sweep. The building is seen from all round the circle and
    unrolled flat, facet by facet, with each facet's compass direction.
  * **Along a drawn line or wall**: click it.
  * **A side**: North, South, East, West or all four.

  The sheet shows level lines, names and heights, grid lines and bubbles, finished grade, the ground profile and the
  overall height. The elevation mark stays on the plan: drag its grips, or type a new angle, length, radius, sweep or
  start in the bar on the sheet, and the sheet follows at once (`lib/elevation.ts`).
* **Section**: draw the cut line (it runs east–west or north–south), then click the side to look at. A section mark with
  arrows goes on the plan and `SC-1 Section A–A` opens: the cut is drawn in poché with what lies beyond, plus the same
  levels, grids, grade and ground profile.
* **Site Plan**: a top view of the site with its contours (and their heights), trees, paving and the roof plan.
* The sheets are saved with the project, undo like any edit, and close with the × on their tab. Commands: `VIEWELEV`
  (`ELEVATION`), `VIEWSECTION` (`SECTIONVIEW`), `VIEWSITE` (`SITEPLAN`). The renderer cuts in any of the four directions
  (`Cut` in lib/scene/render.ts).

## Saving and version history

* **Save** (`Ctrl/⌘+S`, the save icon, or the Save button in the Versions palette) writes the project's work to this
  browser (localStorage, key `bs.work.<mode>.<projectId>`, in the demo as well as in the app) and adds a **version** when
  something changed. Reloading restores it. Closing the page with unsaved changes keeps a draft and recovers it on the
  next visit. Auto-save (Settings → General) writes the working copy quietly.
* **Version history** is the **Versions** tab of the palette dock (also Collaborate → Share → Versions, the application
  menu, and the "Saved …" indicator in the status bar). Each saved version shows who, when and what changed ("+3 drawn ·
  1 moved"); you can name it, **Restore** it (one undo step brings back what you had), **Show changes** (selects what it
  added or changed), rename or delete it. The 20 newest versions keep a snapshot. An **Activity** tab lists this
  session's steps and the saves. The sample history of the demo projects is shown below yours, without snapshots.
* **Save As** downloads a `.bsd` file (JSON); **Open File** loads one into the open project (same kind of project).
* Storage is the browser's, about 5 MB: when it is full Save says so and Save As still downloads a file. A real back end
  would replace `lib/persist.ts`.

## Windows: sizes, edges, moving, Interfaces

* **Three sizes, shown by an eye**: the Model Explorer, the palette dock, the timeline and the command line each have an
  eye in their header (just the eye). Click it to step **normal → fully open → header only → normal**. A wide-open eye means fully open,
  a half-closed eye normal, a closed eye header only. Header only leaves a 32 px strip or a single bar with the title; a
  pending AI proposal stays visible in every size. Commands that need a window bring it back.
* **Drag an edge** to resize a window (the timeline and command line by their top edge, the side windows by their inner
  edge). A double-click on the edge resets it; arrow keys nudge it.
* **Move and close**: drag a window's grip (⋮⋮) to the other side or, for the bottom windows, above or below the other.
  Click the grip for a menu, or close the window with its ×. Palette and explorer tabs can be dragged into another
  order and closed with their ×; the + puts a closed one back.
* **Interfaces** (View → Panels → Interfaces, `INTERFACES`): save the whole arrangement under a name and switch between
  arrangements. Built-in ones: Standard, Drafting, Analysis, Scheduling, Presentation, Mirrored. Yours can be renamed,
  updated and deleted.
* The ribbon at the top and the **status bar at the bottom never move** and cannot be closed. The arrangement is remembered
  in `localStorage` (`bs.layout`, `bs.interfaces`; `lib/layout.ts`).

## Help: tutorial, Button Guide, shortcuts

* **Tutorial** (Home → Help → Tutorial, the ? in the app bar, Settings → Help & Tutorial, or `F1`): on the first visit a
  popup offers it, and it can be skipped. A text box explains each part of the screen while everything else is dimmed by a
  70 % black overlay, with the part being explained left clear. It covers one step per ribbon tab, saying what the tab is
  for. Next / Back or the arrow keys move through it; Skip or Esc ends it. It can be taken again at any time.
* **Button Guide** (Home → Help, the ? menu, Settings → Button Guide): every button, sorted by tab, with what the tab is for.
  Each entry shows the button as it looks, what it does, where it is (tab › panel) and its command. **Show me** switches to
  its tab and lights the real button. The status bar, window controls and app bar are listed too. It is searchable.
* **Shortcuts** (Home → Help, Settings → Shortcuts): every shortcut, drawn for the computer you are on. See below.

## Keyboard shortcuts

* **Every command and every ribbon button has one.** Hover a button to see it; the Button Guide and Settings → Shortcuts
  list them all.
  * The commands that always had a key keep it (Ctrl+S, F7 …).
  * Everything else has **Alt plus its letters, pressed together**, as in the command line's aliases:

    | Shortcut | Runs |
    |---|---|
    | Alt+L | line |
    | Alt+P | polyline |
    | Alt+R | rectangle |
    | Alt+C | circle |
    | Alt+A | arc |
    | Alt+W | wall |
    | Alt+M | move |
    | Alt+O | offset |
    | Alt+T | text |
    | Alt+2 / Alt+3 | 2D plan / 3D view |
    | Alt+Z | zoom extents |
    | Alt+W+N | window |
    | Alt+D+R | door |
    | Alt+S+B | slab |
    | Alt+C+O | copy |
    | Alt+R+O | rotate |
    | Alt+F+U | furniture |
    | Alt+Shift+R / Alt+Shift+L | turn 90° clockwise / counter-clockwise |
    | Alt+F+N | fence or garden wall |
    | Alt+V+T | view from the top |

  * The rarer commands have three letters. View → Top and other buttons that run a command with an argument have their
    own (`lib/keymap.ts`).
* **Up to 4 keys at once.** A shortcut is a chord of up to four keys, modifiers included (Alt+R+E+C, Ctrl+Alt+Shift+K).
  * The keys can go down in any order.
  * When a short chord is part of a longer one (Alt+L and Alt+L+B), the short one runs when you let go, so both work.
  * Alt chords also work while typing in the command line.
  * With Ctrl (⌘ on a Mac) a chord takes one other key, because macOS does not report keys let go while ⌘ is held. Use
    Alt or Shift for several keys.
* **Change any of them** in Settings → Shortcuts:
  * Filter by ribbon tab, or search by name, alias or key.
  * **Record** a new shortcut: hold the keys, then let go.
  * A chord another command uses can be moved over; that command is then left without one.
  * **Remove** leaves a shortcut blank, and **Clear All** blanks every one.
  * **reset** brings back a row's default, and **Reset to Defaults** brings back all of them.
  * Import and Export save the whole set as a file that works on any OS.
  * Bare letters are refused, so that typing commands keeps working, and so are the combinations the browser or OS keep
    (Ctrl+W, Alt+F4 …).

## The sample projects

* **Residence_2BR** (Miami): two storeys, CMU, with footings, stem walls and a slab on grade. Its **septic system** (a
  1,000 gal tank, sewer line, distribution box and a three-trench drain field) is buried in the back yard.
* **Cottage_2BR_1BA** (Orlando): a one-storey, 28 × 38 ft home with two bedrooms and one bathroom. It has a living / dining
  room, kitchen, laundry and hall, a front porch on piers and a gable roof. Its **foundation** is continuous footings,
  stem walls, a 4" slab with thickened edges and porch piers. It has a septic tank and drain field too, and its own
  checks, issues, cost and schedule.
* **Clinic_Phase1** (Antigua).
* Foundations and septic systems are below grade. They are dashed on the plans, drawn in full on **View → Foundation
  Plan**, and seen in 3D with **Below Grade** (the chip on the 3D view, or View → Display). It fades the house so the
  footings under it show. They sit on the Foundation and Site Utilities layers.

## Projects together: links, merges and communities

* **Link Project** (Insert → Projects, `XREF`): bring another project onto this parcel, moved and turned where you say.
  **Keep them separate** makes a live, read-only link: edit it in its own project, and once that is saved it changes here
  at once, in this tab and in other tabs. **Merge a copy** makes its elements part of this project, editable here; it no
  longer follows the original.
* **New Community** (`COMMUNITY`): pick two or more projects and a new project opens with them side by side on one
  parcel. Their lot fronts line up on one street, or with "facing" every second house turns to face the first across a
  40 ft street. Each lot line is drawn and labelled linked or merged.
* **Linked Projects** palette (`LINKS`): move, turn, open, merge or unlink each one (`lib/links.ts`).

## Importing and exporting

* **Import** (application menu → Import, or the Insert buttons), read in the browser:
  * **DXF** (ASCII): lines, polylines, circles, arcs, points and text, on their layers, scaled from the file's units.
  * **IFC** (STEP): walls, slabs, roofs, columns, beams, doors, windows, stairs and footings as solids, from their
    extrusions or bounding boxes.
  * **Survey points**: CSV / TXT (x y z or PNEZD), LandXML (points and TIN surfaces) or a LAS point cloud, turned into a
    ground surface and contours.
  * **Images** to trace.
  * **Soil report** numbers: bearing, site class, groundwater, percolation.

  **DWG**, **LAZ**, **GeoTIFF** and **PDF pages cannot be read in a browser**; the dialog says so and how to convert them
  (DWG → DXF, LAZ → LAS, PDF → PNG) (`lib/importers.ts`).
* **Export**: PDF (the print dialog, sheet only), a PNG render of the view, **DXF** (R12, for AutoCAD; the DWG button
  writes it), **IFC4** and a printable HTML **report** (`lib/exporters.ts`).

## Code map and how the code is documented

```
app/                     routes (see above), globals.css (design tokens), layout, manifest, icons
components/workspace/    Workspace shell, AppBar, Ribbon/, ModelExplorer/, Viewport/, Palettes/, CommandLine/, Timeline, Modals/
components/settings/     SettingsFrame, route-parts, panes/ (one per page + ConnectDialog)
components/ui/           Menu, Modal, Tooltip, Toaster, Kbd, controls
lib/commands.ts          the command registry; ribbon, hotkeys, command line, context menu and search all resolve through it
lib/draw/                the drawing engine: tools.ts + modify.ts (the commands), session.ts (how a tool runs), compose.ts
                         (drawn items → scene geometry), snap.ts, enclose.ts, geom.ts, options.ts, change.ts
lib/persist.ts, layout.ts  saving / versions / .bsd files; window sizes, sides, order, tabs and Interfaces
lib/tour.ts, links.ts      the tutorial's steps; linked / merged projects and communities
lib/keymap.ts, shortcuts.ts  every command's default shortcut; chords of up to 4 keys (matching, recording, rules)
lib/ground.ts              kinds of ground: look, presumptive bearing, drain-field suitability
lib/draw/parts.ts          the building blocks of catalogue pieces (boxes, discs, rings, legs; looks and colours)
lib/draw/furniture.ts      the furniture catalogue: pieces built from parts (plan symbol and 3D shape)
lib/draw/fixtures.ts       the MEP fixture catalogue: lights, switches, outlets, sinks, toilets, tubs, AC, solar … with
                           their mount, height, the port wires and pipes connect to, and what they need
lib/draw/site.ts           site objects: pools, boulders, flower and gravel beds, roads, sidewalks, signs, traffic
                           lights, drains, gutters
lib/draw/tools-mep.ts, tools-site.ts   the fixture, wire, pipe and solar tools; the site, road and fence tools
lib/draw/interior.ts       the room view: where to stand in a room, its outline, the rooms sorted by building and
                           storey (roomGroups), the ceilings drawn while inside
lib/elevation.ts           elevations at any angle and circular (unrolled) ones
lib/importers.ts, exporters.ts, sitemap.ts, reports.ts   DXF / IFC / survey readers; DXF / IFC / report writers; ground
                         and photo from the map; grading, material, constructability and clash checks from the model
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

* AI calls, task classification, routing and proposals (`lib/services/ai.ts`): the AI tab's buttons answer with sample
  text; no AI model is called
* Stress test, wind / seismic / thermal / energy simulation, council, code compliance, Prompt-to-Plan
  (`lib/services/analysis.ts`)
* Agent connection tests and keys (`lib/services/agents.ts`)
* Projects and the building code database (`lib/services/projects.ts`, `lib/mock-data.ts`)
* Auth, payments, e-mail, sharing with other people (saving is real but local: the browser's localStorage and `.bsd` files)

Real, computed from the model: **Grading** (cut and fill, excavation, the fall away from the foundation), **Material
Analysis**, **Constructability**, **Clash Detection** (MEP runs against the structure), quantities, schedules, the imports
and exports above, and links between projects (`lib/reports.ts`). They are advisory checks, not engineering.

Real, and online: the Site palette's map tiles (Esri World Imagery, OpenStreetMap), Site from Map's elevation tiles
(AWS Terrain Tiles), the address search (OpenStreetMap Nominatim, only when you press Find) and the Google Maps / Google
Earth links. The coordinates, bearings, areas and the KML
file are computed in the browser (`lib/geo.ts`) and work offline.

Numbers on screen (costs, stress, code citations) are illustrative. Nothing here is engineering advice.

## Differences from the spec

* The spec's `(.)settings` interception convention intercepts the wrong URL here (the slot lives under `/demo` and under
  `/app/projects/[projectId]`, at different depths), so the root-relative `(...)settings` is used.
* Next.js 16 matches intercepted routes strictly, so the canonical settings route is one catch-all
  (`settings/[[...slug]]`) rather than a folder per page. URLs are the spec's.
* `cacheComponents` is off: this is an interactive mock-data app with request-time cookies and client clocks.
* The demo saves to this browser (the spec's demo never saved): saving, versions and `.bsd` files work everywhere.
* Added: `doc=start` and (demo only) `project` query parameters; the ribbon panel collapse; the per-OS shortcut,
  gesture, theme ("Match system") and install-as-app support described above.
* The reference PNGs were not available, so layout follows the spec's text and design tokens.

## Tests

* **Unit tests** (`npm test`, a few seconds): the pure logic that differs per OS (platform detection, shortcut matching and
  labels, wheel / trackpad interpretation, theme resolution, CSV output) and the drawing engine (geometry, typed input,
  scene composition, room finding, saving, version summaries, `.bsd` files, a tool for every tool command), the snaps
  (`lib/draw/snap.test.ts`), the site maths (coordinates, bearings, KML, map tiles: `lib/geo.test.ts`), the Views list
  (`lib/views.test.ts`), elevations at any angle, the importers and exporters (round trips through DXF and IFC), links and
  communities, the reports and clash detection, window arrangements and the tutorial, Site from Map's tiles
  (`lib/**/*.test.ts`), the keyboard shortcuts (every command has one, no two share a chord, chords of up to 4 keys,
  saved remaps survive a reload: `lib/keymap.test.ts`, `lib/shortcuts.test.ts`), the ground types, the furniture
  catalogue and the Cutaway and Below Grade views (`lib/ground.test.ts`, `lib/draw/furniture.test.ts`), the fixture
  catalogue, wiring and piping (a switch lighting its lights, drains falling to the stack, the wall a fixture snaps to,
  a roof's slope for solar, pipes drawn as lines or as pipes: `lib/draw/mep.test.ts`) and the site objects (pools,
  beds, roads, signs, drains, gutters, fences: `lib/draw/site.test.ts`), standing inside a room (the eye camera, where
  each room is seen from, ceilings, a render from inside: `lib/draw/interior.test.ts`) and the commands of the room view
  (rooms sorted by building in a community, Next Room staying in the building), quarter turns and sizes typed in
  Properties (`lib/room-view.test.ts`).
  **`lib/buttons.test.ts` backtests every ribbon button**: it runs each one's command against a fresh
  workspace and checks it did what its description says (a tool started, a dialog or palette opened, a toggle flipped, a
  view changed …). It also checks that every description says what the button does, and that the cottage has its
  footings, septic system, one storey, two bedrooms and one bath.
* **Browser tests** (`npm run e2e`) drive a real browser against a running app, in seven suites that can also be run alone
  (`npm run e2e:routing`, `e2e:workspace`, `e2e:tools`, `e2e:layout`, `e2e:site`, `e2e:buttons`, `e2e:platform`).
  **buttons** clicks every ribbon button on every tab, including those inside folded panels. Each click must run its
  command and visibly react, with no "Unknown command", failure or page error. It then checks end to end: the first-run
  tutorial and its dim, the Button Guide's Show me, Interfaces, dragging the timeline edge, a diagonal elevation, a
  community, Site from the Map, DXF import and export, Place by Measure, chords pressed for real (Alt+W+N), a 4-key
  shortcut recorded, moved and removed in Settings, room names and labels switched apart, a ground type, and a bed
  placed in 3D with the cutaway. **tools** runs every drawing,
  placing, annotating, measuring and editing command and checks the geometry they saved, plus delete / copy / group / undo and
  saving (reload, versions, Save As, Open File), a switch wired to a light that glows when it is on, hot water piped to a
  sink (and refused to a toilet) shown as pipes in 2D and in a 3D cutaway, the site and road objects, gutters and a
  solar array on a roof clicked in 3D, every kind of fence, a solar array resized in Properties, a quarter turn by
  Alt+Shift+R and the furniture names; **layout** checks the three window sizes; **site** checks Offset's place,
  the snaps (Midpoint, Nearest, Shift-ortho, OTRACK), labels in 2D and 3D, the Views tab and the underlay, the property line
  from typed bearings, the Site palette (coordinates, address, Google Maps link, KML) and an uploaded site plan. The map
  tiles, the elevation tiles (a generated rolling ground) and the address search are answered by the test harness, so no
  suite calls outside servers. The first-run tutorial prompt is marked as seen before each page load. The other three:
  **routing** (redirects, deep links, modal-over-workspace and page-mode settings, Close / back, 404s),
  **workspace** (every palette, every ribbon button including those inside collapsed panels, command line and AI proposals,
  hotkeys, context menu, document tabs, timeline, sheets, settings draft / Apply / persistence, Connect and Disconnect,
  Esc handling, blocked-storage fallback, the Model Explorer keeping its scroll position, the room view and the Room to
  Room menu of the top bar) and
  **platform** (the app run as macOS, Windows and Linux: labels, keys, selection modifiers, Space-pan, wheel, pinch,
  touch, Match system, forced colours, installability, IME, downloads).

```bash
npm run build && npm start               # or: npm run dev  (leave it running; open a second terminal)
npx playwright-core install chromium     # once; or pass --chromium=PATH to an installed Chrome / Chromium
npm run e2e -- --base=http://localhost:3000
```

Saved project work and the window layout persist between page loads, so each suite clears them on load (`bs.work.*`,
`bs.layout`); a check that wants persistence sets a `sessionStorage` flag to keep them.

Options work the same in every shell: `--base=URL`, `--chromium=PATH`, `--browser=chromium|webkit|firefox`,
`--out=DIR`, and a name filter such as `npm run e2e:workspace -- "ribbon,timeline"`. Screenshots go to `e2e/.shots/`.
A check also fails if the page logs a console error while it runs.

## Known issues

* Under `next dev` only, React logs "Encountered a script tag while rendering React component" on 404 pages: the not-found
  page re-renders the root layout on the client, and that layout contains the blocking theme script. It does not occur on
  real pages or in a production build.
* Browsers do not let a page override Ctrl/⌘+N, +T and +W, and macOS keeps F3, F4 and F11; the alternates above cover them.
* Drawing in the 3D view puts points on the active level's plane (a click does not know how high above it you meant);
  use the 2D plan for exact work. The plan shows about 80 × 40 ft at the default zoom: Zoom Extents (`ZOOM E`) frames
  everything you drew.
* Public elevation data (Site from Map) is 10–30 m apart: it gives the lie of the land, not a survey. Linked projects
  update when the other project is saved in the same browser. There is no shared server yet, so another person's saves
  do not reach you.
* The viewport is a painter's-algorithm SVG renderer tuned for the sample buildings. It is
  not a general-purpose CAD renderer; a production build would put WebGL behind the same scene and camera interfaces.

---

Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
