// REV-100 (docs/spec/provenance.md §1): the athlete's key. WebCrypto only; no DOM.

export const MIN_PASSPHRASE_LENGTH = 12;
export const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;

export function isValidPassphrase(passphrase: string): boolean {
  return passphrase.length >= MIN_PASSPHRASE_LENGTH;
}

export function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function b64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** A fresh random salt, base64. The caller supplies randomness so this module stays deterministic under test. */
export function newSalt(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b as Uint8Array<ArrayBuffer>)): string {
  return bytesToB64(random(new Uint8Array(SALT_BYTES)));
}

export async function deriveKeyBytes(passphrase: string, saltB64: string, iterations = PBKDF2_ITERATIONS): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64ToBytes(saltB64) as BufferSource, iterations },
    material,
    256,
  );
  return new Uint8Array(bits);
}

export async function hmacHex(keyBytes: Uint8Array, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The first 8 hex characters (upper case) of an HMAC of a fixed label: names the key without revealing it. */
export async function keyFingerprint(keyBytes: Uint8Array): Promise<string> {
  return (await hmacHex(keyBytes, 'asa-key-fingerprint')).slice(0, 8).toUpperCase();
}
