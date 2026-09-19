import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildComposite, latestArtifact, loadArtifact } from '@/lib/composite/build';
import { ArtifactNotFoundError, EmptyCompositeError } from '@/lib/composite/artifact';
import type { Shot } from '@/lib/domain/analysis';
import { initialAnalysis } from '@/lib/domain/analysis';
import type { Categorization } from '@/lib/domain/photo';
import type { ServiceContext } from '@/lib/services/context';
import { putAnalysisRecord } from '@/lib/store/analyses-repo';
import { artifactJsonKey, artifactPngKey } from '@/lib/store/blob-keys';
import { getBlob, putBlob } from '@/lib/store/blobs-repo';
import { putPhotoRecord } from '@/lib/store/photos-repo';
import { getSessionRecord, putSessionRecord } from '@/lib/store/sessions-repo';
import { putSettings } from '@/lib/store/settings-repo';
import { defaultAppSettings } from '@/lib/domain/settings';
import { BIATHLON_50M } from '@/lib/defaults/biathlon';
import { analyzeTarget } from '@/lib/scoring/analyze';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';
import { makePhoto, makeSession } from '../../helpers/records';
import { stubRenderTools } from '../../helpers/stub-render-tools';

interface ShotsFixture {
  template: 'sighting' | 'precision';
  categorization: Categorization;
  shots: Shot[];
}

function readFixture(name: string): ShotsFixture {
  const path = fileURLToPath(new URL(`../../../fixtures/reference/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf-8')) as ShotsFixture;
}

const precisionFixture = readFixture('sample-shots-precision.json');
const sightingFixture = readFixture('sample-shots-sighting.json');

interface Seeded {
  ctx: ServiceContext;
  sessionId: string;
}

/** A session with one analyzed precision photo (real scoring, so the composite has real numbers). */
async function seedOneAnalyzed(nowIso = '2026-09-05T17:20:00.000Z'): Promise<Seeded> {
  const db = await openTestDb();
  const ctx = makeTestContext(db, { nowIso });
  const session = makeSession();
  const photo = makePhoto({
    sessionId: session.id,
    status: 'analyzed',
    categorization: precisionFixture.categorization,
    captureTime: { local: '2026-09-05T16:56:03', offset: '+00:00', utc: '2026-09-05T16:56:03.000Z', source: 'exif' },
  });
  const result = analyzeTarget({ template: precisionFixture.template, categorization: precisionFixture.categorization, shots: precisionFixture.shots });
  const analysis = { ...initialAnalysis(photo.id, nowIso), shots: precisionFixture.shots, computed: { engineVersion: '1', result } };

  await putSessionRecord(db, { ...session, photoIds: [photo.id] });
  await putPhotoRecord(db, photo);
  await putAnalysisRecord(db, analysis);

  return { ctx, sessionId: session.id };
}

describe('composite/build buildComposite (rendering-composite.md §6)', () => {
  it('throws EmptyCompositeError when there is nothing analyzed', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = makeSession();
    await putSessionRecord(db, session);

    await expect(buildComposite(ctx, session.id, stubRenderTools())).rejects.toThrow(EmptyCompositeError);
  });

  it('stores the PNG and JSON blobs, and records ArtifactMeta on the session', async () => {
    const { ctx, sessionId } = await seedOneAnalyzed();

    const artifact = await buildComposite(ctx, sessionId, stubRenderTools());

    expect(artifact.sessionId).toBe(sessionId);
    expect(artifact.widthPx).toBe(1440);
    // REV-51: always the four fixed positions (1440) under the 120 header, then a band sized to its 5 lines
    // (targets, the slot line, and the 3 footer lines that don't repeat it): 100 + 34 * 5 + 64 = 334.
    expect(artifact.heightPx).toBe(120 + 1440 + 334);
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);

    const png = await getBlob(ctx.db, artifactPngKey(artifact.id));
    expect(png).not.toBeNull();
    const json = await getBlob(ctx.db, artifactJsonKey(artifact.id));
    expect(json).not.toBeNull();

    const session = await getSessionRecord(ctx.db, sessionId);
    expect(session?.artifacts).toHaveLength(1);
    expect(session?.artifacts[0]?.id).toBe(artifact.id);
  });

  it('the JSON sidecar carries no image data and no GPS', async () => {
    const { ctx, sessionId } = await seedOneAnalyzed();
    const artifact = await buildComposite(ctx, sessionId, stubRenderTools());

    const jsonBlob = await getBlob(ctx.db, artifactJsonKey(artifact.id));
    const parsed: unknown = JSON.parse(await jsonBlob!.text());
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain('"gps"');
    expect(serialized).not.toContain('bytes');
  });

  it('the 4th build prunes the oldest artifact (its blobs are gone)', async () => {
    const { ctx, sessionId } = await seedOneAnalyzed();

    const first = await buildComposite(ctx, sessionId, stubRenderTools());
    const second = await buildComposite(ctx, sessionId, stubRenderTools());
    const third = await buildComposite(ctx, sessionId, stubRenderTools());
    const fourth = await buildComposite(ctx, sessionId, stubRenderTools());

    const session = await getSessionRecord(ctx.db, sessionId);
    expect(session?.artifacts.map((a) => a.id)).toEqual([second.id, third.id, fourth.id]);

    expect(await getBlob(ctx.db, artifactPngKey(first.id))).toBeNull();
    expect(await getBlob(ctx.db, artifactJsonKey(first.id))).toBeNull();
    expect(await getBlob(ctx.db, artifactPngKey(fourth.id))).not.toBeNull();
  });
});

describe('composite/build.ts §6 step 2: fresh analyzeTarget per slot, not the stored result', () => {
  it('rebuilds against the CURRENT holeDiameterMm, so the stat-card and footer text stay mutually consistent even when Settings changed after that photo\'s Stage B run', async () => {
    const nowIso = '2026-09-05T17:20:00.000Z';
    const db = await openTestDb();
    const ctx = makeTestContext(db, { nowIso });
    const session = makeSession();
    const photo = makePhoto({
      sessionId: session.id,
      status: 'analyzed',
      categorization: sightingFixture.categorization,
      captureTime: { local: '2026-09-05T16:56:03', offset: '+00:00', utc: '2026-09-05T16:56:03.000Z', source: 'exif' },
    });

    // Simulate Stage B having run earlier, when Settings' holeDiameterMm was 8 (stale): 9 hit / 1 miss.
    const staleHoleDiameterMm: number = 8;
    const staleProfile = { ...BIATHLON_50M, holeDiameterMm: staleHoleDiameterMm } as typeof BIATHLON_50M;
    const staleResult = analyzeTarget({
      template: sightingFixture.template,
      categorization: sightingFixture.categorization,
      shots: sightingFixture.shots,
      profile: staleProfile,
    });
    const proneStale = staleResult.subsets.find((s) => s.key === 'prone');
    expect(proneStale?.sighting?.hits).toBe(9);
    expect(proneStale?.sighting?.misses).toBe(1);

    const analysis = {
      ...initialAnalysis(photo.id, nowIso),
      shots: sightingFixture.shots,
      computed: { engineVersion: '1', result: staleResult },
    };

    await putSessionRecord(db, { ...session, photoIds: [photo.id] });
    await putPhotoRecord(db, photo);
    await putAnalysisRecord(db, analysis);

    // Settings now say holeDiameterMm = 15 (current), which recomputes to 10 hit / 0 miss.
    await putSettings(db, { ...defaultAppSettings(), profileOverrides: { holeDiameterMm: 15 } });

    const render = stubRenderTools();
    await buildComposite(ctx, session.id, render);

    const svg = render.calls[0]!.svg;
    // The fresh recompute must win: no stale "9 hit / 1 miss" anywhere in the composite...
    expect(svg).not.toContain('9 hit / 1 miss');
    // ...and the current-settings detail line and the freshly-recomputed headline must agree. (REV-51 drops the
    // footer's "Scored (…)" line from the band, since the slot line above it already states the hits.)
    expect(svg).toContain('vs 45 mm prone: 10 hit / 0 miss');
    expect(svg).toContain('Sight in (prone): 10 hits · 0 misses — 45 mm prone');
  });
});

describe('composite/build loadArtifact / latestArtifact', () => {
  it('loadArtifact returns the artifact and PNG for a known id', async () => {
    const { ctx, sessionId } = await seedOneAnalyzed();
    const built = await buildComposite(ctx, sessionId, stubRenderTools());

    const { artifact, png } = await loadArtifact(ctx, sessionId, built.id);
    expect(artifact.id).toBe(built.id);
    expect(png.size).toBeGreaterThan(0);
  });

  it('loadArtifact throws ArtifactNotFoundError for an unknown id', async () => {
    const { ctx, sessionId } = await seedOneAnalyzed();
    await buildComposite(ctx, sessionId, stubRenderTools());

    await expect(loadArtifact(ctx, sessionId, 'nope')).rejects.toThrow(ArtifactNotFoundError);
  });

  it('loadArtifact throws ArtifactNotFoundError when the stored bytes were tampered with', async () => {
    const { ctx, sessionId } = await seedOneAnalyzed();
    const built = await buildComposite(ctx, sessionId, stubRenderTools());

    await putBlob(ctx.db, artifactPngKey(built.id), {
      bytes: new Uint8Array([1, 2, 3]).buffer,
      contentType: 'image/png',
      sizeBytes: 3,
      createdAt: '2026-09-05T17:20:00.000Z',
    });

    await expect(loadArtifact(ctx, sessionId, built.id)).rejects.toThrow(ArtifactNotFoundError);
  });

  it('latestArtifact returns null when the session has none, and the newest one otherwise', async () => {
    const { ctx, sessionId } = await seedOneAnalyzed();
    expect(await latestArtifact(ctx, sessionId)).toBeNull();

    await buildComposite(ctx, sessionId, stubRenderTools());
    const second = await buildComposite(ctx, sessionId, stubRenderTools());

    const latest = await latestArtifact(ctx, sessionId);
    expect(latest?.artifact.id).toBe(second.id);
  });
});
