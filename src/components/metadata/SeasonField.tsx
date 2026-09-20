import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Season } from '@/lib/domain/enums';
import { SEASON_LABEL } from '@/lib/domain/season';

interface SeasonFieldProps {
  idPrefix: string;
  /** The chosen season, or the one the capture date suggests when none was chosen. */
  value: Season | null;
  suggested: Season | null;
  onChange(next: Season): void;
}

/** REV-79: Winter / Spring / Summer / Fall, beside the lighting. */
export function SeasonField({ idPrefix, value, suggested, onChange }: SeasonFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`${idPrefix}-season`}>Season</Label>
      <Select
        value={value ?? ''}
        onValueChange={(v) => {
          const parsed = Season.safeParse(v);
          if (parsed.success) onChange(parsed.data);
        }}
      >
        <SelectTrigger id={`${idPrefix}-season`} className="w-full" data-testid={`${idPrefix}-season`}>
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          {Season.options.map((option) => (
            <SelectItem key={option} value={option}>
              {SEASON_LABEL[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {suggested !== null && (
        <p className="text-xs text-muted-foreground" data-testid={`${idPrefix}-season-hint`}>
          Suggested from date: {SEASON_LABEL[suggested]}
        </p>
      )}
    </div>
  );
}
