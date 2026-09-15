import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Position, TemplateId } from '@/lib/domain/enums';

const TEMPLATE_OPTIONS: Array<{ value: TemplateId; label: string }> = [
  { value: 'sighting', label: 'Sighting' },
  { value: 'precision', label: 'Precision' },
];

const POSITION_OPTIONS: Array<{ value: Position; label: string }> = [
  { value: 'prone', label: 'Prone' },
  { value: 'standing', label: 'Standing' },
  { value: 'both', label: 'Both' },
];

const ITEM_CLASS = 'h-11 min-w-11 px-3';

interface TemplatePositionPickerProps {
  template: TemplateId | null;
  position: Position | null;
  onTemplateChange(template: TemplateId): void;
  onPositionChange(position: Position): void;
}

/** capture-overlay.md §1.2: Template (Sighting | Precision) and Position (Prone | Standing | Both). Tap targets ≥ 44 px. */
export function TemplatePositionPicker({ template, position, onTemplateChange, onPositionChange }: TemplatePositionPickerProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={0}
        aria-label="Template"
        value={template ?? ''}
        onValueChange={(v) => {
          const parsed = TemplateId.safeParse(v);
          if (parsed.success) onTemplateChange(parsed.data);
        }}
      >
        {TEMPLATE_OPTIONS.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} className={ITEM_CLASS}>
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={0}
        aria-label="Position"
        value={position ?? ''}
        onValueChange={(v) => {
          const parsed = Position.safeParse(v);
          if (parsed.success) onPositionChange(parsed.data);
        }}
      >
        {POSITION_OPTIONS.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} className={ITEM_CLASS}>
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
