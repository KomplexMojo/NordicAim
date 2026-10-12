import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useServices } from '@/lib/app/services';
import { ingestErrorMessage } from '@/lib/capture/messages';
import { emptyCategorization } from '@/lib/domain/categorization';
import { clientNow } from '@/lib/media/capture-time';
import { ingestPhoto } from '@/lib/services/ingest';
import { createNewSession } from '@/lib/services/quick-start';
import { deleteSession } from '@/lib/services/sessions';
import { maybeRequestPersistence } from '@/lib/store/persistence-browser';
import { cn } from '@/lib/utils';

/**
 * Issue #107: the New button — opens the photo library straight away (no camera overlay), then puts the picked photos in a
 * fresh session and goes on to the metadata step. Cancelling the picker creates nothing.
 */
export function NewSessionButton({ className }: { className?: string }) {
  const { ctx, imageTools } = useServices();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function addPhotos(files: File[]) {
    setProgress({ done: 0, total: files.length });
    try {
      const session = await createNewSession(ctx);
      let kept = 0;
      for (const [i, file] of files.entries()) {
        setProgress({ done: i, total: files.length });
        try {
          await ingestPhoto(
            ctx,
            {
              sessionId: session.id,
              blob: file,
              origin: 'import',
              originalFilename: file.name ? file.name.slice(0, 255) : null,
              ...clientNow(new Date()),
              capture: null,
              categorization: emptyCategorization(),
            },
            imageTools,
          );
          kept += 1;
        } catch (err) {
          toast.error(files.length > 1 ? `${file.name}: ${ingestErrorMessage(err)}` : ingestErrorMessage(err));
        }
      }
      if (kept === 0) {
        // Nothing could be read: leave no empty session behind.
        await deleteSession(ctx, session.id);
        return;
      }
      try {
        await maybeRequestPersistence(ctx);
      } catch {
        // The photos are saved; persistence is best-effort.
      }
      navigate(`/sessions/${session.id}/metadata`);
    } finally {
      setProgress(null);
    }
  }

  function onPicked(input: HTMLInputElement) {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length > 0) void addPhotos(files);
  }

  return (
    <>
      <Button
        variant="outline"
        className={cn('h-11 gap-2 px-4 text-base', className)}
        disabled={progress !== null}
        // The picker must open inside the tap itself, or iOS blocks it.
        onClick={() => inputRef.current?.click()}
        aria-label="New session from photos in your library"
        data-testid="new-session"
      >
        <Plus className="size-6 shrink-0" aria-hidden="true" />
        {progress === null ? 'New' : `Adding ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        data-testid="new-session-input"
        onChange={(e) => onPicked(e.currentTarget)}
      />
    </>
  );
}
