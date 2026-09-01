import { cx } from "@/components/ui";

/**
 * The mark is the fit gauge.
 *
 * Four bars — two full, one half, one empty — which is the notation the
 * results use for "in the title / in the description / absent". Drawing the
 * product's own instrument means the logo cannot drift from what the thing
 * does, and no job board can borrow it, because none of them rank this way.
 *
 * Geometry is duplicated in src/app/icon.svg, which cannot import this: the
 * favicon is a static file the browser fetches on its own, with no React and
 * no access to the page's custom properties.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      // Decorative wherever the wordmark sits beside it; `Brand` handles the
      // accessible name for the pair.
      aria-hidden="true"
      focusable="false"
      className={cx("size-6 shrink-0", className)}
    >
      <rect x="1" y="7" width="4.5" height="14" rx="1.5" fill="var(--acc)" />
      <rect x="8" y="7" width="4.5" height="14" rx="1.5" fill="var(--acc)" />
      {/* The half bar is the distinctive one: it is the difference between a
          skill named in the title and one buried in the body. */}
      <rect x="15" y="14" width="4.5" height="7" rx="1.5" fill="var(--acc)" />
      <rect x="22" y="7" width="4.5" height="14" rx="1.5" fill="var(--line2)" />
    </svg>
  );
}

/** Mark plus wordmark, as one labelled unit. */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={cx("flex items-center gap-[9px]", className)}>
      <Logo />
      <span className="text-[16.5px] font-bold leading-none tracking-[-0.02em]">
        JobMatch
      </span>
    </span>
  );
}
