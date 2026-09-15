import { z } from 'zod';

export const AppSettings = z.object({
  schemaVersion: z.literal(1),
  key: z.literal('app'),
  profileOverrides: z.object({ holeDiameterMm: z.number().positive() }),
  persistRequested: z.boolean(),
  persisted: z.boolean().nullable(),
});
export type AppSettings = z.infer<typeof AppSettings>;

export function defaultAppSettings(): AppSettings {
  return {
    schemaVersion: 1,
    key: 'app',
    profileOverrides: { holeDiameterMm: 5.6 },
    persistRequested: false,
    persisted: null,
  };
}
