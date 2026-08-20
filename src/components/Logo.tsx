import { cx } from "@/components/ui";

/**
 * The mark is the fit gauge.
 *
 * Four segments — two full, one half, one empty — which is the notation the
 * results sheet uses for "in the title / in the description / absent". Drawing
 * the product's own instrument means the logo cannot drift from what the thing
 * does, and no job board can borrow it, because none of them rank this way.
 *
 * Geometry is duplicated in src/app/icon.svg, which cannot import this: the
 * favicon is a static file the browser fetches on its own, with no React and
 * no access to the page's custom properties.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      // Decorative wherever the wordmark sits beside it; `Brand` handles the
      // accessible name for the pair.
      aria-hidden="true"
      focusable="false"
      className={cx("size-7 shrink-0", className)}
    >
      <rect width="32" height="32" rx="6" className="fill-marca" />
      <g className="fill-papel">
        <rect x="4.25" y="8" width="4" height="16" />
        <rect x="10.75" y="8" width="4" height="16" />
        {/* The half segment is the distinctive one: it is the difference
            between a skill named in the title and one buried in the body. */}
        <rect x="17.25" y="16" width="4" height="8" />
        <rect x="23.75" y="8" width="4" height="16" opacity="0.35" />
      </g>
    </svg>
  );
}

/** Mark plus wordmark, as one labelled unit. */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={cx("flex items-center gap-2", className)}>
      <Logo />
      <span className="display text-base leading-none">JobMatch</span>
    </span>
  );
}
