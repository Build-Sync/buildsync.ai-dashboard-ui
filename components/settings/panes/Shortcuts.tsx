"use client";

import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { COMMANDS, type CommandDef } from "@/lib/commands";
import { useAppApi } from "@/lib/store/app-provider";
import { cn } from "@/lib/utils";
import { comboOf, normaliseCombo } from "@/components/workspace/useHotkeys";
import { useDraft } from "../rows";

/* Searchable table: Command | Alias | Keyboard shortcut | ✎. Buttons: Reset · Import · Export. */
export function ShortcutsPane() {
  const { s, set } = useDraft();
  const app = useAppApi();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<{ cmd: string; field: "alias" | "key" } | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const aliasOf = (d: CommandDef) => s.shortcuts.aliases[d.name] ?? d.aliases?.[0] ?? "";
  const keyOf = (d: CommandDef) => s.shortcuts.keys[d.name] ?? d.key ?? "";

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return COMMANDS.filter((d) => !t || [d.name, d.title, d.group, ...(d.aliases ?? []), s.shortcuts.aliases[d.name] ?? "", s.shortcuts.keys[d.name] ?? d.key ?? ""].some((x) => x.toLowerCase().includes(t))).sort((a, b) => Number(!!(b.aliases?.length || b.key)) - Number(!!(a.aliases?.length || a.key)) || a.name.localeCompare(b.name));
  }, [q, s.shortcuts]);

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
      const clash = COMMANDS.find((o) => o.name !== d.name && normaliseCombo(s.shortcuts.keys[o.name] ?? o.key ?? "") === normaliseCombo(combo));
      if (clash) return setError(`${combo} is already used by ${clash.name}.`);
    }
    set((x) => {
      if (combo) x.shortcuts.keys[d.name] = combo;
      else x.shortcuts.keys[d.name] = "";
    });
    setEditing(null);
  };

  const exportJson = () => {
    const eff = { aliases: Object.fromEntries(COMMANDS.map((d) => [d.name, aliasOf(d)]).filter(([, a]) => a)), keys: Object.fromEntries(COMMANDS.map((d) => [d.name, keyOf(d)]).filter(([, k]) => k)) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(eff, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "buildsync-shortcuts.json";
    a.click();
    URL.revokeObjectURL(url);
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
                      <input autoFocus className="input mono !h-6 !w-24 uppercase" value={value} aria-label={`Alias for ${d.name}`} onChange={(e) => setValue(e.target.value)} onBlur={() => setEditing(null)} onKeyDown={(e) => { if (e.key === "Enter") commitAlias(d, value); if (e.key === "Escape") { e.stopPropagation(); setEditing(null); } }} />
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
                          if (e.key === "Escape") return setEditing(null);
                          if (e.key === "Backspace" || e.key === "Delete") return commitKey(d, "");
                          const c = comboOf(e.nativeEvent);
                          if (c) commitKey(d, c);
                        }}
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        {k ? <span className="kbd">{k}</span> : <span className="text-t3">—</span>}
                        <button aria-label={`Edit shortcut for ${d.name}`} className="text-t3 hover:text-accent" onClick={() => begin(d, "key")}>
                          <Icon name="pencil" size={11} />
                        </button>
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
    </div>
  );
}
