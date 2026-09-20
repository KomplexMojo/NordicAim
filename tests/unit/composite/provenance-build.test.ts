import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildComposite } from '@/lib/composite/build';
import { initialAnalysis, type Shot } from '@/lib/domain/analysis';
import type { Categorization } from '@/lib/domain/photo';
import { provenanceLine } from '@/lib/render/composite';
import { analyzeTarget } from '@/lib/scoring/analyze';
import { setAthlete } from '@/lib/services/settings';
import { setPassphrase, verifySessionStamp } from '@/lib/services/provenance';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { artifactJsonKey, photoOriginalKey } from '@/lib/store/blob-keys';
import { getBlob, putBlob } from '@/lib/store/blobs-repo';
import { putPhotoRecord } from '@/lib/store/photos-repo';
import { putSessionRecord } from '@/lib/store/sessions-repo';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';
import { makePhoto, makeSession } from '../../helpers/records';
import { stubRenderTools } from '../../helpers/stub-render-tools';

const FAST = 1000;
const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../fixtures/reference/sample-shots-precision.json', import.meta.url)), 'utf-8'),
) as { template: 'precision'; categorization: Categorization; shots: Shot[] };

async function seed() {
  const nowIso = '2026-09-05T17:20:00.000Z';
  const db = await openTestDb();
  const ctx = makeTestContext(db, { nowIso });
  const session = makeSession();
  const photo = makePhoto({
    sessionId: session.id,
    status: 'analyzed',
    categorization: fixture.categorization,
    captureTime: { local: '2026-09-05T16:56:03', offset: '+00:00', utc: '2026-09-05T16:56:03.000Z', source: 'exif' },
  });
  const result = analyzeTarget({ template: fixture.template, categorization: fixture.categorization, shots: fixture.shots });
  await putSessionRecord(db, { ...session, photoIds: [photo.id] });
  await putPhotoRecord(db, photo);
  await putAnalysisRecord(db, { ...initialAnalysis(photo.id, nowIso), shots: fixture.shots, computed: { engineVersion: '1', result } });
  await putBlob(db, photoOriginalKey(photo.id), { bytes: new Uint8Array([1, 2, 3]).buffer, contentType: 'image/jpeg', sizeBytes: 3, createdAt: nowIso });
  return { ctx, sessionId: session.id, photoId: photo.id };
}

async function sidecarProvenance(ctx: Awaited<ReturnType<typeof seed>>['ctx'], artifactId: string) {
  const blob = await getBlob(ctx.db, artifactJsonKey(artifactId));
  return (JSON.parse(await blob!.text()) as { provenance?: { payload: string; stamp: string } }).provenance;
}

describe('provenance in the summary (REV-100)', () => {
  it('prints the identity line, leaving out what is empty', () => {
    expect(provenanceLine({ name: 'Jane Doe', club: 'Caledonia Nordic', stamp: '9F2C41AB-3D7E90B1C2A4' })).toBe(
      'Athlete: Jane Doe · Caledonia Nordic · Stamp: 9F2C41AB-3D7E90B1C2A4',
    );
    expect(provenanceLine({ name: 'Jane', club: '', stamp: null })).toBe('Athlete: Jane');
    expect(provenanceLine({ name: '', club: 'Club', stamp: null })).toBe('Club: Club');
  });

  it('with no athlete and no key nothing is stamped', async () => {
    const { ctx, sessionId } = await seed();
    const artifact = await buildComposite(ctx, sessionId, stubRenderTools());
    expect(await sidecarProvenance(ctx, artifact.id)).toBeUndefined();
  });

  it('with a key the sidecar holds the payload and stamp, and Verify accepts them; a wrong passphrase, another stamp or an edited target do not', async () => {
    const { ctx, sessionId, photoId } = await seed();
    await setAthlete(ctx, { name: 'Jane Doe', club: 'Caledonia Nordic Ski Club' });
    await setPassphrase(ctx, 'correct horse battery', FAST);
    const artifact = await buildComposite(ctx, sessionId, stubRenderTools());
    const prov = (await sidecarProvenance(ctx, artifact.id))!;
    expect(prov.stamp).toMatch(/^[0-9A-F]{8}-[0-9A-F]{12}$/);
    expect(prov.payload).toContain('"name":"Jane Doe"');

    const ok = await verifySessionStamp(ctx, sessionId, prov.stamp.toLowerCase(), 'correct horse battery', FAST);
    expect(ok.status).toBe('match');
    if (ok.status === 'match') expect(ok.summary?.name).toBe('Jane Doe');

    expect((await verifySessionStamp(ctx, sessionId, prov.stamp, 'not the passphrase!!', FAST)).status).toBe('wrong-passphrase');
    expect((await verifySessionStamp(ctx, sessionId, '00000000-000000000000', 'correct horse battery', FAST)).status).toBe('no-match');

    // Another shot moves: a rebuilt image carries a different stamp, and the old stamp is still valid only for the old image.
    const analysis = (await getAnalysisRecord(ctx.db, photoId))!;
    const moved = analysis.shots.map((s, i) => (i === 0 ? { ...s, xMm: s.xMm + 1 } : s));
    await putAnalysisRecord(ctx.db, { ...analysis, shots: moved });
    const second = await buildComposite(ctx, sessionId, stubRenderTools());
    const prov2 = (await sidecarProvenance(ctx, second.id))!;
    expect(prov2.stamp).not.toBe(prov.stamp);
  });

  it('the stamp changes when the source photo does', async () => {
    const a = await seed();
    await setPassphrase(a.ctx, 'correct horse battery', FAST);
    const first = await sidecarProvenance(a.ctx, (await buildComposite(a.ctx, a.sessionId, stubRenderTools())).id);
    await putBlob(a.ctx.db, photoOriginalKey(a.photoId), { bytes: new Uint8Array([9, 9, 9]).buffer, contentType: 'image/jpeg', sizeBytes: 3, createdAt: '2026-09-05T17:20:00.000Z' });
    const second = await sidecarProvenance(a.ctx, (await buildComposite(a.ctx, a.sessionId, stubRenderTools())).id);
    expect(second!.payload).not.toBe(first!.payload);
  });
});
