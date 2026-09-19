import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useServices } from '@/lib/app/services';
import type { CameraErrorCode } from '@/lib/capture/camera';
import { cameraErrorMessage, ingestErrorMessage } from '@/lib/capture/messages';
import type { Size } from '@/lib/capture/overlay';
import { CARD_NO_COLOUR_MESSAGE } from '@/lib/domain/backing';
import { measureBackingCard } from '@/lib/services/backing-card';
import { maybeRequestPersistence } from '@/lib/store/persistence-browser';

import { CameraView, type CameraHandle } from './CameraView';
import { CaptureReview } from './CaptureReview';

interface BackingCardCaptureProps {
  fakeCamera: string | null;
  /** Leaves card mode: after a colour was stored, or on Cancel. */
  onDone(): void;
}

/**
 * backing-sheet.md §2: the capture screen in **card mode** (`#/settings/backing-card`). No target
 * overlay and no template picker — the card is just a flat colour — only a guide to fill the frame
 * with it. `Use photo` measures the colour (§4) and, when there is one, stores it as the Settings
 * backing. The card photo itself is not kept (REV-48).
 */
export function BackingCardCapture({ fakeCamera, onDone }: BackingCardCaptureProps) {
  const { ctx, imageTools } = useServices();
  const cameraRef = useRef<CameraHandle>(null);
  const [ready, setReady] = useState(false);
  const [cameraError, setCameraError] = useState<CameraErrorCode | null>(null);
  const [review, setReview] = useState<{ blob: Blob; url: string; frame: Size } | null>(null);
  const [busy, setBusy] = useState(false);
  const [noColour, setNoColour] = useState(false);

  useEffect(() => {
    if (!review) return;
    const { url } = review;
    return () => URL.revokeObjectURL(url);
  }, [review]);

  async function onShutter() {
    const camera = cameraRef.current;
    if (!camera) return;
    setBusy(true);
    try {
      const shot = await camera.capture();
      setNoColour(false);
      setReview({ blob: shot.blob, url: URL.createObjectURL(shot.blob), frame: { w: shot.widthPx, h: shot.heightPx } });
    } catch (err) {
      toast.error(`Could not capture: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onUsePhoto() {
    if (!review) return;
    setBusy(true);
    try {
      const result = await measureBackingCard(ctx, review.blob, imageTools);
      if (result.colour === null) {
        // §4.3: nothing stored; the shooter retakes it in even light.
        setNoColour(true);
        setReview(null);
        setBusy(false);
        return;
      }
    } catch (err) {
      toast.error(ingestErrorMessage(err));
      setBusy(false);
      return; // keep the review so the owner can retry
    }
    try {
      await maybeRequestPersistence(ctx);
    } catch {
      // The colour is saved; persistence is best-effort.
    }
    setReview(null);
    setBusy(false);
    onDone();
  }

  return (
    <main className="dark flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <Button
          variant="ghost"
          className="h-11 px-3 text-sm"
          onClick={onDone}
        >
          Cancel
        </Button>
        <span className="text-sm font-medium" data-testid="card-mode-title">
          Backing card
        </span>
        <span className="w-[72px]" />
      </header>

      <div className="relative min-h-0 flex-1">
        <CameraView
          ref={cameraRef}
          template={null}
          outerDiameterFraction={0.8}
          fakeCamera={fakeCamera}
          debug={false}
          onReadyChange={setReady}
          onError={setCameraError}
        />
        {!cameraError && (
          <div
            className="pointer-events-none absolute inset-8 rounded-lg border-2 border-dashed border-white/80"
            data-testid="card-fill-guide"
          />
        )}
        {cameraError ? (
          <div className="absolute inset-x-4 top-1/3 rounded-lg bg-black/85 p-4 text-center text-sm text-white" role="alert">
            {cameraErrorMessage(cameraError)}
          </div>
        ) : (
          <div className="absolute inset-x-4 bottom-4 rounded-lg bg-black/70 p-3 text-center text-sm text-white">
            Fill the frame with the backing card, in the same light as the targets.
          </div>
        )}
      </div>

      <footer className="flex flex-col gap-2 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {noColour && (
          <p className="text-center text-sm text-amber-400" role="alert" data-testid="card-colour-error">
            {CARD_NO_COLOUR_MESSAGE}
          </p>
        )}
        <div className="flex justify-center">
          <button
            type="button"
            aria-label="Shutter"
            className="size-[72px] rounded-full border-4 border-white bg-white/85 transition active:scale-95 disabled:opacity-40"
            disabled={!ready || busy}
            onClick={() => void onShutter()}
          />
        </div>
      </footer>

      {review && (
        <div className="fixed inset-0 z-50 bg-background pt-[env(safe-area-inset-top)]" data-testid="card-review">
          <CaptureReview
            imageUrl={review.url}
            overlay={{ kind: 'prior', frame: review.frame, prior: null }}
            saving={busy}
            onRetake={() => setReview(null)}
            onUse={() => void onUsePhoto()}
          />
        </div>
      )}
    </main>
  );
}
