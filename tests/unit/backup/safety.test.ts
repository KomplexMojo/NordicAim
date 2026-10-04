// Issue #45 (REV-142): a restore refuses a backup with a type the app never stores, active content in a diagram SVG, or
// settings the app cannot read. Nothing is written: the file fails verification.

import { describe, expect, it } from 'vitest';

import { createBackup } from '@/lib/backup/create';
import { readBackupText } from '@/lib/backup/format';
import { restoreProblem, unsafeSvg } from '@/lib/backup/safety';
import { verifyBackup } from '@/lib/backup/verify';
import { defaultAppSettings } from '@/lib/domain/settings';
import { createSession } from '@/lib/services/sessions';
import { ingestPhoto } from '@/lib/services/ingest';

import { openTestDb } from '../../helpers/db';
import { emptyCategorization, jpegBlob, makeTestContext } from '../../helpers/fixtures';
import { stubImageTools } from '../../helpers/stub-image-tools';

async function backupText(): Promise<string> {
  const db = await openTestDb();
  const ctx = makeTestContext(db);
  const session = await createSession(ctx, { name: 'Range day' });
  await ingestPhoto(
    ctx,
    {
      sessionId: session.id,
      blob: jpegBlob(),
      origin: 'import',
      originalFilename: 'a.jpg',
      clientLocal: '2026-09-05T12:00:00',
      clientOffset: '-07:00',
      capture: null,
      categorization: emptyCategorization(),
    },
    stubImageTools(),
  );
  const text = await readBackupText((await createBackup(db, { appBuild: 'test', nowIso: '2026-09-19T12:00:00.000Z' })).blob);
  db.close();
  return text;
}

describe('unsafeSvg', () => {
  it("passes the app's own diagrams and refuses scripts, handlers, script URLs and embedded HTML", () => {
    expect(unsafeSvg('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="1" cy="1" r="1" fill="#000"/><text>10</text></svg>')).toBe(false);
    expect(unsafeSvg('<svg><script>alert(1)</script></svg>')).toBe(true);
    expect(unsafeSvg('<svg><image href="x" onerror="alert(1)"/></svg>')).toBe(true);
    expect(unsafeSvg('<svg><a href="javascript:alert(1)">x</a></svg>')).toBe(true);
    expect(unsafeSvg('<svg><foreignObject><div/></foreignObject></svg>')).toBe(true);
    expect(unsafeSvg('<!DOCTYPE svg [<!ENTITY x "y">]><svg/>')).toBe(true);
  });
});

describe('restoreProblem', () => {
  const svg = (s: string) => new TextEncoder().encode(s);
  it('accepts the types the app stores and readable settings', () => {
    expect(
      restoreProblem(
        { blobs: [{ key: 'a', contentType: 'image/jpeg' }, { key: 'b', contentType: 'image/svg+xml' }], settings: [defaultAppSettings()] },
        new Map([['b', svg('<svg><circle r="1"/></svg>')]]),
      ),
    ).toBeNull();
  });

  it('names a foreign type, an unsafe SVG and unreadable settings', () => {
    expect(restoreProblem({ blobs: [{ key: 'a', contentType: 'text/html' }], settings: [] }, new Map())).toMatch(/type \(text\/html\)/);
    expect(
      restoreProblem({ blobs: [{ key: 'b', contentType: 'image/svg+xml' }], settings: [] }, new Map([['b', svg('<svg onload="x()"/>')]])),
    ).toMatch(/never writes/);
    expect(restoreProblem({ blobs: [], settings: [{ key: 'app', schemaVersion: 99 }] }, new Map())).toMatch(/settings/);
  });
});

describe('verifyBackup refuses an unsafe backup (#45)', () => {
  it('passes a real backup, and fails one whose image type or settings were edited', async () => {
    const text = await backupText();
    expect((await verifyBackup(text)).ok).toBe(true);

    const typed = JSON.parse(text);
    typed.blobs[0].contentType = 'text/html';
    const t = await verifyBackup(JSON.stringify(typed));
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.problem).toMatch(/never stores/);

    const set = JSON.parse(text);
    set.records.settings = [{ key: 'app', schemaVersion: 99, backingMode: 'nope' }];
    set.manifest.counts.settings = 1;
    const s = await verifyBackup(JSON.stringify(set));
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.problem).toMatch(/settings/);
  });
});
