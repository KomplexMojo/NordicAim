import type { ComponentProps } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { ProtectBackupField } from './BackupProtect';
import { BackupScopePicker, type BackupScope } from './BackupScopePicker';

type ScopeProps = ComponentProps<typeof BackupScopePicker>;

/**
 * backup.md §1, §2c, §2d: the "Make a backup" dialog — what the file holds (photos with GPS), which sessions (REV-143), and whether
 * to protect it with the stamp passphrase (REV-151, off by default).
 */
export function BackupConfirmDialog({
  open,
  onOpenChange,
  sessions,
  scope,
  chosen,
  chosenCount,
  onScope,
  onChosen,
  protect,
  onCreate,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  sessions: ScopeProps['sessions'];
  scope: BackupScope;
  chosen: ScopeProps['chosen'];
  chosenCount: number;
  onScope: ScopeProps['onScope'];
  onChosen: ScopeProps['onChosen'];
  protect: ComponentProps<typeof ProtectBackupField>;
  onCreate(): void;
}) {
  const protecting = protect.on && protect.available;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="backup-confirm-dialog">
        <DialogHeader>
          <DialogTitle>Make a backup</DialogTitle>
          <DialogDescription>
            The backup file contains your original photos, and photos keep the exact GPS location where they were taken.{' '}
            {protecting
              ? 'Protected, the file opens only with your stamp passphrase.'
              : 'Keep the file in your own Files or iCloud Drive and do not share it.'}{' '}
            Nothing is sent anywhere by the app.
          </DialogDescription>
        </DialogHeader>
        <BackupScopePicker sessions={sessions} scope={scope} chosen={chosen} onScope={onScope} onChosen={onChosen} />
        <ProtectBackupField {...protect} />
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="h-11"
            disabled={(scope === 'chosen' && chosenCount === 0) || (protecting && protect.passphrase === '')}
            onClick={onCreate}
            data-testid="backup-confirm"
          >
            {scope === 'all' ? 'Create backup' : `Back up ${chosenCount} ${chosenCount === 1 ? 'session' : 'sessions'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
