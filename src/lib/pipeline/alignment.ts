// analysis-pipeline §3. Pure: picks the calibration for a photo from the overlay prior and the CV
// detection. REV-25: a measured disc always beats the prior.

import type { Calibration } from '@/lib/domain/photo';

export interface AnchorDetection {
  calibration: Calibration;
  confidence: number;
  /** A real disc was measured, but further from the overlay than the prior gate allows (M10 step 3.3). */
  outsidePrior: boolean;
}

export interface ChooseAlignmentInput {
  /** `capture.calibrationPriorFramePx` scaled to working px, else null. */
  prior: Calibration | null;
  detection: AnchorDetection | null;
}

export interface AlignmentChoice {
  calibration: Calibration | null;
  method: 'cv' | 'overlay' | 'none';
  confidence: number | null;
  warnings: Array<'alignment-uncertain'>;
}

/** analysis-pipeline §3 (the table). */
export function chooseAlignment(input: ChooseAlignmentInput): AlignmentChoice {
  const { prior, detection } = input;

  if (detection !== null) {
    return {
      calibration: { ...detection.calibration, source: 'auto', confidence: detection.confidence },
      method: 'cv',
      confidence: detection.confidence,
      warnings: detection.outsidePrior ? ['alignment-uncertain'] : [],
    };
  }

  if (prior !== null) {
    return {
      calibration: { ...prior, source: 'overlay', confidence: null },
      method: 'overlay',
      confidence: null,
      warnings: ['alignment-uncertain'],
    };
  }

  return { calibration: null, method: 'none', confidence: null, warnings: [] };
}
