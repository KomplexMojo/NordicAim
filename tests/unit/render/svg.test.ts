import { describe, expect, it } from 'vitest';

import { el, escapeXml, num, text } from '@/lib/render/svg';

describe('render/svg num()', () => {
  it('rounds to 3 decimal places', () => {
    expect(num(1 / 3)).toBe('0.333');
  });

  it('strips floating-point noise', () => {
    expect(num(0.1 + 0.2)).toBe('0.3');
  });

  it('normalises -0 to "0"', () => {
    expect(num(-0)).toBe('0');
    expect(num(-0.0001)).toBe('0');
  });

  it('renders whole numbers without a decimal point', () => {
    expect(num(1500)).toBe('1500');
  });

  it('throws for non-finite input', () => {
    expect(() => num(NaN)).toThrow();
    expect(() => num(Infinity)).toThrow();
  });
});

describe('render/svg escapeXml()', () => {
  it('escapes the five XML predefined entities', () => {
    expect(escapeXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeXml('9/10 hits @ 45 mm')).toBe('9/10 hits @ 45 mm');
  });
});

describe('render/svg el()', () => {
  it('emits a self-closing tag when no children are given', () => {
    expect(el('circle', { cx: 1, cy: 2, r: 3 })).toBe('<circle cx="1" cy="2" r="3"/>');
  });

  it('emits an open/close pair when children are given', () => {
    expect(el('g', { class: 'shot' }, '<circle/>')).toBe('<g class="shot"><circle/></g>');
  });

  it('omits attributes whose value is undefined', () => {
    expect(el('rect', { x: 0, y: undefined, fill: 'red' })).toBe('<rect x="0" fill="red"/>');
  });

  it('numeric attribute values go through num()', () => {
    expect(el('circle', { r: 1 / 3 })).toBe('<circle r="0.333"/>');
  });

  it('escapes string attribute values', () => {
    expect(el('text', { 'data-note': '<hi & "bye"' })).toBe('<text data-note="&lt;hi &amp; &quot;bye&quot;"/>');
  });
});

describe('render/svg text()', () => {
  it('renders plain content with the system font stack and size', () => {
    const out = text(10, 20, 15, 'hello');
    expect(out).toContain('x="10"');
    expect(out).toContain('y="20"');
    expect(out).toContain('font-size="15"');
    expect(out).toContain('-apple-system');
    expect(out).toContain('>hello<');
    expect(out).not.toContain('font-weight');
  });

  it('applies bold, color, anchor, and class options', () => {
    const out = text(0, 0, 12, 'x', { bold: true, color: '#ABC', anchor: 'middle', class: 'ring-label' });
    expect(out).toContain('font-weight="bold"');
    expect(out).toContain('fill="#ABC"');
    expect(out).toContain('text-anchor="middle"');
    expect(out).toContain('class="ring-label"');
  });

  it('escapes text content', () => {
    expect(text(0, 0, 12, 'A & B')).toContain('>A &amp; B<');
  });
});
