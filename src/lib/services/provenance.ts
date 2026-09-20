// REV-100 (docs/spec/provenance.md §1): setting, unlocking and reading the athlete's key. The passphrase is used once to derive
// the key and is never stored; the derived key goes in the `secrets` store, the salt and fingerprint in settings.

import type { AppSettings } from '@/lib/domain/settings';
import {
  b64ToBytes,
  bytesToB64,
  deriveKeyBytes,
  isValidPassphrase,
  keyFingerprint,
  MIN_PASSPHRASE_LENGTH,
  newSalt,
  PBKDF2_ITERATIONS,
} from '@/lib/provenance/key';
import { findMatchingImage, type PayloadSummary } from '@/lib/provenance/verify';
import { artifactJsonKey } from '@/lib/store/blob-keys';
import { getBlob } from '@/lib/store/blobs-repo';
import { getProvenanceKey, putProvenanceKey } from '@/lib/store/secrets-repo';
import { getSessionRecord } from '@/lib/store/sessions-repo';
import { getSettings, putSettings } from '@/lib/store/settings-repo';

import type { ServiceContext } from './context';

export class WeakPassphraseError extends Error {
  constructor() {
    super(`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
    this.name = 'WeakPassphraseError';
  }
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('That passphrase does not match this key.');
    this.name = 'WrongPassphraseError';
  }
}

/** A new passphrase: a new salt, so it re-keys future images only (old stamps need the old passphrase). */
export async function setPassphrase(ctx: ServiceContext, passphrase: string, iterations = PBKDF2_ITERATIONS): Promise<AppSettings> {
  if (!isValidPassphrase(passphrase)) throw new WeakPassphraseError();
  const salt = newSalt();
  const key = await deriveKeyBytes(passphrase, salt, iterations);
  const fingerprint = await keyFingerprint(key);
  await putProvenanceKey(ctx.db, bytesToB64(key));
  const next = { ...(await getSettings(ctx.db)), athleteSalt: salt, keyFingerprint: fingerprint };
  await putSettings(ctx.db, next);
  return next;
}

/** After a restore: the salt and fingerprint came back, the key did not. The same passphrase re-derives it. */
export async function unlockPassphrase(ctx: ServiceContext, passphrase: string, iterations = PBKDF2_ITERATIONS): Promise<AppSettings> {
  const settings = await getSettings(ctx.db);
  if (settings.athleteSalt === null || settings.keyFingerprint === null) throw new WrongPassphraseError();
  const key = await deriveKeyBytes(passphrase, settings.athleteSalt, iterations);
  if ((await keyFingerprint(key)) !== settings.keyFingerprint) throw new WrongPassphraseError();
  await putProvenanceKey(ctx.db, bytesToB64(key));
  return settings;
}

/** The key stored on this phone, or null. */
export async function loadProvenanceKey(ctx: ServiceContext): Promise<Uint8Array | null> {
  const b64 = await getProvenanceKey(ctx.db);
  return b64 === null ? null : b64ToBytes(b64);
}

export type VerifyResult = { status: 'match'; artifactId: string; summary: PayloadSummary | null } | { status: 'no-match' } | { status: 'wrong-passphrase' } | { status: 'no-key-set' };

/**
 * REV-100 §4: does the passphrase (through this phone's salt) make `stamp` for one of the session's stored images? The stored images'
 * payloads come from the artifact sidecars.
 */
export async function verifySessionStamp(
  ctx: ServiceContext,
  sessionId: string,
  stamp: string,
  passphrase: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<VerifyResult> {
  const settings = await getSettings(ctx.db);
  if (settings.athleteSalt === null || settings.keyFingerprint === null) return { status: 'no-key-set' };
  const key = await deriveKeyBytes(passphrase, settings.athleteSalt, iterations);
  if ((await keyFingerprint(key)) !== settings.keyFingerprint) return { status: 'wrong-passphrase' };

  const session = await getSessionRecord(ctx.db, sessionId);
  const images: Array<{ artifactId: string; payload: string }> = [];
  for (const artifact of session?.artifacts ?? []) {
    const blob = await getBlob(ctx.db, artifactJsonKey(artifact.id));
    if (blob === null) continue;
    try {
      const sidecar = JSON.parse(await blob.text()) as { provenance?: { payload?: string } };
      if (typeof sidecar.provenance?.payload === 'string') images.push({ artifactId: artifact.id, payload: sidecar.provenance.payload });
    } catch {
      // an unreadable sidecar is simply not a candidate
    }
  }
  return findMatchingImage(key, stamp, images);
}
