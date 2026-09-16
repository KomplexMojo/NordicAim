import { createHashRouter, Outlet, RouterProvider } from 'react-router';

import { Toaster } from '@/components/ui/sonner';
import { ServicesProvider } from '@/lib/app/services';
import { CapturePage } from '@/routes/capture/CapturePage';
import { DiagnosticsPage } from '@/routes/diagnostics/DiagnosticsPage';
import { HomePage } from '@/routes/home/HomePage';
import { MetadataPage } from '@/routes/metadata/MetadataPage';
import { ResultsStubPage } from '@/routes/results/ResultsStubPage';
import { SessionRedirect } from '@/routes/sessions/SessionRedirect';
import { SessionsPage } from '@/routes/sessions/SessionsPage';

function ServicesLayout() {
  return (
    <ServicesProvider>
      <Outlet />
    </ServicesProvider>
  );
}

// Routes: docs/spec/analysis-pipeline.md §1. Diagnostics stays outside the services provider so it still runs
// when IndexedDB cannot be opened.
const router = createHashRouter([
  {
    element: <ServicesLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/sessions', element: <SessionsPage /> },
      { path: '/sessions/:sid', element: <SessionRedirect /> },
      { path: '/sessions/:sid/capture', element: <CapturePage /> },
      { path: '/sessions/:sid/metadata', element: <MetadataPage /> },
      { path: '/sessions/:sid/results', element: <ResultsStubPage /> },
    ],
  },
  { path: '/diagnostics', element: <DiagnosticsPage /> },
]);

export function AppRouter() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-center" />
    </>
  );
}
