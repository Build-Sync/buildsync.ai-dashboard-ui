/**
 * lib/draw/fixtures.ts
 *
 * WHAT   The MEP fixture catalogue: about forty-five pieces that light, power, plumb and cool a house, each built from
 *        parts (lib/draw/parts.ts) so it has a real shape in 3D:
 *        - electrical: switches (single, 3-way, dimmer), outlets (duplex, GFCI, 240 V), lights (ceiling, recessed,
 *          pendant, sconce, outdoor), ceiling and exhaust fans, smoke detector, thermostat, panel, meter, solar
 *          inverter, battery, EV charger, generator;
 *        - plumbing: toilet, vanities, pedestal sink, kitchen sink, faucet, bathtub, freestanding tub, shower, water
 *          heater (tank and tankless), washer box, utility sink, hose bib, floor drain, the water supply and the drain
 *          stack;
 *        - HVAC: AC condenser, mini-split (indoor and outdoor), air handler, supply diffuser, return grille.
 *        Each says how it mounts (wall, ceiling, floor, counter) and at what height, the plan symbol it draws with
 *        (electrical devices), where wires or pipes connect to it (`port`), what it needs (power, hot and cold
 *        water, a drain) and what it is in a circuit (a switch, a light, an outlet, a source of power or water).
 *        Wall pieces have their back on the y = 0 line and face -y, so the tools set them against a wall.
 * FOR    The fixture tools (ELEC, PLUMB, HVAC, FIXT, EQUIP and LIGHT, SWITCH, SINK … in lib/draw/tools.ts), the
 *        composer (lib/draw/compose.ts: shapes, plan symbols, the ports wires and pipes connect to), WIRE and
 *        PIPECONNECT, and the Library.
 * DEBUG  - A fixture floats: `base` is its height above the floor for wall and counter pieces; ceiling pieces hang
 *          from the ceiling (their top at the storey height).
 *        - A pipe or wire ends in the wrong spot: `port` is measured up from the piece's base, at its origin (the
 *          back centre of a wall piece).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { Category, Device } from "../scene/types";
import type { LayerId } from "../types";
import { box, disc, legs, measure, oval, place, ring, type Part, type Piece } from "./parts";

/** The groups the catalogue is shown in. */
export const FIXTURE_GROUPS = ["Lights", "Switches & outlets", "Fans & controls", "Power & solar", "Bath", "Kitchen & laundry", "Water", "HVAC"] as const;
/** One group of the catalogue. */
export type FixtureGroup = (typeof FIXTURE_GROUPS)[number];
/** The building system a fixture belongs to. */
export type FixtureSystem = "electrical" | "plumbing" | "hvac";
/** What a fixture is in a circuit or a plumbing system. */
export type FixtureRole = "switch" | "light" | "outlet" | "load" | "panel" | "source" | "control" | "fixture" | "heater" | "supply" | "sewer" | "hvac";
/** Where a fixture is fixed. */
export type Mount = "floor" | "wall" | "ceiling" | "counter";

/** A fixture: a piece with what it is, how it mounts and connects. */
export interface Fixture extends Piece<FixtureGroup> {
  system: FixtureSystem;
  role: FixtureRole;
  mount: Mount;
  /** height of its base above the floor (wall, counter and floor pieces); ceiling pieces hang from the ceiling */
  base: number;
  /** stands against a wall: the tool sets its back on the nearest wall */
  againstWall: boolean;
  /** the symbol drawn on the plan (electrical devices) instead of its small outline */
  symbol?: Device["shape"];
  /** where wires and pipes connect, above its base, at its origin */
  port: number;
  /** what it takes */
  needs: { power?: boolean; hot?: boolean; cold?: boolean; drain?: boolean };
  layer: LayerId;
  category: Category;
}

type Spec = Omit<Fixture, "id" | "label" | "group" | "w" | "d" | "h" | "parts">;
const fx = (id: string, label: string, group: FixtureGroup, spec: Spec, parts: Part[]): Fixture => ({ id, label, group, ...measure(parts), parts, ...spec });

const ELEC = { system: "electrical", layer: "electrical", category: "Device" } as const;
const PLUMB = { system: "plumbing", layer: "furniture", category: "Fixture" } as const;
const WATER = { system: "plumbing", layer: "plumbing", category: "Fixture" } as const;
const AIR = { system: "hvac", layer: "hvac", category: "Equipment" } as const;
const wall = (base: number, port: number, needs: Spec["needs"] = { power: true }) => ({ mount: "wall" as const, base, againstWall: true, port, needs });
const ceiling = (port = 0, needs: Spec["needs"] = { power: true }) => ({ mount: "ceiling" as const, base: 0, againstWall: false, port, needs });
const floor = (againstWall: boolean, port: number, needs: Spec["needs"]) => ({ mount: "floor" as const, base: 0, againstWall, port, needs });

/* ── shared shapes ────────────────────────────────────────────────────── */
/** A wall plate w × h, 0.03 ft proud of the wall. */
const plate = (w: number, h: number): Part => box(-w / 2, -0.03, w / 2, 0, 0, h, "plastic");
/** A faucet whose base is at (x, y) and height z0, with its spout reaching `reach` towards -y. */
const faucet = (x: number, y: number, z0: number, reach = 0.4, tall = 0.5): Part[] => [
  box(x - 0.05, y - 0.05, x + 0.05, y + 0.05, z0, z0 + tall, "chrome"),
  box(x - 0.04, y - reach, x + 0.04, y + 0.03, z0 + tall - 0.08, z0 + tall, "chrome"),
  box(x + 0.06, y - 0.03, x + 0.2, y + 0.03, z0 + tall * 0.55, z0 + tall * 0.65, "chrome"),
];
/** A base cabinet run w wide and d deep with a counter on top (back on y = 0). */
const cabinet = (w: number, d: number, top = 2.92): Part[] => [
  box(-w / 2 + 0.05, -d + 0.3, w / 2 - 0.05, 0, 0, 0.35, "darkwood"),
  box(-w / 2, -d + 0.08, w / 2, 0, 0.35, top - 0.12, "wood"),
  box(-w / 2 - 0.05, -d - 0.05, w / 2 + 0.05, 0, top - 0.12, top, "stone"),
];
/** A rectangular tub's rim around a floor (back on y = 0), w × d, rim height h. */
const tubShell = (w: number, d: number, h: number, t = 0.28): Part[] => [
  box(-w / 2, -d, w / 2, -d + t, 0, h, "porcelain"),
  box(-w / 2, -t, w / 2, 0, 0, h, "porcelain"),
  box(-w / 2, -d + t, -w / 2 + t, -t, 0, h, "porcelain"),
  box(w / 2 - t, -d + t, w / 2, -t, 0, h, "porcelain"),
  box(-w / 2 + t, -d + t, w / 2 - t, -t, 0, 0.3, "porcelain"),
];

/* ── the catalogue ────────────────────────────────────────────────────── */
const LIST: Fixture[] = [
  // lights (ceiling pieces hang from the ceiling: their top is at the storey height)
  fx("ceilinglight", "Ceiling light", "Lights", { ...ELEC, role: "light", symbol: "light", ...ceiling(0.4) }, [disc(0, 0, 0.5, 0.3, 0.4, "metal", 16), disc(0, 0, 0.6, 0, 0.3, "lamp", 16)]),
  fx("recessed", "Recessed light (can)", "Lights", { ...ELEC, role: "light", symbol: "recessed", ...ceiling(0.05) }, [disc(0, 0, 0.42, 0.02, 0.05, "plastic", 16), disc(0, 0, 0.3, 0, 0.02, "lamp", 16)]),
  fx("pendant", "Pendant light", "Lights", { ...ELEC, role: "light", symbol: "pendant", ...ceiling(3) }, [box(-0.02, -0.02, 0.02, 0.02, 0.75, 3, "metal"), disc(0, 0, 0.55, 0.15, 0.75, "metal", 14), disc(0, 0, 0.25, 0, 0.15, "lamp", 10)]),
  fx("sconce", "Wall sconce", "Lights", { ...ELEC, role: "light", symbol: "sconce", ...wall(5.6, 0.3) }, [box(-0.15, -0.05, 0.15, 0, 0, 0.5, "metal"), box(-0.25, -0.42, 0.25, -0.05, 0.05, 0.6, "lamp")]),
  fx("outdoorlight", "Outdoor wall light", "Lights", { ...ELEC, role: "light", symbol: "sconce", ...wall(7, 0.3) }, [box(-0.35, -0.45, 0.35, 0, 0, 0.6, "metal"), box(-0.25, -0.47, 0.25, -0.45, 0.1, 0.45, "lamp")]),
  // switches and outlets
  fx("switch", "Light switch", "Switches & outlets", { ...ELEC, role: "switch", symbol: "switch", ...wall(3.8, 0.19) }, [plate(0.24, 0.38), box(-0.02, -0.06, 0.02, -0.03, 0.15, 0.23, "plastic")]),
  fx("switch3", "3-way switch", "Switches & outlets", { ...ELEC, role: "switch", symbol: "switch3", ...wall(3.8, 0.19) }, [plate(0.24, 0.38), box(-0.03, -0.06, 0.03, -0.03, 0.14, 0.24, "plastic")]),
  fx("dimmer", "Dimmer switch", "Switches & outlets", { ...ELEC, role: "switch", symbol: "dimmer", ...wall(3.8, 0.19) }, [plate(0.24, 0.38), box(-0.03, -0.05, 0.03, -0.03, 0.05, 0.33, "plastic")]),
  fx("outlet", "Outlet (duplex)", "Switches & outlets", { ...ELEC, role: "outlet", symbol: "outlet", ...wall(1.05, 0.19) }, [plate(0.24, 0.38), box(-0.07, -0.05, 0.07, -0.03, 0.05, 0.15, "plastic"), box(-0.07, -0.05, 0.07, -0.03, 0.23, 0.33, "plastic")]),
  fx("gfci", "GFCI outlet (kitchen, bath, outdoors)", "Switches & outlets", { ...ELEC, role: "outlet", symbol: "gfci", ...wall(3.45, 0.19) }, [plate(0.24, 0.38), box(-0.08, -0.05, 0.08, -0.03, 0.07, 0.31, "plastic"), box(-0.03, -0.06, 0.03, -0.05, 0.17, 0.21, "signRed")]),
  fx("outlet240", "240 V outlet (range, dryer)", "Switches & outlets", { ...ELEC, role: "outlet", symbol: "outlet240", ...wall(1.05, 0.22) }, [plate(0.34, 0.45), box(-0.1, -0.06, 0.1, -0.03, 0.12, 0.33, "screen")]),
  // fans and controls
  fx("ceilingfan", "Ceiling fan with light", "Fans & controls", { ...ELEC, role: "light", symbol: "fan", ...ceiling(1.2) }, [
    disc(0, 0, 0.25, 1.05, 1.2, "metal", 12),
    box(-0.04, -0.04, 0.04, 0.04, 0.6, 1.05, "metal"),
    disc(0, 0, 0.45, 0.32, 0.6, "metal", 14),
    ...[0, 72, 144, 216, 288].flatMap((a) => place([box(0.4, -0.22, 2.15, 0.22, 0.42, 0.47, "fan")], a)),
    disc(0, 0, 0.3, 0.05, 0.32, "lamp", 12),
  ]),
  fx("exhaustfan", "Exhaust fan (bath)", "Fans & controls", { ...ELEC, role: "load", symbol: "exhaust", ...ceiling(0.06) }, [box(-0.45, -0.45, 0.45, 0.45, 0.02, 0.06, "plastic"), ...[-0.25, -0.08, 0.09, 0.26].map((y) => box(-0.35, y - 0.03, 0.35, y + 0.03, 0, 0.02, "screen"))]),
  fx("smoke", "Smoke / CO detector", "Fans & controls", { ...ELEC, role: "load", symbol: "smoke", ...ceiling(0.15) }, [disc(0, 0, 0.3, 0, 0.15, "plastic", 14), disc(0, 0, 0.06, -0.01, 0, "signRed", 6)]),
  fx("thermostat", "Thermostat", "Fans & controls", { ...ELEC, role: "control", symbol: "thermostat", ...wall(4.8, 0.15) }, [box(-0.2, -0.08, 0.2, 0, 0, 0.3, "plastic"), box(-0.12, -0.085, 0.12, -0.08, 0.08, 0.22, "screen")]),
  // power and solar
  fx("panel", "Electrical panel (200 A)", "Power & solar", { ...ELEC, role: "panel", symbol: "panel", ...wall(3.6, 1.3) }, [box(-0.7, -0.33, 0.7, 0, 0, 2.6, "metal"), box(-0.01, -0.34, 0.01, -0.33, 0.1, 2.5, "screen")]),
  fx("meter", "Utility meter", "Power & solar", { ...ELEC, role: "source", symbol: "meter", ...wall(4, 0.5) }, [box(-0.35, -0.35, 0.35, 0, 0, 1.1, "metal"), box(-0.25, -0.5, 0.25, -0.35, 0.35, 0.85, "glass")]),
  fx("inverter", "Solar inverter", "Power & solar", { ...ELEC, role: "source", symbol: "inverter", ...wall(3.5, 1.1) }, [box(-0.7, -0.6, 0.7, 0, 0, 2.2, "metal"), box(-0.3, -0.61, 0.3, -0.6, 1.4, 1.8, "screen")]),
  fx("battery", "Home battery", "Power & solar", { ...ELEC, role: "source", symbol: "battery", ...floor(true, 1.9, { power: true }) }, [box(-1.25, -0.55, 1.25, 0, 0, 3.8, "plastic"), box(-0.2, -0.56, 0.2, -0.55, 3.2, 3.4, "lamp")]),
  fx("evcharger", "EV charger", "Power & solar", { ...ELEC, role: "load", symbol: "ev", ...wall(3.4, 0.6) }, [box(-0.4, -0.35, 0.4, 0, 0, 1.2, "plastic"), box(-0.3, -0.5, 0.3, -0.35, 0.2, 0.6, "screen")]),
  fx("generator", "Standby generator", "Power & solar", { ...ELEC, role: "source", symbol: "generator", ...floor(false, 1.3, { power: true }) }, [box(-2.2, -1.4, 2.2, 1.4, 0, 0.33, "concrete"), box(-2, -1.25, 2, 1.25, 0.33, 2.9, "appliance")]),
  // bath
  fx("toilet", "Toilet", "Bath", { ...PLUMB, role: "fixture", ...floor(true, 0.6, { cold: true, drain: true }) }, [
    box(-0.8, -0.55, 0.8, 0, 1.15, 2.45, "porcelain"),
    box(-0.83, -0.58, 0.83, 0.02, 2.45, 2.53, "porcelain"),
    oval(0, -1.45, 0.62, 0.85, 0, 1.25, "porcelain", 18),
    oval(0, -1.45, 0.66, 0.9, 1.25, 1.32, "plastic", 18),
  ]),
  fx("vanity", "Bathroom vanity and sink (36 in)", "Bath", { ...PLUMB, role: "fixture", ...floor(true, 1.6, { hot: true, cold: true, drain: true }) }, [...cabinet(3, 1.75, 2.75), oval(0, -0.95, 0.65, 0.48, 2.75, 2.78, "porcelain", 18), ...faucet(0, -0.22, 2.75, 0.4, 0.55)]),
  fx("doublevanity", "Double vanity (60 in)", "Bath", { ...PLUMB, role: "fixture", ...floor(true, 1.6, { hot: true, cold: true, drain: true }) }, [...cabinet(5, 1.75, 2.75), ...[-1.2, 1.2].flatMap((x) => [oval(x, -0.95, 0.6, 0.46, 2.75, 2.78, "porcelain", 18), ...faucet(x, -0.22, 2.75, 0.4, 0.55)])]),
  fx("pedestalsink", "Pedestal sink", "Bath", { ...PLUMB, role: "fixture", ...floor(true, 1.6, { hot: true, cold: true, drain: true }) }, [oval(0, -0.7, 0.35, 0.3, 0, 2.5, "porcelain", 14), oval(0, -0.9, 0.95, 0.75, 2.5, 2.85, "porcelain", 18), ...faucet(0, -0.25, 2.85, 0.35, 0.45)]),
  fx("bathtub", "Bathtub (60 × 30)", "Bath", { ...PLUMB, role: "fixture", ...floor(true, 0.4, { hot: true, cold: true, drain: true }) }, [...tubShell(5, 2.5, 1.7), ...place(faucet(0, 0, 1.45, 0.45, 0.3), 90, -2.25, -1.25)]),
  fx("freestandingtub", "Freestanding tub", "Bath", { ...PLUMB, role: "fixture", ...floor(false, 0.4, { hot: true, cold: true, drain: true }) }, [
    ...ring(oval(0, 0, 2.45, 1.2, 0, 1, "porcelain", 24).poly, oval(0, 0, 2.75, 1.5, 0, 1, "porcelain", 24).poly, 0.3, 2, "porcelain"),
    oval(0, 0, 2.45, 1.2, 0.3, 0.55, "porcelain", 24),
    ...[[-2, -0.9], [2, -0.9], [-2, 0.9], [2, 0.9]].map(([x, y]) => disc(x, y, 0.15, 0, 0.3, "chrome", 8)),
    ...faucet(2.95, 0, 0, 0.5, 2.6),
  ]),
  fx("shower", "Shower (36 × 36, glass)", "Bath", { ...PLUMB, role: "fixture", ...floor(true, 3.75, { hot: true, cold: true, drain: true }) }, [
    box(-1.5, -3, 1.5, 0, 0, 0.25, "porcelain"),
    { ...box(-1.5, -3, 1.5, -2.95, 0.25, 6.6, "glass"), glass: true },
    { ...box(-1.5, -2.95, -1.45, -0.05, 0.25, 6.6, "glass"), glass: true },
    box(-0.08, -0.45, 0.08, -0.05, 6.35, 6.5, "chrome"),
    box(-0.12, -0.05, 0.12, 0, 3.55, 3.95, "chrome"),
    disc(0, -1.5, 0.15, 0.25, 0.27, "chrome", 8),
  ]),
  // kitchen and laundry
  fx("kitchensink", "Kitchen sink (double bowl)", "Kitchen & laundry", { ...PLUMB, role: "fixture", ...floor(true, 1.6, { hot: true, cold: true, drain: true }) }, [
    ...cabinet(3, 2),
    box(-1.3, -1.65, -0.05, -0.35, 2.92, 2.95, "chrome"),
    box(0.05, -1.65, 1.3, -0.35, 2.92, 2.95, "chrome"),
    box(-0.05, -0.28, 0.05, -0.12, 2.95, 4.1, "chrome"),
    box(-0.04, -0.95, 0.04, -0.12, 3.95, 4.05, "chrome"),
  ]),
  fx("faucet", "Faucet", "Kitchen & laundry", { ...PLUMB, role: "fixture", mount: "counter", base: 2.92, againstWall: false, port: 0, needs: { hot: true, cold: true } }, [disc(0, 0, 0.13, 0, 0.05, "chrome", 10), ...faucet(0, 0, 0.05, 0.5, 0.65)]),
  fx("utilitysink", "Utility sink (laundry tub)", "Kitchen & laundry", { ...PLUMB, role: "fixture", ...floor(true, 1.6, { hot: true, cold: true, drain: true }) }, [...legs(2, 1.9, 0.05, 0.15, 2.3, "plastic"), ...tubShell(2, 1.9, 0.6, 0.12).map((p) => ({ ...p, z0: p.z0 + 2.3, z1: p.z1 + 2.3, look: "plastic" as const })), ...faucet(0, -0.1, 2.9, 0.5, 0.5)]),
  fx("washerbox", "Washer box (valves and drain)", "Kitchen & laundry", { ...PLUMB, role: "fixture", ...wall(3.4, 0.4, { hot: true, cold: true, drain: true }) }, [box(-0.45, -0.12, 0.45, 0, 0, 0.8, "plastic"), box(-0.3, -0.18, -0.2, -0.12, 0.45, 0.6, "signRed"), box(0.2, -0.18, 0.3, -0.12, 0.45, 0.6, "water"), disc(0, -0.06, 0.1, 0.1, 0.25, "screen", 8)]),
  // water heating, supply and drains
  fx("waterheater", "Water heater (50 gal tank)", "Water", { ...WATER, role: "heater", ...floor(true, 4.5, { cold: true, power: true }) }, [disc(0, -1.05, 1, 0, 5, "appliance", 18), disc(0, -1.05, 0.3, 5, 5.25, "chrome", 10), box(0.6, -1.15, 0.85, -0.95, 4.2, 4.5, "chrome")]),
  fx("tankless", "Tankless water heater", "Water", { ...WATER, role: "heater", ...wall(4, 0.2, { cold: true, power: true }) }, [box(-0.6, -0.45, 0.6, 0, 0, 2.2, "appliance"), box(-0.2, -0.46, 0.2, -0.45, 1.4, 1.7, "screen")]),
  fx("hosebib", "Hose bib (outdoor faucet)", "Water", { ...WATER, role: "fixture", ...wall(1.5, 0.1, { cold: true }) }, [box(-0.08, -0.25, 0.08, 0, 0, 0.2, "chrome"), disc(0, -0.12, 0.12, 0.2, 0.25, "chrome", 8)]),
  fx("floordrain", "Floor drain", "Water", { ...WATER, role: "fixture", ...floor(false, 0, { drain: true }) }, [disc(0, 0, 0.35, 0, 0.02, "chrome", 12), ...[-0.15, 0, 0.15].map((y) => box(-0.22, y - 0.03, 0.22, y + 0.03, 0.02, 0.03, "screen"))]),
  fx("watermain", "Water supply (meter and main)", "Water", { ...WATER, role: "supply", ...floor(false, 1, { }) }, [box(-0.6, -0.6, 0.6, 0.6, 0, 0.15, "concrete"), disc(0, 0, 0.1, 0.15, 1.2, "chrome", 8)]),
  fx("stack", "Drain stack / sewer line", "Water", { ...WATER, role: "sewer", ...floor(false, 0.3, {}) }, [disc(0, 0, 0.25, 0, 1, "plastic", 12), disc(0, 0, 0.28, 1, 1.12, "chrome", 12)]),
  // HVAC
  fx("condenser", "AC condenser (outdoor unit)", "HVAC", { ...AIR, role: "hvac", ...floor(false, 1.5, { power: true }) }, [box(-1.6, -1.6, 1.6, 1.6, 0, 0.33, "concrete"), box(-1.4, -1.4, 1.4, 1.4, 0.33, 3.1, "appliance"), disc(0, 0, 1.1, 3.1, 3.15, "screen", 16), disc(0, 0, 0.45, 3.15, 3.2, "metal", 12)]),
  fx("minisplit", "Mini-split (indoor wall unit)", "HVAC", { ...AIR, role: "hvac", ...wall(7, 0.5, { power: true }) }, [box(-1.35, -0.7, 1.35, 0, 0, 1, "plastic"), box(-1.2, -0.72, 1.2, -0.7, 0.1, 0.3, "screen")]),
  fx("minisplitout", "Mini-split (outdoor unit)", "HVAC", { ...AIR, role: "hvac", ...floor(true, 1.2, { power: true }) }, [box(-1.3, -1.1, 1.3, 0, 0.4, 2.3, "appliance"), box(-0.6, -1.12, 0.4, -1.1, 0.6, 2, "screen"), box(-1.2, -1.1, -1, 0, 0, 0.4, "metal"), box(1, -1.1, 1.2, 0, 0, 0.4, "metal")]),
  fx("airhandler", "Air handler", "HVAC", { ...AIR, role: "hvac", ...floor(true, 2, { power: true }) }, [box(-1, -2, 1, 0, 0, 4.5, "metal"), box(-0.8, -2.01, 0.8, -2, 0.4, 1.6, "screen")]),
  fx("diffuser", "Supply diffuser (ceiling)", "HVAC", { ...AIR, role: "hvac", ...ceiling(0.1, {}) }, [box(-0.5, -0.5, 0.5, 0.5, 0.02, 0.1, "plastic"), box(-0.3, -0.3, 0.3, 0.3, 0, 0.02, "screen")]),
  fx("returngrille", "Return grille", "HVAC", { ...AIR, role: "hvac", ...wall(0.8, 0.5, {}) }, [box(-1, -0.08, 1, 0, 0, 1, "plastic"), ...[0.2, 0.4, 0.6, 0.8].map((z) => box(-0.9, -0.1, 0.9, -0.08, z - 0.03, z + 0.03, "screen"))]),
];

/** Every fixture by id. */
export const FIXTURES: Record<string, Fixture> = Object.fromEntries(LIST.map((f) => [f.id, f]));
/** Fixture ids in catalogue order. */
export const FIXTURE_IDS: string[] = LIST.map((f) => f.id);

/** Fixtures drawn before the catalogue (plain boxes) map onto these. */
const LEGACY: Record<string, string> = { sink: "vanity", ahu: "airhandler", heater: "waterheater" };

/** The fixture for a type id (catalogue or older box type), or null. */
export function fixtureOf(type: string): Fixture | null {
  return FIXTURES[type] ?? FIXTURES[LEGACY[type] ?? ""] ?? null;
}

/** The fixtures of one system (or all). */
export function fixturesOf(system?: FixtureSystem): Fixture[] {
  return LIST.filter((f) => !system || f.system === system);
}

/** Height of a fixture's base above the floor, given the storey's ceiling height (ceiling pieces hang from it). */
export function fixtureBase(f: Fixture, ceiling: number): number {
  return f.mount === "ceiling" ? ceiling - f.h : f.base;
}
