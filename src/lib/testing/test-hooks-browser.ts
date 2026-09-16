// analysis-pipeline §10 (base hooks for M07, `waitForIdle` for M10). Only installed from main.tsx when
// VITE_FAKE_CAMERA === '1'.

import { loadAppServices } from '@/lib/app/services';
import type { TargetAnalysis } from '@/lib/domain/analysis';
import type { TargetPhoto } from '@/lib/domain/photo';
import { waitForIdle } from '@/lib/pipeline/runner-browser';
import { getAnalysisRecord } from '@/lib/store/analyses-repo';
import { listPhotosBySession } from '@/lib/store/photos-repo';

export interface AsaTestHooks {
  listPhotos(sessionId: string): Promise<TargetPhoto[]>;
  getAnalysis(photoId: string): Promise<TargetAnalysis | null>;
  waitForIdle(): Promise<void>;
}

declare global {
  interface Window {
    __asaTest?: AsaTestHooks;
  }
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
  };
}
