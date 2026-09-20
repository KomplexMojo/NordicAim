import { createHashRouter, Navigate, Outlet, RouterProvider, useLocation, useParams } from 'react-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { TabBar } from '@/components/nav/TabBar';
import { Toaster } from '@/components/ui/sonner';
import { activeTab, showsTabBar } from '@/lib/app/nav';
import { ServicesProvider } from '@/lib/app/services';
import { CapturePage } from '@/routes/capture/CapturePage';
import { DiagnosticsPage } from '@/routes/diagnostics/DiagnosticsPage';
import { HomePage } from '@/routes/home/HomePage';
import { MetadataPage } from '@/routes/metadata/MetadataPage';
import { ResultsPage } from '@/routes/results/ResultsPage';
import { ReviewPage } from '@/routes/review/ReviewPage';
import { PatternsPage } from '@/routes/patterns/PatternsPage';
import { SessionRedirect } from '@/routes/sessions/SessionRedirect';
import { BackingCardPage } from '@/routes/settings/BackingCardPage';
import { VerifyPage } from '@/routes/verify/VerifyPage';
import { SettingsPage } from '@/routes/settings/SettingsPage';
import { TargetPage } from '@/routes/target/TargetPage';

function AdjustRedirect() {
  const { sid = '', pid = '' } = useParams();
  return <Navigate to={`/sessions/${sid}/photos/${pid}`} replace />;
}

function ServicesLayout() {
  return (
    <ServicesProvider>
      <Outlet />
    </ServicesProvider>
  );
}

/**
 * REV-47 (analysis-pipeline §1): every screen sits above the three-tab bar, except the full-screen capture
 * screens. The page is padded by the bar's height plus the safe-area inset so the bar never covers content.
 */
function AppShell() {
  const { pathname } = useLocation();
  const withBar = showsTabBar(pathname);
  return (
    <>
      {withBar && <AppHeader />}
      <div className={withBar ? 'pb-[calc(3.5rem+env(safe-area-inset-bottom))]' : undefined}>
        <Outlet />
      </div>
      {withBar && <TabBar active={activeTab(pathname)} />}
    </>
  );
}

// Routes: docs/spec/analysis-pipeline.md §1. Diagnostics stays outside the services provider so it still runs
// when IndexedDB cannot be opened.
const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      {
        element: <ServicesLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          // REV-72: the session list is Home; an old link to the removed Sessions screen goes there.
          { path: '/sessions', element: <Navigate to="/" replace /> },
          { path: '/patterns', element: <PatternsPage /> },
          { path: '/sessions/:sid', element: <SessionRedirect /> },
          { path: '/sessions/:sid/capture', element: <CapturePage /> },
          { path: '/sessions/:sid/metadata', element: <MetadataPage /> },
          { path: '/sessions/:sid/results', element: <ResultsPage /> },
          { path: '/sessions/:sid/photos/:pid', element: <TargetPage /> },
          // REV-73: view and adjust are one screen; an old adjust address goes to the target.
          { path: '/sessions/:sid/photos/:pid/adjust', element: <AdjustRedirect /> },
          // M21 step 4 (REV-42): the session review pass.
          { path: '/review/:sessionId', element: <ReviewPage /> },
          // M22 (REV-47, REV-48): Settings, and its full-screen backing-card capture.
          { path: '/settings', element: <SettingsPage /> },
          { path: '/verify', element: <VerifyPage /> },
          { path: '/settings/backing-card', element: <BackingCardPage /> },
        ],
      },
      { path: '/diagnostics', element: <DiagnosticsPage /> },
    ],
  },
]);

export function AppRouter() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-center" />
    </>
  );
}
