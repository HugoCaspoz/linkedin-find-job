import { prisma } from "@/lib/prisma";
import { withCache } from "@/lib/scrapeCache";
import { SCRAPED_SOURCES } from "@/lib/jobSources";
import type { NormalizedJob } from "@/lib/jobSources/types";

/**
 * Runs the scraping out of band, so no user request ever waits on a scraped
 * site — and, more importantly, so the requests come from wherever the worker
 * runs instead of from a serverless datacenter IP that these sites already
 * treat as suspicious.
 *
 * Meant to be triggered by cron: `npm run scrape` on the machine you want the
 * traffic to come from, or POST /api/cron/scrape on a self-hosted deployment.
 */

/** Used until there are enough profiles to derive real queries from. */
const DEFAULT_QUERIES = [
  "JavaScript",
  "TypeScript",
  "React",
  "Python",
  "Java",
  "SQL",
];

const DEFAULT_MAX_QUERIES = 20;
/** Only guards against a cycle being triggered twice; the cron interval is
 * what actually paces the scraping. */
const CYCLE_CACHE_MS = 30 * 60 * 1000;
const PRUNE_AFTER_DAYS = 30;

export interface ScrapeCycleOptions {
  /** Overrides the queries derived from user skills. */
  queries?: string[];
  maxQueries?: number;
}

export interface ScrapeCycleSummary {
  runId: string;
  queries: number;
  upserted: number;
  failures: number;
  pruned: number;
  perSource: Record<string, number>;
}

/**
 * The skills people actually have, most common first — scraping those keeps
 * the stored listings aligned with what gets searched.
 *
 * One term per query on purpose: joining several skills into one string is an
 * AND on most job boards, and narrow enough to return nothing at all.
 */
export async function targetQueries(limit = DEFAULT_MAX_QUERIES): Promise<string[]> {
  const rows = await prisma.skill.groupBy({
    by: ["name"],
    _count: { name: true },
    orderBy: { _count: { name: "desc" } },
    take: limit,
  });

  const fromProfiles = rows.map((r) => r.name);
  if (fromProfiles.length >= DEFAULT_QUERIES.length) return fromProfiles;

  // Top up with the defaults so a fresh install still indexes something.
  const merged = new Set([...fromProfiles, ...DEFAULT_QUERIES]);
  return [...merged].slice(0, limit);
}

async function upsertJobs(jobs: NormalizedJob[]): Promise<number> {
  if (jobs.length === 0) return 0;

  await prisma.$transaction(
    jobs.map((j) =>
      prisma.jobListing.upsert({
        where: { source_externalId: { source: j.source, externalId: j.externalId } },
        create: {
          source: j.source,
          externalId: j.externalId,
          title: j.title,
          company: j.company,
          location: j.location,
          url: j.url,
          description: j.description,
          workMode: j.workMode,
          postedAt: parseDate(j.postedAt),
        },
        update: {
          title: j.title,
          company: j.company,
          location: j.location,
          url: j.url,
          description: j.description,
          workMode: j.workMode,
          fetchedAt: new Date(),
        },
      })
    )
  );

  return jobs.length;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function runScrapeCycle(
  options: ScrapeCycleOptions = {}
): Promise<ScrapeCycleSummary> {
  const queries = options.queries ?? (await targetQueries(options.maxQueries));
  const run = await prisma.scrapeRun.create({ data: { queries: queries.length } });

  const perSource: Record<string, number> = {};
  let upserted = 0;
  let failures = 0;

  try {
    // Sources run in parallel because they're different hosts with independent
    // cooldowns; queries within a source stay sequential so its throttle is
    // what paces them.
    await Promise.all(
      SCRAPED_SOURCES.map(async (source) => {
        perSource[source.name] = 0;

        for (const query of queries) {
          try {
            const jobs = await withCache(
              `worker:${source.name}:${query}`,
              // No modality filter: store everything once, filter at read time.
              () => source.scrape(query, []),
              CYCLE_CACHE_MS
            );

            const count = await upsertJobs(jobs);
            perSource[source.name] += count;
            upserted += count;
          } catch (err) {
            failures += 1;
            console.error(`[scrape] ${source.name} "${query}" falló`, err);
          }
        }
      })
    );

    const cutoff = new Date(Date.now() - PRUNE_AFTER_DAYS * 24 * 60 * 60 * 1000);
    const { count: pruned } = await prisma.jobListing.deleteMany({
      where: { fetchedAt: { lt: cutoff } },
    });

    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), upserted, failures },
    });

    return { runId: run.id, queries: queries.length, upserted, failures, pruned, perSource };
  } catch (err) {
    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        upserted,
        failures,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}
