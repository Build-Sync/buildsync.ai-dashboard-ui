/**
 * components/workspace/SearchBox.tsx
 *
 * WHAT   The app-bar search box: fuzzy search over commands, settings and model elements with arrow keys, Enter
 *        to run the highlighted result and Esc to close. With no match, Enter sends the text to the command
 *        line / AI agent.
 * FOR    Reaching anything without knowing where it lives. Results come from searchAll in lib/search.ts; Ctrl+K
 *        (⌘K on a Mac) focuses the box through the workspace `searchFocus` counter.
 * OS     Enter or arrows that confirm an IME candidate (Japanese, Chinese, Korean input) are ignored
 *        (isComposingKey). Autocorrect, autocapitalise and spell-check are off so macOS and iPadOS do not
 *        rewrite command names.
 * DEBUG  - Wrong result runs: choose(idx) uses the highlighted index; hover also sets it.
 *        - The list stays open: closing relies on a pointerdown listener in the capture phase on `box`.
 *        - No results for a command or setting: the index in lib/search.ts is built from the ribbon
 *          (ribbon.config.ts), COMMANDS (lib/commands.ts) and SETTINGS_PAGES / SETTINGS_ITEMS
 *          (lib/settings-pages.ts); add it to the right list.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Kbd } from "@/components/ui/Kbd";
import { runInput } from "@/lib/commands";
import { isComposingKey } from "@/lib/platform";
import { SEARCH_SUGGESTIONS, searchAll } from "@/lib/search";
import { useWs } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";
import { useCommandCtx, useScene } from "./hooks";

/* Fuzzy search over every command, setting and element. Enter runs the top/selected result. */
export function SearchBox() {
  const ctx = useCommandCtx();
  const scene = useScene();
  const focusTick = useWs((s) => s.searchFocus);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const results = useMemo(() => (open ? searchAll(q || "", scene) : []), [q, scene, open]);
  const list = q.trim() ? results : [];

  useEffect(() => {
    if (focusTick) {
      input.current?.focus();
      input.current?.select();
    }
  }, [focusTick]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [open]);

  const choose = (i: number) => {
    const r = list[i];
    setOpen(false);
    setQ("");
    input.current?.blur();
    if (r) r.run(ctx);
    else if (q.trim()) void runInput(ctx, q);
  };

  return (
    <div ref={box} className="relative">
      <div className="flex h-6 w-52 items-center gap-1.5 rounded-md border border-line bg-app px-2 text-t2 focus-within:border-accent focus-within:text-t1">
        <Icon name="search" size={13} />
        <input
          ref={input}
          role="combobox"
          aria-expanded={open}
          aria-controls="bs-search-list"
          aria-label="Search commands and settings"
          value={q}
          placeholder="Search commands…"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (isComposingKey(e)) return; // confirming an IME candidate with Enter must not run the result
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(i + 1, Math.max(list.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(idx);
            } else if (e.key === "Escape") {
              setOpen(false);
              input.current?.blur();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[0.75rem] text-t1 outline-none placeholder:text-t3"
        />
        <Kbd combo="Ctrl+K" className="hidden xl:inline" />
      </div>
      {open && (
        <div id="bs-search-list" role="listbox" className="anim-pop absolute right-0 top-7 z-[80] w-[22rem] overflow-hidden rounded-lg border border-line bg-chrome py-1 shadow-pop">
          {q.trim() === "" ? (
            <div className="px-3 py-2">
              <p className="label-xs mb-1.5">Try</p>
              <div className="flex flex-wrap gap-1.5">
                {SEARCH_SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => { setQ(s); setIdx(0); input.current?.focus(); }} className="rounded-full border border-line px-2 py-0.5 text-[0.6875rem] text-t2 hover:border-accent hover:text-t1">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : list.length === 0 ? (
            <div className="px-3 py-3 text-[0.75rem] text-t2">
              No match. Press <span className="kbd">Enter</span> to send “{q}” to the command line / AI agent.
            </div>
          ) : (
            list.map((r, i) => (
              <button
                key={r.id}
                role="option"
                aria-selected={i === idx}
                onMouseEnter={() => setIdx(i)}
                onClick={() => choose(i)}
                className={cn("flex w-full items-center gap-2.5 px-3 py-1.5 text-left", i === idx ? "bg-accent/15" : "")}
              >
                <span className="grid size-5 shrink-0 place-items-center text-t2">
                  <Icon name={r.icon} size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.75rem] text-t1">{r.title}</span>
                  <span className="mono block truncate text-[0.625rem] text-t3">{r.subtitle}</span>
                </span>
                {i === idx && <span className="kbd">↵</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
