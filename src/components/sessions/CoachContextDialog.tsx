import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useServices } from '@/lib/app/services';
import type { AttachedCoachContext } from '@/lib/domain/coach-context';
import type { BiathlonSession } from '@/lib/domain/session';
import {
  addCoachContext,
  getCoachContext,
  prepareCoachAttach,
  removeCoachContext,
  type CoachAttachPreview,
} from '@/lib/services/coach-context';
import { getSession } from '@/lib/services/sessions';

import { CoachPreview } from './CoachPreview';

interface CoachContextDialogProps {
  /** The session to attach to, or `null` when the dialog is closed. */
  sessionId: string | null;
  onClose(): void;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * coach-context-import.md §5 (M29, REV-159): attach a 545 Coach export to one session. **Attach 545 Coach data** picks a file; it is
 * checked (a refused file names why, and nothing is written), its records for this session's date are shown as the summary image will
 * draw them, and **Add** writes them (or **Cancel** discards the file). A session that has some gets **Remove 545 Coach data**.
 */
export function CoachContextDialog({ sessionId, onClose }: CoachContextDialogProps) {
  const { ctx } = useServices();
  const fileInput = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<BiathlonSession | null>(null);
  const [attached, setAttached] = useState<AttachedCoachContext | null>(null);
  const [preview, setPreview] = useState<CoachAttachPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sessionId === null) return;
    let cancelled = false;
    Promise.all([getSession(ctx, sessionId), getCoachContext(ctx, sessionId)]).then(
      ([s, a]) => {
        if (cancelled) return;
        setSession(s);
        setAttached(a);
      },
      (err: unknown) => {
        if (!cancelled) setProblem(`Could not read this session's 545 Coach data: ${message(err)}`);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ctx, sessionId]);

  async function onFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file === undefined || sessionId === null) return;
    setProblem(null);
    setPreview(null);
    setBusy(true);
    try {
      const result = await prepareCoachAttach(ctx, sessionId, await file.text());
      if (result.ok) setPreview(result.preview);
      else setProblem(result.problem);
    } catch (err) {
      setProblem(`Could not read that file: ${message(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(): Promise<void> {
    if (preview === null) return;
    setBusy(true);
    try {
      await addCoachContext(ctx, preview);
      toast.success('545 Coach data added. The summary image is being updated.');
      onClose();
    } catch (err) {
      setProblem(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(): Promise<void> {
    if (sessionId === null) return;
    setBusy(true);
    try {
      await removeCoachContext(ctx, sessionId);
      toast.success('545 Coach data removed.');
      onClose();
    } catch (err) {
      setProblem(message(err));
    } finally {
      setBusy(false);
    }
  }

  const records = (a: Pick<AttachedCoachContext, 'metal' | 'zero' | 'wind'>) => ({
    metal: a.metal.map((r) => r.record),
    zero: a.zero.map((r) => r.record),
    wind: a.wind.map((r) => r.record),
  });

  return (
    <Dialog open={sessionId !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent data-testid="coach-dialog" className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>545 Coach data</DialogTitle>
          <DialogDescription>
            {session === null ? 'Reading…' : `${session.name} · ${session.sessionDate}`}. Metal bouts, zero clicks and wind from a 545 Coach
            export, matched to this session by date. They are shown beside your scores and never change them.
          </DialogDescription>
        </DialogHeader>

        <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void onFile(e)} data-testid="coach-file-input" />

        {problem !== null && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" data-testid="coach-error">
            {problem}
          </p>
        )}

        {preview !== null ? (
          <div className="flex flex-col gap-3">
            {preview.empty ? (
              <p className="text-sm" data-testid="coach-preview-empty">
                This export has no records for {preview.sessionDate} ({preview.file.range.from} to {preview.file.range.to}), so there is nothing
                to add.
              </p>
            ) : (
              <>
                <p className="text-sm font-medium">This adds, for {preview.sessionDate}:</p>
                <CoachPreview {...records(preview)} />
                {attached !== null && <p className="text-xs text-muted-foreground">It replaces the 545 Coach data this session has now.</p>}
              </>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" className="h-11" disabled={busy} onClick={() => setPreview(null)} data-testid="coach-cancel">
                Cancel
              </Button>
              <Button className="h-11" disabled={busy || preview.empty} onClick={() => void onAdd()} data-testid="coach-add">
                Add
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {attached !== null ? (
              <>
                <p className="text-sm font-medium">Attached now:</p>
                <CoachPreview {...records(attached)} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="coach-none">
                No 545 Coach data is attached to this session.
              </p>
            )}
            <Button className="h-11" disabled={busy || session === null} onClick={() => fileInput.current?.click()} data-testid="coach-attach">
              Attach 545 Coach data
            </Button>
            {attached !== null && (
              <Button variant="outline" className="h-11" disabled={busy} onClick={() => void onRemove()} data-testid="coach-remove">
                Remove 545 Coach data
              </Button>
            )}
            <DialogFooter>
              <Button variant="ghost" className="h-11" disabled={busy} onClick={onClose} data-testid="coach-close">
                Close
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
