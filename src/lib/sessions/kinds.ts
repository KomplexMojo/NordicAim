// Issue #73 (REV-139): which kinds of target a session holds, for the marks on its Home row. Pure.

import { isTargetPhoto } from '../domain/backing';
import type { TargetPhoto } from '../domain/photo';
import { sightingRoles } from '../domain/sighting-role';
import { kindOfCategorization, TARGET_KIND_LABEL, TARGET_KINDS, type TargetKind } from '../domain/target-kind';

/** A session's targets by kind; `unknown` counts targets with no kind yet (not categorized). */
export interface SessionKinds {
  counts: Record<TargetKind, number>;
  unknown: number;
}

type KindInput = Pick<TargetPhoto, 'id' | 'sessionId' | 'origin' | 'importedAt' | 'captureTime' | 'categorization'>;

function emptyCounts(): Record<TargetKind, number> {
  return { 'sight-in': 0, confirm: 0, 'precision-prone': 0, 'precision-standing': 0 };
}

/**
 * Every session's kinds from one list of photos. A sighting target's kind is its chosen or inferred role within its own
 * session (REV-67), exactly as the results cards read it. Backing-card photos are not targets and are left out.
 */
export function kindsBySession(photos: KindInput[]): Map<string, SessionKinds> {
  const bySession = new Map<string, KindInput[]>();
  for (const p of photos) {
    if (!isTargetPhoto(p)) continue;
    bySession.set(p.sessionId, [...(bySession.get(p.sessionId) ?? []), p]);
  }
  const out = new Map<string, SessionKinds>();
  for (const [sessionId, list] of bySession) {
    const roles = sightingRoles(list);
    const kinds: SessionKinds = { counts: emptyCounts(), unknown: 0 };
    for (const p of list) {
      const kind = kindOfCategorization(p.categorization, roles.get(p.id) ?? null);
      if (kind === null) kinds.unknown += 1;
      else kinds.counts[kind] += 1;
    }
    out.set(sessionId, kinds);
  }
  return out;
}

/** One mark on a row: a kind (or `null`, not categorized yet) and how many targets it stands for. */
export interface KindMark {
  kind: TargetKind | null;
  count: number;
}

/** Up to this many targets, a row shows one mark per target; past it, one mark per kind with its count. */
export const MARKS_PER_TARGET_UP_TO = 4;

/** The marks a row shows, in the fixed kind order (Sight in, Confirm, Prone, Standing), uncategorized last. */
export function rowMarks(kinds: SessionKinds): KindMark[] {
  const groups: KindMark[] = [
    ...TARGET_KINDS.filter((k) => kinds.counts[k] > 0).map((k) => ({ kind: k, count: kinds.counts[k] })),
    ...(kinds.unknown > 0 ? [{ kind: null, count: kinds.unknown }] : []),
  ];
  const total = groups.reduce((t, g) => t + g.count, 0);
  if (total > MARKS_PER_TARGET_UP_TO) return groups;
  return groups.flatMap((g) => Array.from({ length: g.count }, () => ({ kind: g.kind, count: 1 })));
}

/** What a screen reader hears for a row: "4 targets: sight in, confirm, precision prone, precision standing". */
export function kindsLabel(kinds: SessionKinds, targets: number): string {
  const parts = [
    ...TARGET_KINDS.filter((k) => kinds.counts[k] > 0).map((k) => {
      const n = kinds.counts[k];
      const name = TARGET_KIND_LABEL[k].toLowerCase();
      return n === 1 ? name : `${n} ${name}`;
    }),
    ...(kinds.unknown > 0 ? [`${kinds.unknown} not categorized`] : []),
  ];
  const head = `${targets} ${targets === 1 ? 'target' : 'targets'}`;
  return parts.length === 0 ? head : `${head}: ${parts.join(', ')}`;
}
