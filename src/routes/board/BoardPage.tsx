import { useMemo } from 'react';
import { useSearchParams } from 'react-router';

import { SubmissionPreviewCard } from '@/components/leaderboard/SubmissionPreviewCard';
import { ViewSwitch } from '@/components/patterns/ViewRangeControls';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
import { previewSubmission } from '@/lib/leaderboard/select';
import { loadMyBoardTargets } from '@/lib/services/leaderboard';

const BOARD_VIEWS = ['precision-prone', 'precision-standing'] as const;
type BoardView = (typeof BOARD_VIEWS)[number];

/**
 * Route `#/board` (leaderboard.md, issue #42): the precision prone and precision standing boards. Prone / Standing as on Goals; no
 * date range and no season (a submission is each shooter's best 5 of all time). First, what this phone would submit.
 */
export function BoardPage() {
  const { ctx } = useServices();
  const { value: mine, loading } = useLiveQuery(() => loadMyBoardTargets(ctx), [ctx]);
  const [params, setParams] = useSearchParams();
  const view: BoardView = params.get('view') === 'precision-standing' ? 'precision-standing' : 'precision-prone';
  const setView = (v: BoardView) => setParams(new URLSearchParams({ view: v }), { replace: true });
  const position = view === 'precision-standing' ? 'standing' : 'prone';
  const preview = useMemo(() => previewSubmission(mine ?? [], position), [mine, position]);
  const from = { path: `/board?view=${view}`, label: 'Back to Board' };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 lg:max-w-3xl">
      <h1 className="text-xl font-semibold">Board</h1>
      <ViewSwitch view={view} onView={setView} testIdPrefix="board" views={BOARD_VIEWS} />
      {loading && mine === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <SubmissionPreviewCard preview={preview} from={from} />
      )}
    </main>
  );
}
