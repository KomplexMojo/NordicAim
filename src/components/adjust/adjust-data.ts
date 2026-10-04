// M13: what the Adjust editor loads for one photo (the photo, its analysis, the hole sizes and the hole-count safety net), and the
// live preview's shape. Split out of `useAdjustDraft.ts` (issue #24).

import { useServices } from '@/lib/app/services';
import type { AnalysisResult, TargetAnalysis } from '@/lib/domain/analysis';
import type { TargetPhoto } from '@/lib/domain/photo';
import type { PhotoStatus, Reason } from '@/lib/domain/enums';
import { scoringDiameterFromSettings } from '@/lib/scoring/rule';
import { reconcileReasonContext } from '@/lib/scoring/reconcile-shots';
import { getAnalysisRecord } from '@/lib/store/analyses-repo';
import { getPhotoRecord } from '@/lib/store/photos-repo';
import { getSettings } from '@/lib/store/settings-repo';

export interface AdjustData {
  photo: TargetPhoto;
  analysis: TargetAnalysis;
  holeDiameterMm: number;
  /** REV-56: what the score preview treats a hole as (the owner's scoring rule); detection uses `holeDiameterMm`. */
  scoringHoleDiameterMm: number;
  /** Settings' raw-hole-count safety net, so the preview matches what Stage B would decide. */
  maxPlausibleHoles: number;
}

type Ctx = ReturnType<typeof useServices>['ctx'];

export async function loadAdjust(ctx: Ctx, pid: string): Promise<AdjustData | null> {
  const photo = await getPhotoRecord(ctx.db, pid);
  if (photo === null) return null;
  const analysis = await getAnalysisRecord(ctx.db, pid);
  if (analysis === null) return null;
  const settings = await getSettings(ctx.db);
  return {
    photo,
    analysis,
    holeDiameterMm: settings.profileOverrides.holeDiameterMm,
    scoringHoleDiameterMm: scoringDiameterFromSettings(settings),
    maxPlausibleHoles: settings.maxPlausibleHoles,
  };
}

export interface AdjustPreview {
  result: AnalysisResult | null;
  status: PhotoStatus;
  reasons: Reason[];
  reconcile: ReturnType<typeof reconcileReasonContext>;
}
