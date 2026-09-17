import { isCategorizationComplete } from './categorization';
import type { PhotoStatus, Reason, Warning } from './enums';
import type { Categorization } from './photo';
import type { AnalysisResult, TargetAnalysis } from './analysis';

const WARNING_ORDER: Warning[] = [
  'extra-candidates-dropped',
  'alignment-uncertain',
  'image-blurry',
  'template-mismatch',
];

function orderedWarnings(warnings: Warning[]): Reason[] {
  return WARNING_ORDER.filter((w) => warnings.includes(w));
}

export interface PhotoStatusInput {
  categorization: Categorization;
  analysis: TargetAnalysis;
  result: AnalysisResult | null;
}

export interface PhotoStatusOutput {
  status: PhotoStatus;
  reasons: Reason[];
}

/** analysis-pipeline §4. Rules apply in order; first match wins. */
export function photoStatus(input: PhotoStatusInput): PhotoStatusOutput {
  const { categorization, analysis, result } = input;
  const { pipeline } = analysis;
  const warnings = orderedWarnings(pipeline.warnings);

  // 1. categorization incomplete
  if (!isCategorizationComplete(categorization)) {
    return { status: 'needs-metadata', reasons: [] };
  }

  // 2. stage error
  if (pipeline.stageA === 'error' || pipeline.stageB === 'error') {
    return { status: 'failed', reasons: [] };
  }

  // 3. stageA pending/running, or stageB running
  if (pipeline.stageA === 'pending' || pipeline.stageA === 'running' || pipeline.stageB === 'running') {
    return { status: 'processing', reasons: [] };
  }

  // 4. stageB pending
  if (pipeline.stageB === 'pending') {
    return { status: 'ready', reasons: [...warnings] };
  }

  // 5. no calibration
  if (analysis.calibration === null) {
    return { status: 'needs-attention', reasons: ['target-not-found', ...warnings] };
  }

  // 6. no identified shots
  if (result === null || result.all.identified === 0) {
    return { status: 'needs-attention', reasons: ['no-shots-found', ...warnings] };
  }

  // 7. overcount in any subset
  if (result.subsets.some((s) => s.overcount > 0)) {
    return { status: 'needs-attention', reasons: ['too-many-shots', ...warnings] };
  }

  // 8. REV-28: the shot set was capped to the declared rounds, so the owner should confirm which
  // marks were kept before the score counts as finished.
  if (pipeline.warnings.includes('extra-candidates-dropped')) {
    return { status: 'needs-attention', reasons: [...warnings] };
  }

  // 9. analyzed
  const totalMissing = result.subsets.reduce((sum, s) => sum + s.missing, 0);
  const reasons: Reason[] = [];
  if (totalMissing > 0) reasons.push('rounds-unaccounted');
  reasons.push(...warnings);
  return { status: 'analyzed', reasons };
}
