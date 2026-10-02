import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { BoardShare } from '@/components/leaderboard/BoardShare';
import { BoardTable, type ShownRow } from '@/components/leaderboard/BoardTable';
import { ClearBoard } from '@/components/leaderboard/ClearBoard';
import { SubmissionPreviewCard } from '@/components/leaderboard/SubmissionPreviewCard';
import { ViewSwitch } from '@/components/patterns/ViewRangeControls';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
import { CHALLENGES_ENABLED, challengesFor } from '@/lib/leaderboard/challenge';
import { boardRows, ownRow } from '@/lib/leaderboard/merge';
import { previewSubmission } from '@/lib/leaderboard/select';
import { loadBoard } from '@/lib/services/board';

const BOARD_VIEWS = ['precision-prone', 'precision-standing'] as const;
type BoardView = (typeof BOARD_VIEWS)[number];

/**
 * Route `#/board` (leaderboard.md, issue #42): the precision prone and precision standing boards. Prone / Standing as on Goals; no
 * date range and no season (a submission is each shooter's best 5 of all time). First what this phone would submit, then sharing
 * and importing, then the board itself with this phone's own row among the shooters it has received.
 */
export function BoardPage() {
  const { ctx } = useServices();
  const [refreshKey, setRefreshKey] = useState(0);
  const { value: data, loading } = useLiveQuery(() => loadBoard(ctx), [ctx, refreshKey]);
  const [params, setParams] = useSearchParams();
  const view: BoardView = params.get('view') === 'precision-standing' ? 'precision-standing' : 'precision-prone';
  const setView = (v: BoardView) => setParams(new URLSearchParams({ view: v }), { replace: true });
  const position = view === 'precision-standing' ? 'standing' : 'prone';
  const from = { path: `/board?view=${view}`, label: 'Back to Board' };

  const previews = useMemo(
    () => ({ prone: previewSubmission(data?.mine ?? [], 'prone'), standing: previewSubmission(data?.mine ?? [], 'standing') }),
    [data],
  );
  const preview = previews[position];
  // leaderboard.md §9: each phone may hide flagged or challenged entries; the owner's own row always shows.
  const [hideFlagged, setHideFlagged] = useState(false);
  const [hideChallenged, setHideChallenged] = useState(false);
  const ownKey = data?.ownKey ?? 'this-phone';
  const rows = useMemo((): ShownRow[] => {
    if (data === undefined) return [];
    const me = { publicKey: data.ownKey, name: data.athleteName, club: data.athleteClub };
    return boardRows(data.held, ownRow(preview, me), position)
      .map((row) => ({ row, challenges: challengesFor(data.challenges, row.publicKey, position, row.publicKey === ownKey ? null : row.signedAt) }))
      .filter(({ row, challenges }) => row.publicKey === ownKey || ((!hideFlagged || !row.flagged) && (!hideChallenged || challenges.length === 0)));
  }, [data, preview, position, ownKey, hideFlagged, hideChallenged]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 lg:max-w-3xl">
      <h1 className="text-xl font-semibold">Board</h1>
      <ViewSwitch view={view} onView={setView} testIdPrefix="board" views={BOARD_VIEWS} />
      {loading && data === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data === undefined ? null : (
        <>
          <SubmissionPreviewCard preview={preview} from={from} />
          <BoardShare
            identity={data.identity}
            hasName={data.athleteName !== ''}
            canSubmit={previews.prone.complete || previews.standing.complete}
            onImported={() => setRefreshKey((k) => k + 1)}
          />
          <section className="flex flex-col gap-2" aria-label="Board">
            <h2 className="text-sm font-medium text-muted-foreground">Board · best 5 average</h2>
            <div className="flex flex-wrap gap-x-4 text-sm">
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" className="size-5" checked={hideFlagged} onChange={(e) => setHideFlagged(e.target.checked)} data-testid="board-hide-flagged" />
                Hide flagged
              </label>
              {CHALLENGES_ENABLED && (
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" className="size-5" checked={hideChallenged} onChange={(e) => setHideChallenged(e.target.checked)} data-testid="board-hide-challenged" />
                  Hide challenged
                </label>
              )}
            </div>
            <BoardTable rows={rows} ownKey={ownKey} onChallenged={() => setRefreshKey((k) => k + 1)} />
            {data.held.length > 0 && (
              <ClearBoard shooters={data.held.length} onCleared={() => setRefreshKey((k) => k + 1)} />
            )}
          </section>
        </>
      )}
    </main>
  );
}
