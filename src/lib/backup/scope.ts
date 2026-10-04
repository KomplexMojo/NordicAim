// backup.md §2c (REV-143): a backup of chosen sessions. Pure.
//
// A chosen session brings its photos, their analyses, and every blob that belongs to them: the photo's own images
// (`photo:<pid>:*`), its diagrams (`diagram:<pid>:*`) and the session's summary images (`artifact:<aid>:*`). App-wide data
// always comes along (the settings row, the reference sheets, the coach images, anything not tied to one session), so a
// restore never meets a record that points at something missing.

function str(raw: unknown, key: string): string | null {
  return raw !== null && typeof raw === 'object' && key in raw && typeof (raw as Record<string, unknown>)[key] === 'string'
    ? ((raw as Record<string, string>)[key] as string)
    : null;
}

export interface BackupContents {
  sessions: unknown[];
  photos: unknown[];
  analyses: unknown[];
  keys: string[];
}

/** The artifact ids a stored session lists (`session.artifacts[].id`), read tolerantly. */
function artifactIds(session: unknown): string[] {
  const list = session !== null && typeof session === 'object' ? (session as { artifacts?: unknown }).artifacts : undefined;
  return Array.isArray(list) ? list.flatMap((a) => (str(a, 'id') === null ? [] : [str(a, 'id')!])) : [];
}

/** Whether a blob belongs in a backup of these photos and artifacts: session-owned blobs only when theirs; the rest always. */
export function blobInScope(key: string, photoIds: ReadonlySet<string>, artifactIds: ReadonlySet<string>): boolean {
  const [prefix, id = ''] = key.split(':');
  if (prefix === 'photo' || prefix === 'diagram') return photoIds.has(id);
  if (prefix === 'artifact') return artifactIds.has(id);
  return true;
}

/** Everything a backup of `sessionIds` holds; with no ids (a full backup), everything as it is. */
export function scopeToSessions(all: BackupContents, sessionIds: readonly string[] | undefined): BackupContents {
  if (sessionIds === undefined) return all;
  const chosen = new Set(sessionIds);
  const sessions = all.sessions.filter((s) => chosen.has(str(s, 'id') ?? ''));
  const photos = all.photos.filter((p) => chosen.has(str(p, 'sessionId') ?? ''));
  const photoIds = new Set(photos.flatMap((p) => (str(p, 'id') === null ? [] : [str(p, 'id')!])));
  const analyses = all.analyses.filter((a) => photoIds.has(str(a, 'photoId') ?? ''));
  const artifacts = new Set(sessions.flatMap(artifactIds));
  return { sessions, photos, analyses, keys: all.keys.filter((k) => blobInScope(k, photoIds, artifacts)) };
}
