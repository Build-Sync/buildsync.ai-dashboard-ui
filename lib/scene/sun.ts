/**
 * lib/scene/sun.ts
 *
 * WHAT   Sun position helpers: sunVector (direction towards the sun for an hour of the day, northern hemisphere
 *        about 25°N) and sunAltAz (altitude and azimuth in degrees), with PROJECT_SUN_HOUR = 15 as the project
 *        default.
 * FOR    Shadows and shading in the renderer, the Solar overlay and the sun readout in Settings → Rendering.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { clamp, rad } from "../utils";
import type { V3 } from "./types";

/** Direction towards the sun for a given hour (northern hemisphere, ~25°N). */
export function sunVector(hour: number): V3 {
  const t = clamp((hour - 6) / 12, 0, 1);
  const az = rad(90 + 180 * t);
  const alt = rad(8 + 62 * Math.sin(Math.PI * t));
  return [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)];
}

/** Hour of day used when the sun position is "project location & date". */
export const PROJECT_SUN_HOUR = 15;

/** Sun altitude and azimuth in degrees for an hour of the day. */
export function sunAltAz(hour: number): { alt: number; az: number } {
  const t = clamp((hour - 6) / 12, 0, 1);
  return { az: 90 + 180 * t, alt: 8 + 62 * Math.sin(Math.PI * t) };
}
