import { GlossaryList } from '@/components/glossary/GlossaryList';
import { CollapsiblePanel } from '@/components/ui/collapsible-panel';
import { GLOSSARY } from '@/lib/glossary';

/** REV-66: Settings → Glossary, a collapsed box of every acronym and measure the app uses. */
export function GlossarySettings() {
  return (
    <section className="rounded-lg border px-4 py-1" aria-label="Glossary" data-testid="glossary">
      <CollapsiblePanel panelId="glossary" title="Glossary" summary={`${GLOSSARY.length} terms`} defaultOpen={false}>
        <GlossaryList />
      </CollapsiblePanel>
    </section>
  );
}
