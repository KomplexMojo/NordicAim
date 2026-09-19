import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useServices } from '@/lib/app/services';
import { ingestErrorMessage } from '@/lib/capture/messages';
import type { PhotoOrigin, TemplateId } from '@/lib/domain/enums';
import type { Categorization } from '@/lib/domain/photo';
import { clientNow } from '@/lib/media/capture-time';
import { ingestPhoto } from '@/lib/services/ingest';
import { maybeRequestPersistence } from '@/lib/store/persistence-browser';

import { CaptureReview } from './CaptureReview';

interface CaptureFallbacksProps {
  sessionId: string;
  categorization: Categorization;
  template: TemplateId | null;
  outerDiameterFraction: number;
  onImported(): void;
}

/** One photo of a picked batch, currently shown on the review screen. */
interface Session {
  files: File[];
  origin: PhotoOrigin;
  index: number;
  url: string;
}

/**
 * capture-overlay.md §1.8, REV-50: native camera (`camera-native`) and Import from Photos
 * (`import`) both route through the review screen (§1.5), one photo at a time, with Keep/Discard.
 * The overlay shown is informational only — imports keep `prior: null` (Decisions #1).
 */
export function CaptureFallbacks({ sessionId, categorization, template, outerDiameterFraction, onImported }: CaptureFallbacksProps) {
  const { ctx, imageTools } = useServices();
  const nativeRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [saving, setSaving] = useState(false);

  // Revoke the current photo's object URL once it is replaced or the screen unmounts.
  useEffect(() => {
    if (!session) return;
    const { url } = session;
    return () => URL.revokeObjectURL(url);
  }, [session]);

  /** Opens the review screen on `files[index]`, or closes it once every file has been reviewed. */
  function goTo(files: File[], origin: PhotoOrigin, index: number) {
    if (index >= files.length) {
      setSession(null);
      return;
    }
    setSession({ files, origin, index, url: URL.createObjectURL(files[index]!) });
  }

  function pickFiles(input: HTMLInputElement, origin: PhotoOrigin) {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    goTo(files, origin, 0);
  }

  async function onKeep() {
    if (!session) return;
    const file = session.files[session.index]!;
    setSaving(true);
    try {
      await ingestPhoto(
        ctx,
        {
          sessionId,
          blob: file,
          origin: session.origin,
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
      toast.error(session.files.length > 1 ? `${file.name}: ${ingestErrorMessage(err)}` : ingestErrorMessage(err));
    } finally {
      setSaving(false);
      goTo(session.files, session.origin, session.index + 1);
    }
  }

  function onDiscard() {
    if (!session) return;
    goTo(session.files, session.origin, session.index + 1);
  }

  const busy = session !== null;
  const total = session?.files.length ?? 0;
  const header =
    session === null
      ? null
      : session.origin === 'import'
        ? total > 1
          ? `Imported photo ${session.index + 1} of ${total}`
          : 'Imported photo'
        : 'Native photo';

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
        onChange={(e) => pickFiles(e.currentTarget, 'camera-native')}
      />
      <input
        ref={importRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        data-testid="import-input"
        onChange={(e) => pickFiles(e.currentTarget, 'import')}
      />
      <p className="text-center text-xs text-muted-foreground">
        HEIC photos can only be opened in Safari on iPhone or Mac.
      </p>
      {session && (
        <div className="fixed inset-0 z-50 bg-background pt-[env(safe-area-inset-top)]" data-testid="capture-review">
          <CaptureReview
            imageUrl={session.url}
            header={header}
            overlay={template ? { kind: 'template', template, outerDiameterFraction } : undefined}
            saving={saving}
            retakeLabel="Discard"
            useLabel="Keep"
            onRetake={onDiscard}
            onUse={() => void onKeep()}
          />
        </div>
      )}
    </div>
  );
}
