import { Button } from '@/components/ui/button';
import type { ConflictPolicy, RestorePlan } from '@/lib/backup/restore';
import type { VerifiedBackup } from '@/lib/backup/verify';

export interface Loaded {
  backup: VerifiedBackup;
  plan: RestorePlan;
}

/** backup.md §4: what a checked backup holds, how it compares with this phone, and the Keep / Replace choice before Restore. */
export function RestorePreview({
  loaded,
  different,
  policy,
  busy,
  onPolicy,
  onRestore,
}: {
  loaded: Loaded;
  different: number;
  policy: ConflictPolicy;
  busy: boolean;
  onPolicy(policy: ConflictPolicy): void;
  onRestore(): void;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid="restore-preview">
      <p className="text-sm font-medium">
        This backup checks out. It holds {loaded.backup.file.manifest.counts.sessions} sessions and{' '}
        {loaded.backup.file.manifest.counts.photos} photos.
        {loaded.backup.file.manifest.scope !== undefined && ' It is a backup of chosen sessions, not everything.'}
      </p>
      <ul className="text-xs text-muted-foreground">
        {loaded.backup.file.manifest.sessions.map((s) => (
          <li key={s.id}>
            {s.name?.trim() ? s.name : '(unnamed)'} · {s.sessionDate ?? '—'} · {s.photos} photos
          </li>
        ))}
      </ul>
      <p className="text-xs" data-testid="restore-counts">
        New: {loaded.plan.sessions.new} sessions · Already here, identical: {loaded.plan.sessions.same} · Different:{' '}
        {loaded.plan.sessions.different}
      </p>
      {different > 0 && (
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="sr-only">When a session or photo is different on this phone</legend>
          <label className="flex min-h-11 items-center gap-2">
            <input type="radio" name="restore-policy" checked={policy === 'keep'} onChange={() => onPolicy('keep')} data-testid="restore-keep" />
            Keep what is on this phone
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="radio" name="restore-policy" checked={policy === 'replace'} onChange={() => onPolicy('replace')} data-testid="restore-replace" />
            Replace with the backup
          </label>
        </fieldset>
      )}
      <Button className="h-11" disabled={busy} onClick={onRestore} data-testid="restore-go">
        Restore
      </Button>
    </div>

  );
}
