// backup.md §2d (REV-151, issue #44): a backup protected with the athlete's stamp passphrase. The whole compressed file is
// encrypted with AES-GCM under a key derived from the passphrase (PBKDF2-SHA-256) with a fresh salt for this file — a separate
// key from the stamp key, which never leaves the phone. WebCrypto only; no DOM.
//
// Layout: "NAEB" · version byte (1) · header length (4 bytes, big-endian) · header JSON (UTF-8) · AES-GCM ciphertext (with tag).

import { b64ToBytes, bytesToB64, deriveKeyBytes, PBKDF2_ITERATIONS } from '../provenance/key';

const MAGIC = [0x4e, 0x41, 0x45, 0x42]; // "NAEB"
const VERSION = 1;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const MAX_ITERATIONS = 10_000_000;

/** The file's own description of how it was protected. Nothing in it reveals the passphrase or the contents. */
export interface EncryptedBackupHeader {
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  /** The stamp key's fingerprint (also in the file name), so restore can say which passphrase opens it; null when unknown. */
  keyFingerprint: string | null;
}

/** An encrypted backup's file name ends `.enc` after the usual `.json.gz` (backup.md §2). */
export const ENCRYPTED_SUFFIX = '.enc';
export const ENCRYPTED_CONTENT_TYPE = 'application/octet-stream';

export class WrongBackupPassphraseError extends Error {
  constructor() {
    super('That passphrase does not open this backup.');
    this.name = 'WrongBackupPassphraseError';
  }
}

export class DamagedEncryptedBackupError extends Error {
  constructor() {
    super('This protected backup is cut short or damaged.');
    this.name = 'DamagedEncryptedBackupError';
  }
}

async function aesKey(passphrase: string, saltB64: string, iterations: number): Promise<CryptoKey> {
  const bytes = await deriveKeyBytes(passphrase, saltB64, iterations);
  return crypto.subtle.importKey('raw', bytes as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

const defaultRandom = (b: Uint8Array) => crypto.getRandomValues(b as Uint8Array<ArrayBuffer>);

/** Encrypts a finished backup file (the compressed JSON). `random` and `iterations` are injectable for tests. */
export async function encryptBackup(
  plain: Blob,
  passphrase: string,
  opts: { keyFingerprint: string | null; iterations?: number; random?: (bytes: Uint8Array) => Uint8Array },
): Promise<Blob> {
  const random = opts.random ?? defaultRandom;
  const iterations = opts.iterations ?? PBKDF2_ITERATIONS;
  const salt = bytesToB64(random(new Uint8Array(SALT_BYTES)));
  const iv = random(new Uint8Array(IV_BYTES));
  const header: EncryptedBackupHeader = {
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt },
    cipher: { name: 'AES-GCM', iv: bytesToB64(iv) },
    keyFingerprint: opts.keyFingerprint,
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  // The header is bound to the ciphertext as additional data, so editing it (say, the iteration count) breaks decryption.
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: headerBytes as BufferSource },
    await aesKey(passphrase, salt, iterations),
    await plain.arrayBuffer(),
  );
  const prefix = new Uint8Array(9);
  prefix.set(MAGIC, 0);
  prefix[4] = VERSION;
  new DataView(prefix.buffer).setUint32(5, headerBytes.byteLength);
  return new Blob([prefix, headerBytes as BlobPart, cipher], { type: ENCRYPTED_CONTENT_TYPE });
}

/** Whether a chosen file is a protected backup (it starts with "NAEB"). */
export async function isEncryptedBackup(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return MAGIC.every((b, i) => head[i] === b);
}

async function readHeader(file: Blob): Promise<{ header: EncryptedBackupHeader; headerBytes: Uint8Array; bodyStart: number }> {
  const prefix = new Uint8Array(await file.slice(0, 9).arrayBuffer());
  if (prefix.length < 9 || !MAGIC.every((b, i) => prefix[i] === b) || prefix[4] !== VERSION) throw new DamagedEncryptedBackupError();
  const length = new DataView(prefix.buffer).getUint32(5);
  if (9 + length > file.size) throw new DamagedEncryptedBackupError();
  const headerBytes = new Uint8Array(await file.slice(9, 9 + length).arrayBuffer());
  let header: EncryptedBackupHeader;
  try {
    header = JSON.parse(new TextDecoder().decode(headerBytes)) as EncryptedBackupHeader;
  } catch {
    throw new DamagedEncryptedBackupError();
  }
  const ok =
    header?.kdf?.name === 'PBKDF2' &&
    header.kdf.hash === 'SHA-256' &&
    Number.isInteger(header.kdf.iterations) &&
    header.kdf.iterations >= 1 &&
    // A crafted file must not be able to make the phone grind through billions of rounds.
    header.kdf.iterations <= MAX_ITERATIONS &&
    typeof header.kdf.salt === 'string' &&
    header.cipher?.name === 'AES-GCM' &&
    typeof header.cipher.iv === 'string';
  if (!ok) throw new DamagedEncryptedBackupError();
  return { header, headerBytes, bodyStart: 9 + length };
}

/** The header of a protected backup, for the restore screen (which key's passphrase opens it). */
export async function encryptedBackupHeader(file: Blob): Promise<EncryptedBackupHeader> {
  return (await readHeader(file)).header;
}

/**
 * Decrypts a protected backup back to the compressed backup file, ready for `verifyBackupFile`. A wrong passphrase and a tampered
 * file look the same to AES-GCM; both are refused and nothing is returned.
 */
export async function decryptBackup(file: Blob, passphrase: string): Promise<Blob> {
  const { header, headerBytes, bodyStart } = await readHeader(file);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(header.cipher.iv) as BufferSource, additionalData: headerBytes as BufferSource },
      await aesKey(passphrase, header.kdf.salt, header.kdf.iterations),
      await file.slice(bodyStart).arrayBuffer(),
    );
    return new Blob([plain], { type: 'application/gzip' });
  } catch {
    throw new WrongBackupPassphraseError();
  }
}
