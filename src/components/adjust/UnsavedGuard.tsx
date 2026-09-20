import { useEffect } from 'react';
import { useBlocker } from 'react-router';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface UnsavedGuardProps {
  /** True while the screen holds edits that are not saved. */
  modified: boolean;
}

/** REV-94: leaving the screen (Back, the tab bar, another link, closing the tab) with unsaved edits asks first. */
export function UnsavedGuard({ modified }: UnsavedGuardProps) {
  const blocker = useBlocker(modified);

  useEffect(() => {
    if (!modified) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [modified]);

  return (
    <Dialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && blocker.state === 'blocked' && blocker.reset()}>
      <DialogContent data-testid="unsaved-dialog">
        <DialogHeader>
          <DialogTitle>Leave without saving?</DialogTitle>
          <DialogDescription>This target has changes that are not saved. Leaving now discards them.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="h-11" data-testid="unsaved-stay" onClick={() => blocker.state === 'blocked' && blocker.reset()}>
            Stay and keep editing
          </Button>
          <Button variant="destructive" className="h-11" data-testid="unsaved-leave" onClick={() => blocker.state === 'blocked' && blocker.proceed()}>
            Leave without saving
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
