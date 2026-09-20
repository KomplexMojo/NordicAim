// patterns.md: reads every session, photo and analysis that parses (one unreadable record must not blank the screen)
// and hands them to the pure collector.

import { TargetAnalysis } from '@/lib/domain/analysis';
import { TargetPhoto } from '@/lib/domain/photo';
import { BiathlonSession, upgradeSession } from '@/lib/domain/session';
import { collectPatterns, type PatternData, type PatternSource } from '@/lib/patterns/collect';

import type { ServiceContext } from './context';

export interface PatternsLoaded {
  data: PatternData;
  /** `YYYY-MM-DD`, for the date ranges. */
  today: string;
}

export async function loadPatterns(ctx: ServiceContext): Promise<PatternsLoaded> {
  const [rawSessions, rawPhotos, rawAnalyses] = await Promise.all([
    ctx.db.getAll('sessions') as Promise<unknown[]>,
    ctx.db.getAll('photos') as Promise<unknown[]>,
    ctx.db.getAll('analyses') as Promise<unknown[]>,
  ]);

  const dates = new Map<string, { date: string; stamp: string }>();
  for (const raw of rawSessions) {
    const parsed = BiathlonSession.safeParse(upgradeSession(raw));
    if (parsed.success) dates.set(parsed.data.id, { date: parsed.data.sessionDate, stamp: parsed.data.createdAt });
  }
  const analyses = new Map<string, TargetAnalysis>();
  for (const raw of rawAnalyses) {
    const parsed = TargetAnalysis.safeParse(raw);
    if (parsed.success) analyses.set(parsed.data.photoId, parsed.data);
  }

  const sources: PatternSource[] = [];
  for (const raw of rawPhotos) {
    const parsed = TargetPhoto.safeParse(raw);
    if (!parsed.success) continue;
    const photo = parsed.data;
    const session = dates.get(photo.sessionId);
    if (session === undefined || photo.categorization.template === null) continue;
    sources.push({ sessionId: photo.sessionId, sessionDate: session.date, sessionStamp: session.stamp, photo, analysis: analyses.get(photo.id) ?? null });
  }
  return { data: collectPatterns(sources), today: ctx.now().toISOString().slice(0, 10) };
}
