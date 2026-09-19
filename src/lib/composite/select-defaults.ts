// rendering-composite.md §5 "Slot selection (automatic, pure)". Picks up to two photos per template
// for the session summary image, with no user interaction (the manual slot picker is backlog B5).

import type { TargetAnalysis } from '@/lib/domain/analysis';
import type { TemplateId } from '@/lib/domain/enums';
import { isTargetPhoto } from '@/lib/domain/backing';
import type { TargetPhoto } from '@/lib/domain/photo';

export interface SlotIds {
  sighting: [string | null, string | null];
  precision: [string | null, string | null];
}

/** `captureTime.utc` descending, null last. */
function compareUtcDescNullLast(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (a === b) return 0;
  return a < b ? 1 : -1;
}

/**
 * The tie-break score used only when `captureTime.utc` and `importedAt` are both equal (rare in
 * practice, but keeps the sort total): lower is preferred. Precision: higher `identifiedTotal` wins;
 * sighting: smaller `extremeSpreadMm` wins, null (no group at all) is worst.
 */
function tieBreakRank(analysis: TargetAnalysis, template: TemplateId): number {
  const result = analysis.computed!.result;
  if (template === 'precision') return -(result.all.precision?.identifiedTotal ?? 0);
  const es = result.all.extremeSpreadMm;
  return es === null ? Number.POSITIVE_INFINITY : es;
}

function compareCandidates(
  a: TargetPhoto,
  b: TargetPhoto,
  analyses: Map<string, TargetAnalysis>,
  template: TemplateId,
): number {
  const utcCmp = compareUtcDescNullLast(a.captureTime.utc, b.captureTime.utc);
  if (utcCmp !== 0) return utcCmp;
  if (a.importedAt !== b.importedAt) return a.importedAt < b.importedAt ? 1 : -1; // importedAt descending
  return tieBreakRank(analyses.get(a.id)!, template) - tieBreakRank(analyses.get(b.id)!, template);
}

/** Up to two photo ids for one template, older first (§5: "order chronologically, older = slot 1"). */
function selectForTemplate(photos: TargetPhoto[], analyses: Map<string, TargetAnalysis>, template: TemplateId): [string | null, string | null] {
  const candidates = photos.filter(
    (p) =>
      isTargetPhoto(p) &&
      p.status === 'analyzed' &&
      p.categorization.template === template &&
      (analyses.get(p.id)?.computed ?? null) !== null,
  );
  const sorted = [...candidates].sort((a, b) => compareCandidates(a, b, analyses, template));
  const topTwo = sorted.slice(0, 2);
  const chronological = [...topTwo].reverse(); // topTwo is most-recent-first; reverse to oldest-first
  return [chronological[0]?.id ?? null, chronological[1]?.id ?? null];
}

/**
 * rendering-composite.md §5. A rejected target (M20: `needs-attention`, `too-many-holes`, `computed`
 * null) never reaches `status === 'analyzed'`, so it is never a candidate here.
 */
export function selectDefaultSlots(photos: TargetPhoto[], analyses: Map<string, TargetAnalysis>): SlotIds {
  return {
    sighting: selectForTemplate(photos, analyses, 'sighting'),
    precision: selectForTemplate(photos, analyses, 'precision'),
  };
}

/**
 * Owner report 2026-09-19: targets the summary image leaves out because they need attention (or failed).
 * `selectDefaultSlots` only takes `analyzed` photos, and it did so silently, so a session with a new
 * target flagged for attention looked as if the summary had never been updated. The Summary card says so.
 */
export function leftOutOfSummary(photos: TargetPhoto[]): number {
  return photos.filter((p) => isTargetPhoto(p) && (p.status === 'needs-attention' || p.status === 'failed')).length;
}
