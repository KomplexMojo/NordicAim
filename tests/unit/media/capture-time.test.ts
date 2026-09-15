import { describe, expect, it } from 'vitest';

import { clientNow, formatOffset, localToUtc, resolveCaptureTime } from '@/lib/media/capture-time';
import type { ExifMeta } from '@/lib/domain/photo';

describe('formatOffset', () => {
  it.each([
    [420, '-07:00'],
    [0, '+00:00'],
    [-330, '+05:30'],
    [-345, '+05:45'],
  ])('formatOffset(%i) -> %s', (minutes, expected) => {
    expect(formatOffset(minutes)).toBe(expected);
  });
});

describe('clientNow', () => {
  it('builds clientLocal from the Date components and clientOffset from getTimezoneOffset', () => {
    const d = new Date(2026, 8, 5, 16, 56, 3); // local time, month is 0-indexed
    const { clientLocal, clientOffset } = clientNow(d);
    expect(clientLocal).toBe('2026-09-05T16:56:03');
    expect(clientOffset).toBe(formatOffset(d.getTimezoneOffset()));
  });
});

describe('localToUtc', () => {
  it.each([
    ['2026-08-24T19:30:09', '-07:00', '2026-08-25T02:30:09.000Z'],
    ['2026-01-01T00:30:00', '+05:30', '2025-12-31T19:00:00.000Z'],
    ['2026-09-05T16:56:03', '-07:00', '2026-09-05T23:56:03.000Z'],
  ])('localToUtc(%s, %s) -> %s', (local, offset, expected) => {
    expect(localToUtc(local, offset)).toBe(expected);
  });
});

describe('resolveCaptureTime', () => {
  const client = { clientLocal: '2026-09-05T12:00:00', clientOffset: '-07:00' };

  it('prefers exif.captureLocal, using exif.captureOffset when present', () => {
    const exif = {
      captureLocal: '2026-09-05T16:56:03',
      captureOffset: '-07:00',
    } as unknown as ExifMeta;
    const ct = resolveCaptureTime({ exif, origin: 'import', ...client });
    expect(ct.source).toBe('exif');
    expect(ct.local).toBe('2026-09-05T16:56:03');
    expect(ct.offset).toBe('-07:00');
    expect(ct.utc).toBe('2026-09-05T23:56:03.000Z');
  });

  it('falls back to clientOffset when exif.captureOffset is null', () => {
    const exif = { captureLocal: '2026-09-05T16:56:03', captureOffset: null } as unknown as ExifMeta;
    const ct = resolveCaptureTime({ exif, origin: 'import', ...client });
    expect(ct.offset).toBe('-07:00');
  });

  it('uses client-clock for camera-overlay/camera-native when there is no exif', () => {
    for (const origin of ['camera-overlay', 'camera-native'] as const) {
      const ct = resolveCaptureTime({ exif: null, origin, ...client });
      expect(ct.source).toBe('client-clock');
      expect(ct.local).toBe(client.clientLocal);
      expect(ct.offset).toBe(client.clientOffset);
    }
  });

  it('uses import-time for import origin with no exif', () => {
    const ct = resolveCaptureTime({ exif: null, origin: 'import', ...client });
    expect(ct.source).toBe('import-time');
    expect(ct.local).toBe(client.clientLocal);
  });
});
