import { X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { useServices } from '@/lib/app/services';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { backupReminderShown } from '@/lib/backup/due';
import { readReminderDismissal, writeReminderDismissal } from '@/lib/backup/reminder-dismissal-browser';
import { listSessions } from '@/lib/services/sessions';
import { getAppSettings } from '@/lib/services/settings';

/**
 * backup.md §5: shown on Home and Results when there are sessions and no recent backup. Never blocks anything. Issue #92: it
 * can be dismissed; it returns once a new session is recorded or the reminder interval passes (`backupReminderShown`).
 */
export function BackupReminder() {
  const { ctx } = useServices();
  const { value } = useLiveQuery(async () => ({ settings: await getAppSettings(ctx), sessions: (await listSessions(ctx)).length }), [ctx]);
  const [dismissal, setDismissal] = useState(() => readReminderDismissal());
  if (value === undefined || !backupReminderShown(value.settings, ctx.now().getTime(), value.sessions, dismissal)) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-primary/40 p-3 text-sm" data-testid="backup-reminder">
      <p className="flex-1">
        {value.settings.lastBackupAt === null ? 'Your sessions are not backed up.' : 'Your last backup is out of date.'}{' '}
        <Link to="/settings" className="text-primary underline underline-offset-4">
          Back up in Settings
        </Link>
      </p>
      <Button
        variant="ghost"
        size="icon"
        className="-my-2 size-11 shrink-0"
        aria-label="Dismiss backup reminder"
        data-testid="backup-reminder-dismiss"
        onClick={() => {
          const next = { atMs: ctx.now().getTime(), sessions: value.sessions };
          writeReminderDismissal(next);
          setDismissal(next);
        }}
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
