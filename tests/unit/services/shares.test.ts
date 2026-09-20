import { describe, expect, it } from 'vitest';

import { ArtifactNotFoundError } from '@/lib/composite/artifact';
import { recordShare } from '@/lib/services/shares';
import { SessionNotFoundError } from '@/lib/services/sessions';
import { getSessionRecord, putSessionRecord } from '@/lib/store/sessions-repo';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';
import { makeSession } from '../../helpers/records';

const ARTIFACT_ID = '11111111-1111-4111-8111-111111111111';
const ARTIFACT_META = { id: ARTIFACT_ID, sha256: 'a'.repeat(64), widthPx: 1440, heightPx: 2160, createdAt: '2026-09-05T17:20:00.000Z', rendererVersion: 3, scoringRule: 'gauge' as const };

describe('services/shares recordShare (data-model §7, rendering-composite.md §7)', () => {
  it('appends a ShareRecord with the artifact\'s sha256 and the given method', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db, { nowIso: '2026-09-05T17:25:00.000Z' });
    const session = makeSession({ artifacts: [ARTIFACT_META] });
    await putSessionRecord(db, session);

    const record = await recordShare(ctx, session.id, ARTIFACT_ID, 'web-share');

    expect(record.artifactId).toBe(ARTIFACT_ID);
    expect(record.sha256).toBe(ARTIFACT_META.sha256);
    expect(record.method).toBe('web-share');
    expect(record.createdAt).toBe('2026-09-05T17:25:00.000Z');

    const stored = await getSessionRecord(db, session.id);
    expect(stored?.shares).toHaveLength(1);
    expect(stored?.shares[0]).toEqual(record);
    expect(stored?.updatedAt).toBe('2026-09-05T17:25:00.000Z');
  });

  it('rejects an unknown artifact', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = makeSession({ artifacts: [ARTIFACT_META] });
    await putSessionRecord(db, session);

    await expect(recordShare(ctx, session.id, 'not-a-real-id', 'download')).rejects.toThrow(ArtifactNotFoundError);
  });

  it('rejects an unknown session', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);

    await expect(recordShare(ctx, 'no-such-session', ARTIFACT_ID, 'download')).rejects.toThrow(SessionNotFoundError);
  });
});
