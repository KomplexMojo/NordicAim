import { Button } from '@/components/ui/button';
import type { BiathlonSession } from '@/lib/domain/session';
import { sessionTimeLabel } from '@/lib/sessions/list-view';

export type BackupScope = 'all' | 'chosen';

interface BackupScopePickerProps {
  sessions: BiathlonSession[];
  scope: BackupScope;
  chosen: ReadonlySet<string>;
  onScope(scope: BackupScope): void;
  onChosen(chosen: Set<string>): void;
}

/**
 * backup.md §2c (REV-143): what a backup holds. **All sessions** (the default, and the only kind that counts as your backup), or
 * **Choose sessions**: a list to tick, newest first, for a small file to send or keep, such as one range day.
 */
export function BackupScopePicker({ sessions, scope, chosen, onScope, onChosen }: BackupScopePickerProps) {
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChosen(next);
  };
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="backup-scope">
      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">What to back up</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="backup-scope" checked={scope === 'all'} onChange={() => onScope('all')} data-testid="backup-scope-all" />
          All sessions ({sessions.length})
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="backup-scope" checked={scope === 'chosen'} onChange={() => onScope('chosen')} data-testid="backup-scope-chosen" />
          Choose sessions
        </label>
      </fieldset>
      {scope === 'chosen' && (
        <>
          <div className="flex gap-2">
            <Button variant="outline" className="h-11 flex-1" onClick={() => onChosen(new Set(sessions.map((s) => s.id)))} data-testid="backup-choose-all">
              Select all
            </Button>
            <Button variant="outline" className="h-11 flex-1" onClick={() => onChosen(new Set())} data-testid="backup-choose-none">
              Select none
            </Button>
          </div>
          <ul className="max-h-60 overflow-y-auto rounded-md border" data-testid="backup-session-list">
            {sessions.map((s) => (
              <li key={s.id} className="border-b last:border-b-0">
                <label className="flex min-h-11 items-center gap-3 px-3 py-1">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0"
                    checked={chosen.has(s.id)}
                    onChange={() => toggle(s.id)}
                    data-testid="backup-session-check"
                    data-session-id={s.id}
                  />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.sessionDate} · {sessionTimeLabel(s)} · {s.photoIds.length} {s.photoIds.length === 1 ? 'target' : 'targets'}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            A backup of chosen sessions is smaller, for sending or keeping one range day. It does not count as your backup: the reminder
            still waits for a backup of everything. Your settings come along either way.
          </p>
        </>
      )}
    </div>
  );
}
