"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  SENIORITY_LABELS,
  WORK_MODE_LABELS,
  errorMessage,
  readJson,
  relativeDate,
  sourceLabel,
  type Job,
} from "@/lib/ui";
import {
  Banner,
  Button,
  Chip,
  FitGauge,
  GaugeLegend,
  ProgressBar,
  Segmented,
  Skeleton,
  Tag,
  cx,
  inputClass,
  selectClass,
} from "@/components/ui";
import { DEFAULT_PER_PAGE, PAGE_SIZES } from "@/lib/jobQuery";
import { FitPanel } from "./FitPanel";
import type { WorkMode } from "@/lib/jobSources/types";
import type { Seniority } from "@/lib/seniority";

type SeniorityFilter = Seniority | "unspecified";
type Sort = "relevance" | "date";

const WORK_MODES: WorkMode[] = ["remote", "hybrid", "onsite"];
const SENIORITIES: SeniorityFilter[] = ["junior", "mid", "senior", "unspecified"];

const SENIORITY_FILTER_LABELS: Record<SeniorityFilter, string> = {
  ...SENIORITY_LABELS,
  unspecified: "sin especificar",
};

/** Written as durations rather than as a dropdown of sentences: four short
 * buttons in a 236px column say the same thing and can be compared at a
 * glance. No value is "any date" — the absence of a choice already is. */
const DATE_RANGES = [
  { value: "1", label: "24 h" },
  { value: "3", label: "3 d" },
  { value: "7", label: "7 d" },
  { value: "14", label: "14 d" },
] as const;

/**
 * Filters are applied as you tick them, but the request is held back until you
 * stop: ticking five chips is one search, not five. The search endpoint allows
 * 60 an hour per user, which a request per keystroke would burn through in a
 * couple of minutes of ordinary filtering.
 */
const DEBOUNCE_MS = 500;

interface Props {
  /** The user's own skills, most experienced first. */
  skills: string[];
  /** Applied when the user hasn't picked any — mirrors the API's fallback. */
  defaultSkills: string[];
  /** Sources actually present in the fresh index, plus Adzuna when live. */
  sources: string[];
  /** Total years on the CV, compared against what a listing asks for. */
  yearsExp: number | null;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function csv(params: URLSearchParams, key: string): string[] {
  return params.get(key)?.split(",").map((v) => v.trim()).filter(Boolean) ?? [];
}

export function EmpleosClient({ skills, defaultSkills, sources, yearsExp }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The URL is the source of truth for the *initial* state only. Reading it on
  // every render instead would fight the debounce: the URL updates before the
  // request goes out, so the two would take turns overwriting each other.
  const [selectedSkills, setSelectedSkills] = useState<string[]>(() =>
    csv(searchParams, "skills")
  );
  const [selectedModes, setSelectedModes] = useState<WorkMode[]>(() =>
    csv(searchParams, "modes").filter((m): m is WorkMode =>
      WORK_MODES.includes(m as WorkMode)
    )
  );
  const [selectedSeniority, setSelectedSeniority] = useState<SeniorityFilter[]>(() =>
    csv(searchParams, "seniority").filter((s): s is SeniorityFilter =>
      SENIORITIES.includes(s as SeniorityFilter)
    )
  );
  const [selectedSources, setSelectedSources] = useState<string[]>(() =>
    csv(searchParams, "sources")
  );
  const [days, setDays] = useState(() => searchParams.get("days") ?? "");
  const [location, setLocation] = useState(() => searchParams.get("location") ?? "");
  const [sort, setSort] = useState<Sort>(() =>
    searchParams.get("sort") === "date" ? "date" : "relevance"
  );

  const [page, setPage] = useState(() => {
    const raw = Number(searchParams.get("page"));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
  });
  const [perPage, setPerPage] = useState(() => {
    const raw = Number(searchParams.get("porPagina"));
    return (PAGE_SIZES as readonly number[]).includes(raw) ? raw : DEFAULT_PER_PAGE;
  });

  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [searching, setSearching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  /** Only consulted below 900px, where the filter column folds away and the
   * results need the whole width. Above it the panel is simply always there. */
  const [filtersOpen, setFiltersOpen] = useState(false);

  /**
   * Which listing has its description open, as `source:externalId`.
   *
   * One at a time: the panel is tall, and two open cards push everything else
   * off the screen — but more to the point, the fit analysis costs a model
   * call, so a UI that invited opening ten at once would be inviting ten calls.
   */
  const [openJob, setOpenJob] = useState<string | null>(null);

  /**
   * Anything that changes *which* listings match has to send you back to page
   * one. Narrowing a four-page result to one page while sitting on page three
   * would otherwise show an empty screen and look like a bug.
   *
   * Done in the setters rather than in an effect on purpose: an effect would
   * fire a search on the stale page first and a second one after the reset,
   * spending two of the sixty searches an hour on one click.
   */
  function resetPage<T>(apply: (value: T) => void) {
    return (value: T) => {
      apply(value);
      setPage(1);
    };
  }

  const toggleSkill = resetPage((v: string) =>
    setSelectedSkills((prev) => toggle(prev, v))
  );
  const toggleSeniority = resetPage((v: SeniorityFilter) =>
    setSelectedSeniority((prev) => toggle(prev, v))
  );
  const toggleMode = resetPage((v: WorkMode) =>
    setSelectedModes((prev) => toggle(prev, v))
  );
  const toggleSource = resetPage((v: string) =>
    setSelectedSources((prev) => toggle(prev, v))
  );
  const changeDays = resetPage(setDays);
  const changeLocation = resetPage(setLocation);
  const changeSort = resetPage(setSort);
  const changePerPage = resetPage(setPerPage);

  // One serialized string drives both the URL and the request, so the link you
  // can copy always describes the results you're looking at.
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedSkills.length > 0) params.set("skills", selectedSkills.join(","));
    if (selectedModes.length > 0) params.set("modes", selectedModes.join(","));
    if (selectedSeniority.length > 0)
      params.set("seniority", selectedSeniority.join(","));
    if (selectedSources.length > 0) params.set("sources", selectedSources.join(","));
    if (days) params.set("days", days);
    if (location.trim()) params.set("location", location.trim());
    if (sort === "date") params.set("sort", "date");
    if (page > 1) params.set("page", String(page));
    if (perPage !== DEFAULT_PER_PAGE) params.set("perPage", String(perPage));
    return params.toString();
  }, [
    selectedSkills,
    selectedModes,
    selectedSeniority,
    selectedSources,
    days,
    location,
    sort,
    page,
    perPage,
  ]);

  /** The address bar spells one parameter in Spanish, like the rest of the
   * interface; the API spells it perPage. */
  const url = useMemo(() => {
    const params = new URLSearchParams(query);
    const perPageParam = params.get("perPage");
    if (perPageParam) {
      params.delete("perPage");
      params.set("porPagina", perPageParam);
    }
    return params.toString();
  }, [query]);

  const runSearch = useCallback(async (qs: string, signal: AbortSignal) => {
    setSearching(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/search?${qs}`, { signal });
      const data = await readJson(res);

      if (!res.ok) {
        setError(errorMessage(data, "Error buscando empleos"));
        setJobs([]);
        setTotal(0);
        setPages(1);
        setNotice(null);
        return;
      }

      setJobs(data.jobs ?? []);
      setTotal(typeof data.total === "number" ? data.total : (data.jobs?.length ?? 0));
      setPages(typeof data.pages === "number" ? data.pages : 1);
      setNotice(typeof data.notice === "string" ? data.notice : null);
    } catch (err) {
      // An aborted request is the previous search being superseded, not a
      // failure — surfacing it would flash an error on every filter change.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("No se pudo contactar con el servidor");
      setJobs([]);
      setTotal(0);
      setPages(1);
    } finally {
      setHasSearched(true);
      setSearching(false);
    }
  }, []);

  const firstRun = useRef(true);

  useEffect(() => {
    const controller = new AbortController();
    // The first search fires immediately: waiting out the debounce on page
    // load would show an empty list for half a second for no reason.
    const delay = firstRun.current ? 0 : DEBOUNCE_MS;
    firstRun.current = false;

    const timer = setTimeout(() => {
      runSearch(query, controller.signal);
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, runSearch]);

  useEffect(() => {
    router.replace(url ? `/empleos?${url}` : "/empleos", { scroll: false });
  }, [url, router]);

  const activeSkills = selectedSkills.length > 0 ? selectedSkills : defaultSkills;

  const activeFilters =
    selectedSkills.length +
    selectedSeniority.length +
    selectedModes.length +
    selectedSources.length +
    (days ? 1 : 0) +
    (location.trim() ? 1 : 0);

  function clearFilters() {
    setSelectedSkills([]);
    setSelectedModes([]);
    setSelectedSeniority([]);
    setSelectedSources([]);
    setDays("");
    setLocation("");
    setSort("relevance");
    setPage(1);
  }

  const filters = (
    <>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">Filtros</span>
        <button
          type="button"
          onClick={clearFilters}
          disabled={activeFilters === 0}
          className="text-[12.5px] text-tx3 transition hover:text-acc disabled:opacity-40 disabled:hover:text-tx3"
        >
          Limpiar
        </button>
      </div>

      <FilterGroup
        label="Skills"
        hint={`sin marcar = tus ${defaultSkills.length} con más experiencia`}
      >
        {skills.map((skill) => (
          <Chip
            key={skill}
            label={skill}
            checked={selectedSkills.includes(skill)}
            onChange={() => toggleSkill(skill)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Nivel">
        {SENIORITIES.map((level) => (
          <Chip
            key={level}
            label={SENIORITY_FILTER_LABELS[level]}
            checked={selectedSeniority.includes(level)}
            onChange={() => toggleSeniority(level)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Modalidad" hint="las que no lo indican salen siempre">
        {WORK_MODES.map((mode) => (
          <Chip
            key={mode}
            label={WORK_MODE_LABELS[mode]}
            checked={selectedModes.includes(mode)}
            onChange={() => toggleMode(mode)}
          />
        ))}
      </FilterGroup>

      {sources.length > 0 && (
        <FilterGroup label="Fuente">
          {sources.map((source) => (
            <Chip
              key={source}
              label={sourceLabel(source)}
              checked={selectedSources.includes(source)}
              onChange={() => toggleSource(source)}
            />
          ))}
        </FilterGroup>
      )}

      <FilterGroup label="Publicado" wrap={false}>
        {DATE_RANGES.map((range) => (
          <Chip
            key={range.value}
            label={range.label}
            title={`Publicado en los últimos ${range.label}`}
            checked={days === range.value}
            // Clicking the lit one clears it: "any date" is the absence of a
            // choice, so it needs no button of its own.
            onChange={() => changeDays(days === range.value ? "" : range.value)}
            className="flex-1 justify-center px-1 text-[12.5px]"
          />
        ))}
      </FilterGroup>

      <div>
        <p className="rotulo mb-2 text-tx3">Ubicación</p>
        <input
          type="text"
          aria-label="Ubicación"
          value={location}
          placeholder="Madrid, Barcelona…"
          onChange={(e) => changeLocation(e.target.value)}
          className={inputClass("h-[38px] px-[11px] text-[13.5px]")}
        />
      </div>
    </>
  );

  return (
    <div className="mx-auto w-full max-w-[1180px] items-start gap-7 px-6 pb-24 pt-7 min-[900px]:grid min-[900px]:grid-cols-[236px_1fr]">
      {/* Below 900px the column would leave the cards about 300px wide, so it
          folds into a disclosure above them instead. */}
      <button
        type="button"
        onClick={() => setFiltersOpen((open) => !open)}
        aria-expanded={filtersOpen}
        aria-controls="panel-filtros"
        className="mb-4 flex w-full items-center justify-between rounded-[14px] border border-line bg-surf px-[18px] py-3.5 text-sm font-semibold min-[900px]:hidden"
      >
        Filtros
        <span className="text-[13px] font-normal text-tx3">
          {activeFilters > 0 ? `${activeFilters} activos` : "ninguno"}
          <span aria-hidden="true" className="ml-2">
            {filtersOpen ? "▲" : "▼"}
          </span>
        </span>
      </button>

      <aside
        id="panel-filtros"
        className={cx(
          "rounded-[14px] border border-line bg-surf p-[18px] min-[900px]:sticky min-[900px]:top-[88px] min-[900px]:block",
          filtersOpen ? "mb-6 block" : "hidden"
        )}
      >
        {filters}
      </aside>

      <div aria-busy={searching}>
        <div className="mb-[18px] flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-[-0.025em]">
              {searching && !hasSearched ? (
                <span className="text-tx2">Midiendo…</span>
              ) : (
                <>
                  {total} {total === 1 ? "oferta" : "ofertas"}
                </>
              )}
            </h1>
            <p className="mt-[3px] text-[13.5px] text-tx2">
              medidas contra tus {activeSkills.length} skills
              {activeFilters > 0 &&
                ` · ${activeFilters} ${activeFilters === 1 ? "filtro activo" : "filtros activos"}`}
              {pages > 1 && (
                <span className="valor"> · pág. {page}/{pages}</span>
              )}
            </p>
          </div>

          <Segmented
            label="Orden"
            value={sort}
            onChange={changeSort}
            options={[
              { value: "relevance", label: "encaje" },
              { value: "date", label: "fecha" },
            ]}
            className="ml-auto"
          />
        </div>

        <ProgressBar active={searching} />

        {/* The banners and the empty state announce through one polite region:
            results land 500ms after the last click, so without it nothing about
            the change reaches a screen reader. */}
        <div aria-live="polite">
          {error && (
            <Banner tone="danger" className="mt-4">
              {error}
            </Banner>
          )}
          {notice && (
            <Banner tone="warning" className="mt-4">
              {notice}
            </Banner>
          )}

          {/* The empty state is a real branch, not the absence of one: a list
              that renders nothing is indistinguishable from a request that
              never fired. */}
          {!searching && !error && !notice && jobs.length === 0 && hasSearched && (
            <div className="mt-4 rounded-[14px] border border-dashed border-line2 px-6 py-14 text-center">
              <p className="text-lg font-semibold">Ninguna oferta encaja</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-tx2">
                {activeFilters > 0
                  ? "Quita algún filtro o amplía el rango de fechas."
                  : "Prueba con otras skills, o espera a la próxima pasada del worker."}
              </p>
              {activeFilters > 0 && (
                <Button variant="outline" onClick={clearFilters} className="mt-6">
                  Limpiar filtros
                </Button>
              )}
            </div>
          )}
        </div>

        {searching && jobs.length === 0 ? (
          <div className="mt-4 flex flex-col gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-[14px] border border-line bg-surf px-5 py-[18px]"
              >
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-2.5 h-3 w-1/3" />
                <Skeleton className="mt-3 h-6 w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          // Keyed on the query so a new result set remounts and the entrance
          // replays. Without it React reuses the same nodes and the list swaps
          // contents with no sign that anything changed.
          <ul
            key={query}
            className={cx(
              "mt-4 flex flex-col gap-2.5",
              searching && "opacity-55 transition-opacity"
            )}
          >
            {jobs.map((job, i) => (
              <JobCard
                key={`${job.source}-${job.url}-${i}`}
                job={job}
                index={i}
                skills={activeSkills}
                yearsExp={yearsExp}
                open={openJob === jobKey(job)}
                onToggle={() =>
                  setOpenJob((current) => (current === jobKey(job) ? null : jobKey(job)))
                }
              />
            ))}
          </ul>
        )}

        {jobs.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line pt-4">
            <GaugeLegend />
            <label className="rotulo flex shrink-0 items-center gap-2 whitespace-nowrap text-tx3">
              por pág.
              <select
                value={perPage}
                onChange={(e) => changePerPage(Number(e.target.value))}
                className={selectClass("h-9 w-auto px-2 text-[13px]")}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {pages > 1 && <Pagination page={page} pages={pages} onChange={setPage} />}
      </div>
    </div>
  );
}

/* ── Parts ──────────────────────────────────────────────────────────────── */

function FilterGroup({
  label,
  hint,
  wrap = true,
  children,
}: {
  label: string;
  hint?: string;
  wrap?: boolean;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="mb-5">
      {/* The visible heading is the <p>; the legend repeats it for the
          accessibility tree, where a fieldset without one is just a box. */}
      <legend className="sr-only">{label}</legend>
      <p className="rotulo text-tx3">{label}</p>
      {hint && <p className="mt-1 text-[11.5px] leading-snug text-tx3">{hint}</p>}
      <div className={cx("mt-2 flex gap-1.5", wrap && "flex-wrap")}>{children}</div>
    </fieldset>
  );
}

/** Cards past this one appear together. Staggering the whole list would mean
 * the last of ninety-six arrives seconds late, and nobody should wait on an
 * animation to read a result that is already loaded. */
const STAGGER_LIMIT = 8;
const STAGGER_STEP_MS = 30;

/** Identifies a listing across renders and to /api/jobs/fit. */
function jobKey(job: Job): string {
  return `${job.source}:${job.externalId}`;
}

function JobCard({
  job,
  index,
  skills,
  yearsExp,
  open,
  onToggle,
}: {
  job: Job;
  index: number;
  skills: string[];
  yearsExp: number | null;
  open: boolean;
  onToggle: () => void;
}) {
  const delay = `${Math.min(index, STAGGER_LIMIT) * STAGGER_STEP_MS}ms`;
  const panelId = `detalle-${jobKey(job).replace(/[^a-zA-Z0-9-]/g, "-")}`;

  // Built by dropping the blanks before joining: a listing with no stated level
  // must not print a separator with nothing either side of it.
  const meta = [
    job.company,
    job.location,
    job.workMode && WORK_MODE_LABELS[job.workMode],
    job.seniority && SENIORITY_LABELS[job.seniority],
    relativeDate(job.postedAt),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      style={{ animationDelay: delay }}
      className={cx(
        "motion-rise rounded-[14px] border bg-surf px-5 py-[18px] transition-colors",
        open ? "border-acc-line" : "border-line hover:border-line2"
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-semibold leading-snug tracking-[-0.015em]">
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              // The whole card is not a link on purpose: a card-sized target
              // makes the text inside it unselectable, and copying a job title
              // is a thing people do.
              className="underline-offset-4 transition-colors hover:text-acc hover:underline"
            >
              {job.title}
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          </h3>

          {meta && <p className="mt-[5px] text-[13.5px] text-tx2">{meta}</p>}

          {job.matchedSkills && job.matchedSkills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {job.matchedSkills.map((skill) => (
                <Tag key={skill}>{skill}</Tag>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-end justify-between gap-4 sm:w-[132px] sm:flex-col sm:justify-start">
          <FitGauge
            skills={skills}
            matched={job.matchedSkills ?? []}
            inTitle={job.titleSkills ?? []}
            layout="stack"
          />
          <span className="valor text-[11.5px] text-tx3">{sourceLabel(job.source)}</span>
        </div>
      </div>

      {/* The card's own control, separate from the title link. The title goes
          to the job board; this opens what the listing says without leaving
          the page — the difference between judging an offer and opening twenty
          tabs to judge them. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-tx3 underline-offset-4 transition hover:text-acc hover:underline"
      >
        <span aria-hidden="true" className={cx("transition-transform", open && "rotate-90")}>
          ›
        </span>
        {open ? "Ocultar detalle" : "Ver qué pide"}
      </button>

      {open && (
        <div id={panelId}>
          <FitPanel job={job} yearsExp={yearsExp} />
        </div>
      )}
    </li>
  );
}

/** How many numbered pages flank the current one before the list collapses to
 * an ellipsis. */
const PAGE_WINDOW = 2;

function pageList(page: number, pages: number): (number | "gap")[] {
  const shown = new Set<number>([1, pages]);
  for (let i = page - PAGE_WINDOW; i <= page + PAGE_WINDOW; i += 1) {
    if (i >= 1 && i <= pages) shown.add(i);
  }

  const sorted = [...shown].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];

  for (const [i, value] of sorted.entries()) {
    // A single skipped page is shown rather than replaced by an ellipsis that
    // would take the same room and say less.
    if (i > 0 && value - sorted[i - 1] > 1) out.push("gap");
    out.push(value);
  }

  return out;
}

function Pagination({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  function go(next: number) {
    onChange(Math.min(Math.max(next, 1), pages));
    // Paging without this leaves you at the bottom of the previous page, in
    // front of the last few results of a list you have already read.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <nav
      aria-label="Paginación"
      className="mt-6 flex flex-wrap items-center justify-center gap-1"
    >
      <button
        onClick={() => go(page - 1)}
        disabled={page === 1}
        className="min-h-9 rounded-lg px-3 text-[13px] text-tx2 transition hover:bg-surf2 hover:text-tx disabled:opacity-35 disabled:hover:bg-transparent"
      >
        Anterior
      </button>

      {pageList(page, pages).map((entry, i) =>
        entry === "gap" ? (
          <span key={`gap-${i}`} aria-hidden="true" className="valor px-1 text-sm text-tx3">
            …
          </span>
        ) : (
          <button
            key={entry}
            onClick={() => go(entry)}
            aria-current={entry === page ? "page" : undefined}
            className={cx(
              "valor min-h-9 min-w-9 rounded-lg px-2 text-[13px] transition active:scale-95",
              entry === page
                ? "bg-acc font-medium text-acc-tx"
                : "text-tx2 hover:bg-surf2 hover:text-tx"
            )}
          >
            {entry}
          </button>
        )
      )}

      <button
        onClick={() => go(page + 1)}
        disabled={page === pages}
        className="min-h-9 rounded-lg px-3 text-[13px] text-tx2 transition hover:bg-surf2 hover:text-tx disabled:opacity-35 disabled:hover:bg-transparent"
      >
        Siguiente
      </button>
    </nav>
  );
}
