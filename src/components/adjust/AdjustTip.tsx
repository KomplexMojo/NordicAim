import { X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { dismissTip, isTipDismissed } from '@/lib/ui/tips-browser';

const TIP_ID = 'adjust';

/**
 * Issue #87: the first time Adjust opens (on the target or review screen), one short tip; dismissed once, it never shows again
 * on this device. It sits above the editor and never covers Save.
 */
export function AdjustTip() {
  const [dismissed, setDismissed] = useState(() => isTipDismissed(TIP_ID));
  if (dismissed) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm" role="note" data-testid="adjust-tip">
      <p className="flex-1">
        <span className="font-medium">Shots:</span> drag a hole to move it, tap bare paper to add one.{' '}
        <span className="font-medium">Alignment:</span> fixes where the rings sit on the photo.
      </p>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 shrink-0"
        aria-label="Dismiss tip"
        data-testid="adjust-tip-dismiss"
        onClick={() => {
          dismissTip(TIP_ID);
          setDismissed(true);
        }}
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
