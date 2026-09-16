// analysis-pipeline §5. Pure planner: no clock, no randomness, no IO.

import { isCategorizationComplete } from '@/lib/domain/categorization';
import type { TargetAnalysis } from '@/lib/domain/analysis';
import type { TargetPhoto } from '@/lib/domain/photo';
import type { BiathlonSession } from '@/lib/domain/session';

export type Job = { kind: 'A'; photoId: string } | { kind: 'B'; photoId: string };

/** `importedAt` ascending; ties broken by id so the order is deterministic. */
function byImportedAt(a: TargetPhoto, b: TargetPhoto): number {
  if (a.importedAt !== b.importedAt) return a.importedAt < b.importedAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * analysis-pipeline §5: every photo whose Stage A is unfinished gets an `A` job; every photo in a
 * session with `analyzeRequestedAt` set, complete categorization and Stage A done gets a `B` job.
 * All A jobs come first, each group ordered by `importedAt`.
 */
export function planJobs(
  sessions: BiathlonSession[],
  photos: TargetPhoto[],
  analyses: TargetAnalysis[],
): Job[] {
  const analysisByPhoto = new Map(analyses.map((a) => [a.photoId, a]));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  const aJobs: Job[] = [];
  const bJobs: Job[] = [];

  for (const photo of [...photos].sort(byImportedAt)) {
    const analysis = analysisByPhoto.get(photo.id);
    if (analysis === undefined) continue;
    const { stageA, stageB } = analysis.pipeline;

    if (stageA === 'pending' || stageA === 'running') {
      aJobs.push({ kind: 'A', photoId: photo.id });
    }

    const session = sessionById.get(photo.sessionId);
    if (
      session !== undefined &&
      session.analyzeRequestedAt !== null &&
      isCategorizationComplete(photo.categorization) &&
      stageA === 'done' &&
      (stageB === 'pending' || stageB === 'running')
    ) {
      bJobs.push({ kind: 'B', photoId: photo.id });
    }
  }

  return [...aJobs, ...bJobs];
}
