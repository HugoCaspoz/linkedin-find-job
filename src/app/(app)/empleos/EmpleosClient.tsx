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
  Badge,
  Banner,
  Button,
  ProgressBar,
  Skeleton,
  Toggle,
  cx,
  selectClass,
  inputClass,
} from "@/components/ui";
import { DEFAULT_PER_PAGE, PAGE_SIZES } from "@/lib/jobQuery";
import type { WorkMode } from "@/lib/jobSources/types";
import type { Seniority } from "@/lib/seniority";

type View = "list" | "grid";

/**
 * An applied filter, described rather than bound to a handler. The `kind` is
 * what `removeChip` switches on, so the union is exhaustive by construction —
 * adding a filter without teaching the remover about it fails to compile.
 */
type AppliedChip =
  | { key: string; label: string; kind: "skill"; value: string }
  | { key: string; label: string; kind: "seniority"; value: SeniorityFilter }
  | { key: string; label: string; kind: "mode"; value: WorkMode }
  | { key: string; label: string; kind: "source"; value: string }
  | { key: string; label: string; kind: "days" }
  | { key: string; label: string; kind: "location" };

type SeniorityFilter = Seniority | "unspecified";

const WORK_MODES: WorkMode[] = ["remote", "hybrid", "onsite"];
const SENIORITIES: SeniorityFilter[] = ["junior", "mid", "senior", "unspecified"];

const SENIORITY_FILTER_LABELS: Record<SeniorityFilter, string> = {
  ...SENIORITY_LABELS,
  unspecified: "Sin especificar",
};

const DATE_RANGES = [
  { value: "", label: "Cualquier fecha" },
  { value: "1", label: "Últimas 24 h" },
  { value: "3", label: "Últimos 3 días" },
  { value: "7", label: "Última semana" },
  { value: "14", label: "Últimas 2 semanas" },
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
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function csv(params: URLSearchParams, key: string): string[] {
  return params.get(key)?.split(",").map((v) => v.trim()).filter(Boolean) ?? [];
}

export function EmpleosClient({ skills, defaultSkills, sources }: Props) {
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
  const [sort, setSort] = useState(() =>
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
  const [view, setView] = useState<View>(() =>
    searchParams.get("vista") === "grid" ? "grid" : "list"
  );

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

  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [searching, setSearching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Collapsed on phones so the filter groups don't push every listing off the
  // first screen. From `md` up the panel is always open, because there the
  // sidebar sits beside the results rather than above them.
  const [filtersOpen, setFiltersOpen] = useState(false);

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
  }, [selectedSkills, selectedModes, selectedSeniority, selectedSources, days, location, sort, page, perPage]);

  /**
   * The address bar carries the view too, so a shared link reproduces what the
   * sender was looking at. It is kept out of `query` because it changes nothing
   * the server computes — putting it there would re-run the search to rearrange
   * cards the browser already has.
   */
  const url = useMemo(() => {
    const params = new URLSearchParams(query);
    // The API spells it perPage; the address bar is in Spanish like the rest of
    // the interface.
    const perPageParam = params.get("perPage");
    if (perPageParam) {
      params.delete("perPage");
      params.set("porPagina", perPageParam);
    }
    if (view === "grid") params.set("vista", "grid");
    return params.toString();
  }, [query, view]);

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

  // Separate from the search: the view lives in the URL but changes nothing the
  // server computes, so writing the address bar has to be able to happen
  // without a request going out.
  useEffect(() => {
    router.replace(url ? `/empleos?${url}` : "/empleos", { scroll: false });
  }, [url, router]);

  const activeSkills = selectedSkills.length > 0 ? selectedSkills : defaultSkills;

  /**
   * Every applied filter, as data. This is the part that makes the panel
   * legible: the sidebar shows what you *could* pick, and this row shows what
   * you *did*, without scrolling back up to count ticked chips.
   *
   * It deliberately holds no callbacks. Closing over the handlers would pull
   * six functions that are rebuilt every render into the dependency list, so
   * the memo would recompute every render and buy nothing — and leaving them
   * out is the stale-closure bug the lint rule is warning about. Describing the
   * filter and letting `removeChip` act on it sidesteps both.
   */
  const applied = useMemo<AppliedChip[]>(() => {
    const chips: AppliedChip[] = [];

    for (const value of selectedSkills) {
      chips.push({ key: `skill:${value}`, label: value, kind: "skill", value });
    }
    for (const value of selectedSeniority) {
      chips.push({
        key: `sen:${value}`,
        label: SENIORITY_FILTER_LABELS[value],
        kind: "seniority",
        value,
      });
    }
    for (const value of selectedModes) {
      chips.push({
        key: `mode:${value}`,
        label: WORK_MODE_LABELS[value],
        kind: "mode",
        value,
      });
    }
    for (const value of selectedSources) {
      chips.push({
        key: `src:${value}`,
        label: sourceLabel(value),
        kind: "source",
        value,
      });
    }
    if (days) {
      const range = DATE_RANGES.find((r) => r.value === days);
      chips.push({
        key: "days",
        label: range?.label ?? `${days} días`,
        kind: "days",
      });
    }
    if (location.trim()) {
      chips.push({ key: "loc", label: location.trim(), kind: "location" });
    }

    return chips;
  }, [selectedSkills, selectedSeniority, selectedModes, selectedSources, days, location]);

  function removeChip(chip: AppliedChip) {
    switch (chip.kind) {
      case "skill":
        return toggleSkill(chip.value);
      case "seniority":
        return toggleSeniority(chip.value);
      case "mode":
        return toggleMode(chip.value);
      case "source":
        return toggleSource(chip.value);
      case "days":
        return changeDays("");
      case "location":
        return changeLocation("");
    }
  }

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

  return (
    // The results come first in the DOM so the page's <h1> precedes the
    // sidebar's <h2> — the outline a screen reader reads has to start at the
    // page's own heading. `order` puts the sidebar back on the left visually.
    <div className="flex flex-col gap-8 md:flex-row md:gap-10">
      <section aria-busy={searching} className="order-2 min-w-0 flex-1">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">
              {searching ? "Buscando…" : `${total} ${total === 1 ? "oferta" : "ofertas"}`}
            </h1>
            <p className="mt-1 text-sm text-muted">
              Según tus skills: {activeSkills.join(", ")}
              {pages > 1 && ` · página ${page} de ${pages}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <ViewToggle view={view} onChange={setView} />

            <label className="flex items-center gap-2 text-sm text-muted">
              Por página
              <select
                value={perPage}
                onChange={(e) => changePerPage(Number(e.target.value))}
                className={selectClass("w-auto")}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-muted">
              Ordenar
              <select
                value={sort}
                onChange={(e) => changeSort(e.target.value)}
                className={selectClass("w-auto min-w-36")}
              >
                <option value="relevance">Relevancia</option>
                <option value="date">Más recientes</option>
              </select>
            </label>
          </div>
        </div>

        {/* Status feedback sits with the thing it describes, rather than as a
            separate spinner: with the 500ms debounce there is otherwise a gap
            where a filter has been ticked and nothing on screen has moved. */}
        <div className="mb-5">
          <ProgressBar active={searching} />
        </div>

        {applied.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {applied.map((chip) => (
              <button
                key={chip.key}
                onClick={() => removeChip(chip)}
                className="motion-fade inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-sm text-accent transition hover:opacity-80 active:scale-95"
              >
                {chip.label}
                <span aria-hidden="true" className="text-base leading-none">
                  ×
                </span>
                <span className="sr-only">Quitar filtro</span>
              </button>
            ))}
            <button
              onClick={clearFilters}
              className="min-h-9 px-2 text-sm text-muted underline hover:text-foreground"
            >
              Limpiar todo
            </button>
          </div>
        )}

        {/* The banners and the empty state announce through one polite region:
            results land 500ms after the last click, so without it nothing
            about the change reaches a screen reader. */}
        <div aria-live="polite">
          {error && <Banner tone="danger" className="mb-5">{error}</Banner>}
          {notice && <Banner tone="warning" className="mb-5">{notice}</Banner>}

          {/* The empty state is a real branch, not the absence of one: a list
              that renders nothing is indistinguishable from a request that
              never fired. */}
          {!searching && !error && !notice && jobs.length === 0 && hasSearched && (
            <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
              <p className="font-medium">Ninguna oferta encaja</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                {applied.length > 0
                  ? "Prueba a quitar algún filtro o a ampliar el rango de fechas."
                  : "Prueba con otras skills, o espera a la próxima pasada del worker."}
              </p>
              {applied.length > 0 && (
                <Button variant="outline" onClick={clearFilters} className="mt-6">
                  Limpiar filtros
                </Button>
              )}
            </div>
          )}
        </div>

        {searching && jobs.length === 0 ? (
          <div className={view === "grid" ? GRID_CLASS : "space-y-3"}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-line bg-surface p-5">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="mt-3 h-4 w-1/3" />
                <div className="mt-4 flex gap-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-14" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Keyed on the query so a new result set remounts and the entrance
          // replays. Without it React reuses the same <li> nodes and the list
          // swaps contents with no sign that anything changed.
          <ul
            key={query}
            className={cx(
              view === "grid" ? GRID_CLASS : "space-y-3",
              searching && "opacity-60 transition-opacity"
            )}
          >
            {jobs.map((job, i) => (
              <JobCard
                key={`${job.source}-${job.url}-${i}`}
                job={job}
                index={i}
                view={view}
              />
            ))}
          </ul>
        )}

        {pages > 1 && (
          <Pagination page={page} pages={pages} onChange={setPage} />
        )}
      </section>

      <aside className="order-1 w-full shrink-0 md:w-72">
        <div className="flex items-center justify-between gap-3 border-b border-line pb-3 md:border-0 md:pb-0">
          <h2 className="font-medium">
            Filtros
            {applied.length > 0 && (
              <span className="ml-1.5 font-normal text-muted">({applied.length})</span>
            )}
          </h2>

          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="panel-filtros"
            className="min-h-11 px-2 text-sm text-accent underline md:hidden"
          >
            {filtersOpen ? "Ocultar" : "Mostrar"}
          </button>
        </div>

        <div
          id="panel-filtros"
          className={cx(filtersOpen ? "block" : "hidden", "mt-5 space-y-6 md:block")}
        >
          <FilterGroup
            title="Mis skills"
            hint={`Ninguna marcada = tus ${defaultSkills.length} con más experiencia`}
          >
            <ChipRow>
              {skills.map((skill) => (
                <Toggle
                  key={skill}
                  label={skill}
                  checked={selectedSkills.includes(skill)}
                  onChange={() => toggleSkill(skill)}
                />
              ))}
            </ChipRow>
          </FilterGroup>

          <FilterGroup title="Nivel">
            <ChipRow>
              {SENIORITIES.map((level) => (
                <Toggle
                  key={level}
                  label={SENIORITY_FILTER_LABELS[level]}
                  checked={selectedSeniority.includes(level)}
                  onChange={() => toggleSeniority(level)}
                />
              ))}
            </ChipRow>
          </FilterGroup>

          <FilterGroup
            title="Modalidad"
            hint="Las ofertas que no lo indican salen siempre"
          >
            <ChipRow>
              {WORK_MODES.map((mode) => (
                <Toggle
                  key={mode}
                  label={WORK_MODE_LABELS[mode]}
                  checked={selectedModes.includes(mode)}
                  onChange={() => toggleMode(mode)}
                />
              ))}
            </ChipRow>
          </FilterGroup>

          <FilterGroup title="Publicado">
            <select
              aria-label="Publicado"
              value={days}
              onChange={(e) => changeDays(e.target.value)}
              className={selectClass()}
            >
              {DATE_RANGES.map((range) => (
                <option key={range.value} value={range.value}>
                  {range.label}
                </option>
              ))}
            </select>
          </FilterGroup>

          <FilterGroup title="Ubicación">
            <input
              type="text"
              aria-label="Ubicación"
              value={location}
              placeholder="Madrid, Barcelona…"
              onChange={(e) => changeLocation(e.target.value)}
              className={inputClass()}
            />
          </FilterGroup>

          {sources.length > 0 && (
            <FilterGroup title="Fuente">
              <ChipRow>
                {sources.map((source) => (
                  <Toggle
                    key={source}
                    label={sourceLabel(source)}
                    checked={selectedSources.includes(source)}
                    onChange={() => toggleSource(source)}
                  />
                ))}
              </ChipRow>
            </FilterGroup>
          )}
        </div>
      </aside>
    </div>
  );
}

function FilterGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      {/* The visible heading is the <p>; the legend repeats it for the
          accessibility tree, where a fieldset without one is just a box. */}
      <legend className="sr-only">{title}</legend>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </fieldset>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

/**
 * Two columns, not three: the sidebar takes 288px out of a 1152px page, so a
 * third column would leave each card around 265px — narrower than most job
 * titles need to avoid wrapping to three lines.
 */
const GRID_CLASS = "grid gap-3 sm:grid-cols-2";

function ViewToggle({
  view,
  onChange,
}: {
  view: View;
  onChange: (view: View) => void;
}) {
  const options: { value: View; label: string; icon: string }[] = [
    { value: "list", label: "Lista", icon: "☰" },
    { value: "grid", label: "Cuadrícula", icon: "▦" },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Vista"
      className="inline-flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={view === option.value}
          title={option.label}
          onClick={() => onChange(option.value)}
          className={cx(
            "grid size-8 place-items-center rounded-full text-sm transition active:scale-95",
            view === option.value
              ? "bg-accent text-accent-contrast"
              : "text-muted hover:bg-chip hover:text-foreground"
          )}
        >
          <span aria-hidden="true">{option.icon}</span>
          <span className="sr-only">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

/** How many numbered pages flank the current one before the list collapses to
 * an ellipsis. Seven slots is what fits on a phone without wrapping. */
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
    <nav aria-label="Paginación" className="mt-8 flex flex-wrap items-center justify-center gap-1">
      <button
        onClick={() => go(page - 1)}
        disabled={page === 1}
        className="min-h-9 rounded-lg px-3 text-sm text-muted transition hover:bg-chip hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
      >
        Anterior
      </button>

      {pageList(page, pages).map((entry, i) =>
        entry === "gap" ? (
          <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-sm text-muted">
            …
          </span>
        ) : (
          <button
            key={entry}
            onClick={() => go(entry)}
            aria-current={entry === page ? "page" : undefined}
            className={cx(
              "min-h-9 min-w-9 rounded-lg px-2 text-sm transition active:scale-95",
              entry === page
                ? "bg-accent font-medium text-accent-contrast"
                : "text-muted hover:bg-chip hover:text-foreground"
            )}
          >
            {entry}
          </button>
        )
      )}

      <button
        onClick={() => go(page + 1)}
        disabled={page === pages}
        className="min-h-9 rounded-lg px-3 text-sm text-muted transition hover:bg-chip hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
      >
        Siguiente
      </button>
    </nav>
  );
}

/** Cards past this one appear together. Staggering the whole list would mean
 * the last of sixty arrives two seconds late, and nobody should wait on an
 * animation to read a result that is already loaded. */
const STAGGER_LIMIT = 8;
const STAGGER_STEP_MS = 35;

function JobCard({
  job,
  index,
  view,
}: {
  job: Job;
  index: number;
  view: View;
}) {
  const age = relativeDate(job.postedAt);
  const grid = view === "grid";

  return (
    <li
      style={{
        animationDelay: `${Math.min(index, STAGGER_LIMIT) * STAGGER_STEP_MS}ms`,
      }}
      className={cx(
        "motion-rise rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md",
        // Grid cards stretch to the tallest in their row, so the badges are
        // pinned to the bottom with mt-auto and the column has to be a flex
        // one for that to mean anything.
        grid ? "flex flex-col p-4" : "p-5"
      )}
    >
      <h3
        className={cx(
          "text-base font-medium leading-snug",
          // Two lines in a 400px column is roughly 70 characters, which most
          // titles fit; the rest are readable enough truncated, and a card that
          // grows to five lines wrecks the row it sits in.
          grid && "line-clamp-2"
        )}
      >
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          // The whole card is not a link on purpose: a card-sized target makes
          // the text inside it unselectable, and copying a job title is a thing
          // people do.
          className="underline-offset-4 hover:underline"
        >
          {job.title}
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
      </h3>

      {(job.company || job.location) && (
        <p className={cx("mt-1 text-sm text-muted", grid && "line-clamp-1")}>
          {job.company}
          {job.company && job.location && " · "}
          {job.location}
        </p>
      )}

      {/* Metadata as separate badges rather than one dot-separated sentence:
          five values joined by "·" read as prose and scan as noise. */}
      <div className={cx("flex flex-wrap items-center gap-1.5", grid ? "mt-auto pt-3" : "mt-3")}>
        {job.seniority && <Badge tone="accent">{SENIORITY_LABELS[job.seniority]}</Badge>}
        {job.workMode && <Badge>{WORK_MODE_LABELS[job.workMode]}</Badge>}
        {age && <Badge>{age}</Badge>}
        <Badge>{sourceLabel(job.source)}</Badge>
      </div>

      {!grid && job.matchedSkills && job.matchedSkills.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
          <span className="mr-0.5 text-xs text-muted">Encaja por</span>
          {job.matchedSkills.map((skill) => (
            <Badge key={skill}>{skill}</Badge>
          ))}
        </div>
      )}
    </li>
  );
}
