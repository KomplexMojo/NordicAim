import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_HOLE_DIAMETER_MM,
  MAX_HOLE_DIAMETER_MM,
  MIN_HOLE_DIAMETER_MM,
  isValidHoleDiameterMm,
} from '@/lib/domain/settings';

interface HoleSizeSettingsProps {
  holeDiameterMm: number;
  onChange(mm: number): void;
  onReset(): void;
}

/**
 * data-model §5 (REV-47): **Hole size**, `profileOverrides.holeDiameterMm`, 2–12 mm, with Reset to 5.6
 * (.22 LR). It feeds detection and scoring, but changing it re-scores nothing already stored.
 * The draft is committed on blur or Enter, and only when it is in range.
 */
export function HoleSizeSettings({ holeDiameterMm, onChange, onReset }: HoleSizeSettingsProps) {
  const [draft, setDraft] = useState<{ for: number; text: string }>({ for: holeDiameterMm, text: String(holeDiameterMm) });
  // A stored value that changes underneath (Reset, or a reload) replaces the draft.
  const text = draft.for === holeDiameterMm ? draft.text : String(holeDiameterMm);
  const parsed = Number(text);
  const invalid = text.trim() === '' || !isValidHoleDiameterMm(parsed);

  function commit() {
    if (invalid || parsed === holeDiameterMm) return;
    onChange(parsed);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" aria-labelledby="settings-hole-title">
      <h2 id="settings-hole-title" className="text-base font-semibold">
        Hole size
      </h2>
      <div className="flex flex-col gap-1">
        <Label htmlFor="hole-diameter">Hole diameter (mm)</Label>
        <div className="flex gap-2">
          <Input
            id="hole-diameter"
            data-testid="hole-diameter-input"
            type="number"
            inputMode="decimal"
            min={MIN_HOLE_DIAMETER_MM}
            max={MAX_HOLE_DIAMETER_MM}
            step={0.1}
            className="h-11 flex-1"
            aria-invalid={invalid}
            value={text}
            onChange={(e) => setDraft({ for: holeDiameterMm, text: e.currentTarget.value })}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
          />
          <Button
            variant="outline"
            className="h-11"
            data-testid="hole-diameter-reset"
            onClick={() => {
              setDraft({ for: holeDiameterMm, text: String(DEFAULT_HOLE_DIAMETER_MM) });
              onReset();
            }}
          >
            Reset to {DEFAULT_HOLE_DIAMETER_MM}
          </Button>
        </div>
        {invalid ? (
          <p className="text-xs text-destructive" role="alert" data-testid="hole-diameter-error">
            Enter a size from {MIN_HOLE_DIAMETER_MM} to {MAX_HOLE_DIAMETER_MM} mm.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            .22 LR is {DEFAULT_HOLE_DIAMETER_MM} mm. Used to find and score holes in photos analyzed from now on.
          </p>
        )}
      </div>
    </section>
  );
}
