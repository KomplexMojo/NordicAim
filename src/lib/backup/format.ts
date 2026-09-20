// backup.md §2: the backup file's shape and the byte helpers it needs.

export const BACKUP_FORMAT = 'nordic-aim-backup';
export const BACKUP_FORMAT_VERSION = 1;

export interface BackupManifest {
  appBuild: string;
  createdAt: string;
  counts: { sessions: number; photos: number; analyses: number; settings: number; blobs: number };
  sessions: Array<{ id: string; name: string | null; sessionDate: string | null; photos: number }>;
  blobs: Array<{ key: string; sha256: string; sizeBytes: number }>;
}

export interface BackupBlob {
  key: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  base64: string;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  manifest: BackupManifest;
  records: { sessions: unknown[]; photos: unknown[]; analyses: unknown[]; settings: unknown[] };
  blobs: BackupBlob[];
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

export function backupFileName(nowIso: string): string {
  return `nordic-aim-backup-${nowIso.slice(0, 10)}.json`;
}
