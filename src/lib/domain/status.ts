import { isCategorizationComplete } from './categorization';
import type { PhotoStatus, Reason, Warning } from './enums';
import type { Categorization } from './photo';
import type { AnalysisResult, TargetAnalysis } from './analysis';

const WARNING_ORDER: Warning[] = [
  'extra-candidates-dropped',
  'too-many-holes',
  'double-punch-assumed',
  'rounds-scored-as-miss',
  'backing-colour-not-found',
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

  // 7a. REV-39 / M20: clearly more holes than the declared rounds — the target is rejected and carries
  // no score (`computed` is null). Evaluated here, ahead of rules 6 and 7, because a rejected target has
  // no result: in the spec's position rule 6 would always report it as `no-shots-found` instead. See
  // M20's Open questions.
  if (pipeline.warnings.includes('too-many-holes')) {
    return { status: 'needs-attention', reasons: ['too-many-holes', ...warnings.filter((w) => w !== 'too-many-holes')] };
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

  // 9. REV-31: the overlay fallback means no disc was found, so the rings sit where the owner aimed.
  // A guess must not present as a finished score. A measured `cv` alignment with `outsidePrior` keeps
  // its `alignment-uncertain` warning as an appended note and falls through to rule 10.
  if (pipeline.alignment.method === 'overlay') {
    return {
      status: 'needs-attention',
      reasons: ['alignment-uncertain', ...warnings.filter((w) => w !== 'alignment-uncertain')],
    };
  }

  // 10. analyzed
  const totalMissing = result.subsets.reduce((sum, s) => sum + s.missing, 0);
  const reasons: Reason[] = [];
  // REV-39: a round reconciliation scored as a miss is reported by `rounds-scored-as-miss`, not as an
  // unaccounted round (the score is definite; there is no range any more).
  if (totalMissing > 0 && !pipeline.warnings.includes('rounds-scored-as-miss')) reasons.push('rounds-unaccounted');
  reasons.push(...warnings);
  return { status: 'analyzed', reasons };
}
