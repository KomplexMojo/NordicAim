import { BookOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

import { GlossaryList } from './GlossaryList';

/**
 * Issue #89: the glossary from where the jargon is (Adjust, on the target and review screens), as a sheet over the editor —
 * it never navigates away, so an unsaved Adjust draft is kept.
 */
export function GlossarySheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" className="h-11 gap-2 text-muted-foreground" data-testid="glossary-open">
          <BookOpen className="size-4" aria-hidden="true" />
          Glossary
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto px-4" data-testid="glossary-sheet">
        <SheetHeader className="px-0">
          <SheetTitle>Glossary</SheetTitle>
          <SheetDescription>What the measures and acronyms mean.</SheetDescription>
        </SheetHeader>
        <GlossaryList />
      </SheetContent>
    </Sheet>
  );
}
