/**
 * A single restrained marquee.
 *
 * Used once on the page, as a band between sections. The track is duplicated and the
 * animation translates by exactly -50%, so the loop is seamless. The duplicate is hidden
 * from assistive technology, and `prefers-reduced-motion` stops it dead in CSS -- the
 * words stay readable, they just stop moving.
 */
export function Marquee({ items }: { items: readonly string[] }) {
  const track = (
    <ul className="marquee-track flex shrink-0 items-center gap-10 pr-10">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex shrink-0 items-center gap-10">
          <span className="font-display text-2xl whitespace-nowrap uppercase sm:text-4xl">
            {item}
          </span>
          <span aria-hidden="true" className="text-lime text-2xl sm:text-4xl">
            ✦
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div
      data-surface="dark"
      className="surface overflow-hidden border-y border-charcoal-line py-5"
    >
      <div className="flex">
        {track}
        {/* Second copy exists only to make the loop seamless. */}
        <div aria-hidden="true" className="contents">
          {track}
        </div>
      </div>
    </div>
  );
}
