import { createHashRouter, Outlet, RouterProvider } from 'react-router';

import { Toaster } from '@/components/ui/sonner';
import { ServicesProvider } from '@/lib/app/services';
import { CapturePage } from '@/routes/capture/CapturePage';
import { DiagnosticsPage } from '@/routes/diagnostics/DiagnosticsPage';
import { HomePage } from '@/routes/home/HomePage';
import { MetadataStubPage } from '@/routes/metadata/MetadataStubPage';

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
      { path: '/sessions/:sid/capture', element: <CapturePage /> },
      { path: '/sessions/:sid/metadata', element: <MetadataStubPage /> },
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
