import { describe, expect, it } from 'vitest';

import { b64ToBytes, bytesToB64, deriveKeyBytes, isValidPassphrase, keyFingerprint, newSalt } from '@/lib/provenance/key';
import { buildPayload, type ProvenanceInput } from '@/lib/provenance/payload';
import { checkStamp, makeStamp, normalizeStamp } from '@/lib/provenance/stamp';

const FAST = 1000; // the real cost is 310 000; the maths is the same

const input = (): ProvenanceInput => ({
  name: 'Jane Doe',
  club: 'Caledonia Nordic Ski Club',
  sessionDate: '2026-09-20',
  scoringRule: 'gauge',
  visibleHoleDiameterMm: 4.5,
  release: 'abc1234',
  createdAt: '2026-09-20T15:00:00.000Z',
  targets: [
    {
      slot: 'precision-1',
      kind: 'precision-prone',
      photoId: 'p2',
      photoSha256: 'a'.repeat(64),
      captureUtc: '2026-09-20T14:00:00.000Z',
      make: 'Apple',
      model: 'iPhone 15',
      scores: { gauge: 90, centre: 88, visible: 89 },
      alignment: { cx: 500.04, cy: 600, radiusPx: 250 },
      shots: [
        { xMm: 1.234, yMm: -2, multiplicity: 1 },
        { xMm: -3, yMm: 4, multiplicity: 2 },
      ],
    },
    {
      slot: 'sighting-1',
      kind: 'sight-in',
      photoId: 'p1',
      photoSha256: 'b'.repeat(64),
      captureUtc: null,
      make: null,
      model: null,
      scores: { gauge: 9, centre: 8, visible: 9 },
      alignment: null,
      shots: [],
    },
  ],
});

describe('payload (REV-100)', () => {
  it('is deterministic and independent of the order of targets and shots', () => {
    const a = input();
    const b = input();
    b.targets.reverse();
    b.targets[1]!.shots.reverse();
    expect(buildPayload(a)).toBe(buildPayload(b));
  });

  it('changes when any single input changes', () => {
    const base = buildPayload(input());
    const edits: Array<(i: ProvenanceInput) => void> = [
      (i) => (i.name = 'Bob'),
      (i) => (i.club = 'Other'),
      (i) => (i.sessionDate = '2026-09-21'),
      (i) => (i.scoringRule = 'centre'),
      (i) => (i.release = 'zzz'),
      (i) => (i.createdAt = '2026-09-20T15:00:01.000Z'),
      (i) => (i.targets[0]!.photoSha256 = 'c'.repeat(64)),
      (i) => (i.targets[0]!.scores.gauge = 91),
      (i) => (i.targets[0]!.shots[0]!.xMm = 1.3),
      (i) => (i.targets[0]!.shots[0]!.multiplicity = 2),
      (i) => (i.targets[0]!.alignment!.cx = 501),
      (i) => (i.targets[0]!.model = 'iPhone 16'),
      (i) => (i.targets[0]!.captureUtc = '2026-09-20T14:00:01.000Z'),
      (i) => i.targets.pop(),
    ];
    for (const edit of edits) {
      const i = input();
      edit(i);
      expect(buildPayload(i)).not.toBe(base);
    }
  });

  it('ignores sub-rounding noise (positions to 0.01 mm)', () => {
    const i = input();
    i.targets[0]!.shots[0]!.xMm = 1.2341;
    expect(buildPayload(i)).toBe(buildPayload(input()));
  });
});

describe('key and stamp (REV-100)', () => {
  it('the same passphrase and salt reproduce the same key and fingerprint; a new salt or passphrase does not', async () => {
    const salt = newSalt();
    const a = await deriveKeyBytes('correct horse battery', salt, FAST);
    const b = await deriveKeyBytes('correct horse battery', salt, FAST);
    expect(bytesToB64(a)).toBe(bytesToB64(b));
    expect(await keyFingerprint(a)).toBe(await keyFingerprint(b));
    expect(await keyFingerprint(a)).toMatch(/^[0-9A-F]{8}$/);
    const other = await deriveKeyBytes('correct horse battery', newSalt(), FAST);
    expect(await keyFingerprint(other)).not.toBe(await keyFingerprint(a));
    const wrong = await deriveKeyBytes('correct horse batterz', salt, FAST);
    expect(await keyFingerprint(wrong)).not.toBe(await keyFingerprint(a));
  });

  it('a stamp has the form <fingerprint>-<12 hex> and verifies only with the right key and the unchanged payload', async () => {
    const salt = newSalt();
    const key = await deriveKeyBytes('correct horse battery', salt, FAST);
    const payload = buildPayload(input());
    const stamp = await makeStamp(key, payload);
    expect(stamp).toMatch(/^[0-9A-F]{8}-[0-9A-F]{12}$/);
    expect(await checkStamp(key, payload, stamp)).toBe(true);
    expect(await checkStamp(key, payload, ` ${stamp.toLowerCase()} `)).toBe(true);
    const edited = input();
    edited.targets[0]!.scores.gauge = 99;
    expect(await checkStamp(key, buildPayload(edited), stamp)).toBe(false);
    const wrongKey = await deriveKeyBytes('a different passphrase', salt, FAST);
    expect(await checkStamp(wrongKey, payload, stamp)).toBe(false);
    expect(await checkStamp(key, payload, stamp.slice(0, -1))).toBe(false);
  });

  it('the stamp differs per payload (it is not one fixed hash of the passphrase)', async () => {
    const key = await deriveKeyBytes('correct horse battery', newSalt(), FAST);
    const b = input();
    b.name = 'Bob';
    expect(await makeStamp(key, buildPayload(input()))).not.toBe(await makeStamp(key, buildPayload(b)));
  });

  it('base64 helpers round-trip, the passphrase minimum is 12, and stamps normalise', () => {
    const bytes = new Uint8Array([0, 1, 254, 255]);
    expect(Array.from(b64ToBytes(bytesToB64(bytes)))).toEqual([0, 1, 254, 255]);
    expect(isValidPassphrase('12345678901')).toBe(false);
    expect(isValidPassphrase('123456789012')).toBe(true);
    expect(normalizeStamp(' ab12 - cd ')).toBe('AB12-CD');
  });
});
