import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { PipelineState, Shot } from '@/lib/domain/analysis';
import type { TemplateId, Warning } from '@/lib/domain/enums';
import type { Calibration, Categorization } from '@/lib/domain/photo';
import { runStageB } from '@/lib/pipeline/stage-b';
import type { ServiceContext } from '@/lib/services/context';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { diagramCellSvgKey, diagramFullPngKey, diagramFullSvgKey } from '@/lib/store/blob-keys';
import { getBlob, putBlob } from '@/lib/store/blobs-repo';
import { getPhotoRecord, putPhotoRecord } from '@/lib/store/photos-repo';
import { getSessionRecord, putSessionRecord } from '@/lib/store/sessions-repo';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';
import { makeAnalysis, makePhoto, makeSession } from '../../helpers/records';
import { stubRenderTools } from '../../helpers/stub-render-tools';

interface ShotsFixture {
  template: TemplateId;
  categorization: Categorization;
  shots: Shot[];
}

function readFixture(name: string): ShotsFixture {
  const path = fileURLToPath(new URL(`../../../fixtures/reference/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf-8')) as ShotsFixture;
}

const precisionFixture = readFixture('sample-shots-precision.json');
const sightingFixture = readFixture('sample-shots-sighting.json');

/** A calibration the user confirmed in Adjust (analysis-pipeline §8) — Stage B only needs it to be non-null. */
const MANUAL_CAL: Calibration = {
  cx: 620,
  cy: 838,
  radiusPx: 265,
  axisRatio: 0.934,
  angleDeg: 0,
  anchorDiameterMm: 112.4,
  source: 'manual',
  confidence: null,
};

interface SeedOptions {
  categorization?: Categorization;
  calibration?: Calibration | null;
  shots?: Shot[];
  templateHint?: { template: TemplateId; confidence: number } | null;
  warnings?: Warning[];
  /** `pipeline.alignment` as Stage A left it (analysis-pipeline §3). */
  alignment?: PipelineState['alignment'];
}

interface Seeded {
  ctx: ServiceContext;
  photoId: string;
  sessionId: string;
}

/** A photo whose Stage A is done, in a session where Analyze has been tapped. */
async function seed(opts: SeedOptions = {}): Promise<Seeded> {
  const db = await openTestDb();
  const ctx = makeTestContext(db, { nowIso: '2026-09-06T00:05:00.000Z' });
  const session = makeSession({ analyzeRequestedAt: '2026-09-06T00:01:00.000Z' });
  const photo = makePhoto({
    sessionId: session.id,
    categorization: opts.categorization ?? precisionFixture.categorization,
  });
  const analysis = makeAnalysis(
    photo.id,
    {
      stageA: 'done',
      stageB: 'pending',
      templateHint: opts.templateHint ?? null,
      warnings: opts.warnings ?? [],
      ...(opts.alignment === undefined ? {} : { alignment: opts.alignment }),
    },
    { calibration: opts.calibration === undefined ? MANUAL_CAL : opts.calibration, shots: opts.shots ?? [] },
  );

  await putSessionRecord(db, { ...session, photoIds: [photo.id] });
  await putPhotoRecord(db, photo);
  await putAnalysisRecord(db, analysis);

  return { ctx, photoId: photo.id, sessionId: session.id };
}

describe('runStageB (analysis-pipeline §2 Stage B, §4, §5)', () => {
  it('scores the precision golden fixture and stores all three diagram blobs', async () => {
    const { ctx, photoId, sessionId } = await seed({ shots: precisionFixture.shots });
    const render = stubRenderTools();

    await runStageB(ctx, photoId, render);

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.pipeline.stageB).toBe('done');
    expect(analysis?.pipeline.error).toBeNull();
    expect(analysis?.computed?.engineVersion).toBe('1');
    // geometry-scoring §9.1
    expect(analysis?.computed?.result.all.precision?.identifiedTotal).toBe(72);
    expect(analysis?.computed?.result.all.precision?.xCount).toBe(1);

    const photo = await getPhotoRecord(ctx.db, photoId);
    expect(photo?.status).toBe('analyzed');
    expect(photo?.reasons).toEqual([]);

    expect(await getBlob(ctx.db, diagramFullSvgKey(photoId))).not.toBeNull();
    expect(await getBlob(ctx.db, diagramCellSvgKey(photoId))).not.toBeNull();
    expect(await getBlob(ctx.db, diagramFullPngKey(photoId))).not.toBeNull();
    // rendering-composite §3: the `full` variant is rasterised at 1500 x 1700.
    expect(render.calls).toHaveLength(1);
    expect(render.calls[0]?.widthPx).toBe(1500);
    expect(render.calls[0]?.heightPx).toBe(1700);

    const session = await getSessionRecord(ctx.db, sessionId);
    expect(session?.updatedAt).toBe('2026-09-06T00:05:00.000Z');
  });

  it('scores the sighting golden fixture (prone): 9 hits, 1 miss', async () => {
    const { ctx, photoId } = await seed({
      categorization: sightingFixture.categorization,
      shots: sightingFixture.shots,
    });

    await runStageB(ctx, photoId, stubRenderTools());

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    const sighting = analysis?.computed?.result.all.sighting;
    // geometry-scoring §9.2
    expect(sighting?.hits).toBe(9);
    expect(sighting?.misses).toBe(1);
    expect((await getPhotoRecord(ctx.db, photoId))?.status).toBe('analyzed');
  });

  it('reports a range and `rounds-unaccounted` when a round is not found', async () => {
    const shots = precisionFixture.shots.map((shot) => (shot.id === 'P8' ? { ...shot, multiplicity: 1 } : shot));
    const { ctx, photoId } = await seed({ shots });

    await runStageB(ctx, photoId, stubRenderTools());

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    const precision = analysis?.computed?.result.all.precision;
    expect(analysis?.computed?.result.all.missing).toBe(1);
    // geometry-scoring §8.1 over the golden fixture's identified rings.
    expect(precision?.range.pessimistic).toBe(71);
    expect(precision?.range.optimistic).toBe(76);
    expect(precision?.range.averaged).toBeCloseTo(73.333333, 6);

    const photo = await getPhotoRecord(ctx.db, photoId);
    expect(photo?.status).toBe('analyzed');
    expect(photo?.reasons).toEqual(['rounds-unaccounted']);
  });

  it('with no calibration: no result, no diagrams, and `target-not-found`', async () => {
    const { ctx, photoId } = await seed({ calibration: null, shots: precisionFixture.shots });
    // A diagram left over from a run that did have a calibration must not survive.
    await putBlob(ctx.db, diagramFullSvgKey(photoId), {
      bytes: new TextEncoder().encode('<svg/>').buffer as ArrayBuffer,
      contentType: 'image/svg+xml',
      sizeBytes: 6,
      createdAt: '2026-09-06T00:00:00.000Z',
    });
    const render = stubRenderTools();

    await runStageB(ctx, photoId, render);

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.pipeline.stageB).toBe('done');
    expect(analysis?.computed).toBeNull();
    expect(render.calls).toHaveLength(0);
    expect(await getBlob(ctx.db, diagramFullSvgKey(photoId))).toBeNull();
    expect(await getBlob(ctx.db, diagramCellSvgKey(photoId))).toBeNull();

    const photo = await getPhotoRecord(ctx.db, photoId);
    expect(photo?.status).toBe('needs-attention');
    expect(photo?.reasons).toEqual(['target-not-found']);
  });

  it('with no shots: `no-shots-found`', async () => {
    const { ctx, photoId } = await seed({ shots: [] });

    await runStageB(ctx, photoId, stubRenderTools());

    const photo = await getPhotoRecord(ctx.db, photoId);
    expect(photo?.status).toBe('needs-attention');
    expect(photo?.reasons).toEqual(['no-shots-found']);
  });

  it('with an 11th shot: `too-many-shots`', async () => {
    const extra: Shot = {
      id: 'P10',
      xMm: 12,
      yMm: 12,
      multiplicity: 1,
      positionOverrides: null,
      source: 'manual',
      confidence: null,
      cluster: false,
      possibleOverlap: false,
    };
    const { ctx, photoId } = await seed({ shots: [...precisionFixture.shots, extra] });

    await runStageB(ctx, photoId, stubRenderTools());

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.computed?.result.all.overcount).toBe(1);
    const photo = await getPhotoRecord(ctx.db, photoId);
    expect(photo?.status).toBe('needs-attention');
    expect(photo?.reasons).toEqual(['too-many-shots']);
  });

  it('re-caps the shots to the declared rounds after metadata, and warns (REV-28)', async () => {
    // Eleven auto shots reach Stage B (Stage A could not cap: no categorization yet).
    const extras: Shot[] = Array.from({ length: 11 }, (_, i) => ({
      id: `auto-${i + 1}`,
      xMm: i * 2,
      yMm: 0,
      multiplicity: 1,
      positionOverrides: null,
      source: 'auto' as const,
      confidence: 1 - i * 0.05,
      cluster: false,
      possibleOverlap: false,
    }));
    const { ctx, photoId } = await seed({ shots: extras });

    await runStageB(ctx, photoId, stubRenderTools());

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.shots).toHaveLength(10);
    expect(analysis?.shots.map((shot) => shot.id)).not.toContain('auto-11');
    expect(analysis?.pipeline.warnings).toEqual(['extra-candidates-dropped']);

    // identified <= declared, so `overcount` is unreachable from automatic detection.
    expect(analysis?.computed?.result.all.identified).toBe(10);
    expect(analysis?.computed?.result.all.overcount).toBe(0);
    const photo = await getPhotoRecord(ctx.db, photoId);
    expect(photo?.status).toBe('needs-attention');
    expect(photo?.reasons).toEqual(['extra-candidates-dropped']);
  });

  it('keeps Stage A\'s cap warning without dropping anything more', async () => {
    const { ctx, photoId } = await seed({
      shots: precisionFixture.shots.slice(0, 5),
      warnings: ['extra-candidates-dropped'],
    });

    await runStageB(ctx, photoId, stubRenderTools());

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.shots).toHaveLength(5);
    expect(analysis?.pipeline.warnings).toEqual(['extra-candidates-dropped']);
  });

  it('never drops a shot the owner placed by hand, even over the declared rounds', async () => {
    const manual: Shot[] = Array.from({ length: 11 }, (_, i) => ({
      id: `m-${i + 1}`,
      xMm: i * 2,
      yMm: 0,
      multiplicity: 1,
      positionOverrides: null,
      source: 'manual' as const,
      confidence: null,
      cluster: false,
      possibleOverlap: false,
    }));
    const { ctx, photoId } = await seed({ shots: manual });

    await runStageB(ctx, photoId, stubRenderTools());

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.shots).toHaveLength(11);
    expect(analysis?.pipeline.warnings).toEqual([]);
    // The owner's own edits can still overcount (geometry-scoring §8).
    expect((await getPhotoRecord(ctx.db, photoId))?.reasons).toEqual(['too-many-shots']);
  });

  it('an overlay-fallback alignment lands on `needs-attention` (REV-31, analysis-pipeline §4 rule 9)', async () => {
    // The alignment Stage A's overlay fallback leaves behind (analysis-pipeline §3): the on-screen
    // overlay, not a measured disc, with the warning that says so.
    const { ctx, photoId } = await seed({
      shots: precisionFixture.shots,
      alignment: { method: 'overlay', confidence: null },
      warnings: ['alignment-uncertain'],
    });

    await runStageB(ctx, photoId, stubRenderTools());

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.pipeline.alignment.method).toBe('overlay');
    expect(analysis?.pipeline.warnings).toEqual(['alignment-uncertain']);

    // No disc was found, so the rings are a guess: the score must not present as finished.
    const photo = await getPhotoRecord(ctx.db, photoId);
    expect(photo?.status).toBe('needs-attention');
    expect(photo?.reasons).toEqual(['alignment-uncertain']);
  });

  it('adds `template-mismatch` when a confident hint disagrees with the chosen template (§2 B4)', async () => {
    const { ctx, photoId } = await seed({
      shots: precisionFixture.shots,
      templateHint: { template: 'sighting', confidence: 0.8 },
    });

    await runStageB(ctx, photoId, stubRenderTools());

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.pipeline.warnings).toEqual(['template-mismatch']);
    const photo = await getPhotoRecord(ctx.db, photoId);
    expect(photo?.status).toBe('analyzed');
    expect(photo?.reasons).toEqual(['template-mismatch']);
  });

  it('does not add `template-mismatch` below confidence 0.5, and drops a stale one', async () => {
    const { ctx, photoId } = await seed({
      shots: precisionFixture.shots,
      templateHint: { template: 'sighting', confidence: 0.4 },
      warnings: ['template-mismatch'],
    });

    await runStageB(ctx, photoId, stubRenderTools());

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.pipeline.warnings).toEqual([]);
  });

  it('keeps Stage A warnings', async () => {
    const { ctx, photoId } = await seed({ shots: precisionFixture.shots, warnings: ['alignment-uncertain'] });

    await runStageB(ctx, photoId, stubRenderTools());

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.pipeline.warnings).toEqual(['alignment-uncertain']);
    expect((await getPhotoRecord(ctx.db, photoId))?.reasons).toEqual(['alignment-uncertain']);
  });

  it('records stageB error, truncated to 200 chars, when rendering throws', async () => {
    const { ctx, photoId } = await seed({ shots: precisionFixture.shots });
    const render = stubRenderTools({ throwOnRender: new Error('x'.repeat(300)) });

    await runStageB(ctx, photoId, render);

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.pipeline.stageB).toBe('error');
    expect(analysis?.pipeline.error).toHaveLength(200);
    expect((await getPhotoRecord(ctx.db, photoId))?.status).toBe('failed');
  });

  it('leaves Stage B pending when the categorization is incomplete', async () => {
    const { ctx, photoId } = await seed({
      categorization: { template: 'precision', position: null, roundsProne: null, roundsStanding: null },
      shots: precisionFixture.shots,
    });

    await runStageB(ctx, photoId, stubRenderTools());

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.pipeline.stageB).toBe('pending');
    expect(analysis?.computed).toBeNull();
  });
});
