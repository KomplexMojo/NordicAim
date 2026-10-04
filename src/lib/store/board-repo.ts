import { emptyBoardStore, BoardStore } from '@/lib/leaderboard/store-schema';

import type { AppDb, AppTx } from './db';
import { CorruptRecordError } from './errors';

type Executor = AppDb | AppTx;

function isTx(x: Executor): x is AppTx {
  return 'objectStore' in x;
}

/** leaderboard.md §6: the received submissions, or an empty board when nothing was ever imported. */
export async function getBoard(dbOrTx: Executor): Promise<BoardStore> {
  const raw = isTx(dbOrTx) ? await dbOrTx.objectStore('board').get('app') : await dbOrTx.get('board', 'app');
  if (raw == null) return emptyBoardStore();
  const parsed = BoardStore.safeParse(raw);
  if (!parsed.success) throw new CorruptRecordError('board', 'app', parsed.error);
  return parsed.data;
}

export async function putBoard(dbOrTx: Executor, board: BoardStore): Promise<void> {
  if (isTx(dbOrTx)) await dbOrTx.objectStore('board').put(board);
  else await dbOrTx.put('board', board);
}
