import { prisma } from "@/lib/prisma";
import { SCRAPED_SOURCES } from "@/lib/jobSources";

/**
 * Turns what the worker already records into something a monitor can read.
 * `ScrapeRun` answers "did the cron run"; the per-source freshness of
 * `JobListing` answers "is each source still returning anything", which is the
 * only signal that catches a scraper whose selectors stopped matching — those
 * fail silently, returning an empty list rather than an error.
 */

/** Cron is meant to run every ~6h, so this is four missed cycles, not a blip. */
export const MAX_RUN_AGE_HOURS = 24;
/** A source with nothing fresh for this long has almost certainly changed its
 * markup: a working source keeps re-upserting even when it finds no new jobs. */
export const MAX_SOURCE_AGE_HOURS = 48;

export type HealthStatus = "ok" | "never_run" | "running" | "stale" | "degraded";

export interface RunRecord {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  queries: number;
  upserted: number;
  failures: number;
  error: string | null;
}

export interface SourceRow {
  source: string;
  listings: number;
  freshestAt: Date | null;
}

export interface SourceHealth {
  source: string;
  listings: number;
  freshestAt: string | null;
  ageHours: number | null;
  stale: boolean;
}

export interface ScrapeHealth {
  status: HealthStatus;
  /** Plain-language reason, so an alert is readable without the schema. */
  reason: string;
  lastRun:
    | (Omit<RunRecord, "startedAt" | "finishedAt"> & {
        startedAt: string;
        finishedAt: string | null;
        ageHours: number;
        durationSecs: number | null;
      })
    | null;
  sources: SourceHealth[];
}

function hoursSince(now: Date, then: Date): number {
  return Math.round(((now.getTime() - then.getTime()) / 3_600_000) * 10) / 10;
}

export interface HealthInput {
  now: Date;
  /** Most recent run, finished or not. */
  lastRun: RunRecord | null;
  /** Most recent run that actually completed. */
  lastCompletedRun: RunRecord | null;
  sourceRows: SourceRow[];
  knownSources: string[];
}

/**
 * Pure so the thresholds can be tested without a database — the arithmetic
 * around "how stale is too stale" is the part worth pinning down.
 */
export function summarizeHealth(input: HealthInput): ScrapeHealth {
  const { now, lastRun, lastCompletedRun, sourceRows, knownSources } = input;

  const lastRunOut = lastRun
    ? {
        ...lastRun,
        startedAt: lastRun.startedAt.toISOString(),
        finishedAt: lastRun.finishedAt?.toISOString() ?? null,
        ageHours: hoursSince(now, lastRun.finishedAt ?? lastRun.startedAt),
        durationSecs: lastRun.finishedAt
          ? Math.round(
              (lastRun.finishedAt.getTime() - lastRun.startedAt.getTime()) / 1000
            )
          : null,
      }
    : null;

  const byName = new Map(sourceRows.map((r) => [r.source, r]));
  const sources: SourceHealth[] = knownSources.map((source) => {
    const row = byName.get(source);
    const freshestAt = row?.freshestAt ?? null;
    const ageHours = freshestAt ? hoursSince(now, freshestAt) : null;
    return {
      source,
      listings: row?.listings ?? 0,
      freshestAt: freshestAt?.toISOString() ?? null,
      ageHours,
      stale: ageHours === null || ageHours > MAX_SOURCE_AGE_HOURS,
    };
  });

  const base = { lastRun: lastRunOut, sources };

  if (!lastRun) {
    return {
      ...base,
      status: "never_run",
      reason: "El worker de scraping no ha corrido nunca.",
    };
  }

  // No completed run yet: either one is in flight, or one died without ever
  // writing finishedAt. Source freshness says nothing useful in that state,
  // so it is deliberately not consulted here.
  if (!lastCompletedRun) {
    const age = hoursSince(now, lastRun.startedAt);
    return age <= MAX_RUN_AGE_HOURS
      ? { ...base, status: "running", reason: "Hay un ciclo en curso." }
      : {
          ...base,
          status: "stale",
          reason: `Un ciclo empezó hace ${age}h y nunca terminó.`,
        };
  }

  const completedAge = hoursSince(now, lastCompletedRun.finishedAt!);
  if (completedAge > MAX_RUN_AGE_HOURS) {
    return {
      ...base,
      status: "stale",
      reason: `El último ciclo terminó hace ${completedAge}h (límite ${MAX_RUN_AGE_HOURS}h). El cron probablemente está parado.`,
    };
  }

  const stale = sources.filter((s) => s.stale);
  if (stale.length > 0) {
    return {
      ...base,
      status: "degraded",
      reason: `El cron corre, pero sin ofertas frescas de: ${stale
        .map((s) => s.source)
        .join(", ")}. Suele significar que cambió el markup.`,
    };
  }

  return { ...base, status: "ok", reason: "Todas las fuentes al día." };
}

/** Reads the two tables the summary needs and hands them to `summarizeHealth`. */
export async function getScrapeHealth(): Promise<ScrapeHealth> {
  const [lastRun, lastCompletedRun, grouped] = await Promise.all([
    prisma.scrapeRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.scrapeRun.findFirst({
      where: { finishedAt: { not: null } },
      orderBy: { finishedAt: "desc" },
    }),
    prisma.jobListing.groupBy({
      by: ["source"],
      _count: { _all: true },
      _max: { fetchedAt: true },
    }),
  ]);

  return summarizeHealth({
    now: new Date(),
    lastRun,
    lastCompletedRun,
    sourceRows: grouped.map((g) => ({
      source: g.source,
      listings: g._count._all,
      freshestAt: g._max.fetchedAt,
    })),
    // Driven by the registry rather than by what is in the table, so a source
    // that has never produced a single listing still shows up as broken.
    knownSources: SCRAPED_SOURCES.map((s) => s.name),
  });
}
