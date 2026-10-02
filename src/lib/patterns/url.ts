// Issue #72 (REV-140): the view and date range of Patterns and Analysis live in the address (`?view=confirm&range=10`), so
// Back from a target opened there returns to the same view. REV-154 adds `season=` (absent = every season). Pure.

import { parseSeasonFilter, type SeasonFilter } from '../domain/season';
import { PATTERN_RANGE_LABEL, PATTERN_VIEWS, type PatternRange, type PatternView } from './collect';

export const DEFAULT_VIEW: PatternView = 'sight-in';
// Owner, 2026-09-30: opening Patterns or Analysis fresh starts on the athlete's latest session, not everything ever
// recorded.
export const DEFAULT_RANGE: PatternRange = 'last';

/** The view, range and season a query string names; anything missing or unknown falls back to the defaults. */
export function parseViewRange(params: URLSearchParams): { view: PatternView; range: PatternRange; season: SeasonFilter } {
  const view = params.get('view');
  const range = params.get('range');
  return {
    view: (PATTERN_VIEWS as readonly string[]).includes(view ?? '') ? (view as PatternView) : DEFAULT_VIEW,
    range: range !== null && range in PATTERN_RANGE_LABEL ? (range as PatternRange) : DEFAULT_RANGE,
    season: parseSeasonFilter(params.get('season')),
  };
}

/** `view=<view>&range=<range>[&season=<season>]`, for a link or `setSearchParams`. */
export function viewRangeSearch(view: PatternView, range: PatternRange, season: SeasonFilter = 'all'): string {
  const params = new URLSearchParams({ view, range });
  if (season !== 'all') params.set('season', season);
  return params.toString();
}
