import { describe, expect, it } from 'vitest';
import { BiathlonSession, upgradeSession } from '@/lib/domain/session';

const base = {
  id: '4105ce16-85dd-416b-baf9-cc93ec99b7af',
  name: 'Dropping Buathlon',
  sessionDate: '2026-09-19',
  createdAt: '2026-09-19T20:00:00.000Z',
  updatedAt: '2026-09-19T20:00:00.000Z',
  photoIds: [],
  analyzeRequestedAt: null,
  artifacts: [],
  shares: [],
  notes: '',
};

describe('session record round-trip', () => {
  it('v3 parses', () => {
    expect(BiathlonSession.safeParse(upgradeSession({ ...base, schemaVersion: 3 })).success).toBe(true);
  });
  it('v2 (M19 era, with backing) upgrades', () => {
    const v2 = { ...base, schemaVersion: 2, backingMode: 'auto', backing: null };
    expect(BiathlonSession.safeParse(upgradeSession(v2)).success).toBe(true);
  });
  it('v1 upgrades', () => {
    expect(BiathlonSession.safeParse(upgradeSession({ ...base, schemaVersion: 1 })).success).toBe(true);
  });
  it('an artifact without rendererVersion still reads', () => {
    const withArtifact = { ...base, schemaVersion: 3, artifacts: [{ id: base.id, sha256: 'a'.repeat(64), widthPx: 1440, heightPx: 1826, createdAt: base.createdAt }] };
    const parsed = BiathlonSession.safeParse(upgradeSession(withArtifact));
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.artifacts[0]!.rendererVersion).toBe(0);
  });
  it('a record from a NEWER build (schemaVersion 4) reports schemaVersion', () => {
    const parsed = BiathlonSession.safeParse(upgradeSession({ ...base, schemaVersion: 4 }));
    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0]!.path.join('.')).toBe('schemaVersion');
  });
});
