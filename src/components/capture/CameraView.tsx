import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type Ref } from 'react';

import {
  cameraErrorCode,
  grabFrame,
  startCamera,
  stopCamera,
  streamTrackSettings,
  type CameraErrorCode,
} from '@/lib/capture/camera';
import { OVERLAY_LABELS } from '@/lib/capture/messages';
import { coverTransform, type Size } from '@/lib/capture/overlay';
import { acquireWakeLock } from '@/lib/capture/wake-lock-browser';
import type { TemplateId } from '@/lib/domain/enums';

import { OverlaySvg } from './OverlaySvg';

export interface CameraCapture {
  blob: Blob;
  widthPx: number;
  heightPx: number;
  /** Viewfinder container size (css px) at the moment of capture. */
  container: Size;
  trackSettings: Record<string, string | number | boolean> | null;
}

export interface CameraHandle {
  capture(): Promise<CameraCapture>;
}

interface CameraViewProps {
  ref?: Ref<CameraHandle>;
  template: TemplateId | null;
  outerDiameterFraction: number;
  /** Raw `fakeCamera` query value; only honoured when VITE_FAKE_CAMERA === '1'. */
  fakeCamera: string | null;
  debug: boolean;
  onReadyChange(ready: boolean): void;
  onError(code: CameraErrorCode | null): void;
}

async function openStream(fakeCamera: string | null): Promise<{ stream: MediaStream; fake: boolean }> {
  if (import.meta.env.VITE_FAKE_CAMERA === '1' && fakeCamera !== null) {
    const fakeModule = await import('@/lib/capture/fake-camera');
    const name = fakeModule.parseFakeCameraName(fakeCamera);
    if (name !== null) return { stream: await fakeModule.startFakeCamera(name), fake: true };
  }
  return { stream: await startCamera(), fake: false };
}

function measure(el: HTMLElement): Size {
  const r = el.getBoundingClientRect();
  return { w: r.width, h: r.height };
}

/** capture-overlay.md §2: live viewfinder (object-fit: cover), overlay, wake lock, visibility handling. */
export function CameraView({ ref, template, outerDiameterFraction, fakeCamera, debug, onReadyChange, onError }: CameraViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [container, setContainer] = useState<Size | null>(null);
  const [frame, setFrame] = useState<Size | null>(null);
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  const [fake, setFake] = useState(false);

  const reportReady = useEffectEvent((ready: boolean) => onReadyChange(ready));
  const reportError = useEffectEvent((code: CameraErrorCode | null) => onError(code));

  useImperativeHandle(
    ref,
    () => ({
      async capture() {
        const video = videoRef.current;
        const el = containerRef.current;
        if (!video || !el) throw new Error('Camera is not ready');
        const shot = await grabFrame(video);
        return { ...shot, container: measure(el), trackSettings: streamTrackSettings(streamRef.current) };
      },
    }),
    [],
  );

  // Visibility: stop the camera and wake lock when hidden, restart both when visible.
  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Layout: recompute after loadedmetadata, video resize, container ResizeObserver, and orientationchange.
  useEffect(() => {
    const el = containerRef.current;
    const video = videoRef.current;
    if (!el || !video) return;
    const recompute = () => {
      const next = measure(el);
      setContainer((prev) => (prev && prev.w === next.w && prev.h === next.h ? prev : next));
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        setFrame((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
        reportReady(true);
      }
    };
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    video.addEventListener('loadedmetadata', recompute);
    video.addEventListener('resize', recompute);
    window.addEventListener('orientationchange', recompute);
    return () => {
      observer.disconnect();
      video.removeEventListener('loadedmetadata', recompute);
      video.removeEventListener('resize', recompute);
      window.removeEventListener('orientationchange', recompute);
    };
  }, []);

  // Camera + wake lock lifecycle.
  useEffect(() => {
    const video = videoRef.current;
    if (!visible || !video) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let wakeLock: { release(): Promise<void> } | null = null;

    void (async () => {
      try {
        const opened = await openStream(fakeCamera);
        if (cancelled) {
          stopCamera(opened.stream);
          return;
        }
        stream = opened.stream;
        streamRef.current = opened.stream;
        setFake(opened.fake);
        reportError(null);
        video.muted = true;
        video.srcObject = opened.stream;
        video.play().catch(() => {});
        const lock = await acquireWakeLock();
        if (cancelled) {
          void lock?.release().catch(() => {});
          return;
        }
        wakeLock = lock;
      } catch (err) {
        if (!cancelled) reportError(cameraErrorCode(err, globalThis.isSecureContext));
      }
    })();

    return () => {
      cancelled = true;
      if (stream) stopCamera(stream);
      streamRef.current = null;
      video.srcObject = null;
      void wakeLock?.release().catch(() => {});
      reportReady(false);
    };
  }, [visible, fakeCamera]);

  const cover = container && frame ? coverTransform(container, frame) : null;

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-black" data-testid="camera-view">
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 size-full object-cover" />
      {template && container && (
        <OverlaySvg size={container} template={template} outerDiameterFraction={outerDiameterFraction} />
      )}
      <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-col items-center gap-1.5">
        {template && (
          <span className="rounded-full bg-black/65 px-3 py-1.5 text-center text-sm text-white" data-testid="overlay-label">
            {OVERLAY_LABELS[template]}
          </span>
        )}
        {import.meta.env.VITE_FAKE_CAMERA === '1' && fake && (
          <span className="rounded bg-amber-500 px-2 py-0.5 text-xs font-bold text-black">FAKE CAMERA</span>
        )}
        {debug && (
          <span className="rounded bg-black/70 px-2 py-0.5 font-mono text-xs text-white" data-testid="debug-chip">
            {frame ? `${frame.w}×${frame.h}` : 'no frame'}
            {cover && ` · k ${cover.k.toFixed(4)} · ox ${cover.ox.toFixed(1)} · oy ${cover.oy.toFixed(1)}`}
          </span>
        )}
      </div>
    </div>
  );
}
