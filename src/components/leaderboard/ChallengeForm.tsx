import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useServices } from '@/lib/app/services';
import { MAX_CHALLENGE_REASON, type ChallengeTarget } from '@/lib/leaderboard/challenge';
import { createChallenge } from '@/lib/services/board';
import { shareBoardFile } from '@/lib/share/share-browser';

const PROBLEM: Record<'no-passphrase' | 'locked' | 'no-name' | 'own', string> = {
  'no-name': 'Add your name in Settings → Athlete first: a challenge says who made it.',
  'no-passphrase': 'Set a stamp passphrase in Settings → Athlete first: it signs your challenge.',
  locked: 'Unlock your stamp passphrase in Settings → Athlete first: it signs your challenge.',
  own: 'You cannot challenge your own entry.',
};

/**
 * leaderboard.md §9 (issue #42): challenge one target of another shooter's entry with a short reason. It is signed and kept on this
 * board at once; sharing it is a separate tap.
 */
export function ChallengeForm({ target, onSaved, onDone }: { target: ChallengeTarget; onSaved(): void; onDone(): void }) {
  const { ctx } = useServices();
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ text: string; fileName: string } | null>(null);

  async function save() {
    const result = await createChallenge(ctx, target, reason);
    if (result.status !== 'ok') {
      setProblem(PROBLEM[result.status]);
      return;
    }
    setSaved({ text: result.text, fileName: result.fileName });
    onSaved();
  }

  if (saved !== null) {
    return (
      <div className="flex flex-col gap-2 rounded-md border p-2 text-sm" data-testid="challenge-saved">
        <p>Challenge saved on your board. Share it so the shooter and others see it.</p>
        <div className="grid grid-cols-2 gap-2">
          <Button className="h-11" onClick={() => void shareBoardFile(saved.text, saved.fileName, 'NordicAim board challenge')} data-testid="challenge-share">
            Share challenge
          </Button>
          <Button variant="outline" className="h-11" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-2 text-sm" data-testid="challenge-form">
      <label htmlFor="challenge-reason" className="font-medium">
        Why is this score wrong?
      </label>
      <textarea
        id="challenge-reason"
        className="min-h-20 rounded-md border bg-background p-2"
        maxLength={MAX_CHALLENGE_REASON}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. the hole at 4 o'clock is a neighbour's shot"
        data-testid="challenge-reason"
      />
      {problem !== null && (
        <p className="text-destructive" role="status">
          {problem}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button className="h-11" disabled={reason.trim() === ''} onClick={() => void save()} data-testid="challenge-save">
          Sign and save
        </Button>
        <Button variant="outline" className="h-11" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
