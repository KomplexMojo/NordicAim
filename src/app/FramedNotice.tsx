/**
 * Issue #47: shown instead of the app when another page frames it, so no button can be tapped through a disguise (Share,
 * Back up now). The link opens the app on its own; following it is the owner's tap, which browsers allow to leave the frame.
 */
export function FramedNotice() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center" data-testid="framed-notice">
      <p className="text-base font-semibold">NordicAim can't run inside another page.</p>
      <a href={window.location.href} target="_top" rel="noopener" className="inline-flex h-11 items-center text-primary underline underline-offset-4">
        Open NordicAim on its own
      </a>
    </main>
  );
}
