// rendering-composite.md §2, milestone M05 step 1. Minimal, pure SVG string-building helpers. Every
// numeric attribute passed through `el`/`text` goes through `num()` so the emitted markup never
// carries floating-point noise (e.g. `8.000000000000002`) or a bare `-0`.

import { SYSTEM_FONT_STACK } from './fonts';

/** Rounds to 3 decimal places and drops a trailing `.000`; normalises `-0` to `0`. */
export function num(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError(`num() received a non-finite value: ${n}`);
  const rounded = Math.round(n * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** Escapes the five XML predefined entities. Apply to any text content or attribute value that may
 * carry user-authored text (session notes, filenames, …). */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export type ElAttrValue = string | number | undefined;
export type ElAttrs = Record<string, ElAttrValue>;

function attrString(attrs: ElAttrs): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    const rendered = typeof value === 'number' ? num(value) : escapeXml(value);
    parts.push(`${key}="${rendered}"`);
  }
  return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

/** Builds one SVG element. `children` (already-serialised markup) makes it a container; omitting it
 * (or passing `undefined`) emits a self-closing tag. */
export function el(tag: string, attrs: ElAttrs = {}, children?: string): string {
  const open = `<${tag}${attrString(attrs)}`;
  return children === undefined ? `${open}/>` : `${open}>${children}</${tag}>`;
}

export interface TextOptions {
  bold?: boolean;
  color?: string;
  anchor?: 'start' | 'middle' | 'end';
  class?: string;
  /** Outline colour drawn behind the glyphs (`paint-order="stroke"`) so labels stay legible on any background. */
  outline?: string;
}

/** A single `<text>` element at (x, y) with the system font stack, escaped content. */
export function text(x: number, y: number, sizePx: number, content: string, opts: TextOptions = {}): string {
  return el(
    'text',
    {
      x,
      y,
      'font-family': SYSTEM_FONT_STACK,
      'font-size': sizePx,
      'font-weight': opts.bold ? 'bold' : undefined,
      fill: opts.color,
      'text-anchor': opts.anchor,
      class: opts.class,
      stroke: opts.outline,
      'stroke-width': opts.outline ? 4 : undefined,
      'stroke-linejoin': opts.outline ? 'round' : undefined,
      'paint-order': opts.outline ? 'stroke' : undefined,
    },
    escapeXml(content),
  );
}
