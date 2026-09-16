import * as Comlink from 'comlink';

import type { TemplateId } from '@/lib/domain/enums';
import type { Calibration } from '@/lib/domain/photo';

/** analysis-pipeline §6: what `reviewAndAlign` gives Stage A back. */
export interface ReviewAndAlignResult {
  detection: { calibration: Calibration; confidence: number; outsidePrior: boolean } | null;
  sharpness: number;
  templateHint: { template: TemplateId; confidence: number } | null;
}

export interface CvWorkerApi {
  ping(): Promise<{ loadedMs: number; hasMat: boolean }>;
  /** `templateHint` is `capture.overlayTemplate`; null (an import) searches for both anchor sizes. */
  reviewAndAlign(
    workingJpeg: ArrayBuffer,
    prior: Calibration | null,
    templateHint: TemplateId | null,
  ): Promise<ReviewAndAlignResult>;
}

let client: Comlink.Remote<CvWorkerApi> | undefined;

export function getCvClient(): Comlink.Remote<CvWorkerApi> {
  client ??= Comlink.wrap<CvWorkerApi>(
    new Worker(new URL('./cv.worker.ts', import.meta.url), { type: 'module' }),
  );
  return client;
}
