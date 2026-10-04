// leaderboard.md §5–§6 (issue #42): the board identity, signed submissions, merging and the two files.

import { describe, expect, it } from 'vitest';

import type { Shot } from '@/lib/domain/analysis';
import { boardFileText, checkSubmissions, readBoardFile, submissionFileName } from '@/lib/leaderboard/file';
import { boardIdentity, signText, verifyText } from '@/lib/leaderboard/identity';
import { BOARD_CAP, mergeSubmissions, rankRows } from '@/lib/leaderboard/merge';
import { previewSubmission, type MyBoardTarget } from '@/lib/leaderboard/select';
import { athletePictureDataUrl, MAX_ATHLETE_PICTURE_BYTES } from '@/lib/domain/athlete-picture';
import { boardRow, buildSubmission, Submission, verifySubmission, type SubmittedTarget } from '@/lib/leaderboard/submission';
import { correctionCheck } from '@/lib/leaderboard/score';

const stampKey = (fill: number) => new Uint8Array(32).fill(fill);
const shot = (i: number, xMm: number): Shot => ({
  id: `s${i}`, xMm, yMm: 0, multiplicity: 1, positionOverrides: null, source: 'auto', confidence: null, cluster: false, possibleOverlap: false,
});
const ring = (r: number) => Array.from({ length: 10 }, (_, i) => shot(i, r));

function myTarget(id: string, r: number, position: 'prone' | 'standing' = 'prone', autoR: number | null = r): MyBoardTarget {
  const finalShots = ring(r);
  const autoShots = autoR === null ? null : ring(autoR);
  const edited = autoR !== r;
  return { photoId: id, sessionId: 's', sessionDate: '2026-09-20', position, declared: 10, finalShots, autoShots, check: correctionCheck(finalShots, autoShots, edited, position, 10) };
}

describe('board identity', () => {
  it('the same stamp key always gives the same public key; another key a different one', async () => {
    const a = await boardIdentity(stampKey(7));
    const b = await boardIdentity(stampKey(7));
    const c = await boardIdentity(stampKey(8));
    expect(a.publicKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(b.publicKey).toBe(a.publicKey);
    expect(c.publicKey).not.toBe(a.publicKey);
  });

  it('signs and checks; a changed text or a wrong key fails, a malformed key is simply false', async () => {
    const a = await boardIdentity(stampKey(7));
    const sig = await signText(a.privateKey, 'hello');
    expect(await verifyText(a.publicKey, 'hello', sig)).toBe(true);
    expect(await verifyText(a.publicKey, 'hellO', sig)).toBe(false);
    expect(await verifyText((await boardIdentity(stampKey(9))).publicKey, 'hello', sig)).toBe(false);
    expect(await verifyText('not-a-key', 'hello', sig)).toBe(false);
  });
});

async function submissionFor(fill: number, name: string, proneR: number[], signedAt = '2026-10-01T10:00:00.000Z', standingR: number[] = []): Promise<Submission> {
  const identity = await boardIdentity(stampKey(fill));
  const mine = [...proneR.map((r, i) => myTarget(`p${i}`, r)), ...standingR.map((r, i) => myTarget(`s${i}`, r, 'standing'))];
  const s = await buildSubmission({ identity, name, club: 'Club', signedAt, prone: previewSubmission(mine, 'prone'), standing: previewSubmission(mine, 'standing') });
  return s!;
}

describe('buildSubmission', () => {
  it('holds only the positions with the full 5, signed; none at all is no submission', async () => {
    const s = await submissionFor(1, 'Ann', [0, 0, 0, 0, 0, 30], undefined, [0, 0]);
    expect(Submission.parse(s)).toBeTruthy();
    expect(s.prone).toHaveLength(5);
    expect(s.standing).toBeUndefined();
    expect(await verifySubmission(s)).toBe(true);
    const identity = await boardIdentity(stampKey(1));
    const none = await buildSubmission({ identity, name: 'Ann', club: '', signedAt: '2026-10-01T10:00:00.000Z', prone: previewSubmission([], 'prone'), standing: previewSubmission([], 'standing') });
    expect(none).toBeNull();
  });

  it('any change after signing breaks the signature', async () => {
    const s = await submissionFor(1, 'Ann', [0, 0, 0, 0, 0]);
    expect(await verifySubmission({ ...s, name: 'Bob' })).toBe(false);
    const moved: SubmittedTarget[] = s.prone!.map((t, i) => (i === 0 ? { ...t, final: t.final.map((p) => ({ ...p, x: p.x + 1 })) } : t));
    expect(await verifySubmission({ ...s, prone: moved })).toBe(false);
  });
});

describe('the athlete picture in a submission (REV-157)', () => {
  // A tiny JPEG with no metadata, as a canvas makes it.
  const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
  const jpeg = (extra: number[] = []) =>
    athletePictureDataUrl(new Uint8Array([0xff, 0xd8, ...seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]), ...extra, ...seg(0xda, [1, 1, 0, 0, 0x3f, 0]), 0x12, 0xff, 0xd9]));
  const picture = jpeg();

  async function withPicture(p: string | null) {
    const identity = await boardIdentity(stampKey(5));
    const mine = [0, 0, 0, 0, 0].map((r, i) => myTarget(`p${i}`, r));
    return (await buildSubmission({ identity, name: 'Pia', club: '', signedAt: '2026-10-03T10:00:00.000Z', prone: previewSubmission(mine, 'prone'), standing: previewSubmission(mine, 'standing'), picture: p }))!;
  }

  it('with a picture: version 2, signed over it, and the board row shows it', async () => {
    const s = await withPicture(picture);
    expect(s).toMatchObject({ version: 2, picture });
    expect(Submission.safeParse(s).success).toBe(true);
    expect(await verifySubmission(s)).toBe(true);
    expect(boardRow(s, 'prone')!.picture).toBe(picture);
    // Another picture swapped in after signing is caught.
    expect(await verifySubmission({ ...s, picture: jpeg(seg(0xfe, [0x41])) })).toBe(false);
  });

  it('without one: version 1, exactly as before, and the row falls back to initials', async () => {
    const s = await withPicture(null);
    expect(s.version).toBe(1);
    expect('picture' in s).toBe(false);
    expect(await verifySubmission(s)).toBe(true);
    expect(boardRow(s, 'prone')!.picture).toBeNull();
  });

  it('a picture that is too large, carries EXIF, or comes without version 2 rejects that submission alone', async () => {
    const good = await withPicture(picture);
    const tooBig = { ...good, picture: jpeg(seg(0xfe, new Array(MAX_ATHLETE_PICTURE_BYTES).fill(0x20))) };
    const exif = { ...good, picture: jpeg(seg(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0])) };
    const v1WithPicture = { ...good, version: 1 };
    const { accepted, rejected } = await checkSubmissions([good, tooBig, exif, v1WithPicture]);
    expect(accepted).toEqual([good]);
    expect(rejected).toBe(3);
  });
});

describe('boardRow: re-scored on receipt', () => {
  it('scores every target here, averages them, and works out edited and flagged itself', async () => {
    const identity = await boardIdentity(stampKey(2));
    const mine = [myTarget('a', 0, 'prone', 28), myTarget('b', 28), myTarget('c', 28), myTarget('d', 28), myTarget('e', 28)];
    const s = (await buildSubmission({ identity, name: 'Cy', club: '', signedAt: '2026-10-01T10:00:00.000Z', prone: previewSubmission(mine, 'prone'), standing: previewSubmission(mine, 'standing') }))!;
    const row = boardRow(s, 'prone')!;
    expect(row.targets.map((t) => t.check.final.percent)).toEqual([100, 70, 70, 70, 70]);
    expect(row.average).toBe(76);
    expect(row).toMatchObject({ edited: true, flagged: true });
    // A sender that hides its edited mark is still caught by its own automatic shots.
    const hidden = { ...s, prone: s.prone!.map((t) => ({ ...t, edited: false })) };
    expect(boardRow(hidden, 'prone')).toMatchObject({ edited: true, flagged: true });
    expect(boardRow(s, 'standing')).toBeNull();
  });
});

describe('mergeSubmissions', () => {
  it('adds new shooters, a newer submission replaces the older, the same file twice changes nothing, and our own key is never held', async () => {
    const ann = await submissionFor(1, 'Ann', [0, 0, 0, 0, 0]);
    const annLater = await submissionFor(1, 'Ann', [5, 5, 5, 5, 5], '2026-10-02T10:00:00.000Z');
    const bob = await submissionFor(2, 'Bob', [10, 10, 10, 10, 10]);
    const me = await submissionFor(3, 'Me', [0, 0, 0, 0, 0]);

    const first = mergeSubmissions([], [ann, bob, me], me.publicKey);
    expect(first.summary).toEqual({ added: 2, updated: 0, unchanged: 1, overCap: 0 });
    const again = mergeSubmissions(first.submissions, [ann, bob], me.publicKey);
    expect(again.summary).toEqual({ added: 0, updated: 0, unchanged: 2, overCap: 0 });
    expect(again.submissions).toHaveLength(2);
    const newer = mergeSubmissions(again.submissions, [annLater], null);
    expect(newer.summary.updated).toBe(1);
    expect(newer.submissions.find((s) => s.publicKey === ann.publicKey)?.signedAt).toBe('2026-10-02T10:00:00.000Z');
    // An older one arriving after the newer one does not win.
    expect(mergeSubmissions(newer.submissions, [ann], null).summary.unchanged).toBe(1);
  });

  it(`keeps the best ${BOARD_CAP} rows per board`, () => {
    // Merging never checks signatures (import does), so unsigned stand-ins are enough here.
    const fake = (i: number): Submission => ({
      format: 'nordic-aim-board-submission',
      version: 1,
      publicKey: `k${String(i).padStart(42, '0')}`,
      name: `S${i}`,
      club: '',
      signedAt: '2026-10-01T10:00:00.000Z',
      prone: Array.from({ length: 5 }, () => ({ date: '2026-09-20', declared: 10, edited: false, auto: null, final: Array.from({ length: 10 }, () => ({ x: i * 0.3, y: 0, m: 1 })) })),
      signature: 'x'.repeat(86),
    });
    const many = Array.from({ length: BOARD_CAP + 5 }, (_, i) => fake(i));
    const { submissions, summary } = mergeSubmissions([], many, null);
    expect(submissions).toHaveLength(BOARD_CAP);
    expect(summary.overCap).toBe(5);
    const rows = rankRows(submissions, 'prone');
    expect(rows[0]!.name).toBe('S0');
    expect(rows.every((r, i) => i === 0 || rows[i - 1]!.average >= r.average)).toBe(true);
  });
});

describe('files', () => {
  it('reads a board file or a single submission, and rejects anything else', async () => {
    const ann = await submissionFor(1, 'Ann', [0, 0, 0, 0, 0]);
    expect(readBoardFile(boardFileText([ann], '2026-10-01T10:00:00.000Z'))).toMatchObject({ submissions: [ann], challenges: [] });
    expect(readBoardFile(JSON.stringify(ann))?.submissions).toHaveLength(1);
    // A board file from before challenges existed reads as having none.
    expect(readBoardFile(JSON.stringify({ format: 'nordic-aim-board', version: 1, submissions: [] }))?.challenges).toEqual([]);
    expect(readBoardFile('{"format":"nordic-aim-backup"}')).toBeNull();
    expect(readBoardFile('not json')).toBeNull();
  });

  it('a tampered submission is rejected on its own, never the whole file', async () => {
    const ann = await submissionFor(1, 'Ann', [0, 0, 0, 0, 0]);
    const bob = await submissionFor(2, 'Bob', [10, 10, 10, 10, 10]);
    const raws = readBoardFile(boardFileText([ann, { ...bob, name: 'Bobby' }], '2026-10-01T10:00:00.000Z'))!.submissions;
    const checked = await checkSubmissions([...raws, { junk: true }]);
    expect(checked.accepted.map((s) => s.name)).toEqual(['Ann']);
    expect(checked.rejected).toBe(2);
  });

  it('names files after the athlete and the day', () => {
    expect(submissionFileName('Åse Bø', '2026-10-01')).toBe('nordic-aim-submission-ase-bo-2026-10-01.json'); // the backup file name's own slug
    expect(submissionFileName('', '2026-10-01')).toBe('nordic-aim-submission-2026-10-01.json');
  });
});
