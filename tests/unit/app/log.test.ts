// Issue #49: error logs carry only the error's name and message, never the object.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { errorSummary } from '@/lib/app/log';

const SRC = fileURLToPath(new URL('../../../src/', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('errorSummary', () => {
  it('keeps the name and message only, trimmed', () => {
    const err = Object.assign(new TypeError('bad input'), { photo: { gps: { lat: 49.1, lon: -123.2 } } });
    expect(errorSummary(err)).toBe('TypeError: bad input');
    expect(errorSummary('plain')).toBe('plain');
    expect(errorSummary({ gps: { lat: 1 } })).toBe('unknown error');
    expect(errorSummary(new Error('x'.repeat(500))).length).toBe(300);
  });

  it('is what every console call in src logs: no raw error object is passed', () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => /console\.(error|warn|log|info|debug)\(/.test(line) && /,\s*(err|error|e)\s*\)/.test(line))
        .map((line) => `${file}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
