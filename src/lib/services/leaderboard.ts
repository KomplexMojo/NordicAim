// leaderboard.md §4 (issue #42): reads the shooter's own precision targets for the Board. Every record that parses is used; one
// unreadable record never blanks the screen.

import { TargetAnalysis } from '@/lib/domain/analysis';
import { TargetPhoto } from '@/lib/domain/photo';
import { BiathlonSession, upgradeSession } from '@/lib/domain/session';
import type { MyBoardTarget } from '@/lib/leaderboard/select';
import { boardTarget } from '@/lib/leaderboard/target';

import type { ServiceContext } from './context';

/**
 * leaderboard.md §2: a target can enter when it is analysed, its alignment was found by the app or confirmed by the owner (the
 * same rule as Patterns), and it is a scored precision target with a position.
 */
export async function loadMyBoardTargets(ctx: ServiceContext): Promise<MyBoardTarget[]> {
  const [rawSessions, rawPhotos, rawAnalyses] = await Promise.all([
    ctx.db.getAll('sessions') as Promise<unknown[]>,
    ctx.db.getAll('photos') as Promise<unknown[]>,
    ctx.db.getAll('analyses') as Promise<unknown[]>,
  ]);
  const dates = new Map<string, string>();
  for (const raw of rawSessions) {
    const parsed = BiathlonSession.safeParse(upgradeSession(raw));
    if (parsed.success) dates.set(parsed.data.id, parsed.data.sessionDate);
  }
  const analyses = new Map<string, TargetAnalysis>();
  for (const raw of rawAnalyses) {
    const parsed = TargetAnalysis.safeParse(raw);
    if (parsed.success) analyses.set(parsed.data.photoId, parsed.data);
  }

  const out: MyBoardTarget[] = [];
  for (const raw of rawPhotos) {
    const parsed = TargetPhoto.safeParse(raw);
    if (!parsed.success) continue;
    const photo = parsed.data;
    const sessionDate = dates.get(photo.sessionId);
    const analysis = analyses.get(photo.id) ?? null;
    if (sessionDate === undefined || photo.status !== 'analyzed' || analysis === null) continue;
    const method = analysis.pipeline.alignment.method;
    if (method !== 'cv' && method !== 'manual') continue;
    const target = boardTarget(photo, analysis);
    if (target !== null) out.push({ ...target, photoId: photo.id, sessionId: photo.sessionId, sessionDate });
  }
  return out;
}
