import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildTrendsImage, EmptyTrendsError, KEEP_TRENDS_IMAGES } from '@/lib/composite/trends-build';
import { initialAnalysis, type Shot } from '@/lib/domain/analysis';
import type { Categorization } from '@/lib/domain/photo';
import { defaultAppSettings } from '@/lib/domain/settings';
import { analyzeTarget } from '@/lib/scoring/analyze';
import { putAnalysisRecord } from '@/lib/store/analyses-repo';
import { TRENDS_KEY_PREFIX } from '@/lib/store/blob-keys';
import { putPhotoRecord } from '@/lib/store/photos-repo';
import { putSessionRecord } from '@/lib/store/sessions-repo';
import { putSettings } from '@/lib/store/settings-repo';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';
import { makePhoto, makeSession } from '../../helpers/records';
import { stubRenderTools } from '../../helpers/stub-render-tools';

// analysis.md §5 (REV-124): the coach image is built from the Analysis range, stored as trends:<id>, and pruned.

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
    // Patterns (and so the coach image) counts only measured or confirmed alignments (patterns.md §2).
    await putAnalysisRecord(db, { ...base, pipeline: { ...base.pipeline, stageA: 'done', stageB: 'done', alignment: { method: 'cv', confidence: 0.9 } }, shots: fixture.shots, computed: { engineVersion: '1', result } });
  }
  return db;
}

async function trendsKeys(db: Awaited<ReturnType<typeof openTestDb>>): Promise<string[]> {
  return (await db.getAllKeys('blobs', IDBKeyRange.bound(TRENDS_KEY_PREFIX, `${TRENDS_KEY_PREFIX}￿`))) as string[];
}

describe('buildTrendsImage (analysis.md §5)', () => {
  it('throws when the range has no shots in any view', async () => {
    const db = await openTestDb();
    await expect(buildTrendsImage(makeTestContext(db), 'all', stubRenderTools())).rejects.toBeInstanceOf(EmptyTrendsError);
  });

  it('renders the whole sheet at its drawn size, stores the PNG and its sidecar, and returns the PNG', async () => {
    const db = await seed(['2026-09-01', '2026-09-08']);
    const render = stubRenderTools();
    const { artifact, png } = await buildTrendsImage(makeTestContext(db, { nowIso: '2026-09-20T12:00:00.000Z' }), 'all', render, 'abc1234');
    expect(render.calls).toHaveLength(1);
    expect(render.calls[0]!.widthPx).toBe(1440);
    expect(artifact.heightPx).toBe(render.calls[0]!.heightPx);
    expect(render.calls[0]!.svg).toContain('2 sessions');
    expect(render.calls[0]!.svg).toContain('release abc1234');
    expect(png.type).toBe('image/png');
    expect((await trendsKeys(db)).sort()).toEqual([`trends:${artifact.id}:json`, `trends:${artifact.id}:png`]);
    expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('prints the athlete line from Settings (no stamp without a key)', async () => {
    const db = await seed(['2026-09-01'], { ...defaultAppSettings(), athleteName: 'A. Athlete', athleteClub: 'Ski Club' });
    const render = stubRenderTools();
    await buildTrendsImage(makeTestContext(db), 'all', render);
    expect(render.calls[0]!.svg).toContain('Athlete: A. Athlete · Ski Club');
    expect(render.calls[0]!.svg).not.toContain('Stamp:');
  });

  it('keeps only the newest three images', async () => {
    const db = await seed(['2026-09-01']);
    const ids: string[] = [];
    for (let i = 0; i < KEEP_TRENDS_IMAGES + 2; i += 1) {
      const ctx = makeTestContext(db, { nowIso: `2026-09-2${i}T12:00:00.000Z` });
      ids.push((await buildTrendsImage(ctx, 'all', stubRenderTools())).artifact.id);
    }
    const kept = new Set((await trendsKeys(db)).map((k) => k.split(':')[1]));
    expect([...kept].sort()).toEqual(ids.slice(-KEEP_TRENDS_IMAGES).sort());
  });

  it('uses the range: a session outside it is not drawn', async () => {
    const db = await seed(['2026-01-01', '2026-09-18']);
    const render = stubRenderTools();
    await buildTrendsImage(makeTestContext(db, { nowIso: '2026-09-20T12:00:00.000Z' }), '30', render);
    expect(render.calls[0]!.svg).toContain('1 session ·');
    expect(render.calls[0]!.svg).toContain('30 days');
  });
});
