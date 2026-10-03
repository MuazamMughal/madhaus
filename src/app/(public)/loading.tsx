/**
 * Route-level loading state.
 *
 * A quiet skeleton that matches the page rhythm rather than a spinner, so the layout does
 * not jump when content arrives. Announced politely so a screen-reader user knows
 * something is happening.
 */
export default function Loading() {
  return (
    <div data-surface="dark" className="surface py-24" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="shell space-y-6" aria-hidden="true">
        <div className="h-3 w-28 animate-pulse bg-charcoal-line" />
        <div className="h-16 w-3/4 max-w-2xl animate-pulse bg-charcoal-line" />
        <div className="h-4 w-full max-w-xl animate-pulse bg-charcoal-line" />
        <div className="h-4 w-2/3 max-w-lg animate-pulse bg-charcoal-line" />
        <div className="grid gap-4 pt-8 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="aspect-[4/3] animate-pulse bg-charcoal-line" />
          ))}
        </div>
      </div>
    </div>
  );
}
