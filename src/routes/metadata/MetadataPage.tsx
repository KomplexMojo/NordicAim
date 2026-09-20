import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PhotoMetadataCard } from '@/components/metadata/PhotoMetadataCard';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
import { isTargetPhoto } from '@/lib/domain/backing';
import { isCategorizationComplete } from '@/lib/domain/categorization';
import type { TargetAnalysis } from '@/lib/domain/analysis';
import type { Lighting } from '@/lib/domain/enums';
import type { Categorization, TargetPhoto } from '@/lib/domain/photo';
import { getAnalysisRecord } from '@/lib/store/analyses-repo';
import { listPhotosBySession } from '@/lib/store/photos-repo';
import { deletePhoto, requestAnalysis, updatePhotoMetadata } from '@/lib/services/photos';
import { getSession, updateSession } from '@/lib/services/sessions';

const NAME_NOTES_DEBOUNCE_MS = 600;

interface MetadataData {
  sid: string;
  name: string;
  notes: string;
  photos: TargetPhoto[];
  analyses: Map<string, TargetAnalysis | null>;
}

async function loadData(ctx: ReturnType<typeof useServices>['ctx'], sid: string): Promise<MetadataData | null> {
  const session = await getSession(ctx, sid);
  if (session === null) return null;
  const photos = await listPhotosBySession(ctx.db, sid);
  const byId = new Map(photos.map((p) => [p.id, p]));
  // backing-sheet.md §3: card photos are not targets, so they never appear here or in the count.
  const ordered = session.photoIds
    .map((id) => byId.get(id))
    .filter((p): p is TargetPhoto => p !== undefined && isTargetPhoto(p));
  const analysisEntries = await Promise.all(
    ordered.map(async (p) => [p.id, await getAnalysisRecord(ctx.db, p.id)] as const),
  );
  return {
    sid,
    name: session.name,
    notes: session.notes,
    photos: ordered,
    analyses: new Map(analysisEntries),
  };
}

/** Route `#/sessions/:sid/metadata` (analysis-pipeline §1 step 2), replacing M07's stub. */
export function MetadataPage() {
  const { sid = '' } = useParams();
  const { ctx } = useServices();
  const navigate = useNavigate();

  const { value: data } = useLiveQuery(() => loadData(ctx, sid), [ctx, sid]);

  // Seeded once data for this session arrives; re-keyed on `sid` below (via <MetadataPage key={sid}> at the route
  // level isn't set up, so we track the session we've seeded for and only seed once per session load instead of
  // resyncing on every data change, to avoid clobbering in-progress typing).
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  if (data && data.sid === sid && seededFor !== sid) {
    setSeededFor(sid);
    setName(data.name);
    setNotes(data.notes);
  }

  useEffect(() => {
    if (!data || data.sid !== sid) return;
    if (name === data.name && notes === data.notes) return;
    const timer = setTimeout(() => {
      updateSession(ctx, sid, { name, notes }).catch((err: unknown) => {
        toast.error(`Could not save session: ${err instanceof Error ? err.message : String(err)}`);
      });
    }, NAME_NOTES_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, notes]);

  const photos = useMemo(() => (data?.sid === sid ? data.photos : []), [data, sid]);
  const incompleteCount = useMemo(
    () => photos.filter((p) => !isCategorizationComplete(p.categorization)).length,
    [photos],
  );
  const canAnalyze = photos.length > 0 && incompleteCount === 0;

  async function onCategorizationChange(photoId: string, categorization: Categorization) {
    try {
      await updatePhotoMetadata(ctx, photoId, { categorization });
    } catch (err) {
      toast.error(`Could not save: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function onLightingChange(photoId: string, lighting: Lighting) {
    try {
      await updatePhotoMetadata(ctx, photoId, { lighting });
    } catch (err) {
      toast.error(`Could not save: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function onNotesChange(photoId: string, notes: string | null) {
    try {
      await updatePhotoMetadata(ctx, photoId, { notes });
    } catch (err) {
      toast.error(`Could not save: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function onRemovePhoto(photoId: string) {
    try {
      await deletePhoto(ctx, photoId);
    } catch (err) {
      toast.error(`Could not remove photo: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function onAnalyze() {
    setAnalyzing(true);
    try {
      await requestAnalysis(ctx, sid);
      navigate(`/sessions/${sid}/results`);
    } catch (err) {
      toast.error(`Could not start analysis: ${err instanceof Error ? err.message : String(err)}`);
      setAnalyzing(false);
    }
  }

  if (data === undefined) {
    return <p className="p-6 text-center text-muted-foreground">Loading…</p>;
  }
  if (data === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <p>Session not found.</p>
        <Link to="/" className="text-primary underline underline-offset-4">
          Home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-8 lg:max-w-3xl">
      <header className="flex items-center justify-between gap-2">
        {/* The Shooting tab already goes Home; this returns to the session being worked on. */}
        <Link
          to={`/sessions/${sid}/results`}
          className="inline-flex h-11 items-center text-sm text-primary underline underline-offset-4"
          data-testid="metadata-back"
        >
          Back to session
        </Link>
        <span className="text-sm text-muted-foreground" data-testid="metadata-photo-count">
          {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
        </span>
      </header>

      <h1 className="text-xl font-semibold">Add metadata</h1>

      <div className="flex flex-col gap-1">
        <Label htmlFor="session-name">Session name</Label>
        <Input id="session-name" value={name} onChange={(e) => setName(e.currentTarget.value)} maxLength={80} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="session-notes">Session notes</Label>
        <Textarea
          id="session-notes"
          value={notes}
          placeholder="Optional"
          onChange={(e) => setNotes(e.currentTarget.value)}
        />
      </div>

      <div className="flex flex-col gap-4">
        {photos.map((photo) => (
          <PhotoMetadataCard
            key={photo.id}
            photo={photo}
            analysis={data.analyses.get(photo.id) ?? null}
            onCategorizationChange={(c) => void onCategorizationChange(photo.id, c)}
            onLightingChange={(l) => void onLightingChange(photo.id, l)}
            onNotesChange={(n) => void onNotesChange(photo.id, n)}
            onRemove={() => void onRemovePhoto(photo.id)}
          />
        ))}
      </div>

      <Button variant="outline" className="h-11" onClick={() => navigate(`/sessions/${sid}/capture`)}>
        Add more photos
      </Button>

      <Button
        className="h-11"
        disabled={!canAnalyze || analyzing}
        data-testid="analyze-button"
        onClick={() => void onAnalyze()}
      >
        Analyze {photos.length} {photos.length === 1 ? 'target' : 'targets'}
      </Button>
      {!canAnalyze && photos.length > 0 && (
        <p className="text-center text-xs text-muted-foreground" data-testid="analyze-hint">
          {incompleteCount} {incompleteCount === 1 ? 'photo needs' : 'photos need'} template, position, and rounds
          before you can analyze.
        </p>
      )}
    </main>
  );
}
