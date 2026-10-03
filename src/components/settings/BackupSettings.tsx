import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useServices } from '@/lib/app/services';
import { countPhotosWithLocation, removeStoredLocations } from '@/lib/services/location';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { getAppSettings } from '@/lib/services/settings';
import { BUILD_SHA } from '@/lib/app/build-info';
import { MAX_BACKUP_REMINDER_DAYS, MIN_BACKUP_REMINDER_DAYS } from '@/lib/backup/due';
import type { ConflictPolicy } from '@/lib/backup/restore';
import { decryptBackup, encryptedBackupHeader, isEncryptedBackup, WrongBackupPassphraseError } from '@/lib/backup/encrypt';
import { verifyBackupFile } from '@/lib/backup/verify';
import type { AppSettings } from '@/lib/domain/settings';
import { buildBackupFile, planBackupRestore, recordBackupMade, restoreBackup, setBackupReminderDays } from '@/lib/services/backup';
import { shareBackup } from '@/lib/share/share-browser';
import { isStampPassphrase } from '@/lib/services/provenance';
import { listSessions } from '@/lib/services/sessions';

import { BackupConfirmDialog } from './BackupConfirmDialog';
import { UnlockBackupForm } from './BackupProtect';
import { RestorePreview, type Loaded } from './RestorePreview';
import type { BackupScope } from './BackupScopePicker';

/**
 * backup.md (REV-63, issue #13): Settings → **Backup**. Everything here is an explicit tap: creating a file, choosing a
 * file to restore, and restoring it. The file holds the photos; since REV-158 without their location, and the dialog says so.
 */
export function BackupSettings({ settings: initial, onRestored }: { settings: AppSettings; onRestored(): void }) {
  const { ctx, imageTools, renderTools } = useServices();
  // Live, so the last-backup line updates the moment a backup is recorded.
  const { value: live } = useLiveQuery(() => getAppSettings(ctx), [ctx]);
  const settings = live ?? initial;
  const [confirming, setConfirming] = useState(false);
  // REV-158: photos that still hold their location (none, unless one could not be changed safely).
  const [stillLocated, setStillLocated] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [policy, setPolicy] = useState<ConflictPolicy>('keep');
  const [message, setMessage] = useState<string | null>(null);
  const [chosenName, setChosenName] = useState<string | null>(null);
  const [days, setDays] = useState(String(settings.backupReminderDays));
  // REV-143: everything (the default), or chosen sessions. The list is read when the dialog opens.
  const [scope, setScope] = useState<BackupScope>('all');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const { value: sessions } = useLiveQuery(() => (confirming ? listSessions(ctx) : Promise.resolve([])), [ctx, confirming]);
  const sessionList = [...(sessions ?? [])].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate) || b.createdAt.localeCompare(a.createdAt));
  const chosenIds = sessionList.filter((s) => chosen.has(s.id)).map((s) => s.id);
  const fileInput = useRef<HTMLInputElement>(null);
  // REV-151 (issue #44): protect the file with the stamp passphrase (off by default); a protected file to restore waits here.
  const [protectOn, setProtectOn] = useState(false);
  const [protectPass, setProtectPass] = useState('');
  const [protectError, setProtectError] = useState<string | null>(null);
  const [locked, setLocked] = useState<{ file: File; fingerprint: string | null } | null>(null);

  async function onCreate() {
    const protect = protectOn && settings.keyFingerprint !== null ? { passphrase: protectPass } : undefined;
    if (protect !== undefined && !(await isStampPassphrase(ctx, protect.passphrase))) {
      setProtectError("That isn't your stamp passphrase.");
      return;
    }
    setConfirming(false);
    setBusy(true);
    setMessage(null);
    try {
      const started = performance.now();
      const made = await buildBackupFile(ctx, BUILD_SHA, scope === 'chosen' ? chosenIds : undefined, protect);
      const outcome = await shareBackup(made.blob, made.fileName);
      if (outcome === 'cancelled') {
        setMessage('Backup cancelled. Nothing was saved.');
      } else {
        await recordBackupMade(ctx, made);
        const mb = (made.blob.size / 1_048_576).toFixed(1);
        const rawMb = (made.uncompressedBytes / 1_048_576).toFixed(1);
        const secs = ((performance.now() - started) / 1000).toFixed(1);
        const n = made.manifest.counts.sessions;
        setMessage(
          `Backup made: ${n} ${n === 1 ? 'session' : 'sessions'}, ${made.manifest.counts.photos} photos, ${mb} MB (${rawMb} MB before compression) in ${secs} s.` +
            (made.protected ? ' Protected with your stamp passphrase.' : '') +
            (made.manifest.scope !== undefined ? ' Only the chosen sessions: this does not count as your backup.' : ''),
        );
      }
    } catch (err) {
      toast.error(`Could not make the backup: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onChooseFile(file: File | undefined) {
    if (file === undefined) return;
    setChosenName(file.name);
    setBusy(true);
    setProblem(null);
    setLoaded(null);
    setLocked(null);
    setMessage(null);
    try {
      if (await isEncryptedBackup(file)) {
        setLocked({ file, fingerprint: (await encryptedBackupHeader(file)).keyFingerprint });
        return;
      }
      await loadVerified(file);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  /** REV-151: open a protected backup with the stamp passphrase, then check it like any other. */
  async function onUnlock(passphrase: string) {
    if (locked === null) return;
    setBusy(true);
    setProblem(null);
    try {
      await loadVerified(await decryptBackup(locked.file, passphrase));
      setLocked(null);
    } catch (err) {
      setProblem(err instanceof WrongBackupPassphraseError ? err.message : err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function loadVerified(file: Blob) {
    const result = await verifyBackupFile(file);
    if (!result.ok) {
      setProblem(result.problem);
      return;
    }
    setLoaded({ backup: result.backup, plan: await planBackupRestore(ctx, result.backup) });
    setPolicy('keep');
  }

  async function onRestore() {
    if (loaded === null) return;
    setBusy(true);
    try {
      const report = await restoreBackup(ctx, loaded.backup, loaded.plan, policy, {
        makeWorkingImages: imageTools.makeWorkingImages,
        svgToPng: renderTools.svgToPng,
      });
      setMessage(
        `Restored. ${report.written} items written, ${report.skipped} left as they were.` +
          (report.rebuilt > 0 ? ` ${report.rebuilt} photo copies and drawings were made again from the originals.` : '') +
          ' Your settings and preferences came back too.' +
          (report.boardShooters > 0 ? ` ${report.boardShooters} ${report.boardShooters === 1 ? 'shooter' : 'shooters'} came back to your board.` : '') +
          (report.needsUnlock ? ' Enter your passphrase in Settings → Athlete to keep stamping images and to share on the board as yourself.' : ''),
      );
      onRestored();
      setLoaded(null);
      setChosenName(null);
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
      <Button
        className="h-11"
        disabled={busy}
        onClick={() => {
          setScope('all');
          setChosen(new Set());
          setProtectOn(false);
          setProtectPass('');
          setProtectError(null);
          setConfirming(true);
          void removeStoredLocations(ctx)
            .then(() => countPhotosWithLocation(ctx))
            .then(setStillLocated);
        }}
        data-testid="backup-now"
      >
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
        <h3 className="text-sm font-medium">Restore from a backup</h3>
        <p className="text-xs text-muted-foreground">
          Pick a NordicAim backup file (.json.gz, .json, or a protected .enc) from Files or iCloud Drive. Nothing changes until you check what is in it and
          tap Restore.
        </p>
        <Button variant="outline" className="h-11" disabled={busy} onClick={() => fileInput.current?.click()} data-testid="restore-choose">
          Choose backup file…
        </Button>
        {/* The native control is hidden: its "Choose File / no file selected" text did not read as a button (REV-127). */}
        <input
          ref={fileInput}
          data-testid="restore-file"
          type="file"
          accept="application/json,.json,application/gzip,.gz,application/octet-stream,.enc"
          disabled={busy}
          onChange={(e) => void onChooseFile(e.currentTarget.files?.[0])}
          className="hidden"
        />
        {chosenName !== null && (
          <p className="truncate text-xs text-muted-foreground" data-testid="restore-chosen">
            {busy && loaded === null ? 'Checking ' : 'Chosen: '}
            {chosenName}
          </p>
        )}
        {problem !== null && (
          <p className="text-sm text-destructive" role="alert" data-testid="restore-problem">
            {problem}
          </p>
        )}
        {locked !== null && <UnlockBackupForm fingerprint={locked.fingerprint} busy={busy} onUnlock={(p) => void onUnlock(p)} />}
        {loaded !== null && (
          <RestorePreview loaded={loaded} different={different} policy={policy} busy={busy} onPolicy={setPolicy} onRestore={() => void onRestore()} />
        )}
      </div>
      {message !== null && (
        <p className="rounded-md bg-muted p-3 text-sm" role="status" data-testid="backup-message">
          {message}
        </p>
      )}

      <BackupConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        stillLocated={stillLocated}
        sessions={sessionList}
        scope={scope}
        chosen={chosen}
        chosenCount={chosenIds.length}
        onScope={setScope}
        onChosen={setChosen}
        protect={{
          available: settings.keyFingerprint !== null,
          on: protectOn,
          passphrase: protectPass,
          error: protectError,
          onOn: (on) => {
            setProtectOn(on);
            setProtectError(null);
          },
          onPassphrase: (p) => {
            setProtectPass(p);
            setProtectError(null);
          },
        }}
        onCreate={() => void onCreate()}
      />
    </section>
  );
}
