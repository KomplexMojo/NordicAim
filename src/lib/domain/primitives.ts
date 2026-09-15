import { z } from 'zod';

export const Id = z.string().uuid();
export type Id = z.infer<typeof Id>;

// ISO-8601 with a literal 'Z' (UTC), e.g. 2026-09-05T23:40:00.000Z
export const UtcIso = z.string().datetime();
export type UtcIso = z.infer<typeof UtcIso>;

// YYYY-MM-DDTHH:mm:ss, no timezone
export const LocalDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
export type LocalDateTime = z.infer<typeof LocalDateTime>;

// YYYY-MM-DD
export const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type LocalDate = z.infer<typeof LocalDate>;

// ±HH:MM
export const Offset = z.string().regex(/^[+-]\d{2}:\d{2}$/);
export type Offset = z.infer<typeof Offset>;

export const ShotId = z.string().min(1).max(64);
export type ShotId = z.infer<typeof ShotId>;
