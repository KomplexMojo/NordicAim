import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SlideToConfirm } from '@/components/ui/slide-to-confirm';
import { useServices } from '@/lib/app/services';
import { backupCoverage, type BackupCoverage } from '@/lib/backup/coverage';
import { deleteSession, previewSessionDeletion, type SessionDeletionReport } from '@/lib/services/sessions';
import { getSettings } from '@/lib/store/settings-repo';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

interface DeleteSessionDialogProps {
  /** The session to delete, or `null` when the dialog is closed. */
  sessionId: string | null;
  onClose(): void;
}

function coverageText(c: BackupCoverage | null): string {
  if (c === null) return '';
  const day = (iso: string) => new Date(iso).toLocaleDateString();
  switch (c.kind) {
    case 'never':
      return 'You have not made a backup, so there is nothing to restore this from.';
    case 'covered':
      return `Your last backup (${day(c.backupAt)}) holds this session as it is now, so you could restore it from that file.`;
    case 'changed-since':
      return `Your last backup (${day(c.backupAt)}) is older than the latest changes to this session, so a restore would bring back an earlier version.`;
    case 'unknown':
      return `You made a backup on ${day(c.backupAt)}, but this session's record is damaged, so it may not be in it.`;
  }
}

/**
 * Issue #18, REV-117: deleting a session and everything attached, on one screen because it cannot be undone. It shows the session and
 * exactly what goes with it, says whether a backup could bring it back, and is confirmed only by sliding to the trash can and holding
 * there (a tap does nothing). Cancel is focused first, so an accidental Enter cancels.
 */
export function DeleteSessionDialog({ sessionId, onClose }: DeleteSessionDialogProps) {
  const { ctx } = useServices();
  const [report, setReport] = useState<SessionDeletionReport | null>(null);
  const [coverage, setCoverage] = useState<BackupCoverage | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sessionId === null) return;
    let cancelled = false;
    Promise.all([previewSessionDeletion(ctx, sessionId), getSettings(ctx.db)]).then(
      ([next, settings]) => {
        if (cancelled) return;
        setReport(next);
        setCoverage(backupCoverage(settings.lastBackupAt, next.updatedAt));
      },
      (err: unknown) => {
        if (cancelled) return;
        toast.error(`Could not read that session: ${err instanceof Error ? err.message : String(err)}`);
        onClose();
      },
    );
    return () => {
      cancelled = true;
    };
    // `onClose` is stable enough for this: it only closes the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, sessionId]);

  const label = report?.name?.trim() ? `"${report.name}"` : 'this session';

  async function onConfirm() {
    if (sessionId === null || report === null) return;
    setBusy(true);
    try {
      const removed = await deleteSession(ctx, sessionId);
      toast.success(`Deleted ${label} and ${plural(removed.photos, 'photo')}.`);
      onClose();
    } catch (err) {
      toast.error(`Could not delete: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={sessionId !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent data-testid="delete-session-dialog" className="max-h-[92dvh] overflow-y-auto">
        {report === null ? (
          <p className="text-sm text-muted-foreground">Reading…</p>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Delete {label}?</DialogTitle>
              <DialogDescription>
                {report.sessionDate ?? 'Unknown date'}
                {report.readable ? '' : ' · this session record is damaged and cannot be opened'}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm" data-testid="delete-counts">
              <dt className="text-muted-foreground">Photos</dt>
              <dd>{report.photos}</dd>
              <dt className="text-muted-foreground">Analyses and scores</dt>
              <dd>{report.analyses}</dd>
              <dt className="text-muted-foreground">Summary images</dt>
              <dd>{report.artifacts}</dd>
              <dt className="text-muted-foreground">Shares recorded</dt>
              <dd>{report.shares}</dd>
              {report.updatedAt !== null && (
                <>
                  <dt className="text-muted-foreground">Last changed</dt>
                  <dd>{new Date(report.updatedAt).toLocaleString()}</dd>
                </>
              )}
            </dl>

            <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="font-medium">Your photos exist only on this phone. Once deleted, they cannot be recovered.</p>
              <p>
                This permanently deletes the photos, scores, corrections and summary images stored on this phone. Summary images you
                have already saved to Photos or shared are separate copies and are <strong>not</strong> affected.
              </p>
              <p data-testid="delete-backup-note">{coverageText(coverage)}</p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm">To delete {label} permanently, put your finger on the handle, slide it to the trash can and hold it there.</p>
              <SlideToConfirm label="Slide to the trash and hold" disabled={busy} onConfirm={() => void onConfirm()} />
            </div>

            <DialogFooter>
              <Button autoFocus variant="outline" className="h-11" onClick={onClose} disabled={busy} data-testid="delete-cancel">
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
