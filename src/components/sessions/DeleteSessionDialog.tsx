import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SlideToConfirm } from '@/components/ui/slide-to-confirm';
import { useServices } from '@/lib/app/services';
import { deleteSession, previewSessionDeletion, type SessionDeletionReport } from '@/lib/services/sessions';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

interface DeleteSessionDialogProps {
  /** The session to delete, or `null` when the dialog is closed. */
  sessionId: string | null;
  onClose(): void;
}

/**
 * Issue #18: deleting a session and everything attached, behind three deliberate steps because it cannot be undone.
 *   1. what will be deleted, with the counts     2. why it matters (the photos exist only on this phone)
 *   3. type the session's name, then the destructive button enables.
 * There is no shortcut past a step and no "don't ask again". Cancel is focused first, so an accidental Enter cancels.
 */
export function DeleteSessionDialog({ sessionId, onClose }: DeleteSessionDialogProps) {
  const { ctx } = useServices();
  const [report, setReport] = useState<SessionDeletionReport | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sessionId === null) return;
    let cancelled = false;
    previewSessionDeletion(ctx, sessionId).then(
      (next) => {
        if (!cancelled) setReport(next);
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
      <DialogContent data-testid="delete-session-dialog" data-step={step}>
        {report === null ? (
          <p className="text-sm text-muted-foreground">Reading…</p>
        ) : step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>Delete {label}?</DialogTitle>
              <DialogDescription>
                {report.sessionDate ?? 'Unknown date'}
                {report.readable ? '' : ' · this session record is damaged and cannot be opened'}
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm font-medium" data-testid="delete-counts">
              {plural(report.photos, 'photo')} · {plural(report.analyses, 'analysis', 'analyses')} ·{' '}
              {plural(report.artifacts, 'summary image')} · {plural(report.shares, 'share')}
            </p>
            <p className="text-sm">
              This permanently deletes the photos, scores, corrections and summary images stored on this phone. It cannot be
              undone.
            </p>
            <DialogFooter>
              <Button autoFocus variant="outline" className="h-11" onClick={onClose} data-testid="delete-cancel">
                Cancel
              </Button>
              <Button variant="outline" className="h-11" onClick={() => setStep(2)} data-testid="delete-continue-1">
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : step === 2 ? (
          <>
            <DialogHeader>
              <DialogTitle>Your photos exist only on this phone</DialogTitle>
              <DialogDescription>Once deleted, they cannot be recovered.</DialogDescription>
            </DialogHeader>
            <p className="text-sm">
              This app has no backup yet, so there is nothing to restore from. Summary images you have already saved to Photos or
              shared are separate copies and are <strong>not</strong> affected.
            </p>
            <DialogFooter>
              <Button autoFocus variant="outline" className="h-11" onClick={() => setStep(1)} data-testid="delete-back-2">
                Back
              </Button>
              <Button variant="outline" className="h-11" onClick={() => setStep(3)} data-testid="delete-continue-2">
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Slide to delete</DialogTitle>
              <DialogDescription>
                To delete {label} permanently, put your finger on the handle, slide it to the trash can and hold it there.
              </DialogDescription>
            </DialogHeader>
            <SlideToConfirm label="Slide to the trash and hold" disabled={busy} onConfirm={() => void onConfirm()} />
            <DialogFooter>
              <Button variant="outline" className="h-11" onClick={() => setStep(2)} disabled={busy} data-testid="delete-back-3">
                Back
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
