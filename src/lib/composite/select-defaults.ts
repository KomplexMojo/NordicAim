// rendering-composite.md §5 "Slot selection (automatic, pure)". Picks up to two photos per template
// for the session summary image, with no user interaction (the manual slot picker is backlog B5).

import type { TargetAnalysis } from '@/lib/domain/analysis';
import type { TemplateId } from '@/lib/domain/enums';
import { isTargetPhoto } from '@/lib/domain/backing';
import type { TargetPhoto } from '@/lib/domain/photo';
import { hasExplicitRole, sightingRoles } from '@/lib/domain/sighting-role';

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
 * REV-67 (rendering-composite.md §5): once the owner has marked any sighting target Sight in or Confirm, slot 1 is the most
 * recent Sight in and slot 2 the most recent Confirm; otherwise the two most recent, as before.
 */
function selectSighting(photos: TargetPhoto[], analyses: Map<string, TargetAnalysis>): [string | null, string | null] {
  const targets = photos.filter((p) => isTargetPhoto(p));
  if (!hasExplicitRole(targets)) return selectForTemplate(photos, analyses, 'sighting');
  const roles = sightingRoles(targets);
  const candidates = targets.filter(
    (p) => p.status === 'analyzed' && p.categorization.template === 'sighting' && (analyses.get(p.id)?.computed ?? null) !== null,
  );
  const latest = (role: 'sight-in' | 'confirm'): string | null =>
    [...candidates.filter((p) => roles.get(p.id) === role)].sort((a, b) => compareCandidates(a, b, analyses, 'sighting'))[0]?.id ?? null;
  return [latest('sight-in'), latest('confirm')];
}

/**
 * REV-90: slot 3 is the most recent Precision prone and slot 4 the most recent Precision standing. A session whose precision
 * targets have no single position (stored before REV-79 with "both", or not yet categorised) keeps the two most recent.
 */
function selectPrecision(photos: TargetPhoto[], analyses: Map<string, TargetAnalysis>): [string | null, string | null] {
  const candidates = photos.filter(
    (p) =>
      isTargetPhoto(p) &&
      p.status === 'analyzed' &&
      p.categorization.template === 'precision' &&
      (analyses.get(p.id)?.computed ?? null) !== null,
  );
  if (!candidates.some((p) => p.categorization.position === 'prone' || p.categorization.position === 'standing')) {
    return selectForTemplate(photos, analyses, 'precision');
  }
  const latest = (position: 'prone' | 'standing'): string | null =>
    [...candidates.filter((p) => p.categorization.position === position)].sort((a, b) => compareCandidates(a, b, analyses, 'precision'))[0]?.id ?? null;
  return [latest('prone'), latest('standing')];
}

/**
 * rendering-composite.md §5. A rejected target (M20: `needs-attention`, `too-many-holes`, `computed`
 * null) never reaches `status === 'analyzed'`, so it is never a candidate here.
 */
export function selectDefaultSlots(photos: TargetPhoto[], analyses: Map<string, TargetAnalysis>): SlotIds {
  return {
    sighting: selectSighting(photos, analyses),
    precision: selectPrecision(photos, analyses),
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
