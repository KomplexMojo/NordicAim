import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

import { UpdateBanner } from '@/components/UpdateBanner';
import { BUILD_SHA } from '@/lib/app/build-info';
import { SeasonFilter } from '@/components/patterns/SeasonFilter';
import { CoachContextDialog } from '@/components/sessions/CoachContextDialog';
import { DeleteSessionDialog } from '@/components/sessions/DeleteSessionDialog';
import { SessionList } from '@/components/sessions/SessionList';
import { QuickStartButton } from '@/components/sessions/QuickStartButton';
import { BackupReminder } from '@/components/settings/BackupReminder';
import { Button } from '@/components/ui/button';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
import { parseSeasonFilter, SEASON_LABEL, type SeasonFilter as SeasonFilterValue } from '@/lib/domain/season';
import { listSessionKinds, listSessionSeasons, listSessionsWithProblems } from '@/lib/services/sessions';
import { listCoachContextSessions } from '@/lib/services/coach-context';
import { sortSessions, type SessionSortDirection } from '@/lib/sessions/list-view';
import { sessionInSeason } from '@/lib/sessions/seasons';

/**
 * Route `#/` (analysis-pipeline §1). REV-72: the one screen that lists every session, and the one place a session is
 * deleted (issue #18). There is no separate Sessions screen.
 */
export function HomePage() {
  const { ctx } = useServices();
  const { value, loading } = useLiveQuery(() => listSessionsWithProblems(ctx), [ctx]);
  const { value: kinds } = useLiveQuery(() => listSessionKinds(ctx), [ctx]);
  const { value: seasons } = useLiveQuery(() => listSessionSeasons(ctx), [ctx]);
  // REV-154 (issue #29): the season filter lives in the address, so Back from a session returns to it.
  const [params, setParams] = useSearchParams();
  const season = parseSeasonFilter(params.get('season'));
  const setSeason = (s: SeasonFilterValue) => setParams(s === 'all' ? {} : { season: s }, { replace: true });
  const [deleting, setDeleting] = useState<string | null>(null);
  // M29 (REV-159): the session whose 545 Coach data is open, and which sessions have some attached.
  const [coachFor, setCoachFor] = useState<string | null>(null);
  const { value: coachAttached } = useLiveQuery(() => listCoachContextSessions(ctx), [ctx]);
  // Newest session date first by default; the toggle beside the heading flips it.
  const [sortDirection, setSortDirection] = useState<SessionSortDirection>('desc');
  const sessions = value?.sessions;
  const sorted = useMemo(
    () => sortSessions((sessions ?? []).filter((s) => sessionInSeason(s, seasons, season)), sortDirection),
    [sessions, seasons, season, sortDirection],
  );
  const unreadable = value?.unreadable ?? [];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6 lg:max-w-3xl">
      {/* The name is in the header on every page (REV-109); the heading stays for screen readers. */}
      <h1 className="sr-only">NordicAim</h1>

      <UpdateBanner />

      <QuickStartButton sessions={sessions ?? []} className="h-14 w-full text-lg" />
      {/* Issue #93: before the first session, one line of the three-step promise; it goes once a session exists. */}
      {sessions !== undefined && sessions.length === 0 && (
        <p className="-mt-3 text-center text-sm text-muted-foreground" data-testid="home-promise">
          Photograph your targets, confirm what you shot, then read the analysis.
        </p>
      )}

      <BackupReminder />

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Sessions</h2>
          <Button
            variant="ghost"
            className="h-auto min-h-11 min-w-11 px-2 text-muted-foreground"
            onClick={() => setSortDirection((d) => (d === 'desc' ? 'asc' : 'desc'))}
            aria-label={sortDirection === 'desc' ? 'Sorted newest first; show oldest first' : 'Sorted oldest first; show newest first'}
            data-testid="session-sort-toggle"
            data-sort={sortDirection}
          >
            {sortDirection === 'desc' ? <ArrowDown className="size-4" aria-hidden /> : <ArrowUp className="size-4" aria-hidden />}
          </Button>
        </div>
        {sessions !== undefined && sessions.length > 0 && <SeasonFilter season={season} onSeason={setSeason} testIdPrefix="home" />}
        {loading && sessions === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <SessionList
            sessions={sorted}
            kinds={kinds}
            emptyMessage={
              season !== 'all' && (sessions ?? []).length > 0
                ? `No ${SEASON_LABEL[season].toLowerCase()} sessions.`
                : 'No sessions yet. Quick start to take your first photo.'
            }
            onDelete={(session) => setDeleting(session.id)}
            onCoach={(session) => setCoachFor(session.id)}
            coachAttached={coachAttached}
          />
        )}
      </section>

      {unreadable.length > 0 && (
        <section className="flex flex-col gap-2 rounded-md border border-destructive/40 p-3" data-testid="home-unreadable">
          <h2 className="text-sm font-medium">
            {unreadable.length === 1 ? '1 session could not be read' : `${unreadable.length} sessions could not be read`}
          </h2>
          <p className="text-xs text-muted-foreground">
            Nothing has been deleted.{' '}
            <Link to="/diagnostics" className="text-primary underline underline-offset-4">
              Open Diagnostics
            </Link>{' '}
            to see why and to export your data, or delete one you no longer want.
          </p>
          <ul className="flex flex-col gap-1">
            {unreadable.map((bad) => (
              <li key={bad.id} className="flex items-center justify-between gap-2">
                <span className="break-all text-xs text-muted-foreground">{bad.id}</span>
                <Button
                  variant="ghost"
                  className="h-auto min-h-11 min-w-11 px-3 text-muted-foreground"
                  onClick={() => setDeleting(bad.id)}
                  data-testid="unreadable-delete"
                  aria-label={`Delete unreadable session ${bad.id}`}
                >
                  <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" />
                  </svg>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <DeleteSessionDialog key={deleting ?? 'none'} sessionId={deleting} onClose={() => setDeleting(null)} />
      <CoachContextDialog key={`coach-${coachFor ?? 'none'}`} sessionId={coachFor} onClose={() => setCoachFor(null)} />

      <p className="mt-auto text-center text-xs text-muted-foreground">
        Results are stored only on this phone. Version{' '}
        <span className="font-mono" data-testid="app-version">
          {BUILD_SHA}
        </span>
      </p>
    </main>
  );
}
