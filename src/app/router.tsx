import { createHashRouter, RouterProvider } from 'react-router';

import { DiagnosticsPage } from '@/routes/diagnostics/DiagnosticsPage';
import { HomePage } from '@/routes/home/HomePage';

const router = createHashRouter([
  { path: '/', element: <HomePage /> },
  { path: '/diagnostics', element: <DiagnosticsPage /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
