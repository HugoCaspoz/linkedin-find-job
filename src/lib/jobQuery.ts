import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DESCRIPTION_WEIGHT, TITLE_WEIGHT, postgresPattern } from "@/lib/matching";
import type { Seniority } from "@/lib/seniority";
import type { NormalizedJob, WorkMode } from "@/lib/jobSources/types";

/** Listings older than this are treated as stale even if not pruned yet. */
export const MAX_AGE_DAYS = 14;

/** Page sizes the UI offers. Multiples of 12 so a two- or three-column grid
 * never ends on a ragged half-row. */
export const PAGE_SIZES = [12, 24, 48, 96] as const;
export const DEFAULT_PER_PAGE = 24;
/** Ceiling for the caller-supplied page size, so a crafted query can't ask for
 * the whole table in one request. */
export const MAX_PER_PAGE = 96;

/**
 * Listings whose title never stated a level. Kept as a selectable bucket
 * instead of being folded into a level or silently included: most listings land
 * here, so hiding the choice would make the seniority filter either useless
 * (everything always matches) or quietly lossy (most results disappear).
 */
export const UNSPECIFIED = "unspecified";

export type SeniorityFilter = Seniority | typeof UNSPECIFIED;

export type SortOrder = "relevance" | "date";

export interface JobFilters {
  /** Always non-empty — the caller falls back to the profile's top skills. */
  skills: string[];
  modes?: WorkMode[];
  seniorities?: SeniorityFilter[];
  /** Source names as stored (`linkedin`, `infojobs`, `tecnoempleo`). */
  sources?: string[];
  /** Drops anything published (or, failing that, indexed) before this. */
  postedWithinDays?: number;
  /** Substring match on the listing's location. */
  location?: string;
  sort?: SortOrder;
  /** 1-based. Out-of-range pages return no rows but still report the total, so
   * the caller can render controls that get the user back. */
  page?: number;
  perPage?: number;
}

export interface ScoredJob extends NormalizedJob {
  score: number;
  matchedSkills: string[];
  seniority?: Seniority;
}

export interface StoredJobPage {
  jobs: ScoredJob[];
  /** Matches for the whole filter, not just this page. */
  total: number;
}

interface Row {
  source: string;
  externalId: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  description: string | null;
  workMode: string | null;
  seniority: string | null;
  postedAt: Date | null;
  score: number;
  matchedSkills: string[];
  total: number;
}

/**
 * Reads what the background worker already scraped. Searches never touch a
 * scraped site themselves — see src/lib/scrapeWorker.ts.
 *
 * Ranking happens in SQL rather than in JS on the way out, because the LIMIT
 * has to apply to the best matches and not to the newest ones: sorting a page
 * that was already truncated by date would hide the strongest matches
 * entirely. The same argument applies to every filter here — each one has to
 * narrow the set *before* the LIMIT, which is why none of them are applied to
 * the returned array.
 *
 * The patterns are word-anchored regexes (see src/lib/matching.ts), which the
 * trigram GIN indexes on title and description can serve — pg_trgm
 * accelerates `~*`, not only LIKE.
 */
export async function searchStoredJobs(filters: JobFilters): Promise<StoredJobPage> {
  const usable = filters.skills.filter((s) => s.trim());
  if (usable.length === 0) return { jobs: [], total: 0 };

  const patterns = usable.map(postgresPattern);
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const perPage = Math.min(Math.max(filters.perPage ?? DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
  const page = Math.max(filters.page ?? 1, 1);
  const offset = (page - 1) * perPage;

  // Weights are module constants, not input, so they go in as literals: as
  // bound parameters Postgres has to infer their type inside the CASE.
  const titleWeight = Prisma.raw(String(TITLE_WEIGHT));
  const descriptionWeight = Prisma.raw(String(DESCRIPTION_WEIGHT));

  // Unrolled, one term per skill, instead of joining against a table of
  // patterns. A join reads better but is 2000x slower here: with the pattern
  // coming from a joined relation the planner cannot reach the trigram
  // indexes and falls back to a sequential scan over every listing. Spelled
  // out like this, each term is a constant and the planner ORs the index
  // scans together. The caller bounds how many terms this can produce.
  const scoreSql = Prisma.join(
    patterns.map(
      (pattern) => Prisma.sql`(
        CASE WHEN j."title" ~* ${pattern} THEN ${titleWeight} ELSE 0 END +
        CASE WHEN j."description" ~* ${pattern} THEN ${descriptionWeight} ELSE 0 END
      )`
    ),
    " + "
  );

  // `description` is nullable and deliberately not wrapped in COALESCE: NULL
  // fails the match on its own, and COALESCE(description, '') would make the
  // expression unindexable and put the sequential scan straight back.
  //
  // Known limit: pg_trgm cannot extract trigrams from a pattern shorter than
  // three characters, so skills like "Go", "R" or "C" fall back to a scan, and
  // because the terms are OR-ed one of them drags the whole query down with it
  // (measured on 60k listings: ~0.3ms indexed, ~250ms with a two-letter skill
  // in the set). Fixing it properly means a different index for those, which
  // is not worth it while they are the exception.
  const matchesSql = Prisma.join(
    patterns.map(
      (pattern) => Prisma.sql`(j."title" ~* ${pattern} OR j."description" ~* ${pattern})`
    ),
    " OR "
  );

  const matchedNamesSql = Prisma.join(
    patterns.map(
      (pattern, i) => Prisma.sql`CASE
        WHEN j."title" ~* ${pattern} OR j."description" ~* ${pattern} THEN ${usable[i]}
      END`
    ),
    ", "
  );

  // A listing with no stated modality passes any filter — most sources do not
  // report it, and dropping those would throw away most of the index.
  const modes = filters.modes ?? [];
  const modeFilter =
    modes.length > 0 && modes.length < 3
      ? Prisma.sql`AND (j."workMode" IS NULL OR j."workMode" = ANY(${modes}::text[]))`
      : Prisma.empty;

  // Seniority works the other way round: "not stated" is its own checkbox, so
  // an unticked box means the user does not want those rows. Folding NULLs in
  // implicitly the way modality does would make "senior" return the whole
  // index, since most titles state nothing.
  const seniorities = filters.seniorities ?? [];
  const levels = seniorities.filter((s) => s !== UNSPECIFIED);
  const wantsUnspecified = seniorities.includes(UNSPECIFIED);
  const seniorityFilter =
    seniorities.length === 0
      ? Prisma.empty
      : Prisma.sql`AND (${Prisma.join(
          [
            ...(levels.length > 0
              ? [Prisma.sql`j."seniority" = ANY(${levels}::text[])`]
              : []),
            ...(wantsUnspecified ? [Prisma.sql`j."seniority" IS NULL`] : []),
          ],
          " OR "
        )})`;

  const sources = filters.sources ?? [];
  const sourceFilter =
    sources.length > 0
      ? Prisma.sql`AND j."source" = ANY(${sources}::text[])`
      : Prisma.empty;

  // Most sources omit `postedAt`, so the date filter falls back to when we
  // indexed the row. That is an upper bound on the real publication date
  // (we cannot have fetched it before it existed), which is the safe direction
  // to be wrong in for a "posted in the last N days" filter.
  const postedFilter =
    filters.postedWithinDays != null
      ? Prisma.sql`AND COALESCE(j."postedAt", j."fetchedAt") >= ${new Date(
          Date.now() - filters.postedWithinDays * 24 * 60 * 60 * 1000
        )}`
      : Prisma.empty;

  const location = filters.location?.trim();
  const locationFilter = location
    ? Prisma.sql`AND j."location" ILIKE ${`%${location}%`}`
    : Prisma.empty;

  // Relevance breaks ties by date and date breaks ties by relevance, and both
  // end on the primary key.
  //
  // That last term is what makes paging correct, not just tidy. Scores repeat
  // heavily and `postedAt` is null on most rows, so without a unique final key
  // the sort is only a partial order: Postgres may return tied rows in a
  // different sequence for each query, and two OFFSET pages of the same search
  // then overlap on some listings and skip others entirely.
  const orderBy =
    filters.sort === "date"
      ? Prisma.sql`ORDER BY COALESCE(j."postedAt", j."fetchedAt") DESC, "score" DESC, j."id" ASC`
      : Prisma.sql`ORDER BY "score" DESC, j."postedAt" DESC NULLS LAST, j."fetchedAt" DESC, j."id" ASC`;

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      j."source", j."externalId", j."title", j."company", j."location",
      j."url", j."description", j."workMode", j."seniority", j."postedAt",
      (${scoreSql})::int AS "score",
      ARRAY_REMOVE(ARRAY[${matchedNamesSql}]::text[], NULL) AS "matchedSkills",
      -- Window functions run after WHERE but before LIMIT, so this is the size
      -- of the whole filtered set, not of the page. It costs materialising that
      -- set — which the ORDER BY already required anyway — and saves a second
      -- round trip whose WHERE clause would have to be kept in sync with this
      -- one by hand.
      COUNT(*) OVER()::int AS "total"
    FROM "JobListing" j
    WHERE j."fetchedAt" >= ${cutoff}
      ${modeFilter}
      ${seniorityFilter}
      ${sourceFilter}
      ${postedFilter}
      ${locationFilter}
      AND (${matchesSql})
    ${orderBy}
    LIMIT ${perPage} OFFSET ${offset}
  `;

  const jobs = rows.map((r) => ({
    source: r.source,
    externalId: r.externalId,
    title: r.title,
    company: r.company ?? undefined,
    location: r.location ?? undefined,
    url: r.url,
    description: r.description ?? undefined,
    workMode: (r.workMode as WorkMode | null) ?? undefined,
    seniority: (r.seniority as Seniority | null) ?? undefined,
    postedAt: r.postedAt?.toISOString(),
    score: r.score,
    matchedSkills: r.matchedSkills,
  }));

  // An empty page past the end still has to report the real total, or the
  // caller cannot draw the controls that get the user back to a page that
  // exists.
  const total = rows[0]?.total ?? (offset > 0 ? await countStoredJobs(filters) : 0);

  return { jobs, total };
}

/** Only reached when a page lands past the end of the result set, where the
 * window function has no row to report the count on. */
async function countStoredJobs(filters: JobFilters): Promise<number> {
  const { total } = await searchStoredJobs({ ...filters, page: 1, perPage: 1 });
  return total;
}

/**
 * Which of the three "no results" causes applies, so the UI can say something
 * true instead of showing an empty list.
 *
 * `stale` is the one that is easy to miss: the table has rows, but every one of
 * them is older than MAX_AGE_DAYS, so every search correctly returns nothing
 * while the index looks populated. That is what a worker which stopped running
 * a fortnight ago produces, and checking only for an empty table reports it as
 * healthy.
 */
export type IndexState = "empty" | "stale" | "ok";

export async function indexState(): Promise<IndexState> {
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  const fresh = await prisma.jobListing.findFirst({
    where: { fetchedAt: { gte: cutoff } },
    select: { id: true },
  });
  if (fresh) return "ok";

  const any = await prisma.jobListing.findFirst({ select: { id: true } });
  return any === null ? "empty" : "stale";
}

/** Distinct sources present in the fresh index, for the filter UI. */
export async function availableSources(): Promise<string[]> {
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.jobListing.groupBy({
    by: ["source"],
    where: { fetchedAt: { gte: cutoff } },
    orderBy: { source: "asc" },
  });
  return rows.map((r) => r.source);
}
