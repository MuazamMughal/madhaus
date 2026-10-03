/**
 * Development banner.
 *
 * Shown whenever the page is rendering the shipped sample content rather than the
 * venue's own. It exists so nobody -- reviewer, client or search engine -- can mistake
 * placeholder copy for a verified fact. The same flag also sets `noindex` in metadata.
 */
export function SampleContentBanner() {
  return (
    <div
      data-surface="lime"
      data-print-hide=""
      role="status"
      className="surface relative z-50 px-4 py-2 text-center"
    >
      <p className="text-xs font-semibold">
        <span className="font-display uppercase">Sample content</span> — prices, menu, address and
        photography are placeholders awaiting the venue&apos;s own details. Not for public release.
      </p>
    </div>
  );
}
