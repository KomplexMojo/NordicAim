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

/**
 * Observed patterns' `outsideShare` row: the share of shots that would miss the biathlon hit zone for the position
 * (`hitsZone`, owner, 2026-10-01) — the same 45 mm prone / 115 mm standing zones on every template, so the label
 * names the position only. `null` reads prone, the tighter, as `characterize` does.
 */
export function missLabel(position: 'prone' | 'standing' | null): string {
  return position === 'standing' ? 'Miss on standing' : 'Miss on prone';
}

/**
 * Issue #81 (analysis-pipeline §1): the metadata card's Stage A badge. No sub-steps are stored, so a queued photo and a
 * running one are told apart, and a running one says what Stage A does as a whole.
 */
export function stageALabel(state: 'pending' | 'running' | 'done' | 'error', error: string | null): string {
  if (state === 'error') return `Couldn't process this photo${error ? `: ${error}` : ''}`;
  if (state === 'done') return 'Ready';
  return state === 'running' ? 'Aligning and finding shots…' : 'Queued…';
}
