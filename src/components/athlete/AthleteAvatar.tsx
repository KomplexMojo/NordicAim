import { initials } from '@/lib/domain/athlete-picture';
import { cn } from '@/lib/utils';

interface AthleteAvatarProps {
  /** The athlete picture (a checked JPEG data URL), or null for the initials. */
  picture: string | null;
  name: string;
  className?: string;
  testId?: string;
}

/** REV-157 (issue #99): an athlete's round picture, or their initials when they have none. */
export function AthleteAvatar({ picture, name, className, testId }: AthleteAvatarProps) {
  return picture !== null ? (
    <img src={picture} alt="" className={cn('size-10 shrink-0 rounded-full object-cover', className)} data-testid={testId} data-kind="picture" />
  ) : (
    <span
      aria-hidden="true"
      className={cn('flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground', className)}
      data-testid={testId}
      data-kind="initials"
    >
      {initials(name)}
    </span>
  );
}
