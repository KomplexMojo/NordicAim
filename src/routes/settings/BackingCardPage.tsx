import { useNavigate, useSearchParams } from 'react-router';

import { BackingCardCapture } from '@/components/capture/BackingCardCapture';

/**
 * Route `#/settings/backing-card` (analysis-pipeline §1, backing-sheet.md §2, REV-161): the capture
 * screen in card mode, full screen with no tab bar. Returns to Settings by default, or to `?return=`
 * when opened from the session camera's Update backing control.
 */
export function BackingCardPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = searchParams.get('return');
  const donePath =
    returnTo !== null && returnTo.startsWith('/sessions/') && returnTo.includes('/capture') ? returnTo : '/settings';
  const fake = searchParams.get('fakeCamera');
  return (
    <BackingCardCapture
      fakeCamera={fake}
      onDone={() => navigate(fake !== null && donePath !== '/settings' ? `${donePath}${donePath.includes('?') ? '&' : '?'}fakeCamera=${encodeURIComponent(fake)}` : donePath)}
    />
  );
}
