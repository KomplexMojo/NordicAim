import { Link } from 'react-router';

export function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Biathlete Harness</h1>
      <Link to="/diagnostics" className="text-primary underline underline-offset-4">
        Diagnostics
      </Link>
    </main>
  );
}
