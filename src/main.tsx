import { BUILD_SHA } from '@/lib/app/build-info';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { FramedNotice } from '@/app/FramedNotice';
import { AppRouter } from '@/app/router';
import { isFramed } from '@/lib/app/framing-browser';
import { loadAppServices } from '@/lib/app/services';
import { startSummaryScheduler } from '@/lib/composite/scheduler-browser';
import { startPipelineRunner } from '@/lib/pipeline/runner-browser';
import { errorSummary } from '@/lib/app/log';
import { removeStoredLocations } from '@/lib/services/location';
import { getCvClient } from '@/workers/cv-client';

import './index.css';

// Issue #47: framed by another page, the app shows only a notice and starts nothing (no pipeline, no services, no buttons).
const framed = isFramed();

// Test hooks exist only in the fake-camera dev/test build (never in the Pages build); the dynamic import inside
// the env check is tree-shaken when VITE_FAKE_CAMERA is unset.
if (!framed && import.meta.env.VITE_FAKE_CAMERA === '1') {
  void import('@/lib/testing/test-hooks-browser').then((m) => m.installTestHooks());
}

// analysis-pipeline §5: the pipeline runner starts on app load, resets interrupted jobs and picks up any
// Stage A or Stage B work left over from a previous visit. The CV worker is created lazily, on the first job.
if (!framed) {
  void loadAppServices()
    .then(({ ctx, imageTools, renderTools }) => {
      startPipelineRunner(ctx, { getCvApi: getCvClient, imageTools, renderTools });
      // analysis-pipeline §7: rebuilds the session summary image after Stage B settles.
      startSummaryScheduler(ctx, renderTools, BUILD_SHA);
      // REV-158: photos stored before locations were removed on import have theirs taken out, once each.
      removeStoredLocations(ctx).catch((err: unknown) => console.error('[location] pass failed', errorSummary(err)));
    })
    .catch((err: unknown) => {
      console.error('[pipeline] runner failed to start', errorSummary(err));
    });
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element not found');

createRoot(rootEl).render(<StrictMode>{framed ? <FramedNotice /> : <AppRouter />}</StrictMode>);
