import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';

import { readExif } from '@/lib/media/exif';

const FIXTURES = new URL('../../../fixtures/reference/', import.meta.url);
const PRIVATE_FIXTURES = new URL('../../../fixtures/private/', import.meta.url);

async function exists(url: URL): Promise<boolean> {
  try {
    await access(url);
    return true;
  } catch {
    return false;
  }
}

describe('readExif', () => {
  it('reads fixtures/reference/exif-sample.jpg matching the §1 table', async () => {
    const buf = await readFile(new URL('exif-sample.jpg', FIXTURES));
    const e = await readExif(new Uint8Array(buf));
    expect(e).not.toBeNull();
    const meta = e!;
    expect(meta.captureLocal).toBe('2026-09-05T16:56:03');
    expect(meta.captureOffset).toBe('-07:00');
    expect(meta.captureUtc).toBe('2026-09-05T23:56:03.000Z');
    expect(meta.brightnessValue).toBeCloseTo(9.71442, 9);
    expect(meta.exposureTimeSec).toBeCloseTo(1 / 3425, 12);
    expect(meta.fNumber).toBeCloseTo(1.78, 9);
    expect(meta.iso).toBe(80);
    expect(meta.flashRaw).toBe(16);
    expect(meta.flashFired).toBe(false);
    expect(meta.whiteBalance).toBe('auto');
    expect(meta.make).toBe('Apple');
    expect(meta.model).toBe('iPhone 16 Pro Max');
    expect(meta.lens).toBe('iPhone 16 Pro Max back triple camera 6.765mm f/1.78');
    expect(meta.gpsPresent).toBe(false);
    expect(meta.gps).toBeNull();
  });

  it('returns null for fixtures/reference/tiny-sighting.heic (no metadata)', async () => {
    const buf = await readFile(new URL('tiny-sighting.heic', FIXTURES));
    const e = await readExif(new Uint8Array(buf));
    expect(e).toBeNull();
  });

  it('returns null for random bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const e = await readExif(bytes);
    expect(e).toBeNull();
  });

  it('private: IMG_5132.HEIC either returns null or matches the sidecar non-GPS fields (skipped if absent)', async () => {
    const path = new URL('IMG_5132.HEIC', PRIVATE_FIXTURES);
    if (!(await exists(path))) return;
    const buf = await readFile(path);
    const e = await readExif(new Uint8Array(buf));
    if (e === null) return;
    // Never assert/print GPS values from the private original.
    expect(e.captureLocal).toBe('2026-09-05T16:56:03');
    expect(e.captureOffset).toBe('-07:00');
    expect(e.captureUtc).toBe('2026-09-05T23:56:03.000Z');
    expect(e.make).toBe('Apple');
    expect(e.model).toBe('iPhone 16 Pro Max');
    expect(e.flashRaw).toBe(16);
    expect(e.flashFired).toBe(false);
    expect(e.whiteBalance).toBe('auto');
  });
});
