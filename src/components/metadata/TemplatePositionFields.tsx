import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { defaultCategorization, emptyCategorization } from '@/lib/domain/categorization';
import { Position, TemplateId } from '@/lib/domain/enums';
import type { Categorization } from '@/lib/domain/photo';

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

interface TemplatePositionFieldsProps {
  categorization: Categorization;
  onChange(next: Categorization): void;
}

/** DESIGN.md "Selection UX": template and position are independent; a template is never locked to one position.
 * Picking a new position re-derives the rounds fields for it (`defaultCategorization`) so a stale count from the
 * previous position doesn't linger. */
export function TemplatePositionFields({ categorization, onChange }: TemplatePositionFieldsProps) {
  function onTemplateChange(template: TemplateId) {
    onChange({ ...categorization, template });
  }

  function onPositionChange(position: Position) {
    const { template } = categorization;
    onChange(template !== null ? defaultCategorization(template, position) : { ...emptyCategorization(), position });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={0}
        aria-label="Template"
        value={categorization.template ?? ''}
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
        value={categorization.position ?? ''}
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
