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
  Skeleton,
  Toggle,
  cx,
  selectClass,
  inputClass,
} from "@/components/ui";
import type { WorkMode } from "@/lib/jobSources/types";
import type { Seniority } from "@/lib/seniority";

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

  const [jobs, setJobs] = useState<Job[]>([]);
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
    return params.toString();
  }, [selectedSkills, selectedModes, selectedSeniority, selectedSources, days, location, sort]);

  const runSearch = useCallback(async (qs: string, signal: AbortSignal) => {
    setSearching(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/search?${qs}`, { signal });
      const data = await readJson(res);

      if (!res.ok) {
        setError(errorMessage(data, "Error buscando empleos"));
        setJobs([]);
        setNotice(null);
        return;
      }

      setJobs(data.jobs ?? []);
      setNotice(typeof data.notice === "string" ? data.notice : null);
    } catch (err) {
      // An aborted request is the previous search being superseded, not a
      // failure — surfacing it would flash an error on every filter change.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("No se pudo contactar con el servidor");
      setJobs([]);
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
      router.replace(query ? `/empleos?${query}` : "/empleos", { scroll: false });
      runSearch(query, controller.signal);
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, router, runSearch]);

  const activeSkills = selectedSkills.length > 0 ? selectedSkills : defaultSkills;

  /**
   * Every applied filter as a removable chip. This is the part that makes the
   * panel legible: the sidebar shows what you *could* pick, and this row shows
   * what you *did*, without scrolling back up to count ticked boxes.
   */
  const applied = useMemo(() => {
    const chips: { key: string; label: string; remove: () => void }[] = [];

    for (const skill of selectedSkills) {
      chips.push({
        key: `skill:${skill}`,
        label: skill,
        remove: () => setSelectedSkills((prev) => prev.filter((s) => s !== skill)),
      });
    }
    for (const level of selectedSeniority) {
      chips.push({
        key: `sen:${level}`,
        label: SENIORITY_FILTER_LABELS[level],
        remove: () => setSelectedSeniority((prev) => prev.filter((s) => s !== level)),
      });
    }
    for (const mode of selectedModes) {
      chips.push({
        key: `mode:${mode}`,
        label: WORK_MODE_LABELS[mode],
        remove: () => setSelectedModes((prev) => prev.filter((m) => m !== mode)),
      });
    }
    for (const source of selectedSources) {
      chips.push({
        key: `src:${source}`,
        label: sourceLabel(source),
        remove: () => setSelectedSources((prev) => prev.filter((s) => s !== source)),
      });
    }
    if (days) {
      const range = DATE_RANGES.find((r) => r.value === days);
      chips.push({
        key: "days",
        label: range?.label ?? `${days} días`,
        remove: () => setDays(""),
      });
    }
    if (location.trim()) {
      chips.push({
        key: "loc",
        label: location.trim(),
        remove: () => setLocation(""),
      });
    }

    return chips;
  }, [selectedSkills, selectedSeniority, selectedModes, selectedSources, days, location]);

  function clearFilters() {
    setSelectedSkills([]);
    setSelectedModes([]);
    setSelectedSeniority([]);
    setSelectedSources([]);
    setDays("");
    setLocation("");
    setSort("relevance");
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
              {searching ? "Buscando…" : `${jobs.length} ofertas`}
            </h1>
            <p className="mt-1 text-sm text-muted">
              Según tus skills: {activeSkills.join(", ")}
            </p>
          </div>

          <label className="flex shrink-0 items-center gap-2 text-sm text-muted">
            Ordenar
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className={selectClass("w-auto min-w-36")}
            >
              <option value="relevance">Relevancia</option>
              <option value="date">Más recientes</option>
            </select>
          </label>
        </div>

        {applied.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {applied.map((chip) => (
              <button
                key={chip.key}
                onClick={chip.remove}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-sm text-accent transition hover:opacity-80"
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
          <div className="space-y-3">
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
          <ul className={cx("space-y-3", searching && "opacity-60 transition-opacity")}>
            {jobs.map((job, i) => (
              <JobCard key={`${job.source}-${job.url}-${i}`} job={job} />
            ))}
          </ul>
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
                  onChange={() => setSelectedSkills((prev) => toggle(prev, skill))}
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
                  onChange={() => setSelectedSeniority((prev) => toggle(prev, level))}
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
                  onChange={() => setSelectedModes((prev) => toggle(prev, mode))}
                />
              ))}
            </ChipRow>
          </FilterGroup>

          <FilterGroup title="Publicado">
            <select
              aria-label="Publicado"
              value={days}
              onChange={(e) => setDays(e.target.value)}
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
              onChange={(e) => setLocation(e.target.value)}
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
                    onChange={() => setSelectedSources((prev) => toggle(prev, source))}
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

function JobCard({ job }: { job: Job }) {
  const age = relativeDate(job.postedAt);

  return (
    <li className="group rounded-2xl border border-line bg-surface p-5 transition hover:border-line-strong hover:shadow-md">
      <h3 className="text-base font-medium leading-snug">
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
        <p className="mt-1 text-sm text-muted">
          {job.company}
          {job.company && job.location && " · "}
          {job.location}
        </p>
      )}

      {/* Metadata as separate badges rather than one dot-separated sentence:
          five values joined by "·" read as prose and scan as noise. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {job.seniority && <Badge tone="accent">{SENIORITY_LABELS[job.seniority]}</Badge>}
        {job.workMode && <Badge>{WORK_MODE_LABELS[job.workMode]}</Badge>}
        {age && <Badge>{age}</Badge>}
        <Badge>{sourceLabel(job.source)}</Badge>
      </div>

      {job.matchedSkills && job.matchedSkills.length > 0 && (
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
