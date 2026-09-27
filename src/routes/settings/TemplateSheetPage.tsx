import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';

import { TemplateSheetCapture } from '@/components/capture/TemplateSheetCapture';
import { TemplateId } from '@/lib/domain/enums';

/**
 * Route `#/settings/template-sheet/:template` (template-reference.md §2, REV-121): the capture screen in sheet mode,
 * full screen with no tab bar. Returns to Settings once a reference is stored, or on Cancel.
 */
export function TemplateSheetPage() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const template = TemplateId.safeParse(params.template);
  if (!template.success) return <Navigate to="/settings" replace />;
  return <TemplateSheetCapture template={template.data} fakeCamera={searchParams.get('fakeCamera')} onDone={() => navigate('/settings')} />;
}
