import { useNavigate, useSearchParams } from 'react-router';

import { BackingCardCapture } from '@/components/capture/BackingCardCapture';

/**
 * Route `#/settings/backing-card` (analysis-pipeline §1, backing-sheet.md §2): the capture screen in
 * card mode, full screen with no tab bar. Returns to Settings when a colour was stored, or on Cancel.
 */
export function BackingCardPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  return <BackingCardCapture fakeCamera={searchParams.get('fakeCamera')} onDone={() => navigate('/settings')} />;
}
