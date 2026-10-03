// REV-158: a photo's location is taken out of its file on import, and nothing else changes.

import * as exifr from 'exifr';
import { describe, expect, it } from 'vitest';

import { readExif } from '@/lib/media/exif';
import { detectFormat } from '@/lib/media/format';
import { LocationNotRemovedError, stripLocation } from '@/lib/media/strip-location';

import { heicWithGps, jpegWithGps, pngWithGps, XMP_WITH_LOCATION } from '../../helpers/exif-files';

const text = (b: Uint8Array) => Buffer.from(b).toString('latin1');

describe('stripLocation', () => {
  for (const [name, make] of [['JPEG', () => jpegWithGps()], ['HEIC', heicWithGps], ['PNG', pngWithGps]] as const) {
    it(`${name}: the GPS location is gone; the capture time, orientation and length are not`, async () => {
      const original = make();
      const format = detectFormat(original)!;
      const before = await readExif(original);
      expect(before?.gps).toMatchObject({ lat: expect.closeTo(51.5033, 3), lon: expect.closeTo(7.2583, 3) });

      const stripped = stripLocation(original, format);
      expect(stripped.byteLength).toBe(original.byteLength);
      const after = await readExif(stripped);
      expect(after?.gpsPresent).toBe(false);
      expect(after?.gps).toBeNull();
      expect(after?.captureLocal).toBe(before?.captureLocal);
      expect(((await exifr.parse(stripped, { tiff: true, translateValues: false })) as { Orientation?: number }).Orientation).toBe(6);
      // The input is never changed: the caller gets a copy.
      expect((await readExif(original))?.gpsPresent).toBe(true);
    });
  }

  it('JPEG: XMP location fields are blanked in place and IPTC is zeroed; the rest of the XMP stays', () => {
    const stripped = stripLocation(jpegWithGps({ xmp: XMP_WITH_LOCATION, iptc: true }), 'jpeg');
    const s = text(stripped);
    expect(s).not.toContain('51,30.2N');
    expect(s).not.toContain('7,15.5E');
    expect(s).not.toContain('Lakeside');
    expect(s).toContain('exif:GPSLatitude="        "');
    expect(s).toContain('<dc:title>Range day</dc:title>');
  });

  it('a photo with no location comes back the same', () => {
    const plain = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
    expect(stripLocation(plain, 'jpeg')).toEqual(plain);
  });

  it('metadata it cannot safely change is reported, never passed over', () => {
    const broken = jpegWithGps();
    broken[2 + 2 + 2 + 6 + 4 + 3] = 0xff; // IFD0's offset points far outside the block
    expect(() => stripLocation(broken, 'jpeg')).toThrow(LocationNotRemovedError);
  });
});
