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
  FitGauge,
  ProgressBar,
  Skeleton,
  Toggle,
  cx,
  inputClass,
  selectClass,
} from "@/components/ui";
import { DEFAULT_PER_PAGE, PAGE_SIZES } from "@/lib/jobQuery";
import { FitPanel } from "./FitPanel";
import type { WorkMode } from "@/lib/jobSources/types";
import type { Seniority } from "@/lib/seniority";

type SeniorityFilter = Seniority | "unspecified";
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

const WORK_MODES: WorkMode[] = ["remote", "hybrid", "onsite"];
const SENIORITIES: SeniorityFilter[] = ["junior", "mid", "senior", "unspecified"];

const SENIORITY_FILTER_LABELS: Record<SeniorityFilter, string> = {
  ...SENIORITY_LABELS,
  unspecified: "sin especificar",
};

const DATE_RANGES = [
  { value: "", label: "cualquier fecha" },
  { value: "1", label: "últimas 24 h" },
  { value: "3", label: "últimos 3 días" },
  { value: "7", label: "última semana" },
  { value: "14", label: "últimas 2 semanas" },
] as const;

/**
 * Filters are applied as you tick them, but the request is held back until you
 * stop: ticking five chips is one search, not five. The search endpoint allows
 * 60 an hour per user, which a request per keystroke would burn through in a
 * couple of minutes of ordinary filtering.
 */
const DEBOUNCE_MS = 500;

/** Two columns, not three: at the page's max width a third would leave each
 * cell around 300px, narrower than most job titles need. */
const GRID_CLASS = "grid gap-px sm:grid-cols-2";

/** The column geometry, written once so the headings and every row cannot
 * drift apart — which is the whole premise of reading down a column. */
const ROW_COLUMNS = "md:grid-cols-[5rem_1fr_7rem_6rem_4.5rem] md:gap-4";

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

  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [searching, setSearching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  /** The conditions block always shows what is applied; the controls that
   * change it stay folded until asked for. */
  const [editing, setEditing] = useState(false);

  /**
   * Which listing has its description open, as `source:externalId`.
   *
   * One at a time: the panel is tall, and two open rows push everything else
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

  /**
   * The address bar carries the view too, so a shared link reproduces what the
   * sender was looking at. It is kept out of `query` because it changes nothing
   * the server computes — putting it there would re-run the search to
   * rearrange rows the browser already has.
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
      chips.push({ key: "days", label: range?.label ?? `${days} días`, kind: "days" });
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

  /** The conditions the numbers below were measured under. Unset rows are kept
   * rather than hidden: an empty field on a sheet is information too. */
  const conditions: { label: string; value: string; unset: boolean }[] = [
    {
      label: "skills",
      value: activeSkills.join(" · "),
      unset: selectedSkills.length === 0,
    },
    {
      label: "nivel",
      value:
        selectedSeniority.map((s) => SENIORITY_FILTER_LABELS[s]).join(", ") ||
        "cualquiera",
      unset: selectedSeniority.length === 0,
    },
    {
      label: "modalidad",
      value: selectedModes.map((m) => WORK_MODE_LABELS[m]).join(", ") || "cualquiera",
      unset: selectedModes.length === 0,
    },
    {
      label: "publicado",
      value: DATE_RANGES.find((r) => r.value === days)?.label ?? "cualquier fecha",
      unset: !days,
    },
    {
      label: "ubicación",
      value: location.trim() || "cualquiera",
      unset: !location.trim(),
    },
    {
      label: "fuente",
      value: selectedSources.map(sourceLabel).join(", ") || "todas",
      unset: selectedSources.length === 0,
    },
  ];

  return (
    <div>
      <section className="border-y border-pauta-fuerte">
        <div className="flex items-start justify-between gap-4 py-3">
          <h1 className="rotulo pt-1">Buscando con</h1>
          <button
            onClick={() => setEditing((open) => !open)}
            aria-expanded={editing}
            aria-controls="panel-filtros"
            className="rotulo min-h-9 shrink-0 px-2 underline underline-offset-4 hover:text-tinta"
          >
            {editing ? "Cerrar" : "Cambiar"}
          </button>
        </div>

        <dl className="grid gap-x-6 gap-y-1.5 pb-4 sm:grid-cols-2">
          {conditions.map((row) => (
            <div key={row.label} className="flex gap-3">
              <dt className="rotulo w-24 shrink-0 pt-0.5">{row.label}</dt>
              <dd
                className={cx(
                  "valor min-w-0 flex-1 text-sm",
                  row.unset ? "text-tinta-2" : "text-tinta"
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <div
          id="panel-filtros"
          className={cx(
            editing ? "block" : "hidden",
            "motion-fade border-t border-pauta py-5"
          )}
        >
          <div className="grid gap-6 md:grid-cols-2">
            <FilterGroup
              label="skills"
              hint={`sin marcar = tus ${defaultSkills.length} con más experiencia`}
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

            <div className="space-y-6">
              <FilterGroup label="nivel">
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
                label="modalidad"
                hint="las ofertas que no lo indican salen siempre"
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

              {sources.length > 0 && (
                <FilterGroup label="fuente">
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

              <div className="grid gap-4 sm:grid-cols-2">
                <FilterGroup label="publicado">
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

                <FilterGroup label="ubicación">
                  <input
                    type="text"
                    aria-label="Ubicación"
                    value={location}
                    placeholder="Madrid, Barcelona…"
                    onChange={(e) => changeLocation(e.target.value)}
                    className={inputClass()}
                  />
                </FilterGroup>
              </div>
            </div>
          </div>

          {applied.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-1.5 border-t border-pauta pt-4">
              {applied.map((chip) => (
                <button
                  key={chip.key}
                  onClick={() => removeChip(chip)}
                  className="motion-fade inline-flex min-h-9 items-center gap-1.5 rounded-sm border border-pauta-fuerte px-2.5 font-mono text-sm transition hover:bg-pauta active:scale-95"
                >
                  {chip.label}
                  <span aria-hidden="true" className="text-tinta-2">
                    ×
                  </span>
                  <span className="sr-only">Quitar filtro</span>
                </button>
              ))}
              <button
                onClick={clearFilters}
                className="rotulo min-h-9 px-2 underline underline-offset-4 hover:text-tinta"
              >
                Limpiar todo
              </button>
            </div>
          )}
        </div>
      </section>

      <div aria-busy={searching}>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
          <p className="display text-xl">
            {searching ? (
              <span className="text-tinta-2">Midiendo…</span>
            ) : (
              <>
                {total} {total === 1 ? "oferta" : "ofertas"}
                {pages > 1 && (
                  <span className="valor ml-3 text-sm font-normal text-tinta-2">
                    pág. {page}/{pages}
                  </span>
                )}
              </>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <ViewToggle view={view} onChange={setView} />

            <label className="rotulo flex items-center gap-2">
              por pág.
              <select
                value={perPage}
                onChange={(e) => changePerPage(Number(e.target.value))}
                className={selectClass("min-h-9 w-auto py-1")}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>

            <label className="rotulo flex items-center gap-2">
              orden
              <select
                value={sort}
                onChange={(e) => changeSort(e.target.value)}
                className={selectClass("min-h-9 w-auto py-1")}
              >
                <option value="relevance">encaje</option>
                <option value="date">fecha</option>
              </select>
            </label>
          </div>
        </div>

        <ProgressBar active={searching} />

        {/* The banners and the empty state announce through one polite region:
            results land 500ms after the last click, so without it nothing about
            the change reaches a screen reader. */}
        <div aria-live="polite">
          {error && (
            <Banner tone="danger" className="mt-5">
              {error}
            </Banner>
          )}
          {notice && (
            <Banner tone="warning" className="mt-5">
              {notice}
            </Banner>
          )}

          {/* The empty state is a real branch, not the absence of one: a list
              that renders nothing is indistinguishable from a request that
              never fired. */}
          {!searching && !error && !notice && jobs.length === 0 && hasSearched && (
            <div className="mt-5 border border-dashed border-pauta-fuerte px-6 py-14 text-center">
              <p className="display text-lg">Ninguna oferta encaja</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-tinta-2">
                {applied.length > 0
                  ? "Quita algún filtro o amplía el rango de fechas."
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

        {view === "list" && (jobs.length > 0 || searching) && <ColumnHeadings />}

        {searching && jobs.length === 0 ? (
          <div className={view === "grid" ? GRID_CLASS : "divide-y divide-pauta"}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-4 py-4">
                <Skeleton className="h-4 w-16 shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
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
              view === "grid"
                ? cx(GRID_CLASS, "bg-pauta-fuerte")
                : "divide-y divide-pauta border-b border-pauta",
              searching && "opacity-55 transition-opacity"
            )}
          >
            {jobs.map((job, i) => (
              <JobRow
                key={`${job.source}-${job.url}-${i}`}
                job={job}
                index={i}
                view={view}
                skills={activeSkills}
                yearsExp={yearsExp}
                open={openJob === jobKey(job)}
                onToggle={() =>
                  setOpenJob((current) =>
                    current === jobKey(job) ? null : jobKey(job)
                  )
                }
              />
            ))}
          </ul>
        )}

        {pages > 1 && <Pagination page={page} pages={pages} onChange={setPage} />}

        {jobs.length > 0 && <GaugeLegend />}
      </div>
    </div>
  );
}

/* ── Sheet parts ────────────────────────────────────────────────────────── */

function FilterGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      {/* The visible heading is the <p>; the legend repeats it for the
          accessibility tree, where a fieldset without one is just a box. */}
      <legend className="sr-only">{label}</legend>
      <p className="rotulo">{label}</p>
      {hint && <p className="mt-1 text-xs text-tinta-2">{hint}</p>}
      <div className="mt-2">{children}</div>
    </fieldset>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

/** The column names, printed once. Hidden below `md`, where each row folds
 * into its own label/value pairs and repeating them would be noise. */
function ColumnHeadings() {
  return (
    <div className={cx("hidden border-b border-pauta-fuerte pb-1.5 md:grid", ROW_COLUMNS)}>
      <span className="rotulo">encaje</span>
      <span className="rotulo">puesto</span>
      <span className="rotulo">nivel</span>
      <span className="rotulo">modalidad</span>
      <span className="rotulo text-right">public.</span>
    </div>
  );
}

/** Rows past this one appear together. Staggering the whole list would mean
 * the last of ninety-six arrives seconds late, and nobody should wait on an
 * animation to read a result that is already loaded. */
const STAGGER_LIMIT = 8;
const STAGGER_STEP_MS = 30;

/** Identifies a listing across renders and to /api/jobs/fit. */
function jobKey(job: Job): string {
  return `${job.source}:${job.externalId}`;
}

function JobRow({
  job,
  index,
  view,
  skills,
  yearsExp,
  open,
  onToggle,
}: {
  job: Job;
  index: number;
  view: View;
  skills: string[];
  yearsExp: number | null;
  open: boolean;
  onToggle: () => void;
}) {
  const age = relativeDate(job.postedAt);
  const delay = `${Math.min(index, STAGGER_LIMIT) * STAGGER_STEP_MS}ms`;
  const panelId = `detalle-${jobKey(job).replace(/[^a-zA-Z0-9-]/g, "-")}`;

  /**
   * The row's own control, separate from the title link. The title goes to the
   * job board; this opens what the listing says without leaving the page,
   * which is the difference between judging an offer and visiting twenty tabs
   * to judge them.
   */
  const disclosure = (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={panelId}
      className="valor inline-flex items-center gap-1.5 text-xs text-tinta-2 underline-offset-4 transition hover:text-marca hover:underline"
    >
      <span aria-hidden="true" className={cx("transition-transform", open && "rotate-90")}>
        ›
      </span>
      {open ? "Ocultar" : "Ver qué pide"}
    </button>
  );

  const panel = open ? (
    <div id={panelId}>
      <FitPanel job={job} yearsExp={yearsExp} />
    </div>
  ) : null;

  const title = (
    <a
      href={job.url}
      target="_blank"
      rel="noopener noreferrer"
      // The whole row is not a link on purpose: a row-sized target makes the
      // text inside it unselectable, and copying a job title is a thing people
      // do.
      className="text-marca underline-offset-4 hover:underline"
    >
      {job.title}
      <span className="sr-only"> (se abre en otra pestaña)</span>
    </a>
  );

  const gauge = (
    <FitGauge
      skills={skills}
      matched={job.matchedSkills ?? []}
      inTitle={job.titleSkills ?? []}
    />
  );

  if (view === "grid") {
    return (
      <li
        style={{ animationDelay: delay }}
        className="motion-rise flex flex-col gap-3 bg-papel p-4 transition hover:bg-pauta/40"
      >
        <h3 className="display line-clamp-2 text-[0.95rem] leading-snug">{title}</h3>
        <p className="valor text-sm text-tinta-2">
          {job.company}
          {job.company && job.location && " · "}
          {job.location}
        </p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-1">
          {gauge}
          <div className="flex flex-wrap justify-end gap-1">
            {job.seniority && <Badge>{SENIORITY_LABELS[job.seniority]}</Badge>}
            {job.workMode && <Badge>{WORK_MODE_LABELS[job.workMode]}</Badge>}
            {age && <Badge>{age}</Badge>}
          </div>
        </div>
        {disclosure}
        {panel}
      </li>
    );
  }

  return (
    <li
      style={{ animationDelay: delay }}
      className={cx(
        "motion-rise py-4 transition hover:bg-pauta/40 md:grid md:items-start",
        ROW_COLUMNS
      )}
    >
      <div className="mb-3 md:mb-0">{gauge}</div>

      <div className="min-w-0">
        <h3 className="display text-[0.95rem] leading-snug">{title}</h3>
        <p className="valor mt-1 text-sm text-tinta-2">
          {job.company}
          {job.company && job.location && " · "}
          {job.location}
          {` · ${sourceLabel(job.source)}`}
        </p>
        <div className="mt-2">{disclosure}</div>
      </div>

      {/* Below md the columns fold into their own labelled pairs, which is how
          a datasheet reads on a narrow page anyway. */}
      <Cell label="nivel">{job.seniority ? SENIORITY_LABELS[job.seniority] : "—"}</Cell>
      <Cell label="modalidad">{job.workMode ? WORK_MODE_LABELS[job.workMode] : "—"}</Cell>
      <Cell label="publicado" align="right">
        {age ?? "—"}
      </Cell>

      {/* Spans every column: the description is the row's content, not one of
          its fields, so confining it to the title column would set it in a
          third of the width for no reason. */}
      {panel && <div className="md:col-span-full">{panel}</div>}
    </li>
  );
}

function Cell({
  label,
  align = "left",
  children,
}: {
  label: string;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <div className="mt-1.5 flex gap-3 md:mt-0 md:block">
      <span className="rotulo w-24 shrink-0 md:hidden">{label}</span>
      <span
        className={cx(
          "valor text-sm text-tinta-2",
          align === "right" && "md:block md:text-right"
        )}
      >
        {children}
      </span>
    </div>
  );
}

/** Printed once under the results, the way a datasheet explains its own
 * notation rather than leaving the reader to infer it. */
function GaugeLegend() {
  const keys = [
    { fill: "bg-medida", label: "en el título" },
    {
      fill: "bg-[linear-gradient(to_top,var(--medida)_50%,var(--pauta)_50%)]",
      label: "en la descripción",
    },
    { fill: "bg-pauta", label: "no aparece" },
  ];

  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-pauta pt-4">
      <span className="rotulo">encaje</span>
      {keys.map((key) => (
        <span key={key.label} className="flex items-center gap-2 text-xs text-tinta-2">
          <span aria-hidden="true" className={cx("h-3 w-2", key.fill)} />
          {key.label}
        </span>
      ))}
      <span className="text-xs text-tinta-2">una casilla por skill buscada</span>
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  const options: { value: View; label: string; icon: string }[] = [
    { value: "list", label: "Lista", icon: "▤" },
    { value: "grid", label: "Cuadrícula", icon: "▦" },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Vista"
      className="inline-flex items-center border border-pauta-fuerte"
    >
      {options.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={view === option.value}
          title={option.label}
          onClick={() => onChange(option.value)}
          className={cx(
            "grid size-8 place-items-center text-sm transition",
            view === option.value
              ? "bg-marca text-papel"
              : "text-tinta-2 hover:bg-pauta hover:text-tinta"
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
        className="rotulo min-h-9 px-3 hover:text-tinta disabled:opacity-35"
      >
        Anterior
      </button>

      {pageList(page, pages).map((entry, i) =>
        entry === "gap" ? (
          <span
            key={`gap-${i}`}
            aria-hidden="true"
            className="valor px-1 text-sm text-tinta-2"
          >
            …
          </span>
        ) : (
          <button
            key={entry}
            onClick={() => go(entry)}
            aria-current={entry === page ? "page" : undefined}
            className={cx(
              "valor min-h-9 min-w-9 px-2 text-sm transition active:scale-95",
              entry === page
                ? "bg-marca text-papel"
                : "text-tinta-2 hover:bg-pauta hover:text-tinta"
            )}
          >
            {entry}
          </button>
        )
      )}

      <button
        onClick={() => go(page + 1)}
        disabled={page === pages}
        className="rotulo min-h-9 px-3 hover:text-tinta disabled:opacity-35"
      >
        Siguiente
      </button>
    </nav>
  );
}
