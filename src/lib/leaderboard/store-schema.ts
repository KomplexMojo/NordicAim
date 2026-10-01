// leaderboard.md §6 (issue #42): the `board` store's one row. Submissions are kept as received (already checked on import) and
// read back one by one, so one unreadable submission never empties the board.

import { z } from 'zod';

export const BoardStore = z.object({
  key: z.literal('app'),
  submissions: z.array(z.unknown()),
  challenges: z.array(z.unknown()).default([]),
});
export type BoardStore = z.infer<typeof BoardStore>;

export function emptyBoardStore(): BoardStore {
  return { key: 'app', submissions: [], challenges: [] };
}
