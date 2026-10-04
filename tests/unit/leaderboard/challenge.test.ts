// leaderboard.md §9 (issue #42): signed challenges, and which ones a board keeps.

import { describe, expect, it } from 'vitest';

import { challengesFor, checkChallenges, mergeChallenges, MAX_CHALLENGES_PER_SUBMISSION, signChallenge, type Challenge } from '@/lib/leaderboard/challenge';
import { boardIdentity } from '@/lib/leaderboard/identity';

const target = { shooter: 'b'.repeat(43), submissionSignedAt: '2026-10-01T09:00:00.000Z', position: 'prone' as const, index: 2 };

async function challenge(fill: number, createdAt = '2026-10-01T12:00:00.000Z', over: Partial<typeof target> = {}): Promise<Challenge> {
  const identity = await boardIdentity(new Uint8Array(32).fill(fill));
  return signChallenge(identity, `Shooter ${fill}`, { ...target, ...over }, ' Hole at 4 o’clock is a neighbour’s shot ', createdAt);
}

describe('challenges are signed', () => {
  it('a challenge checks out; one changed after signing is rejected on its own', async () => {
    const c = await challenge(1);
    expect(c.reason).toBe('Hole at 4 o’clock is a neighbour’s shot');
    const { accepted, rejected } = await checkChallenges([c, { ...c, reason: 'something else' }, { junk: 1 }]);
    expect(accepted).toEqual([c]);
    expect(rejected).toBe(2);
  });
});

describe('mergeChallenges', () => {
  const live = { submissions: [{ publicKey: target.shooter, signedAt: target.submissionSignedAt }], ownKey: null };

  it('one per challenger and target, the newest; importing again adds nothing', async () => {
    const first = await challenge(1);
    const later = await challenge(1, '2026-10-02T12:00:00.000Z');
    const other = await challenge(2);
    const a = mergeChallenges([], [first, other], live);
    expect(a.added).toBe(2);
    const b = mergeChallenges(a.challenges, [later, other], live);
    expect(b.added).toBe(0);
    expect(b.challenges.filter((c) => c.challenger === first.challenger).map((c) => c.createdAt)).toEqual(['2026-10-02T12:00:00.000Z']);
  });

  it('a newer submission from the shooter answers the challenge: it no longer applies and is dropped', async () => {
    const c = await challenge(1);
    const answered = { submissions: [{ publicKey: target.shooter, signedAt: '2026-10-05T09:00:00.000Z' }], ownKey: null };
    expect(mergeChallenges([c], [], answered).challenges).toEqual([]);
  });

  it("challenges of this phone's own shooter are kept, so the owner sees them", async () => {
    const c = await challenge(1, undefined, { shooter: 'm'.repeat(43) });
    expect(mergeChallenges([], [c], { submissions: [], ownKey: 'm'.repeat(43) }).challenges).toEqual([c]);
  });

  it(`keeps at most ${MAX_CHALLENGES_PER_SUBMISSION} per submission, the earliest`, async () => {
    const many = await Promise.all(Array.from({ length: MAX_CHALLENGES_PER_SUBMISSION + 3 }, (_, i) => challenge(i + 1, `2026-10-01T12:${String(i).padStart(2, '0')}:00.000Z`)));
    const kept = mergeChallenges([], many, live).challenges;
    expect(kept).toHaveLength(MAX_CHALLENGES_PER_SUBMISSION);
    expect(kept[0]!.createdAt).toBe('2026-10-01T12:00:00.000Z');
  });

  it('challengesFor picks a row: its current submission, or every one for our own live row', async () => {
    const c = await challenge(1);
    expect(challengesFor([c], target.shooter, 'prone', target.submissionSignedAt)).toEqual([c]);
    expect(challengesFor([c], target.shooter, 'prone', '2026-10-05T09:00:00.000Z')).toEqual([]);
    expect(challengesFor([c], target.shooter, 'standing', null)).toEqual([]);
    expect(challengesFor([c], target.shooter, 'prone', null)).toEqual([c]);
  });
});
