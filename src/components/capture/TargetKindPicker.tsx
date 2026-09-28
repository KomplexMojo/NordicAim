import { ViewMark } from '@/components/patterns/ViewMark';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { isTargetKind, TARGET_KINDS, TARGET_KIND_LABEL, type TargetKind } from '@/lib/domain/target-kind';

interface TargetKindPickerProps {
  kind: TargetKind | null;
  onChange(kind: TargetKind): void;
  className?: string;
}

/**
 * REV-79: the one choice that says what is being shot: Sight in, Confirm, Precision prone or Precision standing. It replaces
 * the separate template and position toggles (and "Both"), on the capture screen and on the metadata screen. Tap targets ≥ 44 px.
 */
export function TargetKindPicker({ kind, onChange, className }: TargetKindPickerProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={2}
      aria-label="Target type"
      value={kind ?? ''}
      // REV-130: two by two, like the Patterns and Analysis view buttons; four in a row (now with their marks) no longer fit a phone.
      className={cn('grid w-full grid-cols-2 sm:grid-cols-4', className)}
      onValueChange={(v) => {
        if (isTargetKind(v)) onChange(v);
      }}
    >
      {TARGET_KINDS.map((k) => (
        <ToggleGroupItem key={k} value={k} className="h-11 min-w-11 w-full gap-1.5 px-3" data-testid={`kind-${k}`}>
          <ViewMark kind={k} />
          {TARGET_KIND_LABEL[k]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
