import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppRouter } from '@/app/router';

import './index.css';

// Test hooks exist only in the fake-camera dev/test build (never in the Pages build); the dynamic import inside
// the env check is tree-shaken when VITE_FAKE_CAMERA is unset.
if (import.meta.env.VITE_FAKE_CAMERA === '1') {
  void import('@/lib/testing/test-hooks-browser').then((m) => m.installTestHooks());
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);
