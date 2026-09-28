// Issue #72 (REV-140): the view and date range of Patterns and Analysis live in the address (`?view=confirm&range=90`), so
// Back from a target opened there returns to the same view. Pure.

import { PATTERN_RANGE_LABEL, PATTERN_VIEWS, type PatternRange, type PatternView } from './collect';

export const DEFAULT_VIEW: PatternView = 'sight-in';
export const DEFAULT_RANGE: PatternRange = 'all';

/** The view and range a query string names; anything missing or unknown falls back to the defaults. */
export function parseViewRange(params: URLSearchParams): { view: PatternView; range: PatternRange } {
  const view = params.get('view');
  const range = params.get('range');
  return {
    view: (PATTERN_VIEWS as readonly string[]).includes(view ?? '') ? (view as PatternView) : DEFAULT_VIEW,
    range: range !== null && range in PATTERN_RANGE_LABEL ? (range as PatternRange) : DEFAULT_RANGE,
  };
}

/** `view=<view>&range=<range>`, for a link or `setSearchParams`. */
export function viewRangeSearch(view: PatternView, range: PatternRange): string {
  return new URLSearchParams({ view, range }).toString();
}
