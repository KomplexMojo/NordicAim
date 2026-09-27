import { Button } from '@/components/ui/button';
import { REFERENCE_HOLES_MESSAGE } from '@/lib/services/template-reference';

interface ReferenceHolesWarningProps {
  onUse(): void;
  onCancel(): void;
  cancelLabel: string;
}

/** template-reference.md §3 step 5: detection found holes on a sheet meant to be blank. A warning, never a refusal. */
export function ReferenceHolesWarning({ onUse, onCancel, cancelLabel }: ReferenceHolesWarningProps) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-500/60 p-3" role="alert" data-testid="sheet-holes-warning">
      <p className="text-sm">{REFERENCE_HOLES_MESSAGE}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button className="h-11" data-testid="sheet-use-anyway" onClick={onUse}>
          Use anyway
        </Button>
      </div>
    </div>
  );
}
