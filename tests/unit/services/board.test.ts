// leaderboard.md §4–§6 (issue #42): the Board's services over a real (fake-indexeddb) database.

import { describe, expect, it } from 'vitest';

import type { Shot } from '@/lib/domain/analysis';
import { boardIdentity } from '@/lib/leaderboard/identity';
import { previewSubmission } from '@/lib/leaderboard/select';
import { boardFileText } from '@/lib/leaderboard/file';
import { buildSubmission } from '@/lib/leaderboard/submission';
import { analyzeTarget } from '@/lib/scoring/analyze';
import { applyImport, createBoardFile, createMySubmission, loadBoard, loadHeldSubmissions, previewImport } from '@/lib/services/board';
import { setPassphrase } from '@/lib/services/provenance';
import { createBackup } from '@/lib/backup/create';
import { readBackupText } from '@/lib/backup/format';
import { verifyBackup } from '@/lib/backup/verify';
import { restoreBoard } from '@/lib/services/board';
import { getBoard } from '@/lib/store/board-repo';
import { putAnalysisRecord } from '@/lib/store/analyses-repo';
import { putPhotoRecord } from '@/lib/store/photos-repo';
import { putSessionRecord } from '@/lib/store/sessions-repo';
import { getSettings, putSettings } from '@/lib/store/settings-repo';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';
import { makeAnalysis, makePhoto, makePrior, makeSession } from '../../helpers/records';

const FAST = 1000;
const shot = (i: number, xMm: number): Shot => ({
  id: `s${i}`, xMm, yMm: 0, multiplicity: 1, positionOverrides: null, source: 'auto', confidence: null, cluster: false, possibleOverlap: false,
});

/** `count` analysed precision targets in one session, found by the app, each ten shots at `radiusMm`. */
async function seedTargets(ctx: ReturnType<typeof makeTestContext>, count: number, position: 'prone' | 'standing', radiusMm: number) {
  const session = makeSession({ sessionDate: '2026-09-20' });
  await putSessionRecord(ctx.db, session);
  for (let i = 0; i < count; i++) {
    const categorization = { template: 'precision' as const, position, roundsProne: position === 'prone' ? 10 : null, roundsStanding: position === 'standing' ? 10 : null };
    const photo = makePhoto({ sessionId: session.id, status: 'analyzed', categorization });
    const shots = Array.from({ length: 10 }, (_, j) => shot(j, radiusMm));
    const result = analyzeTarget({ template: 'precision', categorization, shots });
    await putPhotoRecord(ctx.db, photo);
    await putAnalysisRecord(
      ctx.db,
      makeAnalysis(photo.id, { stageA: 'done', stageB: 'done', alignment: { method: 'cv', confidence: 0.9 } }, {
        calibration: makePrior({ source: 'auto' }),
        shots,
        computed: { engineVersion: '1', result },
      }),
    );
  }
}

async function otherShooter(fill: number, name: string) {
  const identity = await boardIdentity(new Uint8Array(32).fill(fill));
  const target = (id: string) => {
    const finalShots = Array.from({ length: 10 }, (_, j) => shot(j, 10));
    return { photoId: id, sessionId: 's', sessionDate: '2026-09-21', position: 'prone' as const, declared: 10, finalShots, autoShots: finalShots, check: { edited: false, auto: null, final: { percent: 90, xCount: 0, groupMm: 0 }, deltaPoints: null, flagged: false } };
  };
  const mine = ['a', 'b', 'c', 'd', 'e'].map(target);
  return (await buildSubmission({ identity, name, club: 'Other club', signedAt: '2026-10-01T09:00:00.000Z', prone: previewSubmission(mine, 'prone'), standing: previewSubmission(mine, 'standing') }))!;
}

describe('createMySubmission', () => {
  it('says what is missing: a name, the stamp passphrase, five targets', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db, { nowIso: '2026-10-01T12:00:00.000Z' });
    expect((await createMySubmission(ctx)).status).toBe('no-name');
    await putSettings(db, { ...(await getSettings(db)), athleteName: 'Ann Lee', athleteClub: 'North SC' });
    expect((await createMySubmission(ctx)).status).toBe('no-passphrase');
    await setPassphrase(ctx, 'correct horse battery staple', FAST);
    expect((await createMySubmission(ctx)).status).toBe('not-enough');
    await seedTargets(ctx, 5, 'prone', 0);
    const mine = await createMySubmission(ctx);
    expect(mine.status).toBe('ok');
    if (mine.status !== 'ok') return;
    expect(mine.submission).toMatchObject({ name: 'Ann Lee', club: 'North SC', signedAt: '2026-10-01T12:00:00.000Z' });
    expect(mine.submission.prone).toHaveLength(5);
    expect(mine.submission.standing).toBeUndefined();
    expect(mine.fileName).toBe('nordic-aim-submission-ann-lee-2026-10-01.json');
    // No photo or GPS: only dates, rounds, marks and shot positions.
    expect(Object.keys(mine.submission.prone![0]!).sort()).toEqual(['auto', 'date', 'declared', 'edited', 'final']);
    db.close();
  });
});

describe('import', () => {
  it('previews before saving, saves on apply, ignores our own submission, and a second import changes nothing', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db, { nowIso: '2026-10-01T12:00:00.000Z' });
    await putSettings(db, { ...(await getSettings(db)), athleteName: 'Ann Lee' });
    await setPassphrase(ctx, 'correct horse battery staple', FAST);
    await seedTargets(ctx, 5, 'prone', 0);
    const mine = await createMySubmission(ctx);
    if (mine.status !== 'ok') throw new Error(mine.status);

    const bob = await otherShooter(2, 'Bob');
    const tampered = { ...(await otherShooter(3, 'Cy')), name: 'Cyrus' };
    const file = boardFileText([mine.submission, bob, tampered], '2026-10-01T12:00:00.000Z');

    const preview = (await previewImport(ctx, file))!;
    expect(preview.rejected).toBe(1);
    expect(preview.summary).toEqual({ added: 1, updated: 0, unchanged: 1, overCap: 0 });
    expect(await loadHeldSubmissions(ctx)).toHaveLength(0); // nothing saved by a preview

    expect(await applyImport(ctx, preview.accepted)).toEqual({ added: 1, updated: 0, unchanged: 1, overCap: 0 });
    expect((await loadHeldSubmissions(ctx)).map((s) => s.name)).toEqual(['Bob']);
    expect((await applyImport(ctx, preview.accepted)).unchanged).toBe(2);

    const board = await loadBoard(ctx);
    expect(board).toMatchObject({ identity: 'ready', ownKey: mine.submission.publicKey });
    expect(board.held).toHaveLength(1);
    expect(await previewImport(ctx, 'not a board')).toBeNull();

    const whole = await createBoardFile(ctx);
    expect(whole.count).toBe(2);
    expect(whole.fileName).toBe('nordic-aim-board-2026-10-01.json');
    db.close();
  });
});

describe('backup and restore (leaderboard.md §8)', () => {
  it('a full backup carries the received board; a restore checks each submission again and merges it; a partial backup leaves it out', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db, { nowIso: '2026-10-01T12:00:00.000Z' });
    const bob = await otherShooter(2, 'Bob');
    const cy = await otherShooter(3, 'Cy');
    await applyImport(ctx, [bob, cy]);

    const full = await createBackup(db, { appBuild: 'test', nowIso: '2026-10-01T12:00:00.000Z' });
    const verified = await verifyBackup(await readBackupText(full.blob));
    if (!verified.ok) throw new Error(verified.problem);
    expect(verified.backup.file.board?.submissions).toHaveLength(2);

    const partial = await createBackup(db, { appBuild: 'test', nowIso: '2026-10-01T12:00:00.000Z', sessionIds: [] });
    const partialRead = await verifyBackup(await readBackupText(partial.blob));
    if (!partialRead.ok) throw new Error(partialRead.problem);
    expect(partialRead.backup.file.board).toBeUndefined();

    const fresh = await openTestDb();
    const freshCtx = makeTestContext(fresh, { nowIso: '2026-10-02T12:00:00.000Z' });
    // One submission edited inside the file is dropped on its own; the other comes back.
    const board = verified.backup.file.board!;
    const edited = { submissions: [board.submissions[0], { ...(board.submissions[1] as object), name: 'Changed' }] };
    expect(await restoreBoard(freshCtx, edited)).toBe(1);
    expect((await getBoard(fresh)).submissions).toHaveLength(1);
    expect(await restoreBoard(freshCtx, undefined)).toBe(0);
    db.close();
    fresh.close();
  });
});
