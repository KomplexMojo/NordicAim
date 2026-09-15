import type { AppDb } from '@/lib/store/db';

/** data-model §7. Services receive this instead of reading the clock or generating ids directly (determinism). */
export interface ServiceContext {
  db: AppDb;
  now: () => Date;
  newId: () => string;
}
