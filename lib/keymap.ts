/**
 * lib/keymap.ts
 *
 * WHAT   The default keyboard shortcut of every command and every ribbon button, and what runs on a combo:
 *        - DEFAULT_CHORDS: a chord for each command that has no shortcut of its own: Alt plus the letters of its
 *          alias or name, pressed together (Alt+L line, Alt+W wall, Alt+W+N window, Alt+D+R door, Alt+R+E+C … at
 *          most 4 keys). The commonest tools have one or two letters; the long tail has three. Buttons whose
 *          command carries an argument (View → Top is "-VIEW TOP") have their own.
 *        - targetBindings / shortcutOf: the combos that run a target now (the user's own from Settings → Shortcuts
 *          replace the defaults; an empty one means none);
 *        - allBindings: every combo in force, for the hotkey hook and the clash check.
 *        The commands' own keys (Ctrl+S, F7 …: `key` in lib/commands.ts) stay as they are.
 * FOR    The hotkeys (components/workspace/useHotkeys.ts), Settings → Shortcuts, tooltips, menus and the Button Guide.
 * DEBUG  - Two commands on one chord: lib/keymap.test.ts finds it; chords compare in any key order (Alt+D+I = Alt+I+D).
 *        - A chord fires late: a shorter chord inside a longer one (Alt+L inside Alt+L+B) runs when the keys are let
 *          go, so the longer one stays reachable (lib/shortcuts.ts matchChord).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { COMMANDS, type CommandDef } from "./commands";
import type { Platform } from "./platform";
import { bindingsOf, chordId, normaliseCombo, type Binding } from "./shortcuts";

/** The default chord of each command (and ribbon command with an argument) that has no shortcut of its own. */
export const DEFAULT_CHORDS: Record<string, string> = {
  // Full Screen's F11 belongs to macOS on a Mac: this chord works on every system
  FULL: "Alt+Shift+F",
  LINE: "Alt+L",
  PLINE: "Alt+P",
  RECTANG: "Alt+R",
  CIRCLE: "Alt+C",
  ARC: "Alt+A",
  SPLINE: "Alt+S+P+L",
  HATCH: "Alt+H",
  MOVE: "Alt+M",
  ROTATE: "Alt+R+O",
  OFFSET: "Alt+O",
  COPY: "Alt+C+O",
  MIRROR: "Alt+M+I",
  SCALE: "Alt+S+C",
  TRIM: "Alt+T+R",
  EXTEND: "Alt+E+X",
  FILLET: "Alt+F+I",
  CHAMFER: "Alt+C+H",
  ARRAY: "Alt+A+R",
  SPLIT: "Alt+S+P",
  JOIN: "Alt+J",
  ALIGN: "Alt+A+L",
  WALL: "Alt+W",
  DOOR: "Alt+D+R",
  WINDOW: "Alt+W+N",
  SLAB: "Alt+S+B",
  ROOF: "Alt+R+F",
  STAIR: "Alt+S+T",
  COLUMN: "Alt+C+L",
  BEAM: "Alt+B+M",
  RAMP: "Alt+R+A+M",
  ROOM: "Alt+R+M",
  FOUNDATION: "Alt+F+O",
  TRUSS: "Alt+T+R+U",
  FRAMING: "Alt+F+R+A",
  BRACE: "Alt+B+R",
  CONNECT: "Alt+C+O+N",
  HVAC: "Alt+H+V",
  ELEC: "Alt+E+C",
  PLUMB: "Alt+P+L",
  DUCT: "Alt+D+U",
  PIPE: "Alt+P+I",
  TRAY: "Alt+C+T",
  FIRE: "Alt+F+P",
  FIXT: "Alt+F+I+X",
  EQUIP: "Alt+E+Q",
  WIRE: "Alt+W+R",
  PIPECONNECT: "Alt+P+T",
  SOLARPANEL: "Alt+P+V",
  SWITCHON: "Alt+S+W+O",
  CHTYPE: "Alt+C+H+T",
  CHMAT: "Alt+C+H+M",
  CHDIM: "Alt+C+H+D",
  "ATTACH HOST": "Alt+A+H",
  DETACH: "Alt+D+E",
  LAYER: "Alt+L+A+Y",
  ISOLATE: "Alt+I+S",
  LAYLCK: "Alt+L+Y",
  UNGROUP: "Alt+U+N",
  DIST: "Alt+D+I+S",
  AREA: "Alt+A+R+E",
  VOLUME: "Alt+V+O",
  ANGLE: "Alt+A+N",
  ELEV: "Alt+E+V",
  ID: "Alt+I+D+A",
  CLEAR: "Alt+C+L+E",
  BUTTONGUIDE: "Alt+B+U",
  ATTACH: "Alt+A+T",
  IMPORT: "Alt+S+L",
  DRONE: "Alt+D+R+O",
  PDFATTACH: "Alt+P+D",
  GEOLOCATE: "Alt+M+A+P",
  PROPLINE: "Alt+P+R",
  SITEFROMMAP: "Alt+S+F+M",
  TERRAIN: "Alt+T+E",
  SOIL: "Alt+S+O",
  GROUND: "Alt+G+T",
  PLACE: "Alt+P+M",
  SHED: "Alt+S+H",
  TREE: "Alt+T+R+E",
  BUSH: "Alt+B+U+S",
  FLOWERS: "Alt+F+L",
  SEPTIC: "Alt+S+E",
  POOL: "Alt+P+O+L",
  FENCE: "Alt+F+N",
  ROCK: "Alt+R+K",
  GRAVEL: "Alt+G+V",
  ROAD: "Alt+R+O+A",
  SIDEWALK: "Alt+S+W+K",
  SIGN: "Alt+S+I+G",
  SIGNAL: "Alt+S+G+L",
  DRAIN: "Alt+D+N",
  GUTTER: "Alt+G+U+T",
  // the fixture pieces (Systems → Lighting & Power, Plumbing & Air)
  LIGHT: "Alt+L+G",
  SWITCH: "Alt+S+W+I",
  OUTLET: "Alt+O+U",
  CEILINGFAN: "Alt+C+F",
  SMOKEDETECTOR: "Alt+S+M+K",
  THERMOSTAT: "Alt+T+H+E",
  INVERTER: "Alt+I+N+V",
  SINK: "Alt+S+K",
  FAUCET: "Alt+F+A+U",
  TOILET: "Alt+W+C",
  TUB: "Alt+T+U",
  SHOWER: "Alt+S+H+O",
  WATERHEATER: "Alt+W+H",
  ACUNIT: "Alt+A+C+U",
  XREF: "Alt+X+R",
  COMMUNITY: "Alt+C+O+M",
  LINKS: "Alt+L+I",
  MATERIAL: "Alt+M+A",
  FURN: "Alt+F+U",
  "FIXT LIB": "Alt+F+L+I",
  MEPLIB: "Alt+M+E",
  STRLIB: "Alt+S+T+R",
  IMAGE: "Alt+I",
  TEXT: "Alt+T",
  NOTE: "Alt+N+O",
  DIM: "Alt+D+I",
  LEADER: "Alt+L+E+A",
  TAG: "Alt+T+A+G",
  SECTIONLINE: "Alt+S+E+C",
  VIEWELEV: "Alt+E+L",
  VIEWSECTION: "Alt+S+N",
  LABEL: "Alt+L+A+B",
  ELEVMARK: "Alt+E+A",
  DETAIL: "Alt+D+E+T",
  GRIDLINE: "Alt+G",
  SCHEDULE: "Alt+D+W+S",
  QTO: "Alt+Q+T+O",
  PLAN: "Alt+2",
  "3DVIEW": "Alt+3",
  "3DORBIT": "Alt+3+D",
  "3DWALK": "Alt+3+D+W",
  "ZOOM E": "Alt+Z",
  VIEWSITE: "Alt+V+I",
  VIEWTOPO: "Alt+T+O+P",
  VIEWPLANS: "Alt+V+I+E",
  FOUNDATIONPLAN: "Alt+F+O+U",
  VIEWS: "Alt+V+W",
  "-VIEW TOP": "Alt+V+T",
  "-VIEW FRONT": "Alt+V+F",
  "-VIEW BACK": "Alt+V+B",
  "-VIEW LEFT": "Alt+V+L",
  "-VIEW RIGHT": "Alt+V+R",
  "-VIEW BOTTOM": "Alt+V+B+O",
  "-VIEW FLOORPLAN": "Alt+V+F+L",
  "-VIEW ELEVATION": "Alt+V+E+L",
  PERSP: "Alt+P+E",
  ORTHO3D: "Alt+O+R+T",
  "VSCURRENT WIREFRAME": "Alt+V+W+I",
  "VSCURRENT SHADED": "Alt+V+S",
  "VSCURRENT REALISTIC": "Alt+V+R+E",
  "VSCURRENT XRAY": "Alt+V+X",
  SECTIONPLANE: "Alt+S+X",
  SECTIONBOX: "Alt+S+E+T",
  CUTAWAY: "Alt+C+U",
  RULERS: "Alt+R+U",
  GUIDES: "Alt+G+U",
  LABELS: "Alt+L+B",
  ROOMLABELS: "Alt+R+N",
  PIPEVIEW: "Alt+P+I+V",
  FURNLABELS: "Alt+F+N+L",
  ROTATE90: "Alt+Shift+R",
  ROTATE90CCW: "Alt+Shift+L",
  WALKIN: "Alt+W+K+I",
  NEXTROOM: "Alt+N+X",
  PREVROOM: "Alt+P+R+V",
  LEAVEROOM: "Alt+O+U+T",
  WIREVIEW: "Alt+W+R+V",
  UNDERLAY: "Alt+U+N+D",
  BELOWGRADE: "Alt+B+G",
  HIDE: "Alt+H+I",
  UNHIDE: "Alt+S+A",
  INTERFACES: "Alt+U+I",
  EXPLORER: "Alt+E+X+P",
  PALETTES: "Alt+P+A",
  TIMELINE: "Alt+T+I",
  STRUCT: "Alt+S+R",
  STRESS: "Alt+S+R+E",
  LOADS: "Alt+L+O",
  DEFLECT: "Alt+D+E+F",
  SOLAR: "Alt+S+O+L",
  WIND: "Alt+W+I",
  SEISMIC: "Alt+S+E+I",
  THERMAL: "Alt+T+H",
  ENERGY: "Alt+E+N",
  GRADING: "Alt+G+R",
  TRAFFIC: "Alt+T+R+A",
  CLASH: "Alt+C+D",
  CODECHECK: "Alt+C+O+D",
  MATCHECK: "Alt+M+A+T",
  CONSTRUCT: "Alt+C+N",
  COST: "Alt+C+O+S",
  SCHEDQ: "Alt+S+Q",
  WORKFORCE: "Alt+W+O",
  SIMULATE: "Alt+D+S",
  ASK: "Alt+A+S+K",
  P2P: "Alt+P+2",
  EXPLAIN: "Alt+E+I",
  AIGEN: "Alt+A+I",
  AIAUTO: "Alt+A+U",
  AIREVIEW: "Alt+A+I+R",
  AICODE: "Alt+C+R",
  AIERR: "Alt+A+I+E",
  AICOST: "Alt+A+I+C",
  AIMAT: "Alt+A+I+M",
  AIOPT: "Alt+A+I+O",
  AICMP: "Alt+A+C",
  AIEDIT: "Alt+A+M+E",
  COUNCIL: "Alt+C+O+U",
  CONNECTORS: "Alt+C+O+E",
  AGENT: "Alt+A+G",
  COMMENT: "Alt+C+M",
  MARKUP: "Alt+M+K",
  ISSUE: "Alt+I+S+U",
  TASK: "Alt+T+A+S",
  PIN: "Alt+P+I+N",
  PESIGN: "Alt+P+S+O",
  APPROVALS: "Alt+A+O",
  REVIEW: "Alt+R+E",
  SHARE: "Alt+S+H+A",
  PERMS: "Alt+P+E+R",
  HISTORY: "Alt+H+I+S",
  VERSIONS: "Alt+V+N",
  AISETTINGS: "Alt+A+I+S",
  UNITS: "Alt+U+N+I",
  GRIDSNAP: "Alt+G+S",
  TEMPLATES: "Alt+T+E+M",
  STANDARDS: "Alt+S+T+N",
  ACCOUNT: "Alt+A+C+O",
  OPENFILE: "Alt+O+P",
  PROJINFO: "Alt+P+R+O",
  EXPORT: "Alt+E+O",
  ARCHIVE: "Alt+A+R+C",
  CLOSE: "Alt+C+P",
  LOCK: "Alt+L+O+C",
  UNLOCK: "Alt+U+N+L",
  HEALTH: "Alt+H+E",
  ZOOM: "Alt+Z+E",
  "-VIEW": "Alt+V+E+W",
  VSCURRENT: "Alt+V+S+C",
  OTRACK: "Alt+O+T",
  LWT: "Alt+L+W+T",
  MODEL: "Alt+M+O",
  JURISDICTION: "Alt+J+U",
  SIMFLOOD: "Alt+S+F",
  SIMFIRE: "Alt+S+I+M",
  SIMLIGHTING: "Alt+S+M",
  SIMWATER: "Alt+S+W",
};

/** Every target a shortcut can run: each command, and each ribbon command with an argument ("-VIEW TOP"). */
export function shortcutTargets(): string[] {
  return [...new Set([...COMMANDS.map((d) => d.name), ...Object.keys(DEFAULT_CHORDS)])];
}

/** The command a target runs ("-VIEW TOP" → -VIEW). */
export function defOfTarget(target: string): CommandDef | undefined {
  const name = target.split(" ")[0];
  return COMMANDS.find((d) => d.name === name);
}

/** Every combo that runs a target now: the user's own (empty = none) or the command's keys and its default chord. */
export function targetBindings(target: string, user: Record<string, string>, platform: Platform): string[] {
  if (target in user) return user[target] ? [normaliseCombo(user[target])] : [];
  const def = COMMANDS.find((d) => d.name === target);
  const own = def ? bindingsOf(def, {}, platform) : [];
  const chord = DEFAULT_CHORDS[target];
  return [...new Set([...own, ...(chord ? [normaliseCombo(chord)] : [])])];
}

/** The shortcut shown for a target ("" when it has none). */
export function shortcutOf(target: string, user: Record<string, string>, platform: Platform): string {
  return targetBindings(target, user, platform)[0] ?? "";
}

/** Every combo in force and what it runs. */
export function allBindings(user: Record<string, string>, platform: Platform): Binding[] {
  return shortcutTargets().flatMap((target) => targetBindings(target, user, platform).map((combo) => ({ target, combo })));
}

/** The target already on a combo (another than `except`), or null. */
export function clashOf(combo: string, user: Record<string, string>, platform: Platform, except?: string): string | null {
  const id = chordId(combo);
  return allBindings(user, platform).find((b) => b.target !== except && chordId(b.combo) === id)?.target ?? null;
}
