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
 * stop: ticking five boxes is one search, not five. The search endpoint allows
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
  const [selectedModes, setSelectedModes] = useState<WorkMode[]>(
    () => csv(searchParams, "modes").filter((m): m is WorkMode =>
      WORK_MODES.includes(m as WorkMode)
    )
  );
  const [selectedSeniority, setSelectedSeniority] = useState<SeniorityFilter[]>(
    () => csv(searchParams, "seniority").filter((s): s is SeniorityFilter =>
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

  // Collapsed on phones so the six filter groups don't push every listing off
  // the first screen. From `md` up the panel is always open, because there the
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

  const runSearch = useCallback(
    async (qs: string, signal: AbortSignal) => {
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
    },
    []
  );

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
  const filterCount =
    selectedModes.length +
    selectedSeniority.length +
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
  }

  return (
    // The results come first in the DOM so the page's <h1> precedes the
    // sidebar's <h2> — the outline a screen reader reads has to start at the
    // page's own heading. `order` puts the sidebar back on the left visually.
    <div className="flex flex-col gap-8 md:flex-row">
      <section aria-busy={searching} className="order-2 min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">
              {searching ? "Buscando..." : `${jobs.length} ofertas`}
            </h1>
            <p className="mt-1 text-sm text-muted">
              Buscando por: {activeSkills.join(", ")}
              {filterCount > 0 && ` · ${filterCount} filtro${filterCount > 1 ? "s" : ""}`}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            Ordenar
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-md border border-line-strong px-2 py-2 text-sm dark:bg-transparent"
            >
              <option value="relevance">Relevancia</option>
              <option value="date">Más recientes</option>
            </select>
          </label>
        </div>

        {/* The banners and the empty state announce through one polite region:
            results land 500ms after the last click, so without it nothing
            about the change reaches a screen reader. */}
        <div aria-live="polite">
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
            >
              {error}
            </p>
          )}

          {notice && (
            <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              {notice}
            </p>
          )}

          {/* The empty state is a real branch, not the absence of one: a list
              that renders nothing is indistinguishable from a request that
              never fired. */}
          {!searching && !error && jobs.length === 0 && hasSearched && !notice && (
            <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center">
              <p className="text-sm font-medium">Ninguna oferta encaja</p>
              <p className="mt-1 text-sm text-muted">
                {filterCount > 0
                  ? "Prueba a quitar filtros o a ampliar el rango de fechas."
                  : "Prueba a marcar otras skills, o espera a la próxima pasada del worker."}
              </p>
            </div>
          )}
        </div>

        <ul className="space-y-3">
          {jobs.map((job, i) => (
            <JobCard key={`${job.source}-${job.url}-${i}`} job={job} />
          ))}
        </ul>
      </section>

      <aside className="order-1 w-full shrink-0 md:w-64">
        <div className="flex items-center justify-between gap-3 border-b border-line pb-3 md:border-0 md:pb-0">
          <h2 className="font-medium">
            Filtros
            {filterCount > 0 && (
              <span className="ml-1 font-normal text-muted">
                ({filterCount})
              </span>
            )}
          </h2>

          <div className="flex items-center gap-4">
            {(filterCount > 0 || selectedSkills.length > 0) && (
              <button
                onClick={clearFilters}
                className="py-2 text-sm text-muted underline"
              >
                Limpiar
              </button>
            )}
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              aria-controls="panel-filtros"
              className="py-2 text-sm underline md:hidden"
            >
              {filtersOpen ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>

        <div
          id="panel-filtros"
          className={(filtersOpen ? "block " : "hidden ") + "mt-4 md:block"}
        >
          <FilterGroup title="Mis skills">
            <p className="mb-2 text-sm text-muted">
              Ninguna marcada = tus {defaultSkills.length} con más experiencia
            </p>
            <div className="max-h-72 overflow-y-auto pr-1">
              {skills.map((skill) => (
                <Check
                  key={skill}
                  label={skill}
                  checked={selectedSkills.includes(skill)}
                  onChange={() => setSelectedSkills((prev) => toggle(prev, skill))}
                />
              ))}
            </div>
          </FilterGroup>

          <FilterGroup title="Nivel">
            {SENIORITIES.map((level) => (
              <Check
                key={level}
                label={SENIORITY_FILTER_LABELS[level]}
                checked={selectedSeniority.includes(level)}
                onChange={() => setSelectedSeniority((prev) => toggle(prev, level))}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Publicado">
            <select
              aria-label="Publicado"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-full rounded-md border border-line-strong px-2 py-2 text-sm dark:bg-transparent"
            >
              {DATE_RANGES.map((range) => (
                <option key={range.value} value={range.value}>
                  {range.label}
                </option>
              ))}
            </select>
          </FilterGroup>

          <FilterGroup title="Modalidad">
            {WORK_MODES.map((mode) => (
              <Check
                key={mode}
                label={WORK_MODE_LABELS[mode]}
                checked={selectedModes.includes(mode)}
                onChange={() => setSelectedModes((prev) => toggle(prev, mode))}
              />
            ))}
            <p className="mt-1 text-sm text-muted">
              Las ofertas que no lo indican salen siempre
            </p>
          </FilterGroup>

          <FilterGroup title="Ubicación">
            <input
              type="text"
              aria-label="Ubicación"
              value={location}
              placeholder="Madrid, Barcelona..."
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-md border border-line-strong px-2 py-2 text-sm dark:bg-transparent"
            />
          </FilterGroup>

          {sources.length > 0 && (
            <FilterGroup title="Fuente">
              {sources.map((source) => (
                <Check
                  key={source}
                  label={sourceLabel(source)}
                  checked={selectedSources.includes(source)}
                  onChange={() => setSelectedSources((prev) => toggle(prev, source))}
                />
              ))}
            </FilterGroup>
          )}
        </div>
      </aside>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-6 border-t border-line pt-4">
      <legend className="sr-only">{title}</legend>
      <p className="mb-2 text-sm font-medium">{title}</p>
      {children}
    </fieldset>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    // min-h-11 rather than the text's own height: as a 24px row this was half
    // the 44px a finger needs, and the label is the whole hit area.
    <label className="flex min-h-11 items-center gap-2.5 text-sm">
      <input type="checkbox" checked={checked} onChange={onChange} className="size-4" />
      {/* Long skill names get clipped in a 256px sidebar, and the tooltip is
          the only way left to read the rest. */}
      <span className="truncate" title={label}>
        {label}
      </span>
    </label>
  );
}

function JobCard({ job }: { job: Job }) {
  const age = relativeDate(job.postedAt);

  return (
    <li className="rounded-lg border border-line bg-surface p-4 text-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block py-2.5 text-base font-medium text-accent underline underline-offset-2"
        >
          {job.title}
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
        {job.seniority && (
          <span className="mt-2.5 shrink-0 rounded-full border border-line px-2 py-0.5 text-xs">
            {SENIORITY_LABELS[job.seniority]}
          </span>
        )}
      </div>

      <p className="text-muted">
        {job.company}
        {job.location && ` · ${job.location}`}
        {job.workMode && ` · ${WORK_MODE_LABELS[job.workMode]}`}
        {` · vía ${sourceLabel(job.source)}`}
        {age && ` · ${age}`}
      </p>

      {job.matchedSkills && job.matchedSkills.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-1">
          <span className="mr-1 text-muted">Encaja por:</span>
          {job.matchedSkills.map((skill) => (
            <span
              key={skill}
              className="rounded-full bg-line px-2 py-0.5 text-xs"
            >
              {skill}
            </span>
          ))}
        </p>
      )}
    </li>
  );
}
