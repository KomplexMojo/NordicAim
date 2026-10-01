import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * REV-151 (backup.md §2d, issue #44): the backup dialog's "Protect with my stamp passphrase" switch, off by default. It needs the
 * athlete-stamp passphrase set up (Settings → Athlete); the protected file is encrypted and opens only with that passphrase.
 */
export function ProtectBackupField({
  available,
  on,
  passphrase,
  error,
  onOn,
  onPassphrase,
}: {
  available: boolean;
  on: boolean;
  passphrase: string;
  error: string | null;
  onOn(on: boolean): void;
  onPassphrase(passphrase: string): void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3" data-testid="backup-protect">
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="size-5"
          checked={on && available}
          disabled={!available}
          onChange={(e) => onOn(e.currentTarget.checked)}
          data-testid="backup-protect-toggle"
        />
        Protect with my stamp passphrase
      </label>
      {!available ? (
        <p className="text-xs text-muted-foreground">Set up an athlete stamp passphrase in Settings → Athlete to protect backups.</p>
      ) : on ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={id}>Stamp passphrase</Label>
          <Input
            id={id}
            type="password"
            autoComplete="current-password"
            className="h-11"
            value={passphrase}
            onChange={(e) => onPassphrase(e.currentTarget.value)}
            data-testid="backup-protect-passphrase"
          />
          <p className="text-xs text-muted-foreground">
            The file is encrypted: it opens only with this passphrase. If you forget it, this backup cannot be restored.
          </p>
          {error !== null && (
            <p className="text-sm text-destructive" role="alert" data-testid="backup-protect-error">
              {error}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** REV-151: a protected backup was chosen to restore; the stamp passphrase opens it. */
export function UnlockBackupForm({ fingerprint, busy, onUnlock }: { fingerprint: string | null; busy: boolean; onUnlock(passphrase: string): void }) {
  const id = useId();
  const [passphrase, setPassphrase] = useState('');
  return (
    <form
      className="flex flex-col gap-2"
      data-testid="restore-unlock"
      onSubmit={(e) => {
        e.preventDefault();
        if (passphrase !== '') onUnlock(passphrase);
      }}
    >
      <p className="text-sm">
        This backup is protected. Enter the athlete stamp passphrase it was made with
        {fingerprint !== null ? ` (key ${fingerprint})` : ''}.
      </p>
      <Label htmlFor={id} className="sr-only">
        Stamp passphrase
      </Label>
      <Input
        id={id}
        type="password"
        autoComplete="current-password"
        className="h-11"
        value={passphrase}
        onChange={(e) => setPassphrase(e.currentTarget.value)}
        data-testid="restore-passphrase"
      />
      <Button type="submit" className="h-11" disabled={busy || passphrase === ''} data-testid="restore-unlock-go">
        {busy ? 'Opening…' : 'Open backup'}
      </Button>
    </form>
  );
}
