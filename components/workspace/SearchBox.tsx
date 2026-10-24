"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { runInput } from "@/lib/commands";
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
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
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
        <span className="kbd hidden xl:inline">Ctrl K</span>
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
