import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checksLabel, dataLabel, metricsLabel, reasonsLabel } from '@/lib/ui/panel-labels';
import { readPanelOpen, writePanelOpen } from '@/lib/ui/panel-state';

describe('panel labels (issue #14)', () => {
  it('metrics: the group size', () => {
    const result = { all: { extremeSpreadMm: 27.681 } } as never;
    expect(metricsLabel(result)).toBe('Group size 27.7 mm');
    expect(metricsLabel({ all: { extremeSpreadMm: null } } as never)).toBe('Group size — mm');
  });

  it('reasons: none means no panel; one; several names the count and the first', () => {
    expect(reasonsLabel([])).toBeNull();
    expect(reasonsLabel(['Needs attention'])).toBe('1 note: Needs attention');
    expect(reasonsLabel(['Needs attention', 'Blurry'])).toBe('2 notes: Needs attention');
  });

  it('checks and data', () => {
    expect(checksLabel({ pass: 14, fail: 0 })).toBe('14 pass · 0 fail');
    expect(dataLabel({ sessions: 2, photos: 6 })).toBe('2 sessions · 6 photos');
    expect(dataLabel({ sessions: 1, photos: 1 })).toBe('1 session · 1 photo');
  });
});

describe('panel state', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
  });

  it('uses the default until a choice is made, then keeps it', () => {
    expect(readPanelOpen('unit-a', true)).toBe(true);
    writePanelOpen('unit-a', false);
    expect(readPanelOpen('unit-a', true)).toBe(false);
    expect(store.get('asa.panel.unit-a')).toBe('closed');
  });

  it('still works when storage throws', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(readPanelOpen('unit-b', false)).toBe(false);
    expect(() => writePanelOpen('unit-b', true)).not.toThrow();
    expect(readPanelOpen('unit-b', false)).toBe(true);
  });
});
