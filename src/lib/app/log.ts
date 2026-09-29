// Issue #49 (privacy-storage-hosting.md §1 item 5): what an error log line may carry. Only the error's name and message,
// never the object itself, so no photo record, EXIF or GPS value attached to an error can reach the console. Pure.

export function errorSummary(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.slice(0, 300);
  if (typeof err === 'string') return err.slice(0, 300);
  return 'unknown error';
}
