// REV-79: the season a target was shot in. Pure.

import type { Season } from './enums';

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
