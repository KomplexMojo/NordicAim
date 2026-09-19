import { TargetAnalysis } from '@/lib/domain/analysis';

import type { AppDb, AppTx } from './db';
import { CorruptRecordError } from './errors';

type Executor = AppDb | AppTx;

function isTx(x: Executor): x is AppTx {
  return 'objectStore' in x;
}

function photoIdOf(raw: unknown): string {
  return raw !== null && typeof raw === 'object' && 'photoId' in raw && typeof raw.photoId === 'string'
    ? raw.photoId
    : 'unknown';
}

function parse(id: string, raw: unknown): TargetAnalysis {
  const parsed = TargetAnalysis.safeParse(raw);
  if (!parsed.success) throw new CorruptRecordError('analyses', id, parsed.error);
  return parsed.data;
}

export async function getAnalysisRecord(dbOrTx: Executor, photoId: string): Promise<TargetAnalysis | null> {
  const raw = isTx(dbOrTx) ? await dbOrTx.objectStore('analyses').get(photoId) : await dbOrTx.get('analyses', photoId);
  if (raw == null) return null;
  return parse(photoId, raw);
}

export async function putAnalysisRecord(dbOrTx: Executor, analysis: TargetAnalysis): Promise<void> {
  if (isTx(dbOrTx)) await dbOrTx.objectStore('analyses').put(analysis);
  else await dbOrTx.put('analyses', analysis);
}

export async function deleteAnalysisRecord(dbOrTx: Executor, photoId: string): Promise<void> {
  if (isTx(dbOrTx)) await dbOrTx.objectStore('analyses').delete(photoId);
  else await dbOrTx.delete('analyses', photoId);
}

/** Every analysis in the database (the runner plans over all of them). */
export async function listAnalysisRecords(dbOrTx: Executor): Promise<TargetAnalysis[]> {
  const raws = isTx(dbOrTx) ? await dbOrTx.objectStore('analyses').getAll() : await dbOrTx.getAll('analyses');
  return raws.map((raw) => parse(photoIdOf(raw), raw));
}
