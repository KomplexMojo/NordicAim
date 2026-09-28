// backup.md §2: the backup file's shape and the byte helpers it needs.

export const BACKUP_FORMAT = 'nordic-aim-backup';
/** REV-126: version 2 leaves out the images a restore can make again (`manifest.rebuild`, §2b). Version 1 files still restore. */
export const BACKUP_FORMAT_VERSION = 2;
export const READABLE_FORMAT_VERSIONS: readonly number[] = [1, 2];

export interface BackupManifest {
  appBuild: string;
  createdAt: string;
  counts: { sessions: number; photos: number; analyses: number; settings: number; blobs: number };
  sessions: Array<{ id: string; name: string | null; sessionDate: string | null; photos: number }>;
  blobs: Array<{ key: string; sha256: string; sizeBytes: number }>;
  /** §2b: images left out of the file and the image in it each is made from. Absent in version 1. */
  rebuild?: Array<{ key: string; from: string }>;
}

export interface BackupBlob {
  key: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  base64: string;
}

/** REV-115: the app's own preferences (localStorage keys under this prefix: panel states, the capture screen's choices) travel in a backup too. */
export const PREFERENCE_PREFIX = 'asa.';

export interface BackupPreference {
  key: string;
  value: string;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: 1 | 2;
  manifest: BackupManifest;
  records: { sessions: unknown[]; photos: unknown[]; analyses: unknown[]; settings: unknown[] };
  blobs: BackupBlob[];
  /** Absent in a backup made before REV-115. */
  preferences?: BackupPreference[];
}

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A lower-case ASCII slug of the athlete's name for a file name: diacritics dropped, Nordic letters spelled out, at most 30 characters. */
export function fileNameSlug(text: string): string {
  const spelled = text
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[þÞ]/g, 'th')
    .replace(/[đĐðÐ]/g, 'd')
    .replace(/[łŁ]/g, 'l');
  return spelled
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '');
}

/**
 * backup.md §2: `nordic-aim-backup[-<athlete>][-<fingerprint>]-YYYY-MM-DD.json.gz`. The athlete part is left out when no name is
 * set, the fingerprint when no key was ever set up; `localDate` is the phone's own calendar date.
 */
export function backupFileName(opts: { localDate: string; athleteName: string; keyFingerprint: string | null }): string {
  const parts = ['nordic-aim-backup'];
  const slug = fileNameSlug(opts.athleteName);
  if (slug !== '') parts.push(slug);
  if (opts.keyFingerprint !== null && /^[0-9A-F]{8}$/i.test(opts.keyFingerprint)) parts.push(opts.keyFingerprint.toUpperCase());
  parts.push(opts.localDate);
  return `${parts.join('-')}.json.gz`;
}

/** backup.md §2a: the backup file is its JSON, gzip-compressed. */
export const BACKUP_CONTENT_TYPE = 'application/gzip';

export async function gzipBlob(blob: Blob): Promise<Blob> {
  const packed = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  return new Blob([packed], { type: BACKUP_CONTENT_TYPE });
}

export class BackupUnreadableError extends Error {
  constructor() {
    super('This is not a complete NordicAim backup: the file is cut short or damaged.');
    this.name = 'BackupUnreadableError';
  }
}

/**
 * backup.md §2a: the text of a backup file, compressed or not. A gzip file (it starts with 1F 8B) is decompressed; anything else is
 * read as it is, so a backup made before compression, or one the Files app expanded, still restores.
 */
export async function readBackupText(file: Blob): Promise<string> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (head[0] !== 0x1f || head[1] !== 0x8b) return file.text();
  try {
    return await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  } catch {
    throw new BackupUnreadableError();
  }
}
