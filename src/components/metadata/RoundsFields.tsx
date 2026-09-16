import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Categorization } from '@/lib/domain/photo';

const MIN_ROUNDS = 1;
const MAX_ROUNDS = 50;

interface RoundsFieldsProps {
  categorization: Categorization;
  idPrefix: string;
  onChange(next: Categorization): void;
}

function clampRounds(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, n));
}

/** analysis-pipeline pitfalls: integers 1-50, `inputMode="numeric"`. Only the fields relevant to the current
 * position are shown (DESIGN.md "Selection UX"). */
export function RoundsFields({ categorization, idPrefix, onChange }: RoundsFieldsProps) {
  const { position } = categorization;
  const showProne = position === 'prone' || position === 'both';
  const showStanding = position === 'standing' || position === 'both';

  if (!showProne && !showStanding) return null;

  return (
    <div className="flex gap-3">
      {showProne && (
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor={`${idPrefix}-rounds-prone`}>Rounds (prone)</Label>
          <Input
            id={`${idPrefix}-rounds-prone`}
            type="number"
            inputMode="numeric"
            min={MIN_ROUNDS}
            max={MAX_ROUNDS}
            value={categorization.roundsProne ?? ''}
            onChange={(e) => onChange({ ...categorization, roundsProne: clampRounds(e.currentTarget.value) })}
          />
        </div>
      )}
      {showStanding && (
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor={`${idPrefix}-rounds-standing`}>Rounds (standing)</Label>
          <Input
            id={`${idPrefix}-rounds-standing`}
            type="number"
            inputMode="numeric"
            min={MIN_ROUNDS}
            max={MAX_ROUNDS}
            value={categorization.roundsStanding ?? ''}
            onChange={(e) => onChange({ ...categorization, roundsStanding: clampRounds(e.currentTarget.value) })}
          />
        </div>
      )}
    </div>
  );
}
