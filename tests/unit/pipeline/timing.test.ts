import { beforeEach, describe, expect, it } from 'vitest';

import { getRecentTimings, recordTiming, resetTimingsForTests } from '@/lib/pipeline/timing';

describe('pipeline/timing', () => {
  beforeEach(() => {
    resetTimingsForTests();
  });

  it('records a timing and returns it from getRecentTimings', () => {
    recordTiming({ kind: 'A', photoId: 'p1', ms: 123 });
    expect(getRecentTimings()).toEqual([{ kind: 'A', photoId: 'p1', ms: 123 }]);
  });

  it('returns the most recent `count` timings, oldest first', () => {
    for (let i = 0; i < 15; i++) {
      recordTiming({ kind: i % 2 === 0 ? 'A' : 'B', photoId: `p${i}`, ms: i });
    }
    const recent = getRecentTimings(10);
    expect(recent).toHaveLength(10);
    expect(recent[0]).toEqual({ kind: 'B', photoId: 'p5', ms: 5 });
    expect(recent[9]).toEqual({ kind: 'A', photoId: 'p14', ms: 14 });
  });

  it('keeps at most 50 timings in memory, dropping the oldest', () => {
    for (let i = 0; i < 60; i++) {
      recordTiming({ kind: 'A', photoId: `p${i}`, ms: i });
    }
    const all = getRecentTimings(50);
    expect(all).toHaveLength(50);
    expect(all[0]?.photoId).toBe('p10');
    expect(all[49]?.photoId).toBe('p59');
  });

  it('resetTimingsForTests clears recorded timings', () => {
    recordTiming({ kind: 'B', photoId: 'p1', ms: 1 });
    resetTimingsForTests();
    expect(getRecentTimings()).toEqual([]);
  });
});
