import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';

import { CaptureScreen } from '@/components/capture/CaptureScreen';
import { useServices } from '@/lib/app/services';
import type { BiathlonSession } from '@/lib/domain/session';
import { getSession } from '@/lib/services/sessions';

/** Route `#/sessions/:sid/capture` (analysis-pipeline §1). */
export function CapturePage() {
  const { sid = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { ctx } = useServices();
  const [loaded, setLoaded] = useState<{ sid: string; session: BiathlonSession | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSession(ctx, sid).then(
      (session) => {
        if (!cancelled) setLoaded({ sid, session });
      },
      () => {
        if (!cancelled) setLoaded({ sid, session: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ctx, sid]);

  if (loaded === null || loaded.sid !== sid) {
    return <p className="p-6 text-center text-muted-foreground">Loading…</p>;
  }
  if (loaded.session === null) {
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
    <CaptureScreen
      key={sid}
      sessionId={sid}
      initialCount={loaded.session.photoIds.length}
      fakeCamera={searchParams.get('fakeCamera')}
      debug={searchParams.get('debug') === '1'}
    />
  );
}
