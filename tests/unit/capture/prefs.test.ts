import { describe, expect, it } from 'vitest';

import {
  capturePrefsKey,
  defaultCapturePrefs,
  loadCapturePrefs,
  parseCapturePrefs,
  saveCapturePrefs,
} from '@/lib/capture/prefs-browser';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

describe('capture prefs (capture-overlay §1.2)', () => {
  it('uses the key asa.capture.<sessionId>', () => {
    expect(capturePrefsKey('s1')).toBe('asa.capture.s1');
  });

  it('defaults to no picks and size 0.85', () => {
    expect(defaultCapturePrefs()).toEqual({ template: null, position: null, outerDiameterFraction: 0.85 });
    expect(parseCapturePrefs(null)).toEqual(defaultCapturePrefs());
    expect(parseCapturePrefs('not json')).toEqual(defaultCapturePrefs());
  });

  it('round-trips per session', () => {
    const storage = memoryStorage();
    saveCapturePrefs('s1', { template: 'precision', position: 'both', outerDiameterFraction: 0.6 }, storage);
    expect(storage.data.has('asa.capture.s1')).toBe(true);
    expect(loadCapturePrefs('s1', storage)).toEqual({ template: 'precision', position: 'both', outerDiameterFraction: 0.6 });
    expect(loadCapturePrefs('s2', storage)).toEqual(defaultCapturePrefs());
  });

  it('drops invalid fields individually', () => {
    expect(parseCapturePrefs(JSON.stringify({ template: 'sighting', position: 'kneeling', outerDiameterFraction: 0.99 }))).toEqual({
      template: 'sighting',
      position: null,
      outerDiameterFraction: 0.85,
    });
  });

  it('survives a throwing storage', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(loadCapturePrefs('s1', throwing)).toEqual(defaultCapturePrefs());
    expect(() => saveCapturePrefs('s1', defaultCapturePrefs(), throwing)).not.toThrow();
  });
});
