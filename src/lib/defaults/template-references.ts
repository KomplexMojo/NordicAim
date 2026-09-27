// template-reference.md §4, §5 (M26, REV-121). The shipped default reference sheets: the owner's blank sighting and
// precision sheets (2026-09-27), cut down to their target circles. The images are app assets in `public/templates/`;
// their size, hash and calibration (the app's own A4 on the image, §3 step 4) are recorded here, and
// `tests/unit/defaults/template-references.test.ts` checks them against the files.

import type { TemplateId } from '@/lib/domain/enums';
import type { Calibration } from '@/lib/domain/photo';

export interface DefaultTemplateReference {
  template: TemplateId;
  /** Relative to the app's base URL (`import.meta.env.BASE_URL`). */
  assetPath: string;
  widthPx: number;
  heightPx: number;
  sha256: string;
  calibration: Calibration;
}

export const DEFAULT_TEMPLATE_REFERENCE: Record<TemplateId, DefaultTemplateReference> = {
  sighting: {
    template: 'sighting',
    assetPath: 'templates/sighting-reference.jpg',
    widthPx: 1516,
    heightPx: 1516,
    sha256: 'aa868b9c86e18eecf3663eab519dc35fa4b39048537fbc6cce0dc29721de1da2',
    calibration: {
      cx: 758.556,
      cy: 761.908,
      radiusPx: 645.924,
      axisRatio: 0.99299,
      angleDeg: 8.605,
      anchorDiameterMm: 115,
      source: 'auto',
      confidence: 0.9726,
      perspective: { p: 0.0000192542, q: -0.0000665200 },
    },
  },
  precision: {
    template: 'precision',
    assetPath: 'templates/precision-reference.jpg',
    widthPx: 1936,
    heightPx: 1936,
    sha256: '3f52faf8636c7e0de34130d47d524e28efb1d836a65703a492a69b77719aebf9',
    calibration: {
      cx: 964.862,
      cy: 966.217,
      radiusPx: 625.795,
      axisRatio: 0.99311,
      angleDeg: 86.935,
      anchorDiameterMm: 112.4,
      source: 'auto',
      confidence: 0.8847,
      perspective: { p: -0.0001154824, q: 0.0000213718 },
    },
  },
};
