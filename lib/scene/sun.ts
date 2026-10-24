import { clamp, rad } from "../utils";
import type { V3 } from "./types";

/** Direction towards the sun for a given hour (northern hemisphere, ~25°N). */
export function sunVector(hour: number): V3 {
  const t = clamp((hour - 6) / 12, 0, 1);
  const az = rad(90 + 180 * t);
  const alt = rad(8 + 62 * Math.sin(Math.PI * t));
  return [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)];
}

export const PROJECT_SUN_HOUR = 15;

export function sunAltAz(hour: number): { alt: number; az: number } {
  const t = clamp((hour - 6) / 12, 0, 1);
  return { az: 90 + 180 * t, alt: 8 + 62 * Math.sin(Math.PI * t) };
}
