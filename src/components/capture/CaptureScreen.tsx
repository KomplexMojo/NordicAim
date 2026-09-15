import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useServices } from '@/lib/app/services';
import type { CameraErrorCode } from '@/lib/capture/camera';
import { cameraErrorMessage, ingestErrorMessage } from '@/lib/capture/messages';
import { calibrationPriorFromOverlay, type Size } from '@/lib/capture/overlay';
import { loadCapturePrefs, saveCapturePrefs, type CapturePrefs } from '@/lib/capture/prefs-browser';
import { defaultCategorization, emptyCategorization } from '@/lib/domain/categorization';
import type { Position, TemplateId } from '@/lib/domain/enums';
import type { Calibration } from '@/lib/domain/photo';
import { clientNow } from '@/lib/media/capture-time';
import { ingestPhoto } from '@/lib/services/ingest';
import { maybeRequestPersistence } from '@/lib/store/persistence-browser';

import { CameraView, type CameraHandle } from './CameraView';
import { CaptureFallbacks } from './CaptureFallbacks';
import { CaptureReview } from './CaptureReview';
import { SizeSlider } from './SizeSlider';
import { TemplatePositionPicker } from './TemplatePositionPicker';

interface Review {
  blob: Blob;
  url: string;
  frame: Size;
  prior: Calibration;
  trackSettings: Record<string, string | number | boolean> | null;
  template: TemplateId;
  position: Position;
  outerDiameterFraction: number;
}

interface CaptureScreenProps {
  sessionId: string;
  initialCount: number;
  fakeCamera: string | null;
  debug: boolean;
}

/** capture-overlay.md §1: pick template/position → align → shutter → review → Use photo → next target → Done. */
export function CaptureScreen({ sessionId, initialCount, fakeCamera, debug }: CaptureScreenProps) {
  const { ctx, imageTools } = useServices();
  const navigate = useNavigate();
  const cameraRef = useRef<CameraHandle>(null);
  const [prefs, setPrefs] = useState<CapturePrefs>(() => loadCapturePrefs(sessionId));
  const [count, setCount] = useState(initialCount);
  const [ready, setReady] = useState(false);
  const [cameraError, setCameraError] = useState<CameraErrorCode | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);

  // Revoke the review image URL when the review is replaced or the screen unmounts.
  useEffect(() => {
    if (!review) return;
    const { url } = review;
    return () => URL.revokeObjectURL(url);
  }, [review]);

  function updatePrefs(patch: Partial<CapturePrefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveCapturePrefs(sessionId, next);
  }

  async function onShutter() {
    const { template, position, outerDiameterFraction } = prefs;
    const camera = cameraRef.current;
    if (!template || !position || !camera) return;
    setBusy(true);
    try {
      const shot = await camera.capture();
      const frame = { w: shot.widthPx, h: shot.heightPx };
      setReview({
        blob: shot.blob,
        url: URL.createObjectURL(shot.blob),
        frame,
        prior: calibrationPriorFromOverlay(shot.container, frame, template, outerDiameterFraction),
        trackSettings: shot.trackSettings,
        template,
        position,
        outerDiameterFraction,
      });
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
      // capture-overlay.md §5
      await ingestPhoto(
        ctx,
        {
          sessionId,
          blob: review.blob,
          origin: 'camera-overlay',
          originalFilename: null,
          ...clientNow(new Date()),
          capture: {
            overlayTemplate: review.template,
            outerDiameterFraction: review.outerDiameterFraction,
            frameWidthPx: review.frame.w,
            frameHeightPx: review.frame.h,
            calibrationPriorFramePx: review.prior,
            trackSettings: review.trackSettings,
          },
          categorization: defaultCategorization(review.template, review.position),
        },
        imageTools,
      );
    } catch (err) {
      toast.error(ingestErrorMessage(err));
      setBusy(false);
      return; // keep the review so the owner can retry
    }
    try {
      await maybeRequestPersistence(ctx);
    } catch {
      // The photo is saved; persistence is best-effort.
    }
    setCount((c) => c + 1);
    setReview(null);
    setBusy(false);
  }

  const { template, position, outerDiameterFraction } = prefs;
  const canShoot = ready && template !== null && position !== null && !busy;
  const importCategorization =
    template !== null && position !== null ? defaultCategorization(template, position) : emptyCategorization();

  return (
    <main className="dark flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <Link to="/" className="inline-flex h-11 items-center px-2 text-sm underline underline-offset-4">
          Home
        </Link>
        <Badge variant="secondary" className="h-7 px-3 text-sm" data-testid="capture-count">
          {count} captured
        </Badge>
        <Button className="h-11 px-5 text-base" onClick={() => navigate(`/sessions/${sessionId}/metadata`)}>
          Done
        </Button>
      </header>

      <div className="px-2 pb-2">
        <TemplatePositionPicker
          template={template}
          position={position}
          onTemplateChange={(t) => updatePrefs({ template: t })}
          onPositionChange={(p) => updatePrefs({ position: p })}
        />
      </div>

      <div className="relative min-h-0 flex-1">
        <CameraView
          ref={cameraRef}
          template={template}
          outerDiameterFraction={outerDiameterFraction}
          fakeCamera={fakeCamera}
          debug={debug}
          onReadyChange={setReady}
          onError={setCameraError}
        />
        {cameraError && (
          <div className="absolute inset-x-4 top-1/3 rounded-lg bg-black/85 p-4 text-center text-sm text-white" role="alert">
            {cameraErrorMessage(cameraError)}
          </div>
        )}
        {!cameraError && (template === null || position === null) && (
          <div className="absolute inset-x-4 bottom-4 rounded-lg bg-black/70 p-3 text-center text-sm text-white">
            Pick a template and position to start.
          </div>
        )}
      </div>

      <footer className="flex flex-col gap-2 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <SizeSlider value={outerDiameterFraction} onChange={(v) => updatePrefs({ outerDiameterFraction: v })} />
        <div className="flex justify-center">
          <button
            type="button"
            aria-label="Shutter"
            className="size-[72px] rounded-full border-4 border-white bg-white/85 transition active:scale-95 disabled:opacity-40"
            disabled={!canShoot}
            onClick={() => void onShutter()}
          />
        </div>
        <CaptureFallbacks
          sessionId={sessionId}
          categorization={importCategorization}
          onImported={() => setCount((c) => c + 1)}
        />
      </footer>

      {review && (
        <div className="fixed inset-0 z-50 bg-background pt-[env(safe-area-inset-top)]" data-testid="capture-review">
          <CaptureReview
            imageUrl={review.url}
            frame={review.frame}
            prior={review.prior}
            saving={busy}
            onRetake={() => setReview(null)}
            onUse={() => void onUsePhoto()}
          />
        </div>
      )}
    </main>
  );
}
