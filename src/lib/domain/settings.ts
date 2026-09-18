import { z } from 'zod';

import { BackingMode, BackingSheet, DEFAULT_BACKING_MODE } from './backing';

export const AppSettings = z.object({
  schemaVersion: z.literal(1),
  key: z.literal('app'),
  profileOverrides: z.object({ holeDiameterMm: z.number().positive() }),
  persistRequested: z.boolean(),
  persisted: z.boolean().nullable(),
  // REV-38 (backing-sheet.md §2, §3): the last backing the user chose, so a new session offers it
  // again. `cardPhotoId` is always null here — card photos belong to a session. Both fields carry a
  // default so settings rows written before REV-38 still read back (the schema version is unchanged).
  lastBackingMode: BackingMode.default(DEFAULT_BACKING_MODE),
  lastBacking: BackingSheet.nullable().default(null),
});
export type AppSettings = z.infer<typeof AppSettings>;

export function defaultAppSettings(): AppSettings {
  return {
    schemaVersion: 1,
    key: 'app',
    profileOverrides: { holeDiameterMm: 5.6 },
    persistRequested: false,
    persisted: null,
    lastBackingMode: DEFAULT_BACKING_MODE,
    lastBacking: null,
  };
}
