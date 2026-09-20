// Issue #14 / REV-62: the one thing a collapsed review panel still says. Pure, so it is unit-tested.

import type { AnalysisResult } from '../domain/analysis';
import { formatMm } from '../scoring/format';

/** Metrics panel: the group size, the number the panel exists to give. */
export function metricsLabel(result: AnalysisResult): string {
  return `Group size ${formatMm(result.all.extremeSpreadMm)} mm`;
}

/**
 * Reasons panel: how many, and the first (they are listed most serious first). `null` when there is nothing to
 * say, so the caller renders no panel at all rather than an empty collapsed one.
 */
export function reasonsLabel(messages: string[]): string | null {
  const first = messages[0];
  if (first === undefined) return null;
  return messages.length === 1 ? `1 note: ${first}` : `${messages.length} notes: ${first}`;
}

/** Diagnostics checks panel. */
export function checksLabel(summary: { pass: number; fail: number }): string {
  return `${summary.pass} pass · ${summary.fail} fail`;
}

/** Diagnostics "Your data" panel. */
export function dataLabel(counts: { sessions: number; photos: number }): string {
  const s = counts.sessions === 1 ? '1 session' : `${counts.sessions} sessions`;
  const p = counts.photos === 1 ? '1 photo' : `${counts.photos} photos`;
  return `${s} · ${p}`;
}
