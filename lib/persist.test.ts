/**
 * lib/persist.test.ts
 *
 * WHAT   Unit tests of saving: snapshot → store patch round trip, the saved record in (a fake) localStorage,
 *        change summaries between versions, the .bsd file format (export, parse, rejects foreign JSON), and the
 *        guarantee that every command which starts a drawing tool has a tool registered.
 * FOR    `npm test`.
 * DEBUG  - localStorage is replaced by a Map so the tests run in Node; the app never sees this shim.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { TOOL_COMMANDS } from "./commands";
import { TOOLS } from "./draw";
import type { DrawnItem } from "./draw/types";
import { RESIDENCE } from "./mock-data";
import { ago, exportBsd, parseBsd, readStored, snapshotOf, summarize, workPatch, writeStored } from "./persist";
import { DEFAULT_APPEARANCE } from "./scene/types";

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const rect = (id: string): DrawnItem => ({ id, kind: "rect", name: id, level: "level1", z: 0, pts: [[0, 0], [1, 0], [1, 1], [0, 1]], p: {}, closed: true });
const state = (drawn: DrawnItem[]) => ({
  project: RESIDENCE,
  drawn,
  xf: {},
  hidden: [],
  locked: [],
  isolated: null,
  renames: {},
  materialOverrides: {},
  colors: { ...DEFAULT_APPEARANCE },
  elColors: {},
  types: {},
  groups: {},
});

beforeEach(() => store.clear());

describe("snapshots and records", () => {
  it("round-trips the user's work and keeps the project's own version list out of the snapshot", () => {
    const work = snapshotOf(state([rect("a"), rect("b")]));
    assert.equal(work.drawn.length, 2);
    assert.equal((work.project as { versions?: unknown }).versions, undefined);
    const patch = workPatch(work, RESIDENCE);
    assert.equal(patch.drawn?.length, 2);
    assert.deepEqual(patch.project?.versions, RESIDENCE.versions);
    assert.equal(patch.project?.id, RESIDENCE.id);
  });

  it("writes and reads a record per mode and project, and ignores records of another project", () => {
    const work = snapshotOf(state([rect("a")]));
    assert.ok(writeStored("demo", RESIDENCE.id, { work, versions: [], dirty: false, savedAt: 5 }));
    assert.equal(readStored("demo", RESIDENCE.id)?.work.drawn.length, 1);
    assert.equal(readStored("app", RESIDENCE.id), null, "the app and the demo keep separate work");
    store.set("bs.work.demo.other", JSON.stringify({ work, versions: [], dirty: false, savedAt: 1 }));
    assert.equal(readStored("demo", "other"), null, "a record whose project id differs is not used");
    store.set("bs.work.demo.broken", "{not json");
    assert.equal(readStored("demo", "broken"), null);
  });

  it("refuses to store a record that is too large", () => {
    const big = { ...snapshotOf(state([])), renames: Object.fromEntries(Array.from({ length: 60000 }, (_, i) => [`k${i}`, "x".repeat(80)])) };
    assert.equal(writeStored("demo", RESIDENCE.id, { work: big, versions: [], dirty: false, savedAt: 1 }), false);
  });
});

describe("version summaries", () => {
  it("counts what was added, deleted, changed and moved", () => {
    const a = snapshotOf(state([rect("a"), rect("b")]));
    const moved = { ...rect("b"), pts: [[5, 5], [6, 5], [6, 6], [5, 6]] as [number, number][] };
    const b = { ...snapshotOf(state([moved, rect("c"), rect("d")])), xf: { "W-1": { aff: [1, 0, 0, 1, 2, 0] as [number, number, number, number, number, number], dz: 0 } } };
    assert.equal(summarize(a, b), "+2 drawn · −1 deleted · 1 changed · 1 moved");
    assert.equal(summarize(a, a), "No model changes");
    assert.equal(summarize(null, a), "+2 drawn");
    assert.equal(summarize(null, snapshotOf(state([]))), "0 drawn items");
  });

  it("describes how long ago a save was", () => {
    assert.equal(ago(1000, 1000 + 20_000), "just now");
    assert.equal(ago(0, 5 * 60_000), "5 min ago");
    assert.equal(ago(0, 3 * 3_600_000), "3 h ago");
  });
});

describe(".bsd files", () => {
  it("exports and parses the work and the saved versions", () => {
    const work = snapshotOf(state([rect("a")]));
    const text = exportBsd(work, [{ id: "v-1", label: "One", at: "", by: "You", ts: 5, snapshot: work }, { id: "seed", label: "Sample", at: "Today", by: "Team" }]);
    const parsed = parseBsd(text);
    assert.ok(parsed);
    assert.equal(parsed!.work.drawn[0].id, "a");
    assert.equal(parsed!.versions.length, 1, "sample history is not exported");
  });

  it("rejects JSON that is not a BuildSync project", () => {
    assert.equal(parseBsd("{}"), null);
    assert.equal(parseBsd("[]"), null);
    assert.equal(parseBsd("not json"), null);
    assert.equal(parseBsd(JSON.stringify({ format: "other", work: {} })), null);
  });
});

describe("tool registry", () => {
  it("has a tool for every command that starts one", () => {
    const missing = [...TOOL_COMMANDS].filter((name) => !TOOLS[name]);
    assert.deepEqual(missing, [], `commands without a tool: ${missing.join(", ")}`);
    assert.ok(TOOL_COMMANDS.size >= 70, `${TOOL_COMMANDS.size} tool commands`);
  });
});
