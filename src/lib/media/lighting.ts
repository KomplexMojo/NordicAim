/** metadata-lighting §4. Pure; no DOM. */

import type { ImageStats, LightingSuggestion } from '@/lib/domain/photo';

export interface EstimateBrightnessValueInput {
  fNumber: number | null;
  exposureTimeSec: number | null;
  iso: number | null;
}

export function estimateBrightnessValue(e: EstimateBrightnessValueInput): number | null {
  const { fNumber, exposureTimeSec, iso } = e;
  if (fNumber === null || exposureTimeSec === null || iso === null) return null;
  return Math.log2(fNumber * fNumber) + Math.log2(1 / exposureTimeSec) - Math.log2(iso / 3.125);
}

export interface SuggestLightingInput {
  bv: number | null;
  flashFired: boolean | null;
  localHour: number | null;
  stats: ImageStats | null;
}

function nightHour(h: number): boolean {
  return h >= 21 || h < 5;
}

function dayHour(h: number): boolean {
  return h >= 8 && h < 18;
}

export function suggestLighting(input: SuggestLightingInput): LightingSuggestion {
  const { bv, flashFired, localHour, stats } = input;
  const warm = stats != null && stats.brightMeanR / Math.max(stats.brightMeanB, 1) > 1.15;

  // 1
  if (bv === null && localHour === null && stats === null) {
    return { label: 'unknown', confidence: 0, reasons: ['no-signals'] };
  }

  // 2
  if (flashFired === true) {
    return { label: 'artificial', confidence: 0.7, reasons: ['flash'] };
  }

  if (bv !== null) {
    // 3a / 3b
    if (bv >= 4) {
      if (localHour !== null && nightHour(localHour)) {
        return { label: 'mixed', confidence: 0.4, reasons: ['bright', 'night-hour'] };
      }
      return { label: 'daylight', confidence: 0.9, reasons: ['bright'] };
    }
    // 3c / 3d
    if (bv < 0) {
      if (warm) return { label: 'artificial', confidence: 0.6, reasons: ['dark', 'warm-cast'] };
      return { label: 'night', confidence: 0.6, reasons: ['dark'] };
    }
    // 3e / 3f (0 <= bv < 4)
    if (warm) return { label: 'artificial', confidence: 0.6, reasons: ['dim', 'warm-cast'] };
    return { label: 'mixed', confidence: 0.4, reasons: ['dim'] };
  }

  // bv === null from here
  // 4a
  if (localHour === null) {
    if (warm) return { label: 'artificial', confidence: 0.4, reasons: ['warm-cast'] };
    return { label: 'unknown', confidence: 0, reasons: ['no-exposure'] };
  }

  // 4b
  if (dayHour(localHour)) {
    if (warm) return { label: 'mixed', confidence: 0.3, reasons: ['day-hour', 'warm-cast'] };
    return { label: 'daylight', confidence: 0.5, reasons: ['day-hour'] };
  }

  // 4c
  if (nightHour(localHour)) {
    if (warm) return { label: 'artificial', confidence: 0.5, reasons: ['night-hour', 'warm-cast'] };
    return { label: 'mixed', confidence: 0.3, reasons: ['night-hour'] };
  }

  // 4d (dawn/dusk)
  return { label: 'mixed', confidence: 0.3, reasons: ['twilight-hour'] };
}
