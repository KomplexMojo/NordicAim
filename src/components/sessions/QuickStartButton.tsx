import { useState } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import { useServices } from '@/lib/app/services';
import type { BiathlonSession } from '@/lib/domain/session';
import { quickStart, quickStartLabel } from '@/lib/services/quick-start';
import { cn } from '@/lib/utils';

interface QuickStartButtonProps {
  sessions: BiathlonSession[];
  className?: string;
}

/** capture-overlay.md §1.1: opens today's local session (creating it once), reading "Start & capture" or
 * "Capture (today's session)". */
export function QuickStartButton({ sessions, className }: QuickStartButtonProps) {
  const { ctx } = useServices();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const label = quickStartLabel(sessions, ctx.now());

  async function onClick() {
    setBusy(true);
    try {
      await quickStart(ctx, (path) => navigate(path));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button className={cn('h-11 gap-2 px-6 text-base', className)} disabled={busy} onClick={() => void onClick()}>
      <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
        <circle cx="12" cy="13" r="3.5" />
      </svg>
      {label}
    </Button>
  );
}
