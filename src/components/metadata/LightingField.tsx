import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Lighting } from '@/lib/domain/enums';
import type { LightingSuggestion } from '@/lib/domain/photo';

const LIGHTING_LABELS: Record<Lighting, string> = {
  daylight: 'Daylight',
  night: 'Night',
  artificial: 'Artificial light',
  mixed: 'Mixed light',
  unknown: 'Unknown',
};

const LIGHTING_OPTIONS = Lighting.options;

interface LightingFieldProps {
  idPrefix: string;
  value: Lighting;
  suggestion: LightingSuggestion;
  onChange(next: Lighting): void;
}

/** metadata-lighting §4: select prefilled with the suggestion, with the hint `Suggested from photo: <label>`
 * (analysis-pipeline §1). */
export function LightingField({ idPrefix, value, suggestion, onChange }: LightingFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`${idPrefix}-lighting`}>Lighting</Label>
      <Select
        value={value}
        onValueChange={(v) => {
          const parsed = Lighting.safeParse(v);
          if (parsed.success) onChange(parsed.data);
        }}
      >
        <SelectTrigger id={`${idPrefix}-lighting`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LIGHTING_OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {LIGHTING_LABELS[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground" data-testid={`${idPrefix}-lighting-hint`}>
        Suggested from photo: {LIGHTING_LABELS[suggestion.label]}
      </p>
    </div>
  );
}
