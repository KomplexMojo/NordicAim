// REV-100 (docs/spec/provenance.md §3): `<fingerprint>-<12 hex>`, a truncated HMAC-SHA-256 over the canonical payload.

import { hmacHex, keyFingerprint } from './key';

export async function makeStamp(keyBytes: Uint8Array, payload: string): Promise<string> {
  const [fingerprint, mac] = await Promise.all([keyFingerprint(keyBytes), hmacHex(keyBytes, payload)]);
  return `${fingerprint}-${mac.slice(0, 12).toUpperCase()}`;
}

/** Tolerant of case and stray spaces, since the stamp is typed from a picture. */
export function normalizeStamp(text: string): string {
  return text.replace(/\s+/g, '').toUpperCase();
}

export async function checkStamp(keyBytes: Uint8Array, payload: string, stamp: string): Promise<boolean> {
  const expected = await makeStamp(keyBytes, payload);
  const given = normalizeStamp(stamp);
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
