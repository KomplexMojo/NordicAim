#!/usr/bin/env tsx
// Node-only: builds a synthetic `nordic-aim-backup` file (backup.md §2) with many fake sessions, a fake
// Goals history, and a fake Board (leaderboard) full of other signed shooters — for demonstration and
// UI/perf testing. No photo blobs are included on purpose — every record is run through the real scoring
// engine (`analyzeTarget`) and `photoStatus` so Sessions, Analysis, Patterns, Goals and Board all see
// internally-consistent, schema-valid data, just with no pixels behind it. Board submissions are signed
// with freshly generated Ed25519 keys (Node's WebCrypto), exactly as `verifySubmission` checks them.
//
// Usage: tsx scripts/generate-fake-dataset.ts [--count=100] [--seed=20261004] [--out=path.json]
// Open it from the app's own Settings -> Backup -> choose this file -> Restore (or the `/demo` route).

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BACKUP_FORMAT } from '../src/lib/backup/format.ts';
import { TargetAnalysis, INITIAL_DETECTION } from '../src/lib/domain/analysis.ts';
import type { Shot } from '../src/lib/domain/analysis.ts';
import { GoalLogEntry } from '../src/lib/domain/goals.ts';
import { TargetPhoto } from '../src/lib/domain/photo.ts';
import type { Calibration, CaptureInfo, Categorization } from '../src/lib/domain/photo.ts';
import { suggestSeason } from '../src/lib/domain/season.ts';
import { BiathlonSession } from '../src/lib/domain/session.ts';
import { AppSettings, defaultAppSettings } from '../src/lib/domain/settings.ts';
import { photoStatus } from '../src/lib/domain/status.ts';
import { signText } from '../src/lib/leaderboard/identity.ts';
import { canonicalText, Submission, SUBMISSION_FORMAT, type SubmittedTarget, type BoardShot, type UnsignedSubmission } from '../src/lib/leaderboard/submission.ts';
import { analyzeTarget } from '../src/lib/scoring/analyze.ts';
import { withCharacteristics } from '../src/lib/scoring/characterize-result.ts';
import { scoringDiameterFromSettings } from '../src/lib/scoring/rule.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The default `gauge` scoring rule's hole diameter — every fake session and board target uses it, so this stays constant across the dataset. */
const HOLE_DIAMETER_MM = scoringDiameterFromSettings(defaultAppSettings());

// ---------- CLI ----------
function argVal(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit === undefined ? fallback : hit.slice(prefix.length);
}
const SESSION_COUNT = Number(argVal('count', '100'));
const SEED = Number(argVal('seed', '20261004'));
const OUT = argVal('out', `${REPO_ROOT}public/demo/nordic-aim-fake-dataset.json`);

// ---------- seeded RNG (mulberry32), so a given seed always reproduces the same dataset ----------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const uniform = (min: number, max: number): number => min + rand() * (max - min);
const chance = (p: number): boolean => rand() < p;
function pick<T>(arr: readonly T[]): T {
  const item = arr[Math.floor(rand() * arr.length)];
  if (item === undefined) throw new Error('pick() from an empty array');
  return item;
}
function weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let r = rand() * total;
  for (const [item, w] of items) {
    if (r < w) return item;
    r -= w;
  }
  return items[items.length - 1]![0];
}
/** Box-Muller: a normally-distributed sample with the given mean and standard deviation. */
function gaussian(mean: number, sd: number): number {
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const round1 = (v: number): number => Math.round(v * 10) / 10;
const round2 = (v: number): number => Math.round(v * 100) / 100;

// ---------- calendar ----------
const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * 86_400_000);
const addMinutes = (d: Date, minutes: number): Date => new Date(d.getTime() + minutes * 60_000);

const TODAY = new Date();
/** `count - 1` gaps, averaging ~2.8 days, rescaled to span one training season ending a few days ago. */
function seasonDates(count: number): Date[] {
  if (count <= 1) return [addDays(TODAY, -4)];
  const gaps = Array.from({ length: count - 1 }, () => Math.max(0.4, gaussian(2.8, 1.6)));
  const totalGapDays = gaps.reduce((a, b) => a + b, 0);
  const scale = 330 / totalGapDays;
  const offsets = [0];
  let t = 0;
  for (const g of gaps) {
    t += g * scale;
    offsets.push(t);
  }
  const lastOffset = offsets[offsets.length - 1]!;
  const start = addDays(TODAY, -Math.round(lastOffset) - 4);
  return offsets.map((off) => addDays(start, Math.round(off)));
}

// ======================================================================================
// Part 1: sessions, photos and analyses (Sessions / Analysis / Patterns / Goals screens)
// ======================================================================================

interface Spec {
  template: 'sighting' | 'precision';
  position: 'prone' | 'standing';
  roundsProne: number | null;
  roundsStanding: number | null;
}
function sightingSpecAt(position: 'prone' | 'standing', rounds: number): Spec {
  return { template: 'sighting', position, roundsProne: position === 'prone' ? rounds : null, roundsStanding: position === 'standing' ? rounds : null };
}
/**
 * domain/sighting-role.ts: a session's sighting-template targets get their `sight-in` / `confirm` role
 * inferred from chronological order — the first is `sight-in`, any later one is `confirm`. A lone sighting
 * target in a session can therefore never show up under Confirm; most real sessions that sight in at all
 * shoot a sight-in (10 rounds) and then a tighter confirm (5 rounds) at the same position to check the
 * zero, so that's the common case here too (65%); the rest are a sight-in with no confirm shot.
 */
function sightingPlan(): Spec[] {
  const position: 'prone' | 'standing' = chance(0.55) ? 'prone' : 'standing';
  const sightIn = sightingSpecAt(position, 10);
  if (!chance(0.65)) return [sightIn];
  return [sightIn, sightingSpecAt(position, 5)];
}
function precisionSpec(): Spec {
  const position: 'prone' | 'standing' = chance(0.5) ? 'prone' : 'standing';
  const rounds = chance(0.7) ? 10 : 5;
  return { template: 'precision', position, roundsProne: position === 'prone' ? rounds : null, roundsStanding: position === 'standing' ? rounds : null };
}
function sessionPlan(): Spec[] {
  const r = rand();
  if (r < 0.5) return [precisionSpec()];
  if (r < 0.75) return [...sightingPlan(), precisionSpec()];
  if (r < 0.9) return [...sightingPlan(), precisionSpec(), precisionSpec()];
  return [precisionSpec(), precisionSpec()];
}

const SESSION_NAMES = [
  'Club time trial',
  'Morning zero check',
  'Pre-competition tune-up',
  'Wind drill',
  'Evening practice',
  'Standing focus session',
  'Prone technique work',
  'Rapid-fire drill',
  'Recovery week practice',
  'Team practice',
];
const NOTE_SNIPPETS = [
  'Gusty crosswind, left to right.',
  'Felt rushed on the last string.',
  'New sling position, felt steadier.',
  'Cold start, warmed up by round 5.',
  'Borrowed rifle, different trigger weight.',
  'Good natural point of aim today.',
];

interface Built {
  photo: TargetPhoto;
  analysis: TargetAnalysis;
}

function toShot(p: { x: number; y: number }, doublePunch: boolean): Shot {
  const manual = chance(0.08);
  return {
    id: randomUUID(),
    xMm: round2(p.x),
    yMm: round2(p.y),
    multiplicity: doublePunch ? 2 : 1,
    positionOverrides: null,
    source: manual ? 'manual' : 'auto',
    confidence: manual ? null : round2(uniform(0.75, 0.99)),
    cluster: doublePunch,
    possibleOverlap: doublePunch,
    ...(doublePunch ? { overlapRatio: round2(uniform(1.8, 2.6)), inferred: 'double-punch' as const } : {}),
  };
}

/**
 * One declared-rounds group of shots scattered around `(cx, cy)`. Rarely (4%) one round is a "double
 * punch" (two rounds through the same hole, `multiplicity: 2`) — then only `n - 1` holes are generated
 * so the identified unit count still lands on `n`, never overcounting. Separately, rarely (8%) a round
 * never shows up as a hole at all, leaving the group genuinely short.
 */
function buildGroup(n: number, cx: number, cy: number, sigma: number): Shot[] {
  if (n <= 0) return [];
  const doublePunch = n >= 2 && chance(0.04);
  const missing = !doublePunch && n > 1 && chance(0.08);
  const holeCount = doublePunch || missing ? n - 1 : n;
  const points = Array.from({ length: holeCount }, () => ({ x: gaussian(cx, sigma), y: gaussian(cy, sigma) }));
  return points.map((p, i) => toShot(p, doublePunch && i === 0));
}

function buildShots(spec: Spec, center: { x: number; y: number }, sigmaProne: number, sigmaStanding: number): Shot[] {
  const disciplineScale = spec.template === 'sighting' ? 0.55 : 1;
  const n = spec.position === 'prone' ? spec.roundsProne! : spec.roundsStanding!;
  const sigma = (spec.position === 'prone' ? sigmaProne : sigmaStanding) * disciplineScale;
  return buildGroup(n, center.x, center.y, sigma);
}

function buildPhoto(spec: Spec, sessionId: string, captureTime: Date, center: { x: number; y: number }, sigmaProne: number, sigmaStanding: number): Built {
  const photoId = randomUUID();
  const captureUtc = captureTime.toISOString();
  const captureLocal = captureUtc.slice(0, 19);

  const categorization: Categorization = { template: spec.template, position: spec.position, roundsProne: spec.roundsProne, roundsStanding: spec.roundsStanding };
  const shots = buildShots(spec, center, sigmaProne, sigmaStanding);

  // Occasionally the disc wasn't found and the overlay guess stood in (status.ts rule 9: needs-attention,
  // alignment-uncertain) — rare, but real enough to be worth a few in a demo/test dataset.
  const alignmentMethod: 'cv' | 'manual' | 'overlay' = weighted([
    ['cv', 86],
    ['manual', 10],
    ['overlay', 4],
  ] as const);
  const alignmentConfidence = alignmentMethod === 'cv' ? round2(uniform(0.82, 0.99)) : null;
  const blurry = chance(0.05);
  const sharpness = blurry ? round2(uniform(0.25, 0.45)) : round2(uniform(0.55, 0.97));
  const templateHint = chance(0.85) ? { template: spec.template, confidence: round2(uniform(0.75, 0.98)) } : null;

  const working = { widthPx: 1536, heightPx: 2048, scaleFromOriginal: 0.5 };
  const calibration: Calibration = {
    cx: round1(working.widthPx / 2 + uniform(-15, 15)),
    cy: round1(working.heightPx / 2 + uniform(-15, 15)),
    radiusPx: round1(uniform(480, 560)),
    axisRatio: round2(uniform(0.9, 1)),
    angleDeg: round1(uniform(0, 179)),
    anchorDiameterMm: spec.template === 'sighting' ? 115 : 112.4,
    source: alignmentMethod === 'cv' ? 'auto' : alignmentMethod,
    confidence: alignmentConfidence,
    perspective: null,
  };

  const result = withCharacteristics(analyzeTarget({ template: spec.template, categorization, shots }), categorization, 'right', HOLE_DIAMETER_MM);

  const analysis: TargetAnalysis = {
    schemaVersion: 1,
    photoId,
    calibration,
    shots,
    pipeline: {
      stageA: 'done',
      stageB: 'done',
      error: null,
      alignment: { method: alignmentMethod, confidence: alignmentConfidence },
      templateHint,
      sharpness,
      warnings: blurry ? ['image-blurry'] : [],
      detection: { ...INITIAL_DETECTION },
    },
    updatedAt: captureUtc,
    computed: { engineVersion: result.engineVersion, result },
  };

  const { status, reasons } = photoStatus({ categorization, analysis, result });

  const capture: CaptureInfo = {
    overlayTemplate: spec.template,
    outerDiameterFraction: round2(uniform(0.82, 0.88)),
    frameWidthPx: 3024,
    frameHeightPx: 4032,
    calibrationPriorFramePx: null,
    trackSettings: null,
  };
  const lighting = weighted([
    ['daylight', 60],
    ['artificial', 20],
    ['mixed', 10],
    ['night', 5],
    ['unknown', 5],
  ] as const);

  const photo: TargetPhoto = {
    schemaVersion: 1,
    id: photoId,
    sessionId,
    origin: 'camera-overlay',
    originalFormat: 'jpeg',
    originalFilename: null,
    importedAt: captureUtc,
    capture,
    exif: null,
    captureTime: { local: captureLocal, offset: '+00:00', utc: captureUtc, source: 'client-clock' },
    working,
    imageStats: null,
    lightingSuggestion: { label: lighting, confidence: round2(uniform(0.6, 0.95)), reasons: [] },
    lighting,
    lightingConfirmed: chance(0.8),
    season: suggestSeason(captureUtc.slice(0, 10)),
    categorization,
    notes: chance(0.12) ? pick(NOTE_SNIPPETS) : null,
    status,
    reasons,
    locationRemoved: true,
  };

  return { photo, analysis };
}

const dates = seasonDates(SESSION_COUNT);
const sessions: BiathlonSession[] = [];
const photos: TargetPhoto[] = [];
const analyses: TargetAnalysis[] = [];

let driftX = 0;
let driftY = 0;

for (let i = 0; i < SESSION_COUNT; i++) {
  const date = dates[i]!;
  const sessionDate = date.toISOString().slice(0, 10);

  driftX = clamp(driftX + gaussian(0, 3), -35, 35);
  driftY = clamp(driftY + gaussian(0, 3), -35, 35);
  if (chance(0.1)) {
    const angle = uniform(0, Math.PI * 2);
    const jump = uniform(5, 15);
    driftX = clamp(driftX + Math.cos(angle) * jump, -35, 35);
    driftY = clamp(driftY + Math.sin(angle) * jump, -35, 35);
  }

  const t = SESSION_COUNT > 1 ? i / (SESSION_COUNT - 1) : 1;
  const sigmaProne = lerp(34, 15, t) * uniform(0.85, 1.25);
  const sigmaStanding = lerp(58, 32, t) * uniform(0.85, 1.25);

  const baseTime = new Date(date);
  baseTime.setUTCHours(Math.floor(uniform(9, 19)), Math.floor(uniform(0, 59)), 0, 0);

  const sessionId = randomUUID();
  const built = sessionPlan().map((spec, idx) => buildPhoto(spec, sessionId, addMinutes(baseTime, idx * 6), { x: driftX, y: driftY }, sigmaProne, sigmaStanding));
  for (const b of built) {
    photos.push(b.photo);
    analyses.push(b.analysis);
  }

  // captureTime.utc is typed nullable (CaptureTime covers real EXIF-less captures too), but buildPhoto always sets it.
  const firstUtc = built[0]!.photo.captureTime.utc!;
  const lastUtc = built[built.length - 1]!.photo.captureTime.utc!;
  sessions.push({
    schemaVersion: 3,
    id: sessionId,
    name: chance(0.2) ? pick(SESSION_NAMES) : `Session ${sessionDate}`,
    sessionDate,
    createdAt: firstUtc,
    updatedAt: lastUtc,
    photoIds: built.map((b) => b.photo.id),
    analyzeRequestedAt: firstUtc,
    artifacts: [],
    shares: [],
    notes: chance(0.08) ? pick(NOTE_SNIPPETS) : '',
  });
}

// ======================================================================================
// Part 2: the fake owner's identity, and their Goals history (Goals screen)
// ======================================================================================

const OWNER_NAME = 'Alex Dalen';
const OWNER_CLUB = 'Caledonia Nordic Ski Club';

const settingsRow: AppSettings = { ...defaultAppSettings(), athleteName: OWNER_NAME, athleteClub: OWNER_CLUB };

/** goals.md §5: a handful of goal-setting events across the season, values tightening as the (simulated) skill improves. */
function buildGoals(): GoalLogEntry[] {
  const checkpoints = [0.05, 0.35, 0.7]; // fraction through the season
  const entries: GoalLogEntry[] = [];
  const setAtFor = (fraction: number): string => dates[Math.min(dates.length - 1, Math.round(fraction * (dates.length - 1)))]!.toISOString();
  const plan: Array<{ view: 'precision-prone' | 'precision-standing'; metric: 'score' | 'group' | 'rms'; values: number[] }> = [
    { view: 'precision-prone', metric: 'score', values: [75, 82, 88] },
    { view: 'precision-prone', metric: 'group', values: [2.2, 1.7, 1.3] },
    { view: 'precision-standing', metric: 'score', values: [60, 68, 76] },
    { view: 'precision-standing', metric: 'rms', values: [45, 35, 28] },
  ];
  for (const p of plan) {
    checkpoints.forEach((fraction, i) => {
      entries.push({ id: randomUUID(), view: p.view, metric: p.metric, value: p.values[i]!, setAt: setAtFor(fraction) });
    });
  }
  return entries.sort((a, b) => (a.setAt < b.setAt ? -1 : 1));
}
const goalEntries = buildGoals();

// ======================================================================================
// Part 3: the fake Board (leaderboard.md) — other shooters, signed submissions, several clubs
// ======================================================================================

interface FakeShooter {
  name: string;
  club: string;
  /** Mean board score (0-100ish), drives shot scatter so the board ranking looks real. */
  skill: number;
  positions: Array<'prone' | 'standing'>;
}
const FAKE_SHOOTERS: FakeShooter[] = [
  { name: 'Erik Lindqvist', club: 'Fjällviken Biathlon Club', skill: 92, positions: ['prone', 'standing'] },
  { name: 'Mia Solberg', club: 'Nordkapp Ski & Shoot', skill: 88, positions: ['prone', 'standing'] },
  { name: 'Sofie Andersen', club: 'Fjällviken Biathlon Club', skill: 84, positions: ['prone'] },
  { name: 'Hannah Whitfield', club: 'Caledonia Nordic Ski Club', skill: 80, positions: ['prone', 'standing'] },
  { name: 'Tomas Novák', club: 'Šumava Biathlon', skill: 74, positions: ['standing'] },
  { name: 'Liam O’Connor', club: 'Thunder Bay Biathlon', skill: 70, positions: ['prone', 'standing'] },
  { name: 'Ava Petrov', club: 'Caledonia Nordic Ski Club', skill: 65, positions: ['prone'] },
  { name: 'Noah Kim', club: 'Yellowknife Nordic', skill: 55, positions: ['prone', 'standing'] },
];

/** Higher `skill` (an approximate board percent) -> a tighter group, roughly: 100% skill ~ sigma 3mm, 50% ~ sigma 22mm. */
function sigmaForSkill(skill: number): number {
  return lerp(22, 3, clamp((skill - 50) / 50, 0, 1));
}

function fakeBoardTarget(sigma: number, dateIso: string, edited: boolean, flagBig: boolean): SubmittedTarget {
  const final: BoardShot[] = Array.from({ length: 10 }, () => ({ x: round2(gaussian(0, sigma)), y: round2(gaussian(0, sigma)), m: 1 }));
  // A clean automatic baseline matching final (not edited), unless this target is marked edited/flagged for variety.
  const auto: BoardShot[] | null = edited
    ? flagBig
      ? final.map((s) => ({ x: round2(s.x + uniform(-18, 18)), y: round2(s.y + uniform(-18, 18)), m: s.m }))
      : null
    : final;
  return { date: dateIso, declared: 10, edited, auto, final };
}

interface SignedSubmission {
  submission: Submission;
}

async function buildFakeSubmission(shooter: FakeShooter): Promise<SignedSubmission> {
  const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  if (typeof jwk.x !== 'string') throw new Error('Ed25519 public key missing');
  const publicKey = jwk.x;
  const sigma = sigmaForSkill(shooter.skill);
  const positionDates = dates.slice(-12).map((d) => d.toISOString().slice(0, 10));

  const buildFive = (): SubmittedTarget[] =>
    Array.from({ length: 5 }, () => {
      const edited = chance(0.15);
      return fakeBoardTarget(sigma, pick(positionDates), edited, edited && chance(0.4));
    });

  const signedAt = dates[dates.length - 1]!.toISOString();
  const unsigned: UnsignedSubmission = {
    format: SUBMISSION_FORMAT,
    version: 1,
    publicKey,
    name: shooter.name,
    club: shooter.club,
    signedAt,
    ...(shooter.positions.includes('prone') ? { prone: buildFive() } : {}),
    ...(shooter.positions.includes('standing') ? { standing: buildFive() } : {}),
  };
  const signature = await signText(keyPair.privateKey, canonicalText(unsigned));
  const submission = Submission.parse({ ...unsigned, signature });
  return { submission };
}

// ======================================================================================
// Assemble, validate against the real schemas, and write the backup file
// ======================================================================================

async function main() {
  const fakeSubmissions = await Promise.all(FAKE_SHOOTERS.map(buildFakeSubmission));

  for (const s of sessions) BiathlonSession.parse(s);
  for (const p of photos) TargetPhoto.parse(p);
  for (const a of analyses) TargetAnalysis.parse(a);
  AppSettings.parse(settingsRow);
  for (const g of goalEntries) GoalLogEntry.parse(g);
  for (const s of fakeSubmissions) Submission.parse(s.submission);

  const photosBySession = new Map<string, number>();
  for (const p of photos) photosBySession.set(p.sessionId, (photosBySession.get(p.sessionId) ?? 0) + 1);

  const manifest = {
    appBuild: 'generate-fake-dataset',
    createdAt: new Date().toISOString(),
    counts: { sessions: sessions.length, photos: photos.length, analyses: analyses.length, settings: 1, blobs: 0 },
    sessions: sessions.map((s) => ({ id: s.id, name: s.name, sessionDate: s.sessionDate, photos: photosBySession.get(s.id) ?? 0 })),
    blobs: [] as Array<{ key: string; sha256: string; sizeBytes: number }>,
    rebuild: [] as Array<{ key: string; from: string }>,
  };

  const backupFile = {
    format: BACKUP_FORMAT,
    formatVersion: 2 as const,
    manifest,
    records: { sessions, photos, analyses, settings: [settingsRow] },
    blobs: [] as unknown[],
    preferences: [] as unknown[],
    board: { submissions: fakeSubmissions.map((s) => s.submission), challenges: [] as unknown[] },
    goals: { entries: goalEntries },
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(backupFile));
  console.log(
    `Wrote ${sessions.length} sessions, ${photos.length} photos, ${analyses.length} analyses, ${goalEntries.length} goal entries, ${fakeSubmissions.length} board shooters -> ${OUT}`,
  );
}

void main();
