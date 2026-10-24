export type ClassValue = string | number | false | null | undefined | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const walk = (v: ClassValue) => {
    if (!v && v !== 0) return;
    if (Array.isArray(v)) v.forEach(walk);
    else out.push(String(v));
  };
  inputs.forEach(walk);
  return out.join(" ");
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;

/** Small deterministic string hash, used to make mock service output repeatable. */
export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

let counter = 0;
/** Unique-enough id for client-side events. Never call during render. */
export function uid(prefix = "id"): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ── formatting ───────────────────────────────────────────────────────── */
const CURRENCY_RATES: Record<string, number> = { USD: 1, XCD: 2.7, EUR: 0.92, ANG: 1.79 };
const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", XCD: "EC$", EUR: "€", ANG: "ƒ" };

export function fmtMoney(usd: number, currency = "USD", compact = false): string {
  const v = usd * (CURRENCY_RATES[currency] ?? 1);
  const sym = CURRENCY_SYMBOL[currency] ?? "$";
  if (compact) {
    if (Math.abs(v) >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(2)}M`;
    if (Math.abs(v) >= 1_000) return `${sym}${Math.round(v / 1_000)}K`;
  }
  return `${sym}${Math.round(v).toLocaleString("en-US")}`;
}

export function fmtSigned(n: number, digits = 0): string {
  const s = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${n < 0 ? "−" : "+"}${s}`;
}

/** 12.5 → 12'-6" */
export function fmtFtIn(ft: number, precision = 2): string {
  const sign = ft < 0 ? "−" : "";
  const abs = Math.abs(ft);
  let feet = Math.floor(abs);
  let inches = (abs - feet) * 12;
  const p = Math.pow(10, Math.min(precision, 3));
  inches = Math.round(inches * p) / p;
  if (inches >= 12) {
    feet += 1;
    inches = 0;
  }
  const inchStr = Number.isInteger(inches) ? String(inches) : inches.toFixed(Math.min(precision, 3));
  return `${sign}${feet}'-${inchStr}"`;
}

export type MeasureSystem = "imperial" | "metric-m" | "metric-mm";

export function fmtLength(ft: number, system: MeasureSystem, precision: number): string {
  if (system === "imperial") return fmtFtIn(ft, precision);
  const m = ft * 0.3048;
  if (system === "metric-m") return `${m.toFixed(precision)} m`;
  return `${Math.round(m * 1000).toLocaleString("en-US")} mm`;
}

export function fmtCoord(ft: number, system: MeasureSystem, precision: number): string {
  if (system === "imperial") return ft.toFixed(Math.min(precision, 3));
  const m = system === "metric-m" ? ft * 0.3048 : ft * 304.8;
  return m.toFixed(system === "metric-m" ? Math.min(precision, 3) : 0);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function addDays(iso: string, days: number): Date {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function dayOffset(startIso: string, iso: string): number {
  const a = new Date(`${startIso}T00:00:00Z`).getTime();
  const b = new Date(`${iso}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export type DateFormat = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";

export function fmtDate(d: Date | string, format: DateFormat = "MM/DD/YYYY"): string {
  const date = typeof d === "string" ? new Date(`${d.slice(0, 10)}T00:00:00Z`) : d;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  if (format === "DD/MM/YYYY") return `${day}/${m}/${y}`;
  if (format === "YYYY-MM-DD") return `${y}-${m}-${day}`;
  return `${m}/${day}/${y}`;
}

export function fmtShortDate(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Fuzzy subsequence score: 0 = no match, higher is better. */
export function fuzzy(query: string, target: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = target.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 500 - t.length;
  const idx = t.indexOf(q);
  if (idx >= 0) return 300 - idx;
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    streak = found === ti ? streak + 1 : 0;
    score += 1 + streak;
    ti = found + 1;
  }
  return score;
}
