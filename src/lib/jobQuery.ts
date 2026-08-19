import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DESCRIPTION_WEIGHT, TITLE_WEIGHT, postgresPattern } from "@/lib/matching";
import type { NormalizedJob, WorkMode } from "@/lib/jobSources/types";

/** Listings older than this are treated as stale even if not pruned yet. */
const MAX_AGE_DAYS = 14;
const DEFAULT_LIMIT = 60;

export interface ScoredJob extends NormalizedJob {
  score: number;
  matchedSkills: string[];
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
  postedAt: Date | null;
  score: number;
  matchedSkills: string[];
}

/**
 * Reads what the background worker already scraped. Searches never touch a
 * scraped site themselves — see src/lib/scrapeWorker.ts.
 *
 * Ranking happens in SQL rather than in JS on the way out, because the LIMIT
 * has to apply to the best matches and not to the newest ones: sorting a page
 * that was already truncated by date would hide the strongest matches
 * entirely.
 *
 * The patterns are word-anchored regexes (see src/lib/matching.ts), which the
 * trigram GIN indexes on title and description can serve — pg_trgm
 * accelerates `~*`, not only LIKE.
 */
export async function searchStoredJobs(
  skills: string[],
  modes: WorkMode[],
  limit: number = DEFAULT_LIMIT
): Promise<ScoredJob[]> {
  const usable = skills.filter((s) => s.trim());
  if (usable.length === 0) return [];

  const patterns = usable.map(postgresPattern);
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  // Weights are module constants, not input, so they go in as literals: as
  // bound parameters Postgres has to infer their type inside the CASE.
  const titleWeight = Prisma.raw(String(TITLE_WEIGHT));
  const descriptionWeight = Prisma.raw(String(DESCRIPTION_WEIGHT));

  // Unrolled, one term per skill, instead of joining against a table of
  // patterns. A join reads better but is 2000x slower here: with the pattern
  // coming from a joined relation the planner cannot reach the trigram
  // indexes and falls back to a sequential scan over every listing. Spelled
  // out like this, each term is a constant and the planner ORs the index
  // scans together. TOP_SKILLS bounds how many terms this can produce.
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
  const modeFilter =
    modes.length > 0 && modes.length < 3
      ? Prisma.sql`AND (j."workMode" IS NULL OR j."workMode" = ANY(${modes}::text[]))`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      j."source", j."externalId", j."title", j."company", j."location",
      j."url", j."description", j."workMode", j."postedAt",
      (${scoreSql})::int AS "score",
      ARRAY_REMOVE(ARRAY[${matchedNamesSql}]::text[], NULL) AS "matchedSkills"
    FROM "JobListing" j
    WHERE j."fetchedAt" >= ${cutoff}
      ${modeFilter}
      AND (${matchesSql})
    ORDER BY "score" DESC, j."postedAt" DESC NULLS LAST, j."fetchedAt" DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    source: r.source,
    externalId: r.externalId,
    title: r.title,
    company: r.company ?? undefined,
    location: r.location ?? undefined,
    url: r.url,
    description: r.description ?? undefined,
    workMode: (r.workMode as WorkMode | null) ?? undefined,
    postedAt: r.postedAt?.toISOString(),
    score: r.score,
    matchedSkills: r.matchedSkills,
  }));
}

/** Distinguishes "nothing matches your skills" from "the worker never ran". */
export async function indexIsEmpty(): Promise<boolean> {
  const any = await prisma.jobListing.findFirst({ select: { id: true } });
  return any === null;
}
