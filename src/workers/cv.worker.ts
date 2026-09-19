import * as Comlink from 'comlink';

import { calibrationWithPerspective } from '@/lib/cv/alignment-perspective';
import { ANCHOR_DIAMETER_MM, detectAnchor } from '@/lib/cv/anchor';
import { detectShotsWithBacking } from '@/lib/cv/backing-colour';
import { loadOpenCv } from '@/lib/cv/opencv';
import { sharpness } from '@/lib/cv/sharpness';
import { splitCluster, type PointMm } from '@/lib/cv/split-cluster';
import { hintTemplate } from '@/lib/cv/template-hint';
import type { TemplateId } from '@/lib/domain/enums';
import type { Calibration } from '@/lib/domain/photo';
import type { RgbaImage } from '@/lib/media/format';

import type { BackingInput, CvWorkerApi, DetectShotsResult, ReviewAndAlignResult } from './cv-client';

/** analysis-pipeline §6: JPEG bytes -> RgbaImage, via createImageBitmap + OffscreenCanvas. */
async function decodeToRgba(bytes: ArrayBuffer): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('OffscreenCanvas 2D context unavailable');
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { data: imageData.data, width: imageData.width, height: imageData.height };
  } finally {
    bitmap.close();
  }
}

const api: CvWorkerApi = {
  async ping() {
    const t = performance.now();
    const cv = await loadOpenCv();
    return { loadedMs: performance.now() - t, hasMat: typeof cv.Mat === 'function' };
  },

  async reviewAndAlign(
    workingJpeg: ArrayBuffer,
    prior: Calibration | null,
    templateHint: TemplateId | null,
  ): Promise<ReviewAndAlignResult> {
    const cv = await loadOpenCv();
    const img = await decodeToRgba(workingJpeg);

    // A3: review the image.
    const sharpnessScore = sharpness(cv, img);

    // A4: find the anchor disc. Imports carry no overlay template, so both anchor sizes are searched.
    const anchorDiameterMm = templateHint === null ? 'both' : ANCHOR_DIAMETER_MM[templateHint];
    const detection = detectAnchor(cv, img, prior, anchorDiameterMm);

    // The hint needs a disc to walk its rays from: the measured one if there is one, else the prior.
    const hintCalibration = detection?.calibration ?? prior;
    const hint = hintCalibration === null ? null : hintTemplate(cv, img, hintCalibration);

    // A4, REV-44 (M18): measure every printed circle and store the sheet's tilt with the disc, so the
    // rings land on the printed rings at the centre too. The circles measured are the template's: the
    // overlay's when the photo was captured through it, else A3's hint, else the one whose anchor size
    // the disc was measured at. A failed measurement keeps the disc with `perspective: null` — the
    // pre-M18 calibration.
    if (detection === null) return { detection, sharpness: sharpnessScore, templateHint: hint };
    const template: TemplateId =
      templateHint ??
      hint?.template ??
      (detection.calibration.anchorDiameterMm === ANCHOR_DIAMETER_MM.sighting ? 'sighting' : 'precision');
    const refined = calibrationWithPerspective(img, detection.calibration, template);
    return {
      detection: { ...detection, calibration: refined ?? detection.calibration },
      sharpness: sharpnessScore,
      templateHint: hint,
    };
  },

  async detectShots(
    workingJpeg: ArrayBuffer,
    calibration: Calibration,
    template: TemplateId,
    holeDiameterMm: number,
    backing: BackingInput,
  ): Promise<DetectShotsResult> {
    const cv = await loadOpenCv();
    const img = await decodeToRgba(workingJpeg);

    // A5: rectify with the chosen alignment, then segment the holes (M11 steps 1-5) — by the
    // backing's colour first when there is one (REV-38, backing-sheet.md §5).
    return detectShotsWithBacking(cv, img, calibration, template, holeDiameterMm, backing);
  },

  async splitCluster(pointsMm: PointMm[], k: number): Promise<PointMm[]> {
    const cv = await loadOpenCv();
    return splitCluster(cv, pointsMm, k);
  },
};

Comlink.expose(api);
