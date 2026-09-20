import { Link } from 'react-router';

import { useServices } from '@/lib/app/services';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { backupDue } from '@/lib/backup/due';
import { listSessions } from '@/lib/services/sessions';
import { getAppSettings } from '@/lib/services/settings';

/** backup.md §5: shown on Home and Results when there are sessions and no recent backup. Never blocks anything. */
export function BackupReminder() {
  const { ctx } = useServices();
  const { value } = useLiveQuery(async () => ({ settings: await getAppSettings(ctx), sessions: (await listSessions(ctx)).length }), [ctx]);
  if (value === undefined || !backupDue(value.settings, ctx.now().getTime(), value.sessions)) return null;
  return (
    <p className="rounded-md border border-primary/40 p-3 text-sm" data-testid="backup-reminder">
      {value.settings.lastBackupAt === null ? 'Your sessions are not backed up.' : 'Your last backup is out of date.'}{' '}
      <Link to="/settings" className="text-primary underline underline-offset-4">
        Back up in Settings
      </Link>
    </p>
  );
}
