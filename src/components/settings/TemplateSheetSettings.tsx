import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useServices } from '@/lib/app/services';
import { DEFAULT_TEMPLATE_REFERENCE } from '@/lib/defaults/template-references';
import type { TemplateId } from '@/lib/domain/enums';
import type { AppSettings } from '@/lib/domain/settings';
import type { TemplateReferences } from '@/lib/domain/template-reference';
import { getCustomReferenceImage, restoreDefaultReference } from '@/lib/services/template-reference';

import { ReferenceHolesWarning } from './ReferenceHolesWarning';
import { useReferenceMaker } from './useReferenceMaker';

const ROWS: Array<{ template: TemplateId; label: string }> = [
  { template: 'sighting', label: 'Sighting sheet' },
  { template: 'precision', label: 'Precision sheet' },
];

interface TemplateSheetSettingsProps {
  templateReferences: TemplateReferences;
  holeDiameterMm: number;
  onChanged(settings: AppSettings): void;
}

/**
 * template-reference.md §2 (M26, REV-121): the Settings screen's **Target sheets** section. One row per template,
 * showing the reference in use (the shipped default or the user's own), with Photograph sheet, Choose photo, and
 * Restore default for a custom one.
 */
export function TemplateSheetSettings({ templateReferences, holeDiameterMm, onChanged }: TemplateSheetSettingsProps) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" aria-labelledby="settings-sheets-title">
      <h2 id="settings-sheets-title" className="text-base font-semibold">
        Target sheets
      </h2>
      <p className="text-xs text-muted-foreground">
        A photo of a blank sheet, cut down to its target circles. The app ships with a default for each; replace it when
        your printed sheets change. Only the circles are kept.
      </p>
      {ROWS.map((row) => (
        <TemplateSheetRow
          key={row.template}
          template={row.template}
          label={row.label}
          custom={templateReferences[row.template]}
          holeDiameterMm={holeDiameterMm}
          onChanged={onChanged}
        />
      ))}
    </section>
  );
}

interface RowProps {
  template: TemplateId;
  label: string;
  custom: TemplateReferences[TemplateId];
  holeDiameterMm: number;
  onChanged(settings: AppSettings): void;
}

function TemplateSheetRow({ template, label, custom, holeDiameterMm, onChanged }: RowProps) {
  const { ctx } = useServices();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  const maker = useReferenceMaker(template, holeDiameterMm, onChanged);

  // The custom image is a stored blob; the default is a same-origin asset.
  useEffect(() => {
    // With no custom sheet the thumbnail is the default asset, whatever `customUrl` holds.
    if (custom === null) return;
    let url: string | null = null;
    let cancelled = false;
    void getCustomReferenceImage(ctx, template).then((blob) => {
      if (cancelled || blob === null) return;
      url = URL.createObjectURL(blob);
      setCustomUrl(url);
    });
    return () => {
      cancelled = true;
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [ctx, template, custom]);

  const defaultUrl = `${import.meta.env.BASE_URL}${DEFAULT_TEMPLATE_REFERENCE[template].assetPath}`;
  const thumbnail = custom === null ? defaultUrl : customUrl;

  async function onRestore() {
    try {
      const { settings, rerun } = await restoreDefaultReference(ctx, template);
      onChanged(settings);
      toast.success(rerun > 0 ? `Default restored. Re-analyzing ${rerun} ${rerun === 1 ? 'target' : 'targets'}.` : 'Default restored.');
    } catch (err) {
      toast.error(`Could not restore the default: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-3" data-testid={`sheet-row-${template}`}>
      <div className="flex items-center gap-3">
        {thumbnail !== null ? (
          <img src={thumbnail} alt={`${label} in use`} className="size-16 shrink-0 rounded border object-cover" />
        ) : (
          <span className="size-16 shrink-0 rounded border" />
        )}
        <div className="flex flex-col">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground" data-testid={`sheet-source-${template}`}>
            {custom === null ? 'Default' : `Your sheet · ${custom.capturedAt.slice(0, 10)}`}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="h-11"
          disabled={maker.busy}
          data-testid={`photograph-sheet-${template}`}
          onClick={() => navigate(`/settings/template-sheet/${template}`)}
        >
          Photograph sheet
        </Button>
        <Button
          variant="outline"
          className="h-11"
          disabled={maker.busy}
          data-testid={`choose-sheet-${template}`}
          onClick={() => fileRef.current?.click()}
        >
          Choose photo
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        data-testid={`sheet-photo-input-${template}`}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file !== undefined) void maker.make(file);
        }}
      />
      {custom !== null && (
        <Button variant="ghost" className="h-11" disabled={maker.busy} data-testid={`restore-sheet-${template}`} onClick={() => void onRestore()}>
          Restore default
        </Button>
      )}
      {maker.busy && <p className="text-xs text-muted-foreground">Checking the sheet…</p>}
      {maker.refused !== null && (
        <p className="text-xs text-destructive" role="alert" data-testid={`sheet-refused-${template}`}>
          {maker.refused}
        </p>
      )}
      {maker.pending !== null && <ReferenceHolesWarning onUse={() => void maker.useAnyway()} onCancel={maker.discard} cancelLabel="Cancel" />}
    </div>
  );
}
