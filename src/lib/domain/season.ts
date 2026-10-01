// REV-79: the season a target was shot in. Pure.

import { Season } from './enums';

export const SEASON_LABEL: Record<Season, string> = { winter: 'Winter', spring: 'Spring', summer: 'Summer', fall: 'Fall' };

/** The meteorological season (northern hemisphere) for a `YYYY-MM-DD…` date; `null` when it is not a date. */
export function suggestSeason(dateIso: string | null): Season | null {
  const month = Number(dateIso?.slice(5, 7));
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'fall';
}

/** REV-154 (issue #29): the season filter on Patterns, Analysis, Goals and Home — every season, or one. */
export type SeasonFilter = 'all' | Season;
export const SEASON_FILTERS: readonly SeasonFilter[] = ['all', ...Season.options];
export const SEASON_FILTER_LABEL: Record<SeasonFilter, string> = { all: 'All seasons', ...SEASON_LABEL };

/** The filter a `season=` query value names; anything missing or unknown is `all`. */
export function parseSeasonFilter(value: string | null): SeasonFilter {
  return Season.safeParse(value).data ?? 'all';
}

/**
 * The season a target counts in: the one the owner chose, else the season of its capture date, else of `fallbackDate` (the
 * session's date), the same rule the summary image's season badge uses. `null` when none of them is a date.
 */
export function targetSeason(chosen: Season | null | undefined, captureLocal: string | null, fallbackDate: string | null): Season | null {
  return chosen ?? suggestSeason(captureLocal ?? fallbackDate);
}

/** Whether a target in `season` passes `filter`; a target with no season passes only `all`. */
export function seasonMatches(season: Season | null | undefined, filter: SeasonFilter): boolean {
  return filter === 'all' || season === filter;
}
