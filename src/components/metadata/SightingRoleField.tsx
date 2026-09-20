import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { SightingRole } from '@/lib/domain/sighting-role';

const OPTIONS: Array<{ value: SightingRole; label: string }> = [
  { value: 'sight-in', label: 'Sight in' },
  { value: 'confirm', label: 'Confirm' },
];

interface SightingRoleFieldProps {
  role: SightingRole;
  onChange(next: SightingRole): void;
}

/** REV-67: the initial sight-in (usually the wider group) or the confirm (usually five shots, tighter). */
export function SightingRoleField({ role, onChange }: SightingRoleFieldProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      aria-label="Sight in or confirm"
      value={role}
      data-testid="sighting-role"
      onValueChange={(v) => {
        if (v === 'sight-in' || v === 'confirm') onChange(v);
      }}
    >
      {OPTIONS.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} className="h-11 min-w-11 px-3" data-testid={`sighting-role-${o.value}`}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
