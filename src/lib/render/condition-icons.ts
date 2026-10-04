// REV-108: the season and lighting icons in the summary image's header. Small line pictograms in a circle, 44 px, drawn to read on the
// dark header. Pure.

import type { Lighting, Season } from '../domain/enums';
import { el } from './svg';

const LINE = '#CFE6F3';
const SUN = '#F2B705';
const LEAF = '#E08A2E';
const SPROUT = '#6FBF73';

const SEASON_LABEL: Record<Season, string> = { winter: 'Winter', spring: 'Spring', summer: 'Summer', fall: 'Fall' };
const LIGHTING_LABEL: Record<Exclude<Lighting, 'unknown'>, string> = {
  daylight: 'Daylight',
  night: 'Night',
  artificial: 'Artificial light',
  mixed: 'Mixed lighting',
};

function badge(kind: 'season' | 'lighting', name: string, label: string, x: number, y: number, glyph: string): string {
  const disc = el('circle', { cx: 22, cy: 22, r: 20.5, fill: '#2B3644', stroke: LINE, 'stroke-width': 1.5 });
  return el('g', { class: `${kind}-icon`, [`data-${kind}`]: name, transform: `translate(${x} ${y})` }, `<title>${label}</title>` + disc + glyph);
}

function rays(cx: number, cy: number, r0: number, r1: number, count: number, fromDeg = 0, stepDeg = 360 / count): string {
  let out = '';
  for (let i = 0; i < count; i += 1) {
    const a = ((fromDeg + stepDeg * i) * Math.PI) / 180;
    out += `<line x1="${(cx + r0 * Math.cos(a)).toFixed(2)}" y1="${(cy + r0 * Math.sin(a)).toFixed(2)}" x2="${(cx + r1 * Math.cos(a)).toFixed(2)}" y2="${(cy + r1 * Math.sin(a)).toFixed(2)}" />`;
  }
  return out;
}

const stroke = (inner: string, colour = LINE, width = 2): string =>
  `<g stroke="${colour}" stroke-width="${width}" stroke-linecap="round" fill="none">${inner}</g>`;

/** The season pictogram alone, on a 44 × 44 box; `line` is its line colour (REV-154: `currentColor` on the app's filter buttons). */
export function renderSeasonGlyph(season: Season, line = LINE): string {
  return seasonGlyphs(line)[season];
}

const seasonGlyphs = (line: string): Record<Season, string> => ({
  winter: stroke(rays(22, 22, 0, 12, 6, 90), line) + stroke(rays(22, 22, 7, 10, 6, 60), line),
  spring:
    stroke('<line x1="22" y1="33" x2="22" y2="21" />', SPROUT) +
    `<path d="M22 22 C13 23 11 16 11 13 C19 12 22 16 22 22 Z" fill="${SPROUT}" />` +
    `<path d="M22 20 C31 21 33 14 33 11 C25 10 22 14 22 20 Z" fill="${SPROUT}" />`,
  summer:
    `<path d="M13 27 A9 9 0 0 1 31 27 Z" fill="${SUN}" />` +
    stroke(rays(22, 27, 12, 15.5, 5, 210, 30), SUN) +
    stroke('<path d="M10 31 q3 -3 6 0 t6 0 t6 0 t6 0" />', line),
  // REV-154 (owner, 2026-10-01): a maple leaf, so fall reads as a leaf and not a bean.
  fall:
    `<path d="M22 6 L25 12 L28 10 L27.5 16.5 L33 13.5 L31.5 19.5 L37 21 L31 25 L32.5 28.5 L25.5 27.5 L22.8 31 L21.2 31 L18.5 27.5 L11.5 28.5 L13 25 L7 21 L12.5 19.5 L11 13.5 L16.5 16.5 L16 10 L19 12 Z" fill="${LEAF}" stroke="${LEAF}" stroke-width="1" stroke-linejoin="round" />` +
    stroke('<line x1="22" y1="13" x2="22" y2="38" /><line x1="22" y1="24" x2="29" y2="19" /><line x1="22" y1="24" x2="15" y2="19" />', '#5A3410', 1.4),
});

/**
 * All four season glyphs in one 44 × 44 box, 2×2 in cycle order (winter, spring / summer, fall): the season filter's
 * "All" button (REV-154 follow-up, owner, 2026-10-04), in place of the word "All", so the button reads visually like
 * its four siblings. `line` is winter's line colour (`currentColor` on the filter button, same as the solo glyph);
 * spring, summer and fall keep their own fixed palette either way.
 */
export function renderAllSeasonsGlyph(line = LINE): string {
  const glyphs = seasonGlyphs(line);
  const quadrant = (season: Season, tx: number, ty: number): string => `<g transform="translate(${tx} ${ty}) scale(0.5)">${glyphs[season]}</g>`;
  return quadrant('winter', 0, 0) + quadrant('spring', 22, 0) + quadrant('summer', 0, 22) + quadrant('fall', 22, 22);
}

const LIGHTING_GLYPH: Record<Exclude<Lighting, 'unknown'>, string> = {
  daylight: `<circle cx="22" cy="22" r="5.5" fill="${SUN}" />` + stroke(rays(22, 22, 9, 13, 8, 0), SUN),
  night: `<path d="M26 11 A11.5 11.5 0 1 0 33 28 A9.5 9.5 0 0 1 26 11 Z" fill="${LINE}" />`,
  artificial:
    `<circle cx="22" cy="19" r="7.5" fill="#F2D26B" />` + `<rect x="18" y="26" width="8" height="5" rx="1.5" fill="${LINE}" />` + stroke('<line x1="19.5" y1="34" x2="24.5" y2="34" />'),
  mixed: `<circle cx="17" cy="18" r="5" fill="${SUN}" />` + stroke(rays(17, 18, 8, 10.5, 6, 180, 45), SUN, 1.6) + `<path d="M31 22 A7.5 7.5 0 1 0 35 33 A6 6 0 0 1 31 22 Z" fill="${LINE}" />`,
};

/** The season badge at (x, y), 44 px. */
export function renderSeasonIcon(season: Season, x: number, y: number): string {
  return badge('season', season, SEASON_LABEL[season], x, y, renderSeasonGlyph(season));
}

/** The lighting badge at (x, y), 44 px; `unknown` has none. */
export function renderLightingIcon(lighting: Lighting, x: number, y: number): string {
  if (lighting === 'unknown') return '';
  return badge('lighting', lighting, LIGHTING_LABEL[lighting], x, y, LIGHTING_GLYPH[lighting]);
}
