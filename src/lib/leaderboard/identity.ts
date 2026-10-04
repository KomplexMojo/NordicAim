// leaderboard.md §5 (issue #42): the shooter's board identity, an Ed25519 key pair derived from the athlete-stamp key, so the same
// passphrase (and the salt a backup restores) always gives the same identity. WebCrypto only; no DOM.

import { b64ToBytes, bytesToB64 } from '../provenance/key';

const IDENTITY_LABEL = 'nordicaim-board-identity-v1';
/** PKCS #8 wrapping of a raw 32-byte Ed25519 seed (RFC 8410): the only form WebCrypto imports a bare seed in. */
const PKCS8_ED25519_PREFIX = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);

export interface BoardIdentity {
  privateKey: CryptoKey;
  /** The raw public key, base64url (43 characters): names the shooter on every board. */
  publicKey: string;
}

export function toB64Url(bytes: Uint8Array): string {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  return b64ToBytes(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

/** The 32-byte seed: HMAC-SHA-256 of a fixed label under the stamp key, so it never equals or reveals the stamp key. */
export async function identitySeed(stampKey: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', stampKey as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(IDENTITY_LABEL)));
}

/** The identity for a stamp key. The private key is imported non-extractable once the public half has been read. */
export async function boardIdentity(stampKey: Uint8Array): Promise<BoardIdentity> {
  const seed = await identitySeed(stampKey);
  const pkcs8 = new Uint8Array(PKCS8_ED25519_PREFIX.length + seed.length);
  pkcs8.set(PKCS8_ED25519_PREFIX);
  pkcs8.set(seed, PKCS8_ED25519_PREFIX.length);
  const readable = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, true, ['sign']);
  const jwk = await crypto.subtle.exportKey('jwk', readable);
  if (typeof jwk.x !== 'string') throw new Error('Ed25519 public key missing');
  const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
  return { privateKey, publicKey: jwk.x };
}

export async function signText(privateKey: CryptoKey, text: string): Promise<string> {
  return toB64Url(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, new TextEncoder().encode(text))));
}

/** Whether `signature` is `publicKey`'s signature of `text`; false (never a throw) for anything malformed. */
export async function verifyText(publicKey: string, text: string, signature: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('raw', fromB64Url(publicKey) as BufferSource, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, fromB64Url(signature) as BufferSource, new TextEncoder().encode(text));
  } catch {
    return false;
  }
}
