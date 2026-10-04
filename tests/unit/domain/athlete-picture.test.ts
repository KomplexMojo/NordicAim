// REV-157 (issue #99): the athlete picture's checks. A picture may only be a small JPEG with no photo metadata.

import { describe, expect, it } from 'vitest';

import { AthletePicture, athletePictureDataUrl, athletePictureProblem, initials, MAX_ATHLETE_PICTURE_BYTES, withoutJpegMetadata } from '@/lib/domain/athlete-picture';
import { AppSettings, defaultAppSettings } from '@/lib/domain/settings';

/** A segment: marker, then a length that counts itself, then the payload. */
const segment = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const JFIF = segment(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const SCAN = [...segment(0xda, [1, 1, 0, 0, 0x3f, 0]), 0x12, 0x34, 0xff, 0xd9];
const jpeg = (...segments: number[][]) => new Uint8Array([0xff, 0xd8, ...segments.flat(), ...SCAN]);

describe('athletePictureProblem', () => {
  it('a plain JPEG, as a canvas makes it, is accepted', () => {
    const url = athletePictureDataUrl(jpeg(JFIF));
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(athletePictureProblem(url)).toBeNull();
    expect(AthletePicture.safeParse(url).success).toBe(true);
  });

  it('a JPEG still carrying EXIF (where a GPS location lives) or IPTC is refused', () => {
    const gps = segment(0xe1, [...ascii('Exif'), 0, 0, ...ascii('MM'), 0, 42, 0, 0, 0, 8, ...ascii('GPS')]);
    expect(athletePictureProblem(athletePictureDataUrl(jpeg(JFIF, gps)))).toBe('it carries photo metadata');
    expect(athletePictureProblem(athletePictureDataUrl(jpeg(segment(0xed, ascii('Photoshop 3.0')))))).toBe('it carries photo metadata');
  });

  it('too large, not a JPEG, or not base64 is refused', () => {
    const big = jpeg(JFIF, segment(0xfe, new Array(MAX_ATHLETE_PICTURE_BYTES).fill(0x20)));
    expect(athletePictureProblem(athletePictureDataUrl(big))).toBe('too large');
    expect(athletePictureProblem('data:image/png;base64,iVBORw0KGgo=')).toBe('not a JPEG');
    expect(athletePictureProblem('data:image/jpeg;base64,!!!!')).toBe('not a JPEG');
    expect(athletePictureProblem(athletePictureDataUrl(new Uint8Array([0x89, 0x50, 0x4e, 0x47])))).toBe('not a JPEG');
  });

  it('a stored picture that no longer passes reads back as none, never failing the settings row', () => {
    const settings = AppSettings.parse({ ...defaultAppSettings(), athletePicture: 'data:image/jpeg;base64,AAAA' });
    expect(settings.athletePicture).toBeNull();
    const older: Record<string, unknown> = { ...defaultAppSettings() };
    delete older.athletePicture;
    expect(AppSettings.parse(older).athletePicture).toBeNull();
  });
});

describe('withoutJpegMetadata', () => {
  it('takes out EXIF (as Safari\'s encoder writes it), XMP, IPTC and comments; keeps JFIF, the colour profile and the image', () => {
    const exif = segment(0xe1, [...ascii('Exif'), 0, 0, ...ascii('MM'), 0, 42, 0, 0, 0, 8, 0, 0]);
    const xmp = segment(0xe1, ascii('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>'));
    const icc = segment(0xe2, ascii('ICC_PROFILE\0abc'));
    const iptc = segment(0xed, ascii('Photoshop 3.0'));
    const comment = segment(0xfe, ascii('made on a phone'));
    const input = jpeg(JFIF, exif, xmp, icc, iptc, comment);
    const out = withoutJpegMetadata(input);
    expect(out).toEqual(jpeg(JFIF, icc));
    expect(athletePictureProblem(athletePictureDataUrl(input))).toBe('it carries photo metadata');
    expect(athletePictureProblem(athletePictureDataUrl(out))).toBeNull();
  });

  it('a file it cannot walk comes back unchanged', () => {
    const broken = new Uint8Array([0xff, 0xd8, 0x00, 0x01, 0x02, 0x03]);
    expect(withoutJpegMetadata(broken)).toBe(broken);
  });
});

describe('initials', () => {
  it('first and last words, one letter for one word, ? for none', () => {
    expect(initials('Ingrid Solberg')).toBe('IS');
    expect(initials('  åse  bø  ')).toBe('ÅB');
    expect(initials('Mats van der Berg')).toBe('MB');
    expect(initials('Cher')).toBe('C');
    expect(initials('')).toBe('?');
  });
});
