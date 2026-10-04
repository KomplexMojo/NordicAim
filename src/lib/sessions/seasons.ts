// REV-154 (issue #29): which seasons a session's targets count in, for Home's season filter. Pure.

import { isTargetPhoto } from '../domain/backing';
import type { Season } from '../domain/enums';
import type { TargetPhoto } from '../domain/photo';
import type { BiathlonSession } from '../domain/session';
import { suggestSeason, targetSeason, type SeasonFilter } from '../domain/season';

type SeasonInput = Pick<TargetPhoto, 'sessionId' | 'origin' | 'season' | 'captureTime'>;

/**
 * Every session's target seasons from one list of photos: the season chosen on the photo, else its capture date's; `null` for a
 * target with neither, which then takes the session's date (`sessionInSeason`). Backing-card photos are not targets.
 */
export function seasonsBySession(photos: SeasonInput[]): Map<string, Array<Season | null>> {
  const out = new Map<string, Array<Season | null>>();
  for (const p of photos) {
    if (!isTargetPhoto(p)) continue;
    out.set(p.sessionId, [...(out.get(p.sessionId) ?? []), targetSeason(p.season, p.captureTime.local, null)]);
  }
  return out;
}

/**
 * Whether a session belongs under `filter`: any of its targets counts in that season (a target with no season of its own, or a
 * session with no targets yet, goes by the session's date). `all` keeps every session.
 */
export function sessionInSeason(
  session: Pick<BiathlonSession, 'id' | 'sessionDate'>,
  seasons: ReadonlyMap<string, ReadonlyArray<Season | null>> | undefined,
  filter: SeasonFilter,
): boolean {
  if (filter === 'all') return true;
  const own = seasons?.get(session.id) ?? [];
  const byDate = suggestSeason(session.sessionDate);
  if (own.length === 0) return byDate === filter;
  return own.some((s) => (s ?? byDate) === filter);
}
