/** metadata-lighting §2. Pure; the caller injects `Date` (determinism). */

import type { PhotoOrigin } from '@/lib/domain/enums';
import type { CaptureTime, ExifMeta } from '@/lib/domain/photo';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `Date.getTimezoneOffset()` is POSITIVE west of UTC. */
export function formatOffset(tzOffsetMinutes: number): string {
  const total = -tzOffsetMinutes;
  const sign = total < 0 ? '-' : '+';
  const abs = Math.abs(total);
  const hh = pad2(Math.floor(abs / 60));
  const mm = pad2(abs % 60);
  return `${sign}${hh}:${mm}`;
}

export function clientNow(d: Date): { clientLocal: string; clientOffset: string } {
  const local =
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return { clientLocal: local, clientOffset: formatOffset(d.getTimezoneOffset()) };
}

/** Parses `local` ("YYYY-MM-DDTHH:mm:ss") and `offset` ("±HH:MM") without going through the host timezone. */
export function localToUtc(local: string, offset: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error(`Invalid local datetime: ${local}`);
  const [, y, mo, d, h, mi, s] = m as unknown as [string, string, string, string, string, string, string];
  const om = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!om) throw new Error(`Invalid offset: ${offset}`);
  const [, sign, oh, omin] = om as unknown as [string, string, string, string];
  const offsetMs = (sign === '-' ? -1 : 1) * (Number(oh) * 60 + Number(omin)) * 60 * 1000;
  const localMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  const utcMs = localMs - offsetMs;
  return new Date(utcMs).toISOString();
}

export interface ResolveCaptureTimeInput {
  exif: ExifMeta | null;
  origin: PhotoOrigin;
  clientLocal: string;
  clientOffset: string;
}

export function resolveCaptureTime(input: ResolveCaptureTimeInput): CaptureTime {
  const { exif, origin, clientLocal, clientOffset } = input;

  let local: string;
  let offset: string;
  let source: CaptureTime['source'];

  if (exif?.captureLocal != null) {
    local = exif.captureLocal;
    offset = exif.captureOffset ?? clientOffset;
    source = 'exif';
  } else if (origin === 'camera-overlay' || origin === 'camera-native') {
    local = clientLocal;
    offset = clientOffset;
    source = 'client-clock';
  } else {
    local = clientLocal;
    offset = clientOffset;
    source = 'import-time';
  }

  return { local, offset, utc: localToUtc(local, offset), source };
}
