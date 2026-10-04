import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useServices } from '@/lib/app/services';
import { clearBoard } from '@/lib/services/board';

/**
 * leaderboard.md §8: empties the board this phone received, after a second tap to confirm. The owner's own row is worked out
 * live, so it stays; their submission can be shared again at any time.
 */
export function ClearBoard({ shooters, onCleared }: { shooters: number; onCleared(): void }) {
  const { ctx } = useServices();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function clear() {
    setBusy(true);
    try {
      await clearBoard(ctx);
      setConfirming(false);
      onCleared();
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="outline" className="h-11" onClick={() => setConfirming(true)} data-testid="board-clear">
        Clear board
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-destructive/50 p-3 text-sm" role="dialog" aria-label="Clear board" data-testid="board-clear-confirm">
      <p>
        Remove {shooters === 1 ? 'the 1 shooter' : `all ${shooters} shooters`} you received, prone and standing? Your own
        entry stays. To get the others back, import the files again.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="destructive" className="h-11" disabled={busy} onClick={() => void clear()} data-testid="board-clear-apply">
          Clear board
        </Button>
        <Button variant="outline" className="h-11" disabled={busy} onClick={() => setConfirming(false)} data-testid="board-clear-cancel">
          Cancel
        </Button>
      </div>
    </div>
  );
}
