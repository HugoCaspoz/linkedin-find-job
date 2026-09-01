/** The portals the index is built from, in the order the worker runs them. */
export const SOURCES = ["InfoJobs", "LinkedIn", "Tecnoempleo", "Adzuna"];

/**
 * Closes every page. It names where the listings come from rather than
 * carrying the usual row of legal links, because those pages do not exist —
 * three dead anchors would look finished and be worse than saying nothing.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line px-6 py-[26px]">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-4 text-[13px] text-tx3">
        <span>JobMatch — buscador de empleo técnico</span>
        <span className="flex flex-wrap gap-x-[18px] gap-y-1">
          {SOURCES.map((source) => (
            <span key={source}>{source}</span>
          ))}
        </span>
      </div>
    </footer>
  );
}
