// data-model §7, rendering-composite.md §7 step 4. Appends a `ShareRecord` to the session once its
// artifact has actually been shared or downloaded.

import { ArtifactNotFoundError } from '@/lib/composite/artifact';
import type { ShareRecord } from '@/lib/domain/session';
import { emitPipelineChanged } from '@/lib/pipeline/events';
import { getSessionRecord, putSessionRecord } from '@/lib/store/sessions-repo';

import type { ServiceContext } from './context';
import { SessionNotFoundError } from './sessions';

/** Rejects an artifact id the session does not (or no longer) hold with `ArtifactNotFoundError`. */
export async function recordShare(
  ctx: ServiceContext,
  sessionId: string,
  artifactId: string,
  method: ShareRecord['method'],
): Promise<ShareRecord> {
  const nowIso = ctx.now().toISOString();
  const tx = ctx.db.transaction(['sessions'], 'readwrite');

  const session = await getSessionRecord(tx, sessionId);
  if (session === null) {
    await tx.done;
    throw new SessionNotFoundError(sessionId);
  }
  const meta = session.artifacts.find((a) => a.id === artifactId);
  if (meta === undefined) {
    await tx.done;
    throw new ArtifactNotFoundError(sessionId, artifactId);
  }

  const record: ShareRecord = { id: ctx.newId(), artifactId, sha256: meta.sha256, createdAt: nowIso, method };
  await putSessionRecord(tx, { ...session, shares: [...session.shares, record], updatedAt: nowIso });
  await tx.done;

  emitPipelineChanged({ sessionId });
  return record;
}
