import * as Comlink from 'comlink';

import type { PointMm } from '@/lib/cv/split-cluster';
import type { Shot } from '@/lib/domain/analysis';
import type { TemplateId } from '@/lib/domain/enums';
import type { Calibration } from '@/lib/domain/photo';

/** analysis-pipeline §6: what `reviewAndAlign` gives Stage A back. */
export interface ReviewAndAlignResult {
  detection: { calibration: Calibration; confidence: number; outsidePrior: boolean } | null;
  sharpness: number;
  templateHint: { template: TemplateId; confidence: number } | null;
}

/** analysis-pipeline §6: what `detectShots` gives Stage A back. */
export interface DetectShotsResult {
  shots: Shot[];
}

export interface CvWorkerApi {
  ping(): Promise<{ loadedMs: number; hasMat: boolean }>;
  /** `templateHint` is `capture.overlayTemplate`; null (an import) searches for both anchor sizes. */
  reviewAndAlign(
    workingJpeg: ArrayBuffer,
    prior: Calibration | null,
    templateHint: TemplateId | null,
  ): Promise<ReviewAndAlignResult>;
  /** M11 (A5). `calibration` is in the working image's pixel space; shots come back in mm. */
  detectShots(
    workingJpeg: ArrayBuffer,
    calibration: Calibration,
    template: TemplateId,
    holeDiameterMm: number,
  ): Promise<DetectShotsResult>;
  /**
   * M11 step 6, for M13's Adjust screen: `k` centroids in mm for one cluster's points. Not listed in
   * analysis-pipeline §6 (see the M11 Open questions); the milestone's Files section asks for it here.
   */
  splitCluster(pointsMm: PointMm[], k: number): Promise<PointMm[]>;
}

let client: Comlink.Remote<CvWorkerApi> | undefined;

export function getCvClient(): Comlink.Remote<CvWorkerApi> {
  client ??= Comlink.wrap<CvWorkerApi>(
    new Worker(new URL('./cv.worker.ts', import.meta.url), { type: 'module' }),
  );
  return client;
}
