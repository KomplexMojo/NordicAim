import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { BoardShare } from '@/components/leaderboard/BoardShare';
import { BoardTable } from '@/components/leaderboard/BoardTable';
import { SubmissionPreviewCard } from '@/components/leaderboard/SubmissionPreviewCard';
import { ViewSwitch } from '@/components/patterns/ViewRangeControls';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
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
  const rows = useMemo(() => {
    if (data === undefined) return [];
    const me = { publicKey: data.ownKey, name: data.athleteName, club: data.athleteClub };
    return boardRows(data.held, ownRow(preview, me), position);
  }, [data, preview, position]);

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
            <BoardTable rows={rows} ownKey={data.ownKey ?? 'this-phone'} />
          </section>
        </>
      )}
    </main>
  );
}
