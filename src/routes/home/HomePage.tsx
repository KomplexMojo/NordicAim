import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import { useServices } from '@/lib/app/services';
import { createSession } from '@/lib/services/sessions';

export function HomePage() {
  const { ctx } = useServices();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  // Temporary (M07): quick start and the sessions list replace this in M09.
  async function newSession() {
    setCreating(true);
    try {
      const session = await createSession(ctx);
      navigate(`/sessions/${session.id}/capture`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Biathlete Harness</h1>
      <Button className="h-11 px-6 text-base" disabled={creating} onClick={() => void newSession()}>
        New session
      </Button>
      <Link to="/diagnostics" className="text-primary underline underline-offset-4">
        Diagnostics
      </Link>
    </main>
  );
}
