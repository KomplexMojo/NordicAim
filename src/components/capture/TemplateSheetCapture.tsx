import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ReferenceHolesWarning } from '@/components/settings/ReferenceHolesWarning';
import { useReferenceMaker } from '@/components/settings/useReferenceMaker';
import { Button } from '@/components/ui/button';
import { useServices } from '@/lib/app/services';
import type { CameraErrorCode } from '@/lib/capture/camera';
import { cameraErrorMessage } from '@/lib/capture/messages';
import type { Size } from '@/lib/capture/overlay';
import type { TemplateId } from '@/lib/domain/enums';
import { getAppSettings } from '@/lib/services/settings';

import { CameraView, type CameraHandle } from './CameraView';
import { CaptureReview } from './CaptureReview';

interface TemplateSheetCaptureProps {
  template: TemplateId;
  fakeCamera: string | null;
  /** Leaves sheet mode: after a reference was stored, or on Cancel. */
  onDone(): void;
}

const TITLE: Record<TemplateId, string> = { sighting: 'Blank sighting sheet', precision: 'Blank precision sheet' };

/**
 * template-reference.md §2, §3 (M26, REV-121): the capture screen in **sheet mode**
 * (`#/settings/template-sheet/:template`), with that template's overlay to line the blank sheet up with. *Use photo*
 * makes the reference (§3); a refused photo stores nothing, and a sheet with holes asks first.
 */
export function TemplateSheetCapture({ template, fakeCamera, onDone }: TemplateSheetCaptureProps) {
  const { ctx } = useServices();
  const cameraRef = useRef<CameraHandle>(null);
  const [ready, setReady] = useState(false);
  const [cameraError, setCameraError] = useState<CameraErrorCode | null>(null);
  const [review, setReview] = useState<{ blob: Blob; url: string; frame: Size } | null>(null);
  const [holeDiameterMm, setHoleDiameterMm] = useState<number | null>(null);
  const maker = useReferenceMaker(template, holeDiameterMm ?? 5.6, () => {});

  useEffect(() => {
    void getAppSettings(ctx).then((s) => setHoleDiameterMm(s.profileOverrides.holeDiameterMm));
  }, [ctx]);

  useEffect(() => {
    if (!review) return;
    const { url } = review;
    return () => URL.revokeObjectURL(url);
  }, [review]);

  async function onShutter() {
    const camera = cameraRef.current;
    if (!camera) return;
    try {
      const shot = await camera.capture();
      setReview({ blob: shot.blob, url: URL.createObjectURL(shot.blob), frame: { w: shot.widthPx, h: shot.heightPx } });
    } catch (err) {
      toast.error(`Could not capture: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function onUsePhoto() {
    if (!review) return;
    const stored = await maker.make(review.blob);
    setReview(null);
    if (stored) onDone();
  }

  return (
    <main className="dark flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <Button variant="ghost" className="h-11 px-3 text-sm" onClick={onDone}>
          Cancel
        </Button>
        <span className="text-sm font-medium" data-testid="sheet-mode-title">
          {TITLE[template]}
        </span>
        <span className="w-[72px]" />
      </header>

      <div className="relative min-h-0 flex-1">
        <CameraView
          ref={cameraRef}
          template={template}
          outerDiameterFraction={0.8}
          fakeCamera={fakeCamera}
          debug={false}
          onReadyChange={setReady}
          onError={setCameraError}
        />
        {cameraError ? (
          <div className="absolute inset-x-4 top-1/3 rounded-lg bg-black/85 p-4 text-center text-sm text-white" role="alert">
            {cameraErrorMessage(cameraError)}
          </div>
        ) : (
          <div className="absolute inset-x-4 bottom-4 rounded-lg bg-black/70 p-3 text-center text-sm text-white">
            Line the rings up with a blank sheet, flat and in good light. Only the circles are kept.
          </div>
        )}
      </div>

      <footer className="flex flex-col gap-2 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {maker.busy && <p className="text-center text-sm text-muted-foreground">Checking the sheet…</p>}
        {maker.refused !== null && (
          <p className="text-center text-sm text-amber-400" role="alert" data-testid="sheet-refused">
            {maker.refused}
          </p>
        )}
        {maker.pending !== null && (
          <ReferenceHolesWarning
            onUse={() => void maker.useAnyway().then((stored) => stored && onDone())}
            onCancel={maker.discard}
            cancelLabel="Retake"
          />
        )}
        <div className="flex justify-center">
          <button
            type="button"
            aria-label="Shutter"
            className="size-[72px] rounded-full border-4 border-white bg-white/85 transition active:scale-95 disabled:opacity-40"
            disabled={!ready || maker.busy || holeDiameterMm === null}
            onClick={() => void onShutter()}
          />
        </div>
      </footer>

      {review && (
        <div className="fixed inset-0 z-50 bg-background pt-[env(safe-area-inset-top)]" data-testid="sheet-review">
          <CaptureReview
            imageUrl={review.url}
            overlay={{ kind: 'prior', frame: review.frame, prior: null }}
            saving={maker.busy}
            onRetake={() => setReview(null)}
            onUse={() => void onUsePhoto()}
          />
        </div>
      )}
    </main>
  );
}
