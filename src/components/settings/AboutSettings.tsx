import { Stethoscope } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { APP_NAME, BUILD_SHA } from '@/lib/app/build-info';

/**
 * REV-47 Settings → **About**: the app name and the build, so a tester can say which build they are on. REV-136: and the way to
 * **Diagnostics**, which left the tab bar (a troubleshooting screen, not an everyday one).
 */
export function AboutSettings() {
  return (
    <section className="flex flex-col gap-1 rounded-lg border p-4" aria-labelledby="settings-about-title">
      <h2 id="settings-about-title" className="text-base font-semibold">
        About
      </h2>
      <p className="text-sm">{APP_NAME}</p>
      <p className="text-xs text-muted-foreground">
        Build <span data-testid="build-version" className="font-mono">{BUILD_SHA}</span>
      </p>
      <p className="text-xs text-muted-foreground">Results are stored only on this phone.</p>
      <Button asChild variant="outline" className="mt-2 h-11 justify-start gap-2">
        <Link to="/diagnostics" data-testid="open-diagnostics">
          <Stethoscope aria-hidden className="size-5" />
          Diagnostics
        </Link>
      </Button>
      <p className="text-xs text-muted-foreground">Checks that the app works on this phone, and recovers data if something is wrong.</p>
    </section>
  );
}
