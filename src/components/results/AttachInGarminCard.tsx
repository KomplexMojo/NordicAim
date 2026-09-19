import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** rendering-composite.md §7 step 5: the four manual steps to get the summary image onto a Garmin
 * Connect activity (there is no Garmin API integration in this app — see docs/BACKLOG.md). */
const STEPS = [
  'In the share sheet, choose Save Image.',
  'Open the Garmin Connect app.',
  'Open the activity (usually the most recent).',
  'Tap the camera icon and choose the saved image.',
] as const;

export function AttachInGarminCard() {
  return (
    <Card data-testid="attach-garmin-card">
      <CardHeader>
        <CardTitle>Attach in Garmin Connect</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          {STEPS.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
