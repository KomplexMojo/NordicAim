import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useServices } from '@/lib/app/services';
import { ingestErrorMessage } from '@/lib/capture/messages';
import type { PhotoOrigin } from '@/lib/domain/enums';
import type { Categorization } from '@/lib/domain/photo';
import { clientNow } from '@/lib/media/capture-time';
import { ingestPhoto } from '@/lib/services/ingest';
import { maybeRequestPersistence } from '@/lib/store/persistence-browser';

interface CaptureFallbacksProps {
  sessionId: string;
  categorization: Categorization;
  onImported(): void;
}

/** capture-overlay.md §1.8: native camera (`camera-native`) and Import from Photos (`import`), ingested one at a time. */
export function CaptureFallbacks({ sessionId, categorization, onImported }: CaptureFallbacksProps) {
  const { ctx, imageTools } = useServices();
  const nativeRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function ingestFiles(input: HTMLInputElement, origin: PhotoOrigin) {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    setProgress({ done: 0, total: files.length });
    for (const [i, file] of files.entries()) {
      try {
        await ingestPhoto(
          ctx,
          {
            sessionId,
            blob: file,
            origin,
            originalFilename: file.name ? file.name.slice(0, 255) : null,
            ...clientNow(new Date()),
            capture: null,
            categorization,
          },
          imageTools,
        );
        try {
          await maybeRequestPersistence(ctx);
        } catch {
          // The photo is saved; persistence is best-effort.
        }
        onImported();
      } catch (err) {
        toast.error(files.length > 1 ? `${file.name}: ${ingestErrorMessage(err)}` : ingestErrorMessage(err));
      }
      setProgress({ done: i + 1, total: files.length });
    }
    setProgress(null);
  }

  const busy = progress !== null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex w-full gap-2">
        <Button
          variant="outline"
          className="h-11 flex-1"
          disabled={busy}
          onClick={() => nativeRef.current?.click()}
        >
          Native camera
        </Button>
        <Button
          variant="outline"
          className="h-11 flex-1"
          disabled={busy}
          onClick={() => importRef.current?.click()}
        >
          Import from Photos
        </Button>
      </div>
      <input
        ref={nativeRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="native-camera-input"
        onChange={(e) => void ingestFiles(e.currentTarget, 'camera-native')}
      />
      <input
        ref={importRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        data-testid="import-input"
        onChange={(e) => void ingestFiles(e.currentTarget, 'import')}
      />
      {progress && (
        <p className="text-sm" role="status" data-testid="import-progress">
          Importing {Math.min(progress.done + 1, progress.total)} of {progress.total}…
        </p>
      )}
      <p className="text-center text-xs text-muted-foreground">
        HEIC photos can only be opened in Safari on iPhone or Mac.
      </p>
    </div>
  );
}
