// goals.md §6: the Goals screen's one write. Read-modify-write of the single goals row, in one transaction that
// only awaits IndexedDB calls (data-model §6).

import type { TargetAnalysis } from '@/lib/domain/analysis';
import { GoalLogEntry, GoalMetric, GoalView, type GoalsStore } from '@/lib/domain/goals';
import type { TargetPhoto } from '@/lib/domain/photo';
import type { BiathlonSession } from '@/lib/domain/session';
import { sessionGoalChecks, type SessionGoalChecks } from '@/lib/goals/session';
import { collectPatterns } from '@/lib/patterns/collect';
import { scoringDiameterFromSettings } from '@/lib/scoring/rule';
import { getAnalysisRecord } from '@/lib/store/analyses-repo';
import { getGoals, putGoals } from '@/lib/store/goals-repo';
import { listPhotosBySession } from '@/lib/store/photos-repo';
import { getSessionRecord } from '@/lib/store/sessions-repo';
import { getSettings } from '@/lib/store/settings-repo';

import type { ServiceContext } from './context';

/**
 * goals.md §2a: a backup's goal log, added after the rest of a restore. Each entry is checked on its own; the log is
 * append-only, so entries are merged by id with this phone's own (nothing is replaced or removed), and the current goal
 * is again the latest `setAt` per pair. Returns how many entries were new to this phone.
 */
export async function restoreGoals(ctx: ServiceContext, goals: { entries: unknown[] } | undefined): Promise<number> {
  if (goals === undefined) return 0;
  const incoming = goals.entries.flatMap((raw) => {
    const parsed = GoalLogEntry.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
  if (incoming.length === 0) return 0;
  const tx = ctx.db.transaction('goals', 'readwrite');
  const stored = await getGoals(tx);
  const known = new Set(stored.entries.map((e) => e.id));
  const added: GoalLogEntry[] = [];
  for (const entry of incoming) {
    if (known.has(entry.id)) continue;
    known.add(entry.id);
    added.push(entry);
  }
  if (added.length > 0) await putGoals(tx, { ...stored, entries: [...stored.entries, ...added] });
  await tx.done;
  return added.length;
}

export async function listGoals(ctx: ServiceContext): Promise<GoalLogEntry[]> {
  return (await getGoals(ctx.db)).entries;
}

/**
 * Appends a new goal-log entry (goals.md §2): never edits or deletes an existing one, so the log is the full
 * history of what this (view, metric) pair's goal has ever been.
 */
export async function setGoal(
  ctx: ServiceContext,
  input: { view: GoalView; metric: GoalMetric; value: number },
): Promise<GoalLogEntry> {
  const entry = GoalLogEntry.parse({
    id: ctx.newId(),
    view: GoalView.parse(input.view),
    metric: GoalMetric.parse(input.metric),
    value: input.value,
    setAt: ctx.now().toISOString(),
  });
  const tx = ctx.db.transaction('goals', 'readwrite');
  const store: GoalsStore = await getGoals(tx);
  await putGoals(tx, { ...store, entries: [...store.entries, entry] });
  await tx.done;
  return entry;
}

/**
 * goals.md §8 (REV-148): the session's own values against the goals in effect when it was created, from the same points the
 * Goals screen reads (`collectPatterns`). Shared by the summary image (`composite/build.ts`) and the results and target screens.
 */
export async function goalChecksFor(
  ctx: ServiceContext,
  session: Pick<BiathlonSession, 'id' | 'sessionDate' | 'createdAt'>,
  photos: readonly TargetPhoto[],
  analyses: ReadonlyMap<string, TargetAnalysis | null>,
  holeDiameterMm: number,
): Promise<SessionGoalChecks> {
  const patterns = collectPatterns(
    photos.map((photo) => ({
      sessionId: session.id,
      sessionDate: session.sessionDate,
      sessionStamp: session.createdAt,
      photo,
      analysis: analyses.get(photo.id) ?? null,
    })),
  );
  return sessionGoalChecks(await listGoals(ctx), patterns.points, session, holeDiameterMm);
}

/** {@link goalChecksFor} for a stored session, under the scoring rule in Settings; `{}` when the session is gone. */
export async function loadSessionGoalChecks(ctx: ServiceContext, sessionId: string): Promise<SessionGoalChecks> {
  const session = await getSessionRecord(ctx.db, sessionId);
  if (session === null) return {};
  const photos = await listPhotosBySession(ctx.db, sessionId);
  const analyses = new Map(await Promise.all(photos.map(async (p) => [p.id, await getAnalysisRecord(ctx.db, p.id)] as const)));
  return goalChecksFor(ctx, session, photos, analyses, scoringDiameterFromSettings(await getSettings(ctx.db)));
}
