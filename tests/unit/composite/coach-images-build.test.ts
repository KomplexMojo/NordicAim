import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EmptyCoachImageError, KEEP_COACH_IMAGES } from '@/lib/composite/coach-store';
import { buildGoalsCoachImage } from '@/lib/composite/goals-coach-build';
import { buildPatternsCoachImage } from '@/lib/composite/patterns-coach-build';
import { buildTrendsImage } from '@/lib/composite/trends-build';
import { initialAnalysis, type Shot } from '@/lib/domain/analysis';
import type { Categorization } from '@/lib/domain/photo';
import { defaultAppSettings } from '@/lib/domain/settings';
import { analyzeTarget } from '@/lib/scoring/analyze';
import { setGoal } from '@/lib/services/goals';
import { putAnalysisRecord } from '@/lib/store/analyses-repo';
import { COACH_KEY_PREFIX, type CoachImageKind } from '@/lib/store/blob-keys';
import { putPhotoRecord } from '@/lib/store/photos-repo';
import { putSessionRecord } from '@/lib/store/sessions-repo';
import { putSettings } from '@/lib/store/settings-repo';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';
import { makePhoto, makeSession } from '../../helpers/records';
import { stubRenderTools } from '../../helpers/stub-render-tools';

// patterns.md §7 and goals.md §9 (REV-163): the Patterns and Goals coach images are built from the screen's filters, stored
// under their own prefixes, and pruned to the newest three of their own kind.

interface ShotsFixture { template: 'precision'; categorization: Categorization; shots: Shot[] }
const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../fixtures/reference/sample-shots-precision.json', import.meta.url)), 'utf-8'),
) as ShotsFixture;

async function seed(sessionDates: string[], settings = defaultAppSettings()) {
  const db = await openTestDb();
  await putSettings(db, settings);
  for (const date of sessionDates) {
    const session = { ...makeSession(), sessionDate: date, createdAt: `${date}T09:00:00.000Z` };
    const photo = makePhoto({ sessionId: session.id, status: 'analyzed', categorization: fixture.categorization });
    const result = analyzeTarget({ template: 'precision', categorization: fixture.categorization, shots: fixture.shots });
    const base = initialAnalysis(photo.id, `${date}T10:00:00.000Z`);
    await putSessionRecord(db, { ...session, photoIds: [photo.id] });
    await putPhotoRecord(db, photo);
    await putAnalysisRecord(db, { ...base, pipeline: { ...base.pipeline, stageA: 'done', stageB: 'done', alignment: { method: 'cv', confidence: 0.9 } }, shots: fixture.shots, computed: { engineVersion: '1', result } });
  }
  return db;
}

async function keysOf(db: Awaited<ReturnType<typeof openTestDb>>, kind: CoachImageKind): Promise<string[]> {
  const prefix = COACH_KEY_PREFIX[kind];
  return (await db.getAllKeys('blobs', IDBKeyRange.bound(prefix, `${prefix}￿`))) as string[];
}

describe('buildPatternsCoachImage (patterns.md §7)', () => {
  it('throws when the range has no shots in any view', async () => {
    const db = await openTestDb();
    await expect(buildPatternsCoachImage(makeTestContext(db), { range: 'all', season: 'all' }, stubRenderTools())).rejects.toBeInstanceOf(EmptyCoachImageError);
  });

  it('renders at its drawn size, stores the PNG and its sidecar under its own prefix, and returns a patterns artifact', async () => {
    const db = await seed(['2026-09-01', '2026-09-08']);
    const render = stubRenderTools();
    const { artifact, png } = await buildPatternsCoachImage(makeTestContext(db, { nowIso: '2026-09-20T12:00:00.000Z' }), { range: 'all', season: 'all' }, render, 'abc1234');
    expect(render.calls).toHaveLength(1);
    expect(render.calls[0]!.widthPx).toBe(1440);
    expect(artifact).toMatchObject({ kind: 'patterns', range: 'all', heightPx: render.calls[0]!.heightPx });
    expect(render.calls[0]!.svg).toContain('All sessions · All seasons');
    expect(render.calls[0]!.svg).toContain('release abc1234');
    expect(png.type).toBe('image/png');
    expect((await keysOf(db, 'patterns')).sort()).toEqual([`patterns-coach:${artifact.id}:json`, `patterns-coach:${artifact.id}:png`]);
    expect(await keysOf(db, 'trends')).toEqual([]);
  });

  it('uses the season before the range, as the screen does', async () => {
    const db = await seed(['2026-01-10', '2026-09-18']);
    const render = stubRenderTools();
    await buildPatternsCoachImage(makeTestContext(db), { range: 'last', season: 'winter' }, render);
    expect(render.calls[0]!.svg).toContain('Latest session · Winter');
    expect(render.calls[0]!.svg).toContain('1 target · 1 session');
    await expect(buildPatternsCoachImage(makeTestContext(db), { range: 'all', season: 'spring' }, stubRenderTools())).rejects.toBeInstanceOf(EmptyCoachImageError);
  });

  it('keeps the newest three of its own kind, and leaves the Analysis images alone', async () => {
    const db = await seed(['2026-09-01']);
    const trends = (await buildTrendsImage(makeTestContext(db, { nowIso: '2026-09-19T12:00:00.000Z' }), 'all', stubRenderTools())).artifact;
    const ids: string[] = [];
    for (let i = 0; i < KEEP_COACH_IMAGES + 2; i += 1) {
      const ctx = makeTestContext(db, { nowIso: `2026-09-2${i}T12:00:00.000Z` });
      ids.push((await buildPatternsCoachImage(ctx, { range: 'all', season: 'all' }, stubRenderTools())).artifact.id);
    }
    const kept = new Set((await keysOf(db, 'patterns')).map((k) => k.split(':')[1]));
    expect([...kept].sort()).toEqual(ids.slice(-KEEP_COACH_IMAGES).sort());
    expect((await keysOf(db, 'trends')).sort()).toEqual([`trends:${trends.id}:json`, `trends:${trends.id}:png`]);
  });
});

describe('buildGoalsCoachImage (goals.md §9)', () => {
  it('throws when no goal is set', async () => {
    const db = await seed(['2026-09-01']);
    await expect(buildGoalsCoachImage(makeTestContext(db), 'all', stubRenderTools())).rejects.toBeInstanceOf(EmptyCoachImageError);
  });

  it('renders the goals, stores the image under its own prefix, and returns a goals artifact with no range', async () => {
    const db = await seed(['2026-09-01', '2026-09-08'], { ...defaultAppSettings(), athleteName: 'A. Athlete', athleteClub: '' });
    await setGoal(makeTestContext(db, { nowIso: '2026-08-01T00:00:00.000Z' }), { view: 'precision-prone', metric: 'score', value: 10 });
    const render = stubRenderTools();
    const { artifact } = await buildGoalsCoachImage(makeTestContext(db, { nowIso: '2026-09-20T12:00:00.000Z' }), 'all', render, 'abc1234');
    expect(artifact).toMatchObject({ kind: 'goals', range: null, heightPx: render.calls[0]!.heightPx });
    expect(render.calls[0]!.svg).toContain('>1 of 1 goal hit<');
    expect(render.calls[0]!.svg).toContain('Athlete: A. Athlete');
    expect(render.calls[0]!.svg).not.toContain('Stamp:');
    expect((await keysOf(db, 'goals')).sort()).toEqual([`goals-coach:${artifact.id}:json`, `goals-coach:${artifact.id}:png`]);
  });
});
