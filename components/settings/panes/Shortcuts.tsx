/**
 * components/settings/panes/Shortcuts.tsx
 *
 * WHAT   Settings → Shortcuts: every command and every ribbon button with its alias (what you type on the command
 *        line) and its keyboard shortcut, all changeable. Filter by ribbon tab or search by name, alias or key.
 *        Recording takes a chord of up to 4 keys pressed at once (Alt+W+N, Ctrl+Alt+Shift+K …): hold them, let go,
 *        and it is set; a chord another command uses can be moved here (that command then has none). Each row can
 *        be removed (left blank: no shortcut) or reset to its default; Clear All blanks every shortcut; Reset,
 *        Import and Export work on all of them as JSON. Edits go through the settings draft (Apply saves, Close
 *        discards).
 * FOR    Letting people use the keys they are comfortable with. Combos are stored in canonical form where "Ctrl"
 *        means the primary modifier (⌘ on a Mac, Ctrl elsewhere), so an exported file works on any OS; this page
 *        only changes how they are displayed and recorded (lib/shortcuts.ts, lib/keymap.ts).
 *
 * CROSS-PLATFORM  Shows ⌘/⌥/⇧ glyphs on a Mac and "Ctrl+Alt+Shift" text elsewhere; shows the Mac
 *        function-key note; recording uses the same chord tracker as the live hotkeys so what you press is what is
 *        stored.
 *
 * DEBUG  - "already runs X": the clash check compares chords in any key order against every binding in force
 *          (lib/keymap.ts clashOf), defaults included.
 *        - A recorded chord is refused: chordProblem in lib/shortcuts.ts says why (more than 4 keys, a bare letter,
 *          several keys with Ctrl, a combination the browser keeps).
 *        - Changes not taking effect: they only apply after the Apply button (draft semantics, rows.tsx).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { RIBBON } from "@/components/workspace/Ribbon/ribbon.config";
import { COMMANDS } from "@/lib/commands";
import { clashOf, defOfTarget, shortcutTargets, targetBindings } from "@/lib/keymap";
import { isComposingKey } from "@/lib/platform";
import { saveJson } from "@/lib/save-file";
import { ChordTracker, MAX_CHORD_KEYS, chordProblem, comboParts, formatCombo } from "@/lib/shortcuts";
import { useAppApi } from "@/lib/store/app-provider";
import { usePlatform } from "@/lib/use-platform";
import { cn } from "@/lib/utils";
import { useDraft } from "../rows";

/** Where each ribbon command sits (tab and panel) and its button's name. */
const RIBBON_PLACE: Record<string, { tab: string; tabLabel: string; panel: string; label: string }> = {};
for (const t of RIBBON) for (const p of t.panels) for (const it of p.items) RIBBON_PLACE[it.command] ??= { tab: t.id, tabLabel: t.label, panel: p.name, label: it.label };

interface Row {
  target: string;
  title: string;
  where: string;
  tab: string;
}

/* Searchable table: Command | Alias | Keyboard shortcut. Filters by tab. Buttons: Reset · Import · Export. */
export function ShortcutsPane() {
  const { s, set } = useDraft();
  const app = useAppApi();
  const platform = usePlatform();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<string>("all");
  const [editing, setEditing] = useState<{ target: string; field: "alias" | "key" } | null>(null);
  const [value, setValue] = useState("");
  const [live, setLive] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [clash, setClash] = useState<{ target: string; combo: string; other: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const tracker = useRef(new ChordTracker());
  const most = useRef("");

  const user = s.shortcuts.keys;
  const keysOf = (target: string) => targetBindings(target, user, platform);
  const aliasOf = (target: string) => {
    const d = COMMANDS.find((c) => c.name === target);
    return d ? (s.shortcuts.aliases[d.name] ?? d.aliases?.[0] ?? "") : "";
  };

  const all: Row[] = useMemo(
    () =>
      shortcutTargets().map((target) => {
        const place = RIBBON_PLACE[target];
        const def = defOfTarget(target);
        return { target, title: place?.label ?? def?.title ?? target, where: place ? `${place.tabLabel} › ${place.panel}` : (def?.group ?? ""), tab: place?.tab ?? "other" };
      }),
    [],
  );

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((r) => {
      if (tab !== "all" && r.tab !== tab) return false;
      if (!t) return true;
      const keys = keysOf(r.target);
      return [r.target, r.title, r.where, aliasOf(r.target), ...keys, ...keys.map((k) => formatCombo(k, platform))].some((x) => x.toLowerCase().includes(t));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tab, all, s.shortcuts, platform]);

  const titleOf = (target: string) => all.find((r) => r.target === target)?.title ?? target;

  const beginAlias = (target: string) => {
    setEditing({ target, field: "alias" });
    setValue(aliasOf(target));
    setError(null);
    setClash(null);
  };
  const beginKey = (target: string) => {
    setEditing({ target, field: "key" });
    tracker.current.reset();
    most.current = "";
    setLive("");
    setError(null);
    setClash(null);
  };

  const commitAlias = (target: string, raw: string) => {
    const v = raw.trim().toUpperCase();
    if (v && !/^[A-Z0-9]{1,8}$/.test(v)) return setError("Use 1–8 letters or digits.");
    if (v) {
      const other = COMMANDS.find((o) => o.name !== target && (o.name.toUpperCase() === v || (s.shortcuts.aliases[o.name] ?? "").toUpperCase() === v || (!(o.name in s.shortcuts.aliases) && (o.aliases ?? []).some((a) => a.toUpperCase() === v))));
      if (other) return setError(`${v} already runs ${other.name}.`);
    }
    set((x) => {
      if (v) x.shortcuts.aliases[target] = v;
      else delete x.shortcuts.aliases[target];
    });
    setEditing(null);
  };

  /** Set a target's shortcut ("" = none), or explain why not. */
  const commitKey = (target: string, combo: string, force = false) => {
    if (combo) {
      const problem = chordProblem(combo);
      if (problem) return setError(problem);
      const other = clashOf(combo, user, platform, target);
      if (other && !force) return setClash({ target, combo, other });
    }
    set((x) => {
      x.shortcuts.keys[target] = combo;
      // the chord moves here: the command that had it keeps no shortcut
      if (combo && force) {
        const other = clashOf(combo, x.shortcuts.keys, platform, target);
        if (other) x.shortcuts.keys[other] = "";
      }
    });
    setClash(null);
    setError(null);
    setEditing(null);
  };

  const resetRow = (target: string) =>
    set((x) => {
      delete x.shortcuts.keys[target];
      delete x.shortcuts.aliases[target];
    });

  const exportJson = () => {
    const eff = {
      aliases: Object.fromEntries(COMMANDS.map((d) => [d.name, aliasOf(d.name)]).filter(([, a]) => a)),
      keys: Object.fromEntries(all.map((r) => [r.target, keysOf(r.target)[0] ?? ""]).filter(([, k]) => k)),
    };
    saveJson("buildsync-shortcuts.json", eff);
    app.getState().toast("Shortcuts exported");
  };

  const importJson = async (f: File) => {
    try {
      const j = JSON.parse(await f.text()) as { aliases?: Record<string, string>; keys?: Record<string, string> };
      set((x) => {
        x.shortcuts.aliases = { ...(j.aliases ?? {}) };
        x.shortcuts.keys = { ...(j.keys ?? {}) };
      });
      app.getState().toast(`Imported ${Object.keys(j.aliases ?? {}).length + Object.keys(j.keys ?? {}).length} shortcuts`);
    } catch {
      app.getState().toast("That file isn't a valid shortcuts export", "bad");
    }
  };

  const customised = Object.keys(s.shortcuts.aliases).length + Object.keys(s.shortcuts.keys).length;
  const tabs = [{ id: "all", label: "All" }, ...RIBBON.map((t) => ({ id: t.id, label: t.label })), { id: "other", label: "Other" }];

  return (
    <div data-testid="pane-shortcuts">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Icon name="search" size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-t3" />
          <input className="input !pl-8" placeholder="Search commands, aliases or keys…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search Shortcuts" />
        </div>
        <button className="btn" disabled={!customised} onClick={() => set((x) => ((x.shortcuts.aliases = {}), (x.shortcuts.keys = {})))}>
          <Icon name="refresh" size={13} /> Reset to Defaults
        </button>
        <button
          className="btn"
          data-testid="sc-clear-all"
          onClick={() => {
            if (!window.confirm("Remove every keyboard shortcut? They stay blank until you record new ones or reset them.")) return;
            set((x) => {
              x.shortcuts.keys = Object.fromEntries(all.map((r) => [r.target, ""]));
            });
          }}
        >
          <Icon name="trash" size={13} /> Clear All
        </button>
        <button className="btn" onClick={() => file.current?.click()}>
          <Icon name="upload" size={13} /> Import
        </button>
        <input ref={file} type="file" accept="application/json" className="sr-only" aria-label="Import Shortcuts" onChange={(e) => e.target.files?.[0] && void importJson(e.target.files[0])} />
        <button className="btn" onClick={exportJson}>
          <Icon name="download" size={13} /> Export
        </button>
      </div>
      <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label="Shortcut Groups">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`sc-tab-${t.id}`} className={cn("rounded-full border px-2.5 py-0.5 text-[0.6875rem]", tab === t.id ? "border-accent bg-accent/15 text-t1" : "border-line text-t2 hover:text-t1")}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="mb-2 text-[0.6875rem] text-t3">
        A shortcut is up to {MAX_CHORD_KEYS} keys pressed together: press Record, hold the keys (for example {formatCombo("Alt+W+N", platform)} or {formatCombo("Ctrl+Alt+Shift+K", platform)}), then let go; Esc cancels. Remove (or Backspace while recording) leaves a command with no shortcut; reset brings back its default.
      </p>
      {error && (
        <p role="alert" className="mb-2 rounded-md bg-bad/10 px-3 py-1.5 text-[0.75rem] text-bad" data-testid="sc-error">
          {error}
        </p>
      )}
      {clash && (
        <div role="alert" className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-1.5 text-[0.75rem] text-t1" data-testid="sc-clash">
          <span className="flex-1">
            <span className="kbd">{formatCombo(clash.combo, platform)}</span> already runs <b>{titleOf(clash.other)}</b> ({clash.other}).
          </span>
          <button className="btn !h-6 !text-[0.6875rem]" onClick={() => commitKey(clash.target, clash.combo, true)} data-testid="sc-take">
            Use it here (remove it from {titleOf(clash.other)})
          </button>
          <button className="btn !h-6 !text-[0.6875rem]" onClick={() => setClash(null)}>
            Cancel
          </button>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-left text-[0.75rem]">
          <thead className="bg-panel-alt">
            <tr className="label-xs">
              <th className="px-3 py-2 font-semibold">Command</th>
              <th className="px-3 py-2 font-semibold">Alias</th>
              <th className="px-3 py-2 font-semibold">Keyboard Shortcut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isCommand = COMMANDS.some((d) => d.name === r.target);
              const a = aliasOf(r.target);
              const keys = keysOf(r.target);
              const editA = editing?.target === r.target && editing.field === "alias";
              const editK = editing?.target === r.target && editing.field === "key";
              const edited = s.shortcuts.aliases[r.target] !== undefined || s.shortcuts.keys[r.target] !== undefined;
              return (
                <tr key={r.target} className="border-t border-soft hover:bg-t1/5" data-testid={`sc-row-${r.target}`}>
                  <td className="px-3 py-1.5">
                    <span className="text-t1">{r.title}</span> <span className="mono text-[0.6875rem] text-t3">{r.target}</span>
                    {r.where && <div className="text-[0.625rem] text-t3">{r.where}</div>}
                  </td>
                  <td className="px-3 py-1.5">
                    {!isCommand ? (
                      <span className="text-t3">—</span>
                    ) : editA ? (
                      <input
                        autoFocus
                        className="input mono !h-6 !w-24 uppercase"
                        value={value}
                        aria-label={`Alias for ${r.target}`}
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        onChange={(e) => setValue(e.target.value)}
                        onBlur={() => setEditing(null)}
                        onKeyDown={(e) => {
                          if (isComposingKey(e)) return;
                          if (e.key === "Enter") commitAlias(r.target, value);
                          if (e.key === "Escape") {
                            // cancel the edit only: Settings stays open (SettingsFrame skips a handled Esc)
                            e.preventDefault();
                            e.stopPropagation();
                            setEditing(null);
                          }
                        }}
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        {a ? <span className="kbd">{a}</span> : <span className="text-t3">—</span>}
                        <button aria-label={`Edit alias for ${r.target}`} className="text-t3 hover:text-accent" onClick={() => beginAlias(r.target)}>
                          <Icon name="pencil" size={11} />
                        </button>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {editK ? (
                      <input
                        autoFocus
                        readOnly
                        className="input mono !h-6 !w-48 border-accent"
                        value={live ? formatCombo(live, platform) : "Hold the keys, then let go…"}
                        aria-label={`Shortcut for ${r.target}`}
                        data-testid="sc-recorder"
                        onBlur={() => setEditing(null)}
                        onKeyDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (isComposingKey(e)) return;
                          const now = tracker.current.down(e.nativeEvent, platform);
                          const { mods, keys: held } = comboParts(now);
                          if (!mods.length && held.length === 1 && held[0] === "Esc") return setEditing(null);
                          if (!mods.length && held.length === 1 && (held[0] === "Backspace" || held[0] === "Delete")) return commitKey(r.target, "");
                          if (!now) return;
                          // keep the largest chord seen while the keys are down
                          if (comboParts(now).keys.length + comboParts(now).mods.length >= comboParts(most.current).keys.length + comboParts(most.current).mods.length) most.current = now;
                          setLive(most.current);
                        }}
                        onKeyUp={(e) => {
                          e.preventDefault();
                          tracker.current.up(e.nativeEvent);
                          if (!tracker.current.count && most.current) {
                            const combo = most.current;
                            most.current = "";
                            commitKey(r.target, combo);
                          }
                        }}
                      />
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {keys[0] ? (
                          <span className="kbd" data-combo={keys[0]}>
                            {formatCombo(keys[0], platform)}
                          </span>
                        ) : (
                          <span className="text-t3">—</span>
                        )}
                        <button aria-label={`Record shortcut for ${r.target}`} className="inline-flex items-center gap-0.5 text-[0.6875rem] text-t3 hover:text-accent" onClick={() => beginKey(r.target)} data-testid={`sc-record-${r.target}`}>
                          <Icon name="pencil" size={11} /> Record
                        </button>
                        {keys.length > 0 && (
                          <button aria-label={`Remove shortcut for ${r.target}`} className="inline-flex items-center gap-0.5 text-[0.6875rem] text-t3 hover:text-bad" onClick={() => commitKey(r.target, "")} data-testid={`sc-remove-${r.target}`} title="Remove: leave it with no shortcut">
                            <Icon name="close" size={11} /> Remove
                          </button>
                        )}
                        {keys.slice(1).map((x) => (
                          <span key={x} className="text-[0.625rem] text-t3" title="Also Works">
                            or <span className="kbd">{formatCombo(x, platform)}</span>
                          </span>
                        ))}
                      </span>
                    )}
                    {edited && (
                      <button className="ml-2 text-[0.625rem] text-accent hover:underline" onClick={() => resetRow(r.target)} data-testid={`sc-reset-${r.target}`}>
                        edited · reset
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-t3">
                  No command matches “{q}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[0.6875rem] text-t3">
        {rows.length} of {all.length} commands · Type an alias in the command line, or press a shortcut in the workspace (Alt chords also work while typing in the command line). Changes apply with the Apply button.
      </p>
      <p className="mt-1 text-[0.6875rem] text-t3" data-testid="shortcuts-os-note">
        Shortcuts use {platform === "mac" ? "⌘ (Command)" : "Ctrl"} as the main modifier, so a shortcuts file you export works on macOS, Windows and Linux.
        {platform === "mac" && " On a Mac, function keys (F1–F12) need the fn key unless “Use F1, F2, etc. keys as standard function keys” is on in System Settings → Keyboard; macOS keeps F3, F4 and F11 for itself. ⌘ takes one key in a chord (macOS does not report the others); use ⌥ or ⇧ for chords of several keys."}
        {" "}Browsers keep Ctrl/⌘+N, +T and +W for themselves, so New also answers to the alternate shown; any command can be run from the ribbon or the command line.
      </p>
    </div>
  );
}
