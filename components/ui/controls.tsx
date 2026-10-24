/**
 * components/ui/controls.tsx
 *
 * WHAT   The small reusable form and display controls: Switch, Select, Segmented (radio-style button group),
 *        Checkbox, Slider, Pill (status badge), Section (collapsible block), KV (label/value row), EmptyState,
 *        Spinner, and the AdvisoryNote footer.
 * FOR    Settings panes, palettes and dialogs, so that every screen looks and behaves the same and is keyboard-
 *        and screen-reader-accessible (roles, aria-labels).
 * DEBUG  - A Switch or Segmented value does not update: they are controlled; the parent must store onChange's
 *          value.
 *        - Select with number values: option values are stringified for the DOM and mapped back, see Select's
 *          onChange.
 *        - The advisory wording in AdvisoryNote comes from spec section 6 and must stay on every results
 *          palette.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useId, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

/** On/off toggle (role=switch). `locked` shows a padlock for values fixed by policy. */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  locked,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  /** shows a lock glyph: value is fixed by policy */
  locked?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || locked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[1.125rem] w-8 shrink-0 items-center rounded-full border transition-colors",
        checked ? "border-accent bg-accent" : "border-line bg-panel-alt",
        (disabled || locked) && "opacity-60",
      )}
    >
      <span className={cn("absolute h-3 w-3 rounded-full bg-white shadow transition-all", checked ? "left-[1.1rem]" : "left-[0.15rem] bg-t2")} />
      {locked && (
        <span className="absolute -right-5 text-t3">
          <Icon name="lock" size={11} />
        </span>
      )}
    </button>
  );
}

/** One choice of a Select or Segmented control. */
export interface Option<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

/** Native dropdown with typed values. */
export function Select<T extends string | number>({
  value,
  onChange,
  options,
  label,
  disabled,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      disabled={disabled}
      value={String(value)}
      onChange={(e) => {
        const o = options.find((x) => String(x.value) === e.target.value);
        if (o) onChange(o.value);
      }}
      className={cn("input min-w-[9rem] cursor-pointer", className)}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A group of mutually exclusive buttons (radio group), e.g. Day / Week / Month. */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-app p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded px-2.5 font-medium transition-colors disabled:opacity-35",
              size === "sm" ? "h-5 text-[0.6875rem]" : "h-6 text-[0.75rem]",
              on ? "bg-accent text-on-accent" : "text-t2 hover:text-t1",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Labelled checkbox tinted with the accent colour. */
export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn("inline-flex cursor-pointer items-center gap-2 text-[0.75rem] text-t1", disabled && "cursor-not-allowed opacity-50")}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="size-3.5 accent-[var(--accent)]" />
      {label}
    </label>
  );
}

/** Range input with a numeric read-out and optional unit suffix. */
export function Slider({ value, min, max, step = 1, onChange, label, suffix }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; suffix?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1 w-36 cursor-pointer accent-[var(--accent)]" />
      <span className="mono w-10 text-right text-[0.6875rem] text-t2">
        {value}
        {suffix}
      </span>
    </div>
  );
}

/** Small coloured status badge (ok, warn, bad, info, accent, neutral). */
export function Pill({ tone = "neutral", children, className }: { tone?: "ok" | "warn" | "bad" | "info" | "neutral" | "accent"; children: ReactNode; className?: string }) {
  const tones: Record<string, string> = {
    ok: "bg-ok/15 text-ok",
    warn: "bg-warn/15 text-warn",
    bad: "bg-bad/15 text-bad",
    info: "bg-accent/15 text-accent",
    accent: "bg-accent text-on-accent",
    neutral: "bg-t1/10 text-t2",
  };
  return <span className={cn("pill", tones[tone], className)}>{children}</span>;
}

/** Collapsible section with a title row (Properties, Cost, etc.). */
export function Section({ title, defaultOpen = true, children, right }: { title: string; defaultOpen?: boolean; children: ReactNode; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-soft">
      <div className="flex h-7 items-center pr-2">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex h-full flex-1 items-center gap-1 px-2 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-t2 hover:text-t1">
          <Icon name={open ? "chevDown" : "chevRight"} size={12} />
          {title}
        </button>
        {right}
      </div>
      {open && <div className="px-2 pb-2.5">{children}</div>}
    </section>
  );
}

/** A label on the left and a value on the right, used in property lists. */
export function KV({ k, v, mono = true }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[0.1875rem] text-[0.75rem]">
      <span className="shrink-0 text-t3">{k}</span>
      <span className={cn("min-w-0 truncate text-right text-t1", mono && "mono")} title={typeof v === "string" ? v : undefined}>
        {v}
      </span>
    </div>
  );
}

/** Centred icon, title and hint for a panel that has nothing to show yet. */
export function EmptyState({ icon, title, hint, action }: { icon: Parameters<typeof Icon>[0]["name"]; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="rounded-full bg-t1/5 p-3 text-t3">
        <Icon name={icon} size={20} />
      </span>
      <p className="text-[0.8125rem] font-medium text-t1">{title}</p>
      {hint && <p className="max-w-[16rem] text-[0.75rem] text-t2">{hint}</p>}
      {action}
    </div>
  );
}

/** Rotating loader icon. */
export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span className="inline-block animate-spin text-t2" style={{ width: size, height: size }} aria-label="Loading">
      <Icon name="loader" size={size} />
    </span>
  );
}

/** "AI-generated, unstamped" advisory footer shown wherever results appear (spec §6). */
export function AdvisoryNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-[0.6875rem] leading-snug text-t3", className)}>
      <Icon name="shieldAlert" size={12} className="mt-px shrink-0 text-warn" />
      <span>
        AI-generated, <b className="font-semibold text-t2">unstamped</b>. Advisory only. Life-safety and load-bearing items require licensed PE review and sign-off.
      </span>
    </p>
  );
}
