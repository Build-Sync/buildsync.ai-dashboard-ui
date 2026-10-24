/**
 * components/settings/panes/Shortcuts.tsx
 *
 * WHAT   Settings → Shortcuts: a searchable table of every command with its alias (what you type on the
 *        command line) and its keyboard shortcut, both editable, plus Reset / Import / Export of the
 *        customisations as JSON. Edits go through the settings draft (Apply saves, Close discards).
 * FOR    Letting users remap keys. Combos are stored in canonical form where "Ctrl" means the primary
 *        modifier (⌘ on a Mac, Ctrl elsewhere), so an exported file works on any OS; this page only changes
 *        how they are displayed and recorded (lib/shortcuts.ts).
 *
 * CROSS-PLATFORM  Shows ⌘/⌥/⇧ glyphs on a Mac and "Ctrl+Alt+Shift" text elsewhere; shows the Mac
 *        function-key note; recording uses the same matcher as the live hotkeys so what you press is what is stored.
 *
 * DEBUG  - "already used by X": clash detection compares against every binding of every command
 *          (`bindingsOf`), including alternates such as Redo's Ctrl+Shift+Z.
 *        - A recorded key shows the wrong combo: check `comboOf` and the platform passed to it.
 *        - Changes not taking effect: they only apply after the Apply button (draft semantics, rows.tsx).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { COMMANDS, type CommandDef } from "@/lib/commands";
import { isComposingKey } from "@/lib/platform";
import { saveJson } from "@/lib/save-file";
import { bindingsOf, comboOf, defaultKey, formatCombo, normaliseCombo } from "@/lib/shortcuts";
import { useAppApi } from "@/lib/store/app-provider";
import { usePlatform } from "@/lib/use-platform";
import { cn } from "@/lib/utils";
import { useDraft } from "../rows";

/* Searchable table: Command | Alias | Keyboard shortcut | ✎. Buttons: Reset · Import · Export. */
export function ShortcutsPane() {
  const { s, set } = useDraft();
  const app = useAppApi();
  const platform = usePlatform();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<{ cmd: string; field: "alias" | "key" } | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const aliasOf = (d: CommandDef) => s.shortcuts.aliases[d.name] ?? d.aliases?.[0] ?? "";
  /** canonical combo in force for this OS ("" = none) */
  const keyOf = (d: CommandDef) => s.shortcuts.keys[d.name] ?? defaultKey(d, platform);
  /** extra default combos shown as "also …" while the command is not remapped */
  const extraKeys = (d: CommandDef) => (d.name in s.shortcuts.keys ? [] : bindingsOf(d, s.shortcuts.keys, platform).filter((b) => b !== normaliseCombo(keyOf(d))));

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const label = (d: CommandDef) => {
      const k = s.shortcuts.keys[d.name] ?? defaultKey(d, platform);
      return `${k} ${formatCombo(k, platform)}`;
    };
    return COMMANDS.filter((d) => !t || [d.name, d.title, d.group, ...(d.aliases ?? []), s.shortcuts.aliases[d.name] ?? "", label(d)].some((x) => x.toLowerCase().includes(t))).sort((a, b) => Number(!!(b.aliases?.length || b.key)) - Number(!!(a.aliases?.length || a.key)) || a.name.localeCompare(b.name));
  }, [q, s.shortcuts, platform]);

  const begin = (d: CommandDef, field: "alias" | "key") => {
    setEditing({ cmd: d.name, field });
    setValue(field === "alias" ? aliasOf(d) : keyOf(d));
    setError(null);
  };

  const commitAlias = (d: CommandDef, raw: string) => {
    const v = raw.trim().toUpperCase();
    if (v && !/^[A-Z0-9]{1,8}$/.test(v)) return setError("Use 1–8 letters or digits.");
    if (v) {
      const clash = COMMANDS.find((o) => o.name !== d.name && (o.name.toUpperCase() === v || (s.shortcuts.aliases[o.name] ?? "").toUpperCase() === v || (!(o.name in s.shortcuts.aliases) && (o.aliases ?? []).some((a) => a.toUpperCase() === v))));
      if (clash) return setError(`${v} already runs ${clash.name}.`);
    }
    set((x) => {
      if (v) x.shortcuts.aliases[d.name] = v;
      else delete x.shortcuts.aliases[d.name];
    });
    setEditing(null);
  };

  const commitKey = (d: CommandDef, combo: string) => {
    if (combo) {
      const clash = COMMANDS.find((o) => o.name !== d.name && bindingsOf(o, s.shortcuts.keys, platform).includes(normaliseCombo(combo)));
      if (clash) return setError(`${formatCombo(combo, platform)} is already used by ${clash.name}.`);
    }
    set((x) => {
      if (combo) x.shortcuts.keys[d.name] = combo;
      else x.shortcuts.keys[d.name] = "";
    });
    setEditing(null);
  };

  const exportJson = () => {
    const eff = { aliases: Object.fromEntries(COMMANDS.map((d) => [d.name, aliasOf(d)]).filter(([, a]) => a)), keys: Object.fromEntries(COMMANDS.map((d) => [d.name, keyOf(d)]).filter(([, k]) => k)) };
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

  return (
    <div data-testid="pane-shortcuts">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Icon name="search" size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-t3" />
          <input className="input !pl-8" placeholder="Search commands, aliases or keys…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search shortcuts" />
        </div>
        <button className="btn" disabled={!customised} onClick={() => set((x) => ((x.shortcuts.aliases = {}), (x.shortcuts.keys = {})))}>
          <Icon name="refresh" size={13} /> Reset to defaults
        </button>
        <button className="btn" onClick={() => file.current?.click()}>
          <Icon name="upload" size={13} /> Import
        </button>
        <input ref={file} type="file" accept="application/json" className="sr-only" aria-label="Import shortcuts" onChange={(e) => e.target.files?.[0] && void importJson(e.target.files[0])} />
        <button className="btn" onClick={exportJson}>
          <Icon name="download" size={13} /> Export
        </button>
      </div>
      {error && (
        <p role="alert" className="mb-2 rounded-md bg-bad/10 px-3 py-1.5 text-[0.75rem] text-bad">
          {error}
        </p>
      )}
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-left text-[0.75rem]">
          <thead className="bg-panel-alt">
            <tr className="label-xs">
              <th className="px-3 py-2 font-semibold">Command</th>
              <th className="px-3 py-2 font-semibold">Alias</th>
              <th className="px-3 py-2 font-semibold">Keyboard shortcut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const a = aliasOf(d);
              const k = keyOf(d);
              const editA = editing?.cmd === d.name && editing.field === "alias";
              const editK = editing?.cmd === d.name && editing.field === "key";
              return (
                <tr key={d.name} className="border-t border-soft hover:bg-t1/5">
                  <td className="px-3 py-1.5">
                    <span className="mono text-t1">{d.name}</span> <span className="text-t3">{d.title}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    {editA ? (
                      <input
                        autoFocus
                        className="input mono !h-6 !w-24 uppercase"
                        value={value}
                        aria-label={`Alias for ${d.name}`}
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        onChange={(e) => setValue(e.target.value)}
                        onBlur={() => setEditing(null)}
                        onKeyDown={(e) => {
                          if (isComposingKey(e)) return;
                          if (e.key === "Enter") commitAlias(d, value);
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            setEditing(null);
                          }
                        }}
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        {a ? <span className="kbd">{a}</span> : <span className="text-t3">—</span>}
                        <button aria-label={`Edit alias for ${d.name}`} className="text-t3 hover:text-accent" onClick={() => begin(d, "alias")}>
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
                        className="input mono !h-6 !w-40"
                        value="Press the keys…"
                        aria-label={`Shortcut for ${d.name}`}
                        onBlur={() => setEditing(null)}
                        onKeyDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (isComposingKey(e)) return;
                          if (e.key === "Escape") return setEditing(null);
                          if (e.key === "Backspace" || e.key === "Delete") return commitKey(d, "");
                          const c = comboOf(e.nativeEvent, platform);
                          if (c) commitKey(d, c);
                        }}
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        {k ? (
                          <span className="kbd" data-combo={k}>
                            {formatCombo(k, platform)}
                          </span>
                        ) : (
                          <span className="text-t3">—</span>
                        )}
                        <button aria-label={`Edit shortcut for ${d.name}`} className="text-t3 hover:text-accent" onClick={() => begin(d, "key")}>
                          <Icon name="pencil" size={11} />
                        </button>
                        {extraKeys(d).map((x) => (
                          <span key={x} className="text-[0.625rem] text-t3" title="Also works">
                            or <span className="kbd">{formatCombo(x, platform)}</span>
                          </span>
                        ))}
                      </span>
                    )}
                    {(s.shortcuts.aliases[d.name] !== undefined || s.shortcuts.keys[d.name] !== undefined) && <span className={cn("ml-2 text-[0.625rem] text-accent")}>edited</span>}
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
        {rows.length} of {COMMANDS.length} commands · Type an alias in the command line, or press a shortcut in the workspace. Changes apply with the Apply button.
      </p>
      <p className="mt-1 text-[0.6875rem] text-t3" data-testid="shortcuts-os-note">
        Shortcuts use {platform === "mac" ? "⌘ (Command)" : "Ctrl"} as the main modifier, so a shortcuts file you export works on macOS, Windows and Linux.
        {platform === "mac" && " On a Mac, function keys (F1–F12) need the fn key unless “Use F1, F2, etc. keys as standard function keys” is on in System Settings → Keyboard; macOS keeps F3, F4 and F11 for itself."}
        {" "}Browsers keep Ctrl/⌘+N, +T and +W for themselves, so New also answers to the alternate shown; any command can be run from the ribbon or the command line.
      </p>
    </div>
  );
}
