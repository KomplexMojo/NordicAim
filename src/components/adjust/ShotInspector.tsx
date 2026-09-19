import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Shot } from '@/lib/domain/analysis';
import type { Position, ShotPosition } from '@/lib/domain/enums';

/** data-model §4: `multiplicity` is an integer in [1, 20]. */
export const MIN_MULTIPLICITY = 1;
export const MAX_MULTIPLICITY = 20;

interface ShotInspectorProps {
  shot: Shot;
  /** The photo's position; per-unit overrides only exist for a `both` target (M13 step 2). */
  position: Position;
  onChange(shot: Shot): void;
  onDelete(): void;
  onClose(): void;
}

/** Keeps `positionOverrides` the same length as `multiplicity` (the `Shot` schema refines on it). */
function resizeOverrides(overrides: Array<ShotPosition | null> | null, multiplicity: number): Array<ShotPosition | null> | null {
  if (overrides === null) return null;
  const next: Array<ShotPosition | null> = [];
  for (let i = 0; i < multiplicity; i += 1) next.push(overrides[i] ?? null);
  return next;
}

function OverrideRow({
  index,
  value,
  onChange,
}: {
  index: number;
  value: ShotPosition | null;
  onChange(next: ShotPosition | null): void;
}) {
  const options: Array<{ label: string; value: ShotPosition | null }> = [
    { label: 'Auto', value: null },
    { label: 'Prone', value: 'prone' },
    { label: 'Standing', value: 'standing' },
  ];
  return (
    <div className="flex items-center gap-2" data-testid="override-row" data-unit-index={index}>
      <span className="w-14 text-sm text-muted-foreground">Shot {index + 1}</span>
      <div className="flex flex-1 gap-1">
        {options.map((option) => (
          <Button
            key={option.label}
            type="button"
            variant={option.value === value ? 'default' : 'outline'}
            className="h-11 flex-1 px-2 text-xs"
            aria-pressed={option.value === value}
            data-testid={`override-${option.label.toLowerCase()}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** M13 step 2 (Shots): the selected shot's multiplicity, per-unit positions for a `both` target, and Delete. */
export function ShotInspector({ shot, position, onChange, onDelete, onClose }: ShotInspectorProps) {
  const overrides = shot.positionOverrides ?? new Array<ShotPosition | null>(shot.multiplicity).fill(null);

  function setMultiplicity(raw: number) {
    if (!Number.isFinite(raw)) return;
    const multiplicity = Math.min(MAX_MULTIPLICITY, Math.max(MIN_MULTIPLICITY, Math.round(raw)));
    const next: Shot = { ...shot, multiplicity, positionOverrides: resizeOverrides(shot.positionOverrides, multiplicity) };
    // M20 step 8: the owner has now decided how many rounds this hole holds, so it is no longer an
    // inference (saving marks the shot manual, and reconciliation never alters a manual shot).
    delete next.inferred;
    onChange(next);
  }

  function setOverride(index: number, value: ShotPosition | null) {
    const next = [...overrides];
    next[index] = value;
    onChange({ ...shot, positionOverrides: next.every((v) => v === null) ? null : next });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3" data-testid="shot-inspector">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          Shot {shot.id} · {shot.xMm.toFixed(1)} mm x · {shot.yMm.toFixed(1)} mm y
        </span>
        <Button variant="ghost" className="h-11" data-testid="close-inspector" onClick={onClose}>
          Done
        </Button>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="shot-multiplicity">Shots in this hole</Label>
          <Input
            id="shot-multiplicity"
            data-testid="shot-multiplicity"
            className="h-11 w-24"
            type="number"
            inputMode="numeric"
            min={MIN_MULTIPLICITY}
            max={MAX_MULTIPLICITY}
            step={1}
            value={shot.multiplicity}
            onChange={(e) => setMultiplicity(Number(e.target.value))}
          />
        </div>
        <Button
          variant="outline"
          className="h-11"
          data-testid="multiplicity-minus"
          onClick={() => setMultiplicity(shot.multiplicity - 1)}
        >
          −1
        </Button>
        <Button
          variant="outline"
          className="h-11"
          data-testid="multiplicity-plus"
          onClick={() => setMultiplicity(shot.multiplicity + 1)}
        >
          +1
        </Button>
      </div>

      {shot.inferred === 'double-punch' && shot.multiplicity > 1 && (
        <p className="text-sm text-muted-foreground" data-testid="inferred-double">
          Assumed double punch: the rounds you entered were short, and this hole looks like more than one shot. Set it
          to 1 to score the extra round as a miss.
        </p>
      )}

      {position === 'both' && (
        <div className="flex flex-col gap-2" data-testid="position-overrides">
          <span className="text-sm text-muted-foreground">Position for each shot in this hole</span>
          {overrides.map((value, index) => (
            <OverrideRow
              key={index}
              index={index}
              value={value ?? null}
              onChange={(next) => setOverride(index, next)}
            />
          ))}
        </div>
      )}

      <Button variant="destructive" className="h-11" data-testid="delete-shot" onClick={onDelete}>
        Delete this shot
      </Button>
    </div>
  );
}
