import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EARLIEST_SESSION_DATE, isValidSessionDate } from '@/lib/domain/session-date';

interface SessionDateFieldProps {
  /** The stored date, `YYYY-MM-DD`. */
  value: string;
  /** The phone's local date: the latest a session can be given. */
  today: string;
  onChange(date: string): void;
}

/**
 * REV-141: the session's date. Start & capture gives a new session today's date; this changes it, so a session shot on an
 * earlier day files under that day in the session list, Patterns and Analysis. Only a real, past-or-today date is saved.
 */
export function SessionDateField({ value, today, onChange }: SessionDateFieldProps) {
  // What the picker shows while it is being changed; the stored value is `value`.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const invalid = draft !== null && !isValidSessionDate(draft, today);

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="session-date">Session date</Label>
      <Input
        id="session-date"
        type="date"
        className="h-11"
        value={shown}
        min={EARLIEST_SESSION_DATE}
        max={today}
        aria-invalid={invalid}
        aria-describedby="session-date-help"
        data-testid="session-date"
        onChange={(e) => {
          const next = e.currentTarget.value;
          if (isValidSessionDate(next, today)) {
            setDraft(null);
            if (next !== value) onChange(next);
          } else {
            setDraft(next);
          }
        }}
        onBlur={() => setDraft(null)}
      />
      <p id="session-date-help" className={invalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'} data-testid="session-date-help">
        {invalid ? 'Choose a date that is today or earlier.' : 'The day you shot. Change it to record a session from an earlier day.'}
      </p>
    </div>
  );
}
