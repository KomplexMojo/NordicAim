import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { BUILD_SHA } from '@/lib/app/build-info';
import { isNewer } from '@/lib/app/update-check';
import { fetchDeployedSha, updateApp } from '@/lib/app/update-check-browser';

const RECHECK_MS = 10 * 60 * 1000;

/**
 * REV-101 (#43): on the main screen, says when a newer build is deployed and updates the app in place when tapped. Silent when
 * offline, in a dev build, or up to date.
 */
export function UpdateBanner() {
  const [latest, setLatest] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let last = 0;
    const check = async () => {
      if (Date.now() - last < RECHECK_MS && last !== 0) return;
      last = Date.now();
      const sha = await fetchDeployedSha();
      if (!cancelled) setLatest(sha);
    };
    void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!isNewer(BUILD_SHA, latest)) return null;
  return (
    <Button
      variant="outline"
      className="h-auto min-h-11 w-full flex-col gap-0 border-sky-400 bg-sky-100 py-2 text-sky-950 hover:bg-sky-200 dark:bg-sky-950 dark:text-sky-50"
      data-testid="update-banner"
      disabled={updating}
      onClick={() => {
        setUpdating(true);
        void updateApp();
      }}
    >
      <span className="text-sm font-semibold">{updating ? 'Updating…' : 'New version available. Tap to update'}</span>
      <span className="font-mono text-xs">
        {BUILD_SHA} → {latest?.slice(0, 7)}
      </span>
    </Button>
  );
}
