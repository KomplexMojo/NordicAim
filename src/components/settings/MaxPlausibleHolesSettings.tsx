import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_MAX_PLAUSIBLE_HOLES,
  MAX_MAX_PLAUSIBLE_HOLES,
  MIN_MAX_PLAUSIBLE_HOLES,
  isValidMaxPlausibleHoles,
} from '@/lib/domain/settings';

interface MaxPlausibleHolesSettingsProps {
  maxPlausibleHoles: number;
  onChange(n: number): void;
  onReset(): void;
}

/**
 * Owner instruction, 2026-09-26: a target reporting more raw holes than this (or none at all) is a
 * detector malfunction, not a shooting result, and is rejected outright rather than scored. Editable,
 * 5-50, with Reset to 10 (a precision target is always 10 shots). The draft is committed on blur or
 * Enter, and only when it is in range.
 */
export function MaxPlausibleHolesSettings({ maxPlausibleHoles, onChange, onReset }: MaxPlausibleHolesSettingsProps) {
  const [draft, setDraft] = useState<{ for: number; text: string }>({
    for: maxPlausibleHoles,
    text: String(maxPlausibleHoles),
  });
  // A stored value that changes underneath (Reset, or a reload) replaces the draft.
  const text = draft.for === maxPlausibleHoles ? draft.text : String(maxPlausibleHoles);
  const parsed = Number(text);
  const invalid = text.trim() === '' || !isValidMaxPlausibleHoles(parsed);

  function commit() {
    if (invalid || parsed === maxPlausibleHoles) return;
    onChange(parsed);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="max-plausible-holes">Max plausible holes on one target</Label>
        <div className="flex gap-2">
          <Input
            id="max-plausible-holes"
            data-testid="max-plausible-holes-input"
            type="number"
            inputMode="numeric"
            min={MIN_MAX_PLAUSIBLE_HOLES}
            max={MAX_MAX_PLAUSIBLE_HOLES}
            step={1}
            className="h-11 flex-1"
            aria-invalid={invalid}
            value={text}
            onChange={(e) => setDraft({ for: maxPlausibleHoles, text: e.currentTarget.value })}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
          />
          <Button
            variant="outline"
            className="h-11"
            data-testid="max-plausible-holes-reset"
            onClick={() => {
              setDraft({ for: maxPlausibleHoles, text: String(DEFAULT_MAX_PLAUSIBLE_HOLES) });
              onReset();
            }}
          >
            Reset to {DEFAULT_MAX_PLAUSIBLE_HOLES}
          </Button>
        </div>
        {invalid ? (
          <p className="text-xs text-destructive" role="alert" data-testid="max-plausible-holes-error">
            Enter a count from {MIN_MAX_PLAUSIBLE_HOLES} to {MAX_MAX_PLAUSIBLE_HOLES}.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            A precision target is always 10 shots. More than this on one target, or none at all, is treated as a
            detection failure and rejected rather than scored.
          </p>
        )}
      </div>
    </div>
  );
}
