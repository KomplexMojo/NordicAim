import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useServices } from '@/lib/app/services';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { getAppSettings } from '@/lib/services/settings';
import { BUILD_SHA } from '@/lib/app/build-info';
import { MAX_BACKUP_REMINDER_DAYS, MIN_BACKUP_REMINDER_DAYS } from '@/lib/backup/due';
import type { ConflictPolicy, RestorePlan } from '@/lib/backup/restore';
import { verifyBackup, type VerifiedBackup } from '@/lib/backup/verify';
import type { AppSettings } from '@/lib/domain/settings';
import { buildBackupFile, planBackupRestore, recordBackupMade, restoreBackup, setBackupReminderDays } from '@/lib/services/backup';
import { shareBackup } from '@/lib/share/share-browser';

interface Loaded {
  backup: VerifiedBackup;
  plan: RestorePlan;
}

/**
 * backup.md (REV-63, issue #13): Settings → **Backup**. Everything here is an explicit tap: creating a file, choosing a
 * file to restore, and restoring it. The file holds the photos, including their GPS location, and the dialog says so.
 */
export function BackupSettings({ settings: initial, onRestored }: { settings: AppSettings; onRestored(): void }) {
  const { ctx } = useServices();
  // Live, so the last-backup line updates the moment a backup is recorded.
  const { value: live } = useLiveQuery(() => getAppSettings(ctx), [ctx]);
  const settings = live ?? initial;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [policy, setPolicy] = useState<ConflictPolicy>('keep');
  const [message, setMessage] = useState<string | null>(null);
  const [days, setDays] = useState(String(settings.backupReminderDays));
  const fileInput = useRef<HTMLInputElement>(null);

  async function onCreate() {
    setConfirming(false);
    setBusy(true);
    setMessage(null);
    try {
      const started = performance.now();
      const made = await buildBackupFile(ctx, BUILD_SHA);
      const outcome = await shareBackup(made.blob, made.fileName);
      if (outcome === 'cancelled') {
        setMessage('Backup cancelled. Nothing was saved.');
      } else {
        await recordBackupMade(ctx, made);
        const mb = (made.blob.size / 1_048_576).toFixed(1);
        const secs = ((performance.now() - started) / 1000).toFixed(1);
        setMessage(`Backup made: ${made.manifest.counts.sessions} sessions, ${made.manifest.counts.photos} photos, ${mb} MB in ${secs} s.`);
      }
    } catch (err) {
      toast.error(`Could not make the backup: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onChooseFile(file: File | undefined) {
    if (file === undefined) return;
    setBusy(true);
    setProblem(null);
    setLoaded(null);
    setMessage(null);
    try {
      const result = await verifyBackup(await file.text());
      if (!result.ok) {
        setProblem(result.problem);
        return;
      }
      setLoaded({ backup: result.backup, plan: await planBackupRestore(ctx, result.backup) });
      setPolicy('keep');
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function onRestore() {
    if (loaded === null) return;
    setBusy(true);
    try {
      const report = await restoreBackup(ctx, loaded.backup, loaded.plan, policy);
      setMessage(
        `Restored. ${report.written} items written, ${report.skipped} left as they were. Your settings and preferences came back too.` +
          (report.needsUnlock ? ' Enter your passphrase in Settings → Athlete to keep stamping images.' : ''),
      );
      onRestored();
      setLoaded(null);
    } catch (err) {
      setProblem(`Nothing was changed. ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function commitDays() {
    const n = Number(days);
    if (!Number.isInteger(n) || n === settings.backupReminderDays) return;
    try {
      await setBackupReminderDays(ctx, n);
    } catch {
      setDays(String(settings.backupReminderDays));
    }
  }

  const different =
    loaded === null ? 0 : loaded.plan.sessions.different + loaded.plan.photos.different + loaded.plan.analyses.different + loaded.plan.blobs.different;
  const last =
    settings.lastBackupAt === null
      ? 'No backup yet.'
      : `Last backup ${new Date(settings.lastBackupAt).toLocaleDateString()}, ${settings.lastBackupSessions} sessions.`;

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" aria-labelledby="settings-backup-title">
      <h2 id="settings-backup-title" className="text-base font-semibold">
        Backup
      </h2>
      <p className="text-sm" data-testid="last-backup">
        {last}
      </p>
      <p className="text-xs text-muted-foreground">
        Your sessions live only on this phone. Removing the Home Screen icon or clearing website data deletes them, so keep a
        backup in Files or iCloud Drive.
      </p>
      <Button className="h-11" disabled={busy} onClick={() => setConfirming(true)} data-testid="backup-now">
        {busy ? 'Working…' : 'Back up now'}
      </Button>

      <div className="flex flex-col gap-1">
        <Label htmlFor="backup-days">Remind me after this many days</Label>
        <Input
          id="backup-days"
          data-testid="backup-days"
          type="number"
          inputMode="numeric"
          min={MIN_BACKUP_REMINDER_DAYS}
          max={MAX_BACKUP_REMINDER_DAYS}
          className="h-11"
          value={days}
          onChange={(e) => setDays(e.currentTarget.value)}
          onBlur={() => void commitDays()}
        />
      </div>

      <div className="flex flex-col gap-2 border-t pt-3">
        <Label htmlFor="backup-file">Restore from a backup file</Label>
        <input
          ref={fileInput}
          id="backup-file"
          data-testid="restore-file"
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(e) => void onChooseFile(e.currentTarget.files?.[0])}
          className="text-sm"
        />
        {problem !== null && (
          <p className="text-sm text-destructive" role="alert" data-testid="restore-problem">
            {problem}
          </p>
        )}
        {loaded !== null && (
          <div className="flex flex-col gap-2" data-testid="restore-preview">
            <p className="text-sm font-medium">
              This backup checks out. It holds {loaded.backup.file.manifest.counts.sessions} sessions and{' '}
              {loaded.backup.file.manifest.counts.photos} photos.
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
                  <input type="radio" name="restore-policy" checked={policy === 'keep'} onChange={() => setPolicy('keep')} data-testid="restore-keep" />
                  Keep what is on this phone
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input type="radio" name="restore-policy" checked={policy === 'replace'} onChange={() => setPolicy('replace')} data-testid="restore-replace" />
                  Replace with the backup
                </label>
              </fieldset>
            )}
            <Button className="h-11" disabled={busy} onClick={() => void onRestore()} data-testid="restore-go">
              Restore
            </Button>
          </div>
        )}
      </div>
      {message !== null && (
        <p className="text-sm" role="status" data-testid="backup-message">
          {message}
        </p>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent data-testid="backup-confirm-dialog">
          <DialogHeader>
            <DialogTitle>Back up everything?</DialogTitle>
            <DialogDescription>
              The backup file contains your original photos, and photos keep the exact GPS location where they were taken. Keep the
              file in your own Files or iCloud Drive and do not share it. Nothing is sent anywhere by the app.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button className="h-11" onClick={() => void onCreate()} data-testid="backup-confirm">
              Create backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
