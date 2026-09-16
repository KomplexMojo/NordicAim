// analysis-pipeline §10. Test hooks, only installed from main.tsx when VITE_FAKE_CAMERA === '1'
// (so neither they nor the fixtures they import reach the Pages build).

import precisionFixture from '@fixtures/sample-shots-precision.json';
import sightingFixture from '@fixtures/sample-shots-sighting.json';
import seedCalibrations from '@fixtures/seed-calibrations.json';

import { loadAppServices } from '@/lib/app/services';
import { Shot, type TargetAnalysis } from '@/lib/domain/analysis';
import { Calibration, Categorization, type TargetPhoto } from '@/lib/domain/photo';
import { photoStatus } from '@/lib/domain/status';
import { emitPipelineChanged } from '@/lib/pipeline/events';
import { pipelineHooks } from '@/lib/pipeline/hooks';
import { waitForIdle } from '@/lib/pipeline/runner-browser';
import { clientNow } from '@/lib/media/capture-time';
import type { ServiceContext } from '@/lib/services/context';
import { ingestPhoto } from '@/lib/services/ingest';
import { requestAnalysis } from '@/lib/services/photos';
import { createSession } from '@/lib/services/sessions';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { getPhotoRecord, listPhotosBySession, putPhotoRecord } from '@/lib/store/photos-repo';

export interface AsaTestHooks {
  listPhotos(sessionId: string): Promise<TargetPhoto[]>;
  getAnalysis(photoId: string): Promise<TargetAnalysis | null>;
  waitForIdle(): Promise<void>;
  setShots(photoId: string, shots: unknown): Promise<void>;
  setCalibration(photoId: string, calibration: unknown): Promise<void>;
  loadDemo(): Promise<string>;
}

declare global {
  interface Window {
    __asaTest?: AsaTestHooks;
  }
}

interface ManualPatch {
  calibration?: Calibration;
  shots?: Shot[];
  /** loadDemo only: the demo photos carry fixture data, so Stage A has nothing left to do. */
  markStageADone?: boolean;
}

/**
 * §10: `setShots` / `setCalibration` save the value as `manual` and set Stage B back to `pending`, the
 * same way M13's Adjust screen will (§8). One transaction, then notify.
 */
async function applyManual(ctx: ServiceContext, photoId: string, patch: ManualPatch): Promise<void> {
  const nowIso = ctx.now().toISOString();
  const tx = ctx.db.transaction(['photos', 'analyses'], 'readwrite');
  const photo = await getPhotoRecord(tx, photoId);
  const analysis = await getAnalysisRecord(tx, photoId);
  if (photo === null || analysis === null) {
    await tx.done;
    throw new Error(`No photo or analysis for ${photoId}`);
  }

  const next: TargetAnalysis = {
    ...analysis,
    calibration: patch.calibration ? { ...patch.calibration, source: 'manual' } : analysis.calibration,
    shots: patch.shots ? patch.shots.map((shot) => ({ ...shot, source: 'manual' as const })) : analysis.shots,
    pipeline: {
      ...analysis.pipeline,
      stageA: patch.markStageADone === true ? 'done' : analysis.pipeline.stageA,
      stageB: 'pending',
      error: null,
      alignment: patch.calibration
        ? { method: 'manual' as const, confidence: null }
        : analysis.pipeline.alignment,
    },
    updatedAt: nowIso,
  };
  const { status, reasons } = photoStatus({
    categorization: photo.categorization,
    analysis: next,
    result: next.computed?.result ?? null,
  });

  await putAnalysisRecord(tx, next);
  await putPhotoRecord(tx, { ...photo, status, reasons });
  await tx.done;

  emitPipelineChanged({ sessionId: photo.sessionId, photoId });
  pipelineHooks.notify();
}

interface DemoSpec {
  file: string;
  calibrationKey: string;
  categorization: unknown;
  shots: unknown;
}

/** §10: the two reference sheets, with the golden shots and the seeded calibrations that go with them. */
const DEMO_SPECS: DemoSpec[] = [
  {
    file: 'sighting.jpg',
    calibrationKey: 'IMG_5057-sighting.jpg',
    categorization: sightingFixture.categorization,
    shots: sightingFixture.shots,
  },
  {
    file: 'precision.jpg',
    calibrationKey: 'IMG_5132-precision.jpg',
    categorization: precisionFixture.categorization,
    shots: precisionFixture.shots,
  },
];

function demoCalibration(key: string): Calibration {
  const table = seedCalibrations as Record<string, unknown>;
  return Calibration.parse(table[key]);
}

/**
 * §10 `loadDemo()`: ingests `demo/*.jpg`, applies the fixture categorizations, calibrations and shots
 * as `manual`, marks Stage A done, requests analysis and returns the session id.
 *
 * `ingestPhoto` wakes the runner, so a real Stage A job may already be in flight over these photos by
 * the time the manual data is written. The hook therefore waits for the runner to go idle and writes
 * the manual data again, so what the demo shows never depends on how that race resolved.
 */
async function loadDemo(): Promise<string> {
  const { ctx, imageTools } = await loadAppServices();
  const session = await createSession(ctx, { name: 'Demo — reference targets' });

  const seeded: Array<{ photoId: string; calibration: Calibration; shots: Shot[] }> = [];
  for (const spec of DEMO_SPECS) {
    const response = await fetch(`${import.meta.env.BASE_URL}demo/${spec.file}`);
    if (!response.ok) throw new Error(`Could not load demo/${spec.file}: ${response.status}`);
    const blob = await response.blob();
    const photo = await ingestPhoto(
      ctx,
      {
        sessionId: session.id,
        blob,
        origin: 'import',
        originalFilename: spec.file,
        ...clientNow(new Date()),
        capture: null,
        categorization: Categorization.parse(spec.categorization),
      },
      imageTools,
    );
    const entry = {
      photoId: photo.id,
      calibration: demoCalibration(spec.calibrationKey),
      shots: Shot.array().parse(spec.shots),
    };
    seeded.push(entry);
    await applyManual(ctx, entry.photoId, { ...entry, markStageADone: true });
  }

  await waitForIdle();
  for (const entry of seeded) {
    await applyManual(ctx, entry.photoId, { ...entry, markStageADone: true });
  }

  await requestAnalysis(ctx, session.id);
  return session.id;
}

export function installTestHooks(): void {
  window.__asaTest = {
    async listPhotos(sessionId) {
      const { ctx } = await loadAppServices();
      return listPhotosBySession(ctx.db, sessionId);
    },
    async getAnalysis(photoId) {
      const { ctx } = await loadAppServices();
      return getAnalysisRecord(ctx.db, photoId);
    },
    waitForIdle() {
      return waitForIdle();
    },
    async setShots(photoId, shots) {
      const { ctx } = await loadAppServices();
      await applyManual(ctx, photoId, { shots: Shot.array().parse(shots) });
    },
    async setCalibration(photoId, calibration) {
      const { ctx } = await loadAppServices();
      await applyManual(ctx, photoId, { calibration: Calibration.parse(calibration) });
    },
    loadDemo,
  };
}
