// Issue #73 (REV-139): a session's target kinds for its Home row.

import { describe, expect, it } from 'vitest';

import type { TargetPhoto } from '@/lib/domain/photo';
import { kindsBySession, kindsLabel, rowMarks, type SessionKinds } from '@/lib/sessions/kinds';

let seq = 0;
function photo(sessionId: string, categorization: Partial<TargetPhoto['categorization']>, opts: { origin?: TargetPhoto['origin']; utc?: string } = {}) {
  seq += 1;
  return {
    id: `p${seq}`,
    sessionId,
    origin: opts.origin ?? ('camera-overlay' as const),
    importedAt: `2026-09-28T10:00:${String(seq).padStart(2, '0')}Z`,
    captureTime: { local: null, offset: null, utc: opts.utc ?? `2026-09-28T10:00:${String(seq).padStart(2, '0')}Z`, source: 'client-clock' as const },
    categorization: { template: null, position: null, roundsProne: null, roundsStanding: null, ...categorization },
  };
}
const sighting = (role?: 'sight-in' | 'confirm') => ({ template: 'sighting' as const, position: 'prone' as const, sightingRole: role ?? null });
const precision = (position: 'prone' | 'standing') => ({ template: 'precision' as const, position });

function kinds(counts: Partial<SessionKinds['counts']>, unknown = 0): SessionKinds {
  return { counts: { 'sight-in': 0, confirm: 0, 'precision-prone': 0, 'precision-standing': 0, ...counts }, unknown };
}

describe('kindsBySession', () => {
  it('counts each session on its own, reading sighting roles within that session', () => {
    const map = kindsBySession([
      // Session a: two unset sighting targets → the older is the sight-in, the other the confirm (REV-67).
      photo('a', sighting()),
      photo('a', sighting()),
      photo('a', precision('prone')),
      photo('a', precision('standing')),
      // Session b: its only sighting target is a sight-in, whatever session a holds.
      photo('b', sighting()),
      photo('b', {}),
    ]);
    expect(map.get('a')).toEqual(kinds({ 'sight-in': 1, confirm: 1, 'precision-prone': 1, 'precision-standing': 1 }));
    expect(map.get('b')).toEqual(kinds({ 'sight-in': 1 }, 1));
  });

  it("keeps the owner's chosen roles and leaves backing-card photos out", () => {
    const map = kindsBySession([
      photo('a', sighting('confirm')),
      photo('a', sighting('confirm')),
      photo('a', {}, { origin: 'backing-card' }),
    ]);
    expect(map.get('a')).toEqual(kinds({ confirm: 2 }));
  });
});

describe('rowMarks', () => {
  it('gives one mark per target, in the fixed kind order, up to four targets', () => {
    expect(rowMarks(kinds({ 'precision-standing': 1, 'sight-in': 1, confirm: 2 }))).toEqual([
      { kind: 'sight-in', count: 1 },
      { kind: 'confirm', count: 1 },
      { kind: 'confirm', count: 1 },
      { kind: 'precision-standing', count: 1 },
    ]);
  });

  it('puts targets with no kind last, as their own mark', () => {
    expect(rowMarks(kinds({ 'precision-prone': 1 }, 1))).toEqual([
      { kind: 'precision-prone', count: 1 },
      { kind: null, count: 1 },
    ]);
  });

  it('past four targets, gives one mark per kind with its count', () => {
    expect(rowMarks(kinds({ 'sight-in': 1, confirm: 1, 'precision-prone': 2, 'precision-standing': 2 }))).toEqual([
      { kind: 'sight-in', count: 1 },
      { kind: 'confirm', count: 1 },
      { kind: 'precision-prone', count: 2 },
      { kind: 'precision-standing', count: 2 },
    ]);
  });

  it('is empty for a session with no targets', () => {
    expect(rowMarks(kinds({}))).toEqual([]);
  });
});

describe('kindsLabel', () => {
  it('reads the count, then each kind', () => {
    expect(kindsLabel(kinds({ 'sight-in': 1, confirm: 1, 'precision-prone': 1, 'precision-standing': 1 }), 4)).toBe(
      '4 targets: sight in, confirm, precision prone, precision standing',
    );
    expect(kindsLabel(kinds({ 'precision-prone': 2 }, 1), 3)).toBe('3 targets: 2 precision prone, 1 not categorized');
    expect(kindsLabel(kinds({ confirm: 1 }), 1)).toBe('1 target: confirm');
    expect(kindsLabel(kinds({}), 0)).toBe('0 targets');
  });
});
