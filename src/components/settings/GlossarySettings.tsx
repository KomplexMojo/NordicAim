import { CollapsiblePanel } from '@/components/ui/collapsible-panel';
import { GLOSSARY } from '@/lib/glossary';

/** REV-66: Settings → Glossary, a collapsed box of every acronym and measure the app uses. */
export function GlossarySettings() {
  return (
    <section className="rounded-lg border px-4 py-1" aria-label="Glossary" data-testid="glossary">
      <CollapsiblePanel panelId="glossary" title="Glossary" summary={`${GLOSSARY.length} terms`} defaultOpen={false}>
        <dl className="flex flex-col gap-3 pb-3 text-sm">
          {GLOSSARY.map((entry) => (
            <div key={entry.term} data-testid="glossary-entry" data-term={entry.term}>
              <dt className="font-semibold">
                {entry.term}
                {entry.stands !== null && <span className="ml-2 font-normal text-muted-foreground">{entry.stands}</span>}
              </dt>
              <dd className="text-muted-foreground">{entry.means}</dd>
              {entry.formula !== null && (
                <dd className="mt-1 rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">{entry.formula}</dd>
              )}
            </div>
          ))}
        </dl>
      </CollapsiblePanel>
    </section>
  );
}
