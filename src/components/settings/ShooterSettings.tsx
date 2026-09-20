import { HANDEDNESS_LABEL, Handedness } from '@/lib/domain/settings';

interface ShooterSettingsProps {
  handedness: Handedness;
  onChange(next: Handedness): void;
}

/** REV-88: Settings → Shooter. The trigger hand; the sling arm is the other arm. The observed shooting issues follow it. */
export function ShooterSettings({ handedness, onChange }: ShooterSettingsProps) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" aria-labelledby="settings-shooter-title">
      <h2 id="settings-shooter-title" className="text-base font-semibold">
        Shooter
      </h2>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Trigger hand</legend>
        {Handedness.options.map((value) => {
          const id = `handedness-${value}`;
          return (
            <label
              key={value}
              htmlFor={id}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:ring-1 has-[:checked]:ring-primary"
            >
              <input
                id={id}
                type="radio"
                name="handedness"
                value={value}
                checked={handedness === value}
                onChange={() => onChange(value)}
                data-testid={id}
                className="size-4"
              />
              <span className="text-sm font-medium">{HANDEDNESS_LABEL[value]}</span>
            </label>
          );
        })}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        The hand that pulls the trigger. The sling arm is the other arm. The shooting patterns found on your targets follow it: for a
        right-handed shooter the sling arm is the left, for a left-handed shooter the right. Changing it re-checks every stored target.
      </p>
    </section>
  );
}
