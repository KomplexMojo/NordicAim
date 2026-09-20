import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { AboutSettings } from '@/components/settings/AboutSettings';
import { BackingSettings } from '@/components/settings/BackingSettings';
import { GlossarySettings } from '@/components/settings/GlossarySettings';
import { BackupSettings } from '@/components/settings/BackupSettings';
import { AthleteSettings } from '@/components/settings/AthleteSettings';
import { ScoringSettings } from '@/components/settings/ScoringSettings';
import { HoleSizeSettings } from '@/components/settings/HoleSizeSettings';
import { useServices } from '@/lib/app/services';
import type { BackingMode } from '@/lib/domain/backing';
import type { AppSettings } from '@/lib/domain/settings';
import { loadProvenanceKey, setPassphrase, unlockPassphrase } from '@/lib/services/provenance';
import { measureBackingCard } from '@/lib/services/backing-card';
import {
  clearBacking,
  getAppSettings,
  resetHoleDiameterMm,
  setBackingMode,
  setHoleDiameterMm,
  setAthlete,
  setHandedness,
  setScoringRule,
  setVisibleHoleDiameterMm,
  type ScoringChange,
} from '@/lib/services/settings';

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Route `#/settings` (REV-47, analysis-pipeline §1): defaults that apply across all sessions — the
 * backing sheet (REV-48, backing-sheet.md §2), hole size (data-model §5) and About. Every change here
 * only writes the settings row; nothing is re-analyzed.
 */
export function SettingsPage() {
  const { ctx, imageTools } = useServices();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState(false);
  const [keyPresent, setKeyPresent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadProvenanceKey(ctx).then((k) => {
      if (!cancelled) setKeyPresent(k !== null);
    });
    getAppSettings(ctx).then(
      (s) => {
        if (!cancelled) setSettings(s);
      },
      (err: unknown) => {
        if (!cancelled) setLoadError(errorText(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  async function save(write: () => Promise<AppSettings>) {
    try {
      setSettings(await write());
    } catch (err) {
      toast.error(`Could not save: ${errorText(err)}`);
    }
  }

  /** REV-56: a scoring change re-scores stored sessions, and the toast says how many. */
  async function saveScoring(write: () => Promise<ScoringChange>, optimistic: Partial<AppSettings>) {
    // Show the choice at once: the write also re-scores every stored session, which can take a moment, and a
    // radio that only flips when that finishes looks like it did not take.
    setSettings((current) => (current === null ? current : { ...current, ...optimistic }));
    try {
      const { settings: next, rescored } = await write();
      setSettings(next);
      if (rescored !== null && rescored.photos > 0) {
        toast.success(
          `Re-scored ${rescored.photos} ${rescored.photos === 1 ? 'target' : 'targets'} in ${rescored.sessions} ${
            rescored.sessions === 1 ? 'session' : 'sessions'
          }.`,
        );
      }
    } catch (err) {
      toast.error(`Could not save: ${errorText(err)}`);
      setSettings(await getAppSettings(ctx)); // put back what is actually stored
    }
  }

  async function onChooseCardPhoto(file: File) {
    setCardBusy(true);
    setCardError(false);
    try {
      const result = await measureBackingCard(ctx, file, imageTools);
      // backing-sheet.md §4.3: a card with no clear colour stores nothing.
      if (result.settings === null) setCardError(true);
      else setSettings(result.settings);
    } catch (err) {
      toast.error(`Could not read that card: ${errorText(err)}`);
    } finally {
      setCardBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-8 lg:max-w-3xl">
      <h1 className="pt-4 text-xl font-semibold">Settings</h1>
      <p className="text-sm text-muted-foreground">These apply to every session.</p>

      {loadError !== null && <p className="text-sm text-destructive">Could not load settings: {loadError}</p>}
      {settings === null ? (
        loadError === null && <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <AthleteSettings
            name={settings.athleteName}
            club={settings.athleteClub}
            handedness={settings.handedness}
            onHandednessChange={(h) => void saveScoring(() => setHandedness(ctx, h), { handedness: h })}
            fingerprint={settings.keyFingerprint}
            keyPresent={keyPresent}
            onSetPassphrase={async (p) => {
              setSettings(await setPassphrase(ctx, p));
              setKeyPresent(true);
            }}
            onUnlock={async (p) => {
              setSettings(await unlockPassphrase(ctx, p));
              setKeyPresent(true);
            }}
            onSave={(a) => void save(() => setAthlete(ctx, a))}
          />
          <ScoringSettings
            scoringRule={settings.scoringRule}
            visibleHoleDiameterMm={settings.visibleHoleDiameterMm}
            onRuleChange={(rule) => void saveScoring(() => setScoringRule(ctx, rule), { scoringRule: rule })}
            onVisibleSizeChange={(mm) => void saveScoring(() => setVisibleHoleDiameterMm(ctx, mm), { visibleHoleDiameterMm: mm })}
          >
            <HoleSizeSettings
            holeDiameterMm={settings.profileOverrides.holeDiameterMm}
            onChange={(mm) => void save(() => setHoleDiameterMm(ctx, mm))}
            onReset={() => void save(() => resetHoleDiameterMm(ctx))}
          />
          </ScoringSettings>
          <BackingSettings
            backingMode={settings.backingMode}
            backing={settings.backing}
            busy={cardBusy}
            cardError={cardError}
            onModeChange={(m: BackingMode) => {
              setCardError(false);
              void save(() => setBackingMode(ctx, m));
            }}
            onPhotographCard={() => navigate('/settings/backing-card')}
            onChooseCardPhoto={(file) => void onChooseCardPhoto(file)}
            onClear={() => {
              setCardError(false);
              void save(() => clearBacking(ctx));
            }}
          />
          <BackupSettings settings={settings} />
        </>
      )}
      <GlossarySettings />
      <AboutSettings />
    </main>
  );
}
