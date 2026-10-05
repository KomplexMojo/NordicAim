// coach-context-import.md §6 (M29, REV-159): what the summary image and the attach preview show of 545 Coach context, as data the
// renderers draw. Pure.

import type { MetalContext, WindContext, ZeroAdjustment } from './coach-context';

/** §4 `conventions.windStrength`: the band 545 Coach records instead of a speed. */
export type WindBand = 'none' | 'light' | 'moderate' | 'strong';
const WIND_BANDS: readonly WindBand[] = ['none', 'light', 'moderate', 'strong'];

/** The windage badge: the band as the glyph, and the clock position the wind blows from (1-12) when known. */
export interface WindBadge {
  band: WindBand;
  clock: number | null;
}

/**
 * The strength band of one wind record. §4 has no dedicated band field: the only export seen holds it in `note` (`"none"`), so a
 * `note` that is exactly a band name (any case, trimmed) is read as the band. Anything else is unknown (null): no speed → band rule
 * is defined (`speedKph` is realistically always null), so none is invented.
 */
export function windBandOf(wind: WindContext): WindBand | null {
  const note = wind.note?.trim().toLowerCase() ?? '';
  return (WIND_BANDS as readonly string[]).includes(note) ? (note as WindBand) : null;
}

/** A clock position 1-12 from `direction` (`3`, `"3"`, `"3 o'clock"`, `"3:00"`); anything else is unknown (null). */
export function clockOf(direction: string | number | null): number | null {
  if (direction === null) return null;
  let hour: number;
  if (typeof direction === 'number') hour = direction;
  else {
    const m = /^\s*(\d{1,2})(?:\s*o'?\s*clock|:00)?\s*$/i.exec(direction);
    if (m === null) return null;
    hour = Number(m[1]);
  }
  return Number.isInteger(hour) && hour >= 1 && hour <= 12 ? hour : null;
}

/**
 * §6: the session's windage badge, from the first attached wind record (file order) whose band is known; null when there is none,
 * so the header shows no badge, as before M29. A calm (`none`) badge carries no direction.
 */
export function windBadgeOf(wind: readonly WindContext[]): WindBadge | null {
  for (const w of wind) {
    const band = windBandOf(w);
    if (band !== null) return { band, clock: band === 'none' ? null : clockOf(w.direction) };
  }
  return null;
}

/** One row of five discs on the summary image: one metal bout. */
export interface MetalBoutRow {
  /** `Combo 1`, `Combo 2`… by first appearance in the file, or `No combo`; on the first row of its group only ('' after). */
  group: string;
  position: 'prone' | 'standing';
  discHits: boolean[];
  hits: number;
}

const POSITION_ORDER = { prone: 0, standing: 1 } as const;

/**
 * §6: every bout as its own row, grouped by `comboGroup` (in order of first appearance, bouts with no group last) then position
 * (prone, then standing), keeping file order within that. A session with three standing bouts shows three rows, never one tally.
 */
export function metalBoutRows(metal: readonly MetalContext[]): MetalBoutRow[] {
  const groupOrder = new Map<string | null, number>();
  for (const m of metal) if (m.comboGroup !== null && !groupOrder.has(m.comboGroup)) groupOrder.set(m.comboGroup, groupOrder.size);
  const rank = (g: string | null) => (g === null ? groupOrder.size : groupOrder.get(g)!);
  const sorted = metal
    .map((m, i) => ({ m, i }))
    .sort((a, b) => rank(a.m.comboGroup) - rank(b.m.comboGroup) || POSITION_ORDER[a.m.position] - POSITION_ORDER[b.m.position] || a.i - b.i);
  let previous: string | null | undefined;
  return sorted.map(({ m }) => {
    const first = m.comboGroup !== previous;
    previous = m.comboGroup;
    const label = m.comboGroup === null ? 'No combo' : `Combo ${rank(m.comboGroup) + 1}`;
    return { group: first ? label : '', position: m.position, discHits: [...m.discHits], hits: m.discHits.filter(Boolean).length };
  });
}

/** `2 up · 1 left`, from net clicks (+ up / + right, §4 `conventions.zeroClicks`); `no change` when both are 0. */
export function zeroClicksLabel(z: Pick<ZeroAdjustment, 'verticalClicks' | 'horizontalClicks'>): string {
  const parts: string[] = [];
  if (z.verticalClicks !== 0) parts.push(`${Math.abs(z.verticalClicks)} ${z.verticalClicks > 0 ? 'up' : 'down'}`);
  if (z.horizontalClicks !== 0) parts.push(`${Math.abs(z.horizontalClicks)} ${z.horizontalClicks > 0 ? 'right' : 'left'}`);
  return parts.length === 0 ? 'no change' : parts.join(' · ');
}
