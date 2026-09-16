/** metadata-lighting §1. Uses `exifr`, which runs in both Node and browser. */

import * as exifr from 'exifr';

import type { ExifMeta } from '@/lib/domain/photo';
import { localToUtc } from './capture-time';

interface RawExif {
  DateTimeOriginal?: unknown;
  OffsetTimeOriginal?: unknown;
  GPSLatitude?: unknown;
  GPSLatitudeRef?: unknown;
  GPSLongitude?: unknown;
  GPSLongitudeRef?: unknown;
  GPSAltitude?: unknown;
  GPSAltitudeRef?: unknown;
  GPSImgDirection?: unknown;
  Make?: unknown;
  Model?: unknown;
  LensModel?: unknown;
  Flash?: unknown;
  WhiteBalance?: unknown;
  ISO?: unknown;
  ISOSpeedRatings?: unknown;
  ExposureTime?: unknown;
  FNumber?: unknown;
  BrightnessValue?: unknown;
  ExifImageWidth?: unknown;
  ExifImageHeight?: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asInt(v: unknown): number | null {
  const n = asNumber(v);
  return n === null ? null : Math.trunc(n);
}

/** `"YYYY:MM:DD HH:mm:ss"` -> `"YYYY-MM-DDTHH:mm:ss"`, without going through Date. */
function parseRawDateTimeOriginal(raw: string): string | null {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m as unknown as [string, string, string, string, string, string, string];
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

function dmsToDecimal(dms: unknown, negative: boolean): number | null {
  if (!Array.isArray(dms) || dms.length !== 3) return null;
  const [d, m, s] = dms as [unknown, unknown, unknown];
  const dn = asNumber(d);
  const mn = asNumber(m);
  const sn = asNumber(s);
  if (dn === null || mn === null || sn === null) return null;
  const value = dn + mn / 60 + sn / 3600;
  return negative ? -value : value;
}

export async function readExif(input: Blob | Uint8Array): Promise<ExifMeta | null> {
  let e: RawExif | undefined;
  try {
    e = (await exifr.parse(input, {
      tiff: true,
      exif: true,
      gps: true,
      reviveValues: false,
      translateValues: false,
      mergeOutput: true,
    })) as RawExif | undefined;
  } catch {
    return null;
  }
  if (e === undefined) return null;

  const captureLocalRaw = asString(e.DateTimeOriginal);
  const captureLocal = captureLocalRaw !== null ? parseRawDateTimeOriginal(captureLocalRaw) : null;

  const offsetRaw = asString(e.OffsetTimeOriginal);
  const captureOffset = offsetRaw !== null && /^[+-]\d{2}:\d{2}$/.test(offsetRaw) ? offsetRaw : null;

  const captureUtc = captureLocal !== null && captureOffset !== null ? localToUtc(captureLocal, captureOffset) : null;

  const latRef = asString(e.GPSLatitudeRef);
  const lonRef = asString(e.GPSLongitudeRef);
  const lat = dmsToDecimal(e.GPSLatitude, latRef === 'S');
  const lon = dmsToDecimal(e.GPSLongitude, lonRef === 'W');
  const gpsPresent = lat != null;
  const altRaw = asNumber(e.GPSAltitude);
  const altM = altRaw === null ? null : e.GPSAltitudeRef === 1 ? -altRaw : altRaw;
  const gps = gpsPresent && lat !== null && lon !== null ? { lat, lon, altM } : null;

  const flashRaw = asInt(e.Flash);
  const flashFired = flashRaw === null ? null : (flashRaw & 1) === 1;
  const whiteBalanceRaw = asNumber(e.WhiteBalance);
  const whiteBalance: ExifMeta['whiteBalance'] =
    whiteBalanceRaw === 0 ? 'auto' : whiteBalanceRaw === 1 ? 'manual' : null;

  const isoRaw = e.ISO ?? e.ISOSpeedRatings;
  const iso = Array.isArray(isoRaw) ? asNumber(isoRaw[0]) : asNumber(isoRaw);

  return {
    captureLocal,
    captureOffset,
    captureUtc,
    gpsPresent,
    gps,
    gpsImgDirection: asNumber(e.GPSImgDirection),
    make: asString(e.Make),
    model: asString(e.Model),
    lens: asString(e.LensModel),
    brightnessValue: asNumber(e.BrightnessValue),
    iso,
    exposureTimeSec: asNumber(e.ExposureTime),
    fNumber: asNumber(e.FNumber),
    flashRaw,
    flashFired,
    whiteBalance,
    widthPx: asInt(e.ExifImageWidth),
    heightPx: asInt(e.ExifImageHeight),
  };
}
