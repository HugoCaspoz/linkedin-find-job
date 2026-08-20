import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchAdzuna } from "@/lib/jobSources/adzuna";
import {
  MAX_AGE_DAYS,
  MAX_LIMIT,
  UNSPECIFIED,
  indexState,
  searchStoredJobs,
  type ScoredJob,
  type SeniorityFilter,
  type SortOrder,
} from "@/lib/jobQuery";
import { scoreJob } from "@/lib/matching";
import { detectSeniority, isSeniority } from "@/lib/seniority";
import { checkRateLimit } from "@/lib/rateLimit";
import type { WorkMode } from "@/lib/jobSources/types";

// Only Adzuna is called live, behind an 8s timeout; the scraped sources are
// read from the DB.
export const maxDuration = 15;

const VALID_MODES: WorkMode[] = ["remote", "hybrid", "onsite"];
const SEARCHES_PER_HOUR = 60;
/** How many skills feed the query when the caller doesn't pick any. */
const TOP_SKILLS = 5;
/** Ceiling on an explicit skill selection: each one becomes two regex terms in
 * the SQL, so the query grows linearly with it. */
const MAX_SELECTED_SKILLS = 12;
const ADZUNA_SOURCE = "adzuna";

function csv(params: URLSearchParams, key: string): string[] {
  return params.get(key)?.split(",").map((v) => v.trim()).filter(Boolean) ?? [];
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const limit = await checkRateLimit(
    `search:${session.user.id}`,
    SEARCHES_PER_HOUR,
    60 * 60 * 1000
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Demasiadas búsquedas seguidas. Inténtalo más tarde." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSecs) } }
    );
  }

  const { searchParams } = new URL(req.url);

  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
    include: { skills: true },
  });

  if (!profile || profile.skills.length === 0) {
    return NextResponse.json(
      { error: "Sube tu CV primero para detectar tus skills" },
      { status: 400 }
    );
  }

  const byExperience = [...profile.skills].sort(
    (a, b) => (b.yearsExp ?? 0) - (a.yearsExp ?? 0)
  );

  // A requested skill has to be one of the user's own. Not for safety — the
  // patterns are escaped before they reach Postgres — but because the feature
  // is "filter by my skills": accepting arbitrary terms would quietly turn it
  // into a free-text search whose results the scoring can't explain.
  const owned = new Map(profile.skills.map((s) => [s.name.toLowerCase(), s.name]));
  const requested = csv(searchParams, "skills")
    .map((name) => owned.get(name.toLowerCase()))
    .filter((name): name is string => name != null);

  const skills =
    requested.length > 0
      ? requested.slice(0, MAX_SELECTED_SKILLS)
      : byExperience.slice(0, TOP_SKILLS).map((s) => s.name);

  const modes = csv(searchParams, "modes").filter((m): m is WorkMode =>
    VALID_MODES.includes(m as WorkMode)
  );

  const seniorities = csv(searchParams, "seniority").filter(
    (s): s is SeniorityFilter => s === UNSPECIFIED || isSeniority(s)
  );

  const sources = csv(searchParams, "sources");

  const daysRaw = Number(searchParams.get("days"));
  const postedWithinDays =
    Number.isFinite(daysRaw) && daysRaw > 0
      ? Math.min(daysRaw, MAX_AGE_DAYS)
      : undefined;

  const location = searchParams.get("location")?.trim() || undefined;
  const sort: SortOrder = searchParams.get("sort") === "date" ? "date" : "relevance";

  const limitRaw = Number(searchParams.get("limit"));
  const pageLimit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : undefined;

  // Skipping the live call entirely when Adzuna is filtered out is not just an
  // optimization: it's the difference between a 200ms search and one that
  // waits on somebody else's API for nothing.
  const wantsAdzuna = sources.length === 0 || sources.includes(ADZUNA_SOURCE);

  const [adzunaJobs, storedJobs] = await Promise.all([
    // Adzuna treats the query as one string, and its own relevance ranking
    // handles the combination better than an AND of five terms would.
    wantsAdzuna ? searchAdzuna(skills.slice(0, 3).join(" "), modes) : Promise.resolve([]),
    searchStoredJobs({
      skills,
      modes,
      seniorities,
      sources: sources.filter((s) => s !== ADZUNA_SOURCE),
      postedWithinDays,
      location,
      sort,
      limit: pageLimit,
    }),
  ]);

  // Adzuna arrives unranked and unfiltered — it has no seniority field and no
  // date-range parameter we use — so the same rules are applied here in JS.
  // Doing it after the fetch rather than skipping the fetch is unavoidable:
  // the API can't express these filters.
  const scoredAdzuna: ScoredJob[] = adzunaJobs
    .map((job) => ({
      ...job,
      ...scoreJob(job, skills),
      seniority: detectSeniority(job.title) ?? undefined,
    }))
    .filter((job) => matchesJsFilters(job, { seniorities, postedWithinDays, location }));

  const jobs = [...scoredAdzuna, ...storedJobs].sort((a, b) => {
    if (sort === "date") {
      const byDate = (b.postedAt ?? "").localeCompare(a.postedAt ?? "");
      if (byDate !== 0) return byDate;
      return b.score - a.score;
    }
    if (b.score !== a.score) return b.score - a.score;
    // Same score: newer first, and listings with no date last.
    return (b.postedAt ?? "").localeCompare(a.postedAt ?? "");
  });

  // Adzuna results aren't persisted here: they're already a supported API, so
  // there's no reason to keep a local copy just to re-serve it.
  const response: Record<string, unknown> = {
    query: skills.join(", "),
    count: jobs.length,
    jobs,
  };

  if (storedJobs.length === 0) {
    const state = await indexState();
    if (state === "empty") {
      response.notice =
        "Todavía no hay ofertas indexadas. El worker de scraping aún no ha corrido.";
    } else if (state === "stale") {
      response.notice = `Todas las ofertas indexadas tienen más de ${MAX_AGE_DAYS} días, así que no se muestran. Vuelve a lanzar el worker de scraping.`;
    }
  }

  return NextResponse.json(response);
}

interface JsFilters {
  seniorities: SeniorityFilter[];
  postedWithinDays?: number;
  location?: string;
}

/** The subset of filters that Postgres applied to the stored rows, re-applied
 * to the live Adzuna results so both halves of the list obey the same rules. */
function matchesJsFilters(job: ScoredJob, filters: JsFilters): boolean {
  const { seniorities, postedWithinDays, location } = filters;

  if (seniorities.length > 0) {
    const bucket: SeniorityFilter = job.seniority ?? UNSPECIFIED;
    if (!seniorities.includes(bucket)) return false;
  }

  if (postedWithinDays != null) {
    // Unlike a stored row there is no `fetchedAt` to fall back on — it was
    // fetched just now — so a listing with no date is treated as current.
    if (job.postedAt) {
      const cutoff = Date.now() - postedWithinDays * 24 * 60 * 60 * 1000;
      if (new Date(job.postedAt).getTime() < cutoff) return false;
    }
  }

  if (location && !job.location?.toLowerCase().includes(location.toLowerCase())) {
    return false;
  }

  return true;
}
