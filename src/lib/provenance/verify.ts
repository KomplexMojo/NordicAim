// REV-100 (docs/spec/provenance.md §4): the pure half of Verify. Given a stored payload and the typed stamp, does this key make it?

import { checkStamp, normalizeStamp } from './stamp';

export interface PayloadSummary {
  name: string;
  club: string;
  sessionDate: string;
  scoringRule: string;
  createdAt: string;
  targets: Array<{ slot: string; kind: string; gauge: number; centre: number; visible: number }>;
}

/** The parts of a stored payload worth showing next to the image, or null when it is not a payload we wrote. */
export function summarizePayload(payload: string): PayloadSummary | null {
  try {
    const p = JSON.parse(payload) as Record<string, unknown>;
    if (p.v !== 1 || !Array.isArray(p.targets)) return null;
    return {
      name: String(p.name ?? ''),
      club: String(p.club ?? ''),
      sessionDate: String(p.sessionDate ?? ''),
      scoringRule: String(p.scoringRule ?? ''),
      createdAt: String(p.createdAt ?? ''),
      targets: (p.targets as Array<Record<string, unknown>>).map((t) => {
        const scores = (t.scores ?? {}) as Record<string, number>;
        return { slot: String(t.slot), kind: String(t.kind), gauge: Number(scores.gauge), centre: Number(scores.centre), visible: Number(scores.visible) };
      }),
    };
  } catch {
    return null;
  }
}

export type VerifyOutcome =
  | { status: 'match'; artifactId: string; summary: PayloadSummary | null }
  | { status: 'no-match' };

/** The first stored image whose payload this key stamps as `stamp`. */
export async function findMatchingImage(
  keyBytes: Uint8Array,
  stamp: string,
  images: Array<{ artifactId: string; payload: string }>,
): Promise<VerifyOutcome> {
  for (const image of images) {
    if (await checkStamp(keyBytes, image.payload, normalizeStamp(stamp))) {
      return { status: 'match', artifactId: image.artifactId, summary: summarizePayload(image.payload) };
    }
  }
  return { status: 'no-match' };
}
