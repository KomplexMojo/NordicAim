import { useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { useServices } from '@/lib/app/services';
import type { MergeSummary } from '@/lib/leaderboard/merge';
import type { IdentityState, ImportPreview } from '@/lib/services/board';
import { applyImport, createBoardFile, createMySubmission, previewImport } from '@/lib/services/board';
import { shareBoardFile } from '@/lib/share/share-browser';

interface BoardShareProps {
  identity: IdentityState;
  hasName: boolean;
  /** Either position has the full 5. */
  canSubmit: boolean;
  /** Called after an import was saved, so the board re-reads. */
  onImported(): void;
}

function summaryText(s: MergeSummary, rejected: number, challenges = 0): string {
  const parts = [
    `${s.added} new ${s.added === 1 ? 'shooter' : 'shooters'}`,
    `${s.updated} updated`,
    `${s.unchanged} already on your board`,
    ...(s.overCap > 0 ? [`${s.overCap} below the top 100`] : []),
    ...(rejected > 0 ? [`${rejected} rejected (signature doesn't match)`] : []),
    ...(challenges > 0 ? [`${challenges} ${challenges === 1 ? 'challenge' : 'challenges'}`] : []),
  ];
  return parts.join(', ');
}

/**
 * leaderboard.md §6 (issue #42): sharing this phone's submission or its whole board as a file, and importing one. Nothing leaves the
 * phone without a tap here; an import shows what it would change before anything is saved.
 */
export function BoardShare({ identity, hasName, canSubmit, onImported }: BoardShareProps) {
  const { ctx } = useServices();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);

  async function shareMine() {
    setBusy(true);
    try {
      const mine = await createMySubmission(ctx);
      if (mine.status !== 'ok') return;
      const outcome = await shareBoardFile(mine.text, mine.fileName, 'My NordicAim board submission');
      setMessage(outcome === 'cancelled' ? null : 'Your submission was shared.');
    } finally {
      setBusy(false);
    }
  }

  async function shareBoard() {
    setBusy(true);
    try {
      const file = await createBoardFile(ctx);
      const outcome = await shareBoardFile(file.text, file.fileName, 'NordicAim board');
      setMessage(outcome === 'cancelled' ? null : `The board was shared (${file.count} ${file.count === 1 ? 'shooter' : 'shooters'}).`);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    setMessage(null);
    const preview = await previewImport(ctx, await file.text());
    if (preview === null) setMessage('That file is not a NordicAim submission or board.');
    else setPending(preview);
  }

  async function addToBoard() {
    if (pending === null) return;
    const result = await applyImport(ctx, pending.accepted, pending.challenges.accepted);
    setPending(null);
    setMessage(`Added to your board: ${summaryText(result, 0, result.challengesAdded)}.`);
    onImported();
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Share and import" data-testid="board-share">
      {!hasName ? (
        <p className="text-sm text-muted-foreground" data-testid="board-share-hint">
          Add your name in{' '}
          <Link to="/settings" className="text-primary underline underline-offset-4">
            Settings → Athlete
          </Link>{' '}
          to share your submission.
        </p>
      ) : identity !== 'ready' ? (
        <p className="text-sm text-muted-foreground" data-testid="board-share-hint">
          {identity === 'locked' ? 'Unlock your stamp passphrase in ' : 'Set a stamp passphrase in '}
          <Link to="/settings" className="text-primary underline underline-offset-4">
            Settings → Athlete
          </Link>{' '}
          to share: it signs your submission so nobody can change it on the way.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button className="h-11" disabled={busy || !canSubmit || !hasName || identity !== 'ready'} onClick={() => void shareMine()} data-testid="board-share-mine">
          Share my submission
        </Button>
        <Button variant="outline" className="h-11" onClick={() => fileInput.current?.click()} data-testid="board-import">
          Import…
        </Button>
      </div>
      <Button variant="outline" className="h-11" disabled={busy} onClick={() => void shareBoard()} data-testid="board-share-all">
        Share the whole board
      </Button>
      <p className="text-xs text-muted-foreground">
        This shares every shooter on your board: their names, clubs and scores. Shot positions only; never a photo or a location.
      </p>
      <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void onFile(e)} data-testid="board-import-input" />

      {pending !== null && (
        <div className="flex flex-col gap-2 rounded-md border border-primary p-3 text-sm" role="dialog" aria-label="Import" data-testid="board-import-review">
          <p>
            {pending.accepted.length + pending.rejected} {pending.accepted.length + pending.rejected === 1 ? 'submission' : 'submissions'}:{' '}
            {summaryText(pending.summary, pending.rejected + pending.challenges.rejected, pending.challenges.accepted.length)}.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="h-11"
              onClick={() => void addToBoard()}
              disabled={pending.accepted.length === 0 && pending.challenges.accepted.length === 0}
              data-testid="board-import-apply"
            >
              Add to my board
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {message !== null && (
        <p className="text-sm" role="status" data-testid="board-message">
          {message}
        </p>
      )}
    </section>
  );
}
