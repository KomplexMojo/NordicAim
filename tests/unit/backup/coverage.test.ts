import { describe, expect, it } from 'vitest';

import { backupCoverage } from '@/lib/backup/coverage';

describe('backupCoverage (REV-117)', () => {
  it('no backup at all', () => {
    expect(backupCoverage(null, '2026-09-20T10:00:00.000Z')).toEqual({ kind: 'never' });
  });
  it('a backup made after the session last changed covers it; one made before does not', () => {
    expect(backupCoverage('2026-09-21T09:00:00.000Z', '2026-09-20T10:00:00.000Z').kind).toBe('covered');
    expect(backupCoverage('2026-09-20T10:00:00.000Z', '2026-09-20T10:00:00.000Z').kind).toBe('covered');
    expect(backupCoverage('2026-09-19T09:00:00.000Z', '2026-09-20T10:00:00.000Z').kind).toBe('changed-since');
  });
  it('unreadable session dates are unknown, not a claim', () => {
    expect(backupCoverage('2026-09-21T09:00:00.000Z', null).kind).toBe('unknown');
  });
});
