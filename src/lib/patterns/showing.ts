// REV-156: one plain sentence saying what Patterns and Analysis are showing, so the range and the season read as one
// choice ("Showing your last 5 winter sessions."). Pure.

import { SEASON_LABEL, type SeasonFilter } from '../domain/season';
import { RANGE_SESSIONS, type PatternRange } from './collect';

/**
 * What the screen shows for `range` under `season`, given how many sessions that turned out to be. `null` when nothing is
 * shown and no season narrows it: the screen's own "No sessions here yet" says that already.
 */
export function showingSentence(range: PatternRange, season: SeasonFilter, sessions: number): string | null {
  const kind = season === 'all' ? '' : `${SEASON_LABEL[season].toLowerCase()} `;
  if (sessions === 0) return season === 'all' ? null : `No ${kind}sessions here yet.`;
  if (range === 'last') return `Showing your latest ${kind}session.`;
  if (sessions === 1) return `Showing your only ${kind}session.`;
  const keep = RANGE_SESSIONS[range];
  return keep !== null && sessions >= keep ? `Showing your last ${keep} ${kind}sessions.` : `Showing all ${sessions} of your ${kind}sessions.`;
}
