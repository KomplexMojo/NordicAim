import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { doublePunchProposal, measuredWidthMm } from '@/lib/cv/multiplicity';
import { shotFromSuggestion, visibleSuggestions } from '@/lib/cv/suggestions';
import { useServices } from '@/lib/app/services';
import { BIATHLON_50M } from '@/lib/defaults/biathlon';
import type { AnalysisResult, Shot, TargetAnalysis } from '@/lib/domain/analysis';
import { isCategorizationComplete } from '@/lib/domain/categorization';
import type { Calibration, TargetPhoto } from '@/lib/domain/photo';
import type { PhotoStatus, Reason } from '@/lib/domain/enums';
import { photoStatus } from '@/lib/domain/status';
import { reprojectShots } from '@/lib/geometry/reproject';
import { analyzeTarget } from '@/lib/scoring/analyze';
import { mergeReconcileWarnings, reconcileReasonContext, reconcileShots } from '@/lib/scoring/reconcile-shots';
import { adjustStartCalibration, SAME_HOLE_DIAMETERS, type AdjustmentsPatch } from '@/lib/services/adjust';
import { loadDetectionAids, type DetectionAids } from '@/lib/services/detection-aids';
import { hasAdjustEdits, sameCalibration } from '@/lib/services/review';
import { getAnalysisRecord } from '@/lib/store/analyses-repo';
import { photoWorkingKey } from '@/lib/store/blob-keys';
import { getBlob } from '@/lib/store/blobs-repo';
import { getPhotoRecord } from '@/lib/store/photos-repo';
import { getSettings } from '@/lib/store/settings-repo';
import { getCvClient } from '@/workers/cv-client';

import type { ScreenSuggestion } from './SuggestionLayer';

export interface AdjustData {
  photo: TargetPhoto;
  analysis: TargetAnalysis;
  holeDiameterMm: number;
}

type Ctx = ReturnType<typeof useServices>['ctx'];

export async function loadAdjust(ctx: Ctx, pid: string): Promise<AdjustData | null> {
  const photo = await getPhotoRecord(ctx.db, pid);
  if (photo === null) return null;
  const analysis = await getAnalysisRecord(ctx.db, pid);
  if (analysis === null) return null;
  const settings = await getSettings(ctx.db);
  return { photo, analysis, holeDiameterMm: settings.profileOverrides.holeDiameterMm };
}

export interface AdjustPreview {
  result: AnalysisResult | null;
  status: PhotoStatus;
  reasons: Reason[];
  reconcile: ReturnType<typeof reconcileReasonContext>;
}

/**
 * M13's Adjust draft, shared by the Adjust route and M21's session review so the review embeds the one
 * editor rather than a fork. The record is read once and edited locally — a live query would throw the
 * draft away every time the background runner touched the same photo.
 */
export function useAdjustDraft(pid: string) {
  const { ctx } = useServices();
  const [data, setData] = useState<AdjustData | null | undefined>(undefined);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // M21: derived help from the worker (suggested holes, hole widths); never stored.
  // Keyed by the record they were measured for, so a reload never shows the previous record's aids.
  const [aidsState, setAidsState] = useState<{ for: AdjustData; aids: DetectionAids | null } | null>(null);
  const aids = aidsState !== null && aidsState.for === data ? aidsState.aids : null;
  const [showSuggestions, setShowSuggestions] = useState(true);
  // M21 step 3: shots whose multiplicity the user changed on screen are never re-proposed.
  const [userSet, setUserSet] = useState<ReadonlySet<string>>(new Set());
  // REV-46: the alignment the on-screen shots are currently expressed in. A ref, not state, because a drag
  // delivers several changes between renders and each must re-project from the one before it.
  const shotsCalibration = useRef<Calibration | null>(null);
  // M21 step 4: what the draft started from, so the review can tell whether anything changed.
  const start = useRef<{ calibration: Calibration; shots: Shot[] } | null>(null);

  /** Loads a fresh record's alignment and shots as they are — nothing to re-project. */
  function resetDraft(next: AdjustData) {
    const first = adjustStartCalibration(next.photo, next.analysis);
    shotsCalibration.current = first;
    start.current = { calibration: first, shots: next.analysis.shots };
    setCalibration(first);
    setShots(next.analysis.shots);
    setSelectedId(null);
    setUserSet(new Set());
  }

  function applyLoaded(next: AdjustData | null) {
    setData(next);
    if (next !== null) resetDraft(next);
  }

  useEffect(() => {
    let cancelled = false;
    loadAdjust(ctx, pid).then(
      (next) => {
        if (!cancelled) applyLoaded(next);
      },
      (err: unknown) => {
        if (cancelled) return;
        toast.error(`Could not open this target: ${err instanceof Error ? err.message : String(err)}`);
        setData(null);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per photo; applyLoaded only sets state
  }, [ctx, pid]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    getBlob(ctx.db, photoWorkingKey(pid)).then(
      (blob) => {
        if (cancelled || blob === null) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      },
      () => {
        // No working image stored: the stage still draws the rings and shots on a blank background.
      },
    );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ctx, pid]);

  // M21 steps 1 and 3: ask the worker again whenever a fresh record is loaded (open, Re-analyze).
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    loadDetectionAids(ctx, pid, getCvClient()).then(
      (next) => {
        if (!cancelled) setAidsState({ for: data, aids: next });
      },
      () => {
        // Suggestions are optional help: without them Adjust works exactly as before.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ctx, pid, data]);

  /** REV-46: the user moved the alignment. The rings move; the holes do not, so every shot follows its hole. */
  function changeCalibration(next: Calibration) {
    const previous = shotsCalibration.current;
    shotsCalibration.current = next;
    if (previous !== null) setShots((current) => reprojectShots(current, previous, next));
    setCalibration(next);
  }

  // M13 step 3: the score the edits on screen would produce, recomputed on every change.
  const preview = useMemo((): AdjustPreview | null => {
    if (!data || calibration === null) return null;
    const { photo, analysis, holeDiameterMm } = data;
    const categorization = photo.categorization;
    let result: AnalysisResult | null = null;
    let warnings = analysis.pipeline.warnings;
    const method = analysis.pipeline.detection.method;
    if (categorization.template !== null && isCategorizationComplete(categorization)) {
      const profile = { ...BIATHLON_50M, holeDiameterMm } as typeof BIATHLON_50M;
      // REV-39 (M20): the same reconciliation Stage B runs after Save, so the preview matches it.
      const reconciled = reconcileShots({ shots, categorization, method });
      warnings = mergeReconcileWarnings(warnings, reconciled);
      try {
        result =
          reconciled.rejected.length > 0
            ? null
            : analyzeTarget({ template: categorization.template, categorization, shots: reconciled.shots, profile });
      } catch {
        result = null;
      }
    }
    const draft: TargetAnalysis = {
      ...analysis,
      calibration,
      shots,
      pipeline: { ...analysis.pipeline, stageA: 'done', stageB: 'done', error: null, warnings },
    };
    const { status, reasons } = photoStatus({ categorization, analysis: draft, result });
    const reconcile = reconcileReasonContext(shots, categorization, method);
    return { result, status, reasons, reconcile };
  }, [data, calibration, shots]);

  // M21: the worker's positions are in the stored alignment; re-project them into the one on screen.
  const holeDiameterMm = data?.holeDiameterMm ?? BIATHLON_50M.holeDiameterMm;
  const sameHoleMm = SAME_HOLE_DIAMETERS * holeDiameterMm;
  const onScreen = useMemo(() => {
    if (aids === null || calibration === null) return { suggestions: [] as ScreenSuggestion[], widths: [] };
    const moved = !sameCalibration(aids.calibration, calibration);
    const suggestions = aids.suggestions.map((s, i) => ({ id: `suggestion-${i + 1}`, xMm: s.xMm, yMm: s.yMm }));
    return {
      suggestions: moved ? reprojectShots(suggestions, aids.calibration, calibration) : suggestions,
      widths: moved ? reprojectShots(aids.holeWidths, aids.calibration, calibration) : aids.holeWidths,
    };
  }, [aids, calibration]);
  const suggestions = visibleSuggestions(onScreen.suggestions, shots, sameHoleMm);

  /** A tap on bare paper: a manual shot of multiplicity 1 there (the same shape a suggestion becomes). */
  function addShot(mm: { xMm: number; yMm: number }) {
    const shot = shotFromSuggestion(mm, ctx.newId());
    setShots((current) => [...current, shot]);
    setSelectedId(shot.id);
  }

  /** M21 step 2: a tapped suggestion becomes a manual shot; covered by it, the suggestion stops showing. */
  function acceptSuggestion(id: string) {
    const suggestion = suggestions.find((s) => s.id === id);
    if (suggestion === undefined) return;
    const shot = shotFromSuggestion(suggestion, ctx.newId());
    setShots((current) => [...current, shot]);
  }

  function moveShot(id: string, mm: { xMm: number; yMm: number }) {
    setShots((current) => current.map((shot) => (shot.id === id ? { ...shot, xMm: mm.xMm, yMm: mm.yMm } : shot)));
  }

  function changeShot(next: Shot) {
    const before = shots.find((shot) => shot.id === next.id);
    if (before !== undefined && before.multiplicity !== next.multiplicity) {
      setUserSet((current) => new Set(current).add(next.id));
    }
    setShots((current) => current.map((shot) => (shot.id === next.id ? next : shot)));
  }

  function deleteShot(id: string) {
    setShots((current) => current.filter((shot) => shot.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }

  /** M21 step 3: the "looks like N shots" prompt for one shot, if any. */
  function proposalFor(shot: Shot): number | null {
    return doublePunchProposal(shot, measuredWidthMm(shot, onScreen.widths, sameHoleMm), holeDiameterMm, userSet.has(shot.id));
  }

  /** What Save sends: a calibration only when the user moved it (§8), and the shots on screen. */
  function patch(): AdjustmentsPatch | null {
    if (!data || calibration === null) return null;
    const stored = data.analysis.calibration;
    const moved = stored === null || !sameCalibration(stored, calibration);
    return { ...(moved ? { calibration } : {}), shots };
  }

  function dirty(): boolean {
    if (start.current === null || calibration === null) return false;
    return hasAdjustEdits(start.current, { calibration, shots });
  }

  return {
    ctx,
    data,
    setData: applyLoaded,
    imageUrl,
    calibration,
    shots,
    selectedId,
    setSelectedId,
    preview,
    suggestions: showSuggestions ? suggestions : [],
    suggestionCount: suggestions.length,
    showSuggestions,
    setShowSuggestions,
    addShot,
    acceptSuggestion,
    moveShot,
    changeShot,
    deleteShot,
    changeCalibration,
    proposalFor,
    patch,
    dirty,
  };
}

export type AdjustDraft = ReturnType<typeof useAdjustDraft>;
