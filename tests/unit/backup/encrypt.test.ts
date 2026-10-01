import { describe, expect, it } from 'vitest';

import {
  decryptBackup,
  DamagedEncryptedBackupError,
  encryptBackup,
  encryptedBackupHeader,
  isEncryptedBackup,
  WrongBackupPassphraseError,
} from '@/lib/backup/encrypt';

const PASS = 'correct horse battery';
const plain = new Blob([new Uint8Array([0x1f, 0x8b, 1, 2, 3, 4, 5, 6, 7, 8])], { type: 'application/gzip' });
const opts = { keyFingerprint: '3FA91C07', iterations: 1000 };

async function bytes(b: Blob): Promise<number[]> {
  return Array.from(new Uint8Array(await b.arrayBuffer()));
}

describe('encrypted backups (backup.md §2d, issue #44)', () => {
  it('round-trips with the right passphrase', async () => {
    const enc = await encryptBackup(plain, PASS, opts);
    expect(await isEncryptedBackup(enc)).toBe(true);
    expect(await isEncryptedBackup(plain)).toBe(false);
    expect(await bytes(await decryptBackup(enc, PASS))).toEqual(await bytes(plain));
  });

  it('hides the contents: the plaintext bytes do not appear in the file', async () => {
    const marker = new TextEncoder().encode('"latitude":59.9139');
    const enc = await encryptBackup(new Blob([marker]), PASS, opts);
    const text = new TextDecoder('latin1').decode(new Uint8Array(await enc.arrayBuffer()));
    expect(text).not.toContain('latitude');
  });

  it('a fresh salt and IV every time, so the same file never encrypts the same way twice', async () => {
    const [a, b] = [await encryptBackup(plain, PASS, opts), await encryptBackup(plain, PASS, opts)];
    const [ha, hb] = [await encryptedBackupHeader(a), await encryptedBackupHeader(b)];
    expect(ha.kdf.salt).not.toBe(hb.kdf.salt);
    expect(ha.cipher.iv).not.toBe(hb.cipher.iv);
    expect(ha).toMatchObject({ kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 1000 }, cipher: { name: 'AES-GCM' }, keyFingerprint: '3FA91C07' });
  });

  it('refuses a wrong passphrase', async () => {
    const enc = await encryptBackup(plain, PASS, opts);
    await expect(decryptBackup(enc, 'not the passphrase')).rejects.toBeInstanceOf(WrongBackupPassphraseError);
  });

  it('refuses a file whose ciphertext or header was changed', async () => {
    const enc = new Uint8Array(await (await encryptBackup(plain, PASS, opts)).arrayBuffer());
    const flipped = enc.slice();
    flipped[flipped.length - 1]! ^= 1;
    await expect(decryptBackup(new Blob([flipped]), PASS)).rejects.toBeInstanceOf(WrongBackupPassphraseError);
    // The header is bound to the ciphertext: swapping its fingerprint for another of the same length breaks it.
    const text = new TextDecoder('latin1').decode(enc);
    const edited = new Uint8Array(Array.from(text.replace('3FA91C07', '00000000'), (c) => c.charCodeAt(0)));
    await expect(decryptBackup(new Blob([edited]), PASS)).rejects.toBeInstanceOf(WrongBackupPassphraseError);
  });

  it('refuses a cut-short file and an absurd iteration count', async () => {
    const enc = await encryptBackup(plain, PASS, opts);
    await expect(decryptBackup(enc.slice(0, 12), PASS)).rejects.toBeInstanceOf(DamagedEncryptedBackupError);
    // A crafted header asking for 20 million rounds is refused before any key is derived.
    const buf = new Uint8Array(await enc.arrayBuffer());
    const length = new DataView(buf.buffer).getUint32(5);
    const header = new TextDecoder().decode(buf.slice(9, 9 + length)).replace('"iterations":1000', '"iterations":20000000');
    const headerBytes = new TextEncoder().encode(header);
    const prefix = buf.slice(0, 9);
    new DataView(prefix.buffer).setUint32(5, headerBytes.byteLength);
    const greedy = new Blob([prefix, headerBytes, buf.slice(9 + length)]);
    await expect(decryptBackup(greedy, PASS)).rejects.toBeInstanceOf(DamagedEncryptedBackupError);
  });
});
