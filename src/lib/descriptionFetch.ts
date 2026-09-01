import { prisma } from "@/lib/prisma";
import { SCRAPED_SOURCES } from "@/lib/jobSources";
import { MAX_AGE_DAYS } from "@/lib/jobQuery";
import type { ScrapedSource } from "@/lib/jobSources";

/**
 * Second scraping pass: fills in the descriptions the search-results pages
 * never carried.
 *
 * This is the pass that makes the matching mean anything. Ranking has always
 * weighted a skill found in the description (src/lib/matching.ts), but no
 * scraped source ever wrote that column, so in practice a listing could only
 * ever be judged by the two or three skills that fit in its title.
 *
 * It is deliberately a separate pass rather than part of `scrape`:
 *
 *  - Cost. The search scrape is one request per *query*; this is one request
 *    per *listing*, roughly twenty-five times as many. Bolting it onto the
 *    scrape would multiply the traffic to each site by that factor in one go.
 *  - Pacing. Each request waits on the same per-host cooldown as the search
 *    scrape, so the work is bounded by wall time, not by CPU — which is why
 *    it takes both a budget and a deadline and stops at whichever comes first.
 *  - Resumability. Progress is recorded per listing, so a run that stops
 *    halfway leaves the rest of the queue for the next cycle instead of
 *    starting over.
 */

/** Listings to attempt per source per cycle, when the caller doesn't say. */
export const DEFAULT_DESCRIPTION_BUDGET = 40;

/**
 * How long before a listing that failed is tried again. A detail page can fail
 * for reasons that pass — a timeout, a rate limit, a deploy — so failures are
 * not permanent; but retrying them every cycle would mean the queue fills with
 * listings that will never parse and the ones that would never get a turn.
 */
export const RETRY_AFTER_DAYS = 7;

export interface EnrichOptions {
  /** Per source, not in total. */
  budget?: number;
  /** Epoch ms to stop at, whatever the budget still allows. */
  deadline?: number;
}

export interface EnrichSummary {
  attempted: number;
  filled: number;
  perSource: Record<string, number>;
}

interface QueuedJob {
  id: string;
  externalId: string;
  url: string;
}

/**
 * Listings still missing a description, oldest attempt first.
 *
 * Restricted to rows the search can still return: anything older than
 * MAX_AGE_DAYS is filtered out of every query anyway (src/lib/jobQuery.ts), so
 * spending a request on it would buy a description nobody can ever see.
 *
 * `NULLS FIRST` is the default for ASC in Postgres and is what is wanted here —
 * a listing never attempted goes ahead of one that failed a week ago.
 */
async function queueFor(source: ScrapedSource, budget: number): Promise<QueuedJob[]> {
  const freshCutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const retryCutoff = new Date(Date.now() - RETRY_AFTER_DAYS * 24 * 60 * 60 * 1000);

  return prisma.jobListing.findMany({
    where: {
      source: source.name,
      description: null,
      fetchedAt: { gte: freshCutoff },
      OR: [{ descriptionFetchedAt: null }, { descriptionFetchedAt: { lt: retryCutoff } }],
    },
    orderBy: [{ descriptionFetchedAt: "asc" }, { fetchedAt: "desc" }],
    take: budget,
    select: { id: true, externalId: true, url: true },
  });
}

/**
 * Runs the pass. Sources go in parallel because they are different hosts with
 * independent cooldowns; listings within a source stay sequential so that
 * cooldown is what paces them, exactly as the search scrape does it.
 */
export async function enrichDescriptions(
  options: EnrichOptions = {}
): Promise<EnrichSummary> {
  const budget = options.budget ?? DEFAULT_DESCRIPTION_BUDGET;
  const perSource: Record<string, number> = {};
  let attempted = 0;
  let filled = 0;

  if (budget <= 0) return { attempted, filled, perSource };

  await Promise.all(
    SCRAPED_SOURCES.map(async (source) => {
      perSource[source.name] = 0;
      const queue = await queueFor(source, budget);

      for (const job of queue) {
        if (options.deadline != null && Date.now() >= options.deadline) return;

        attempted += 1;

        let description: string | undefined;
        try {
          description = await source.fetchDescription(job);
        } catch (err) {
          // The source fetchers already swallow their own failures, so this is
          // only reached by a genuine bug in one of them. Logged rather than
          // rethrown: one broken source must not cost the other two their
          // queues, and the attempt is still recorded below.
          console.error(`[descriptions] ${source.name} ${job.externalId} falló`, err);
        }

        // Written even when nothing came back — that is the whole point of the
        // column. `description` stays null, and the retry window keeps this
        // listing out of the queue until it is worth another try.
        await prisma.jobListing.update({
          where: { id: job.id },
          data: { description: description ?? null, descriptionFetchedAt: new Date() },
        });

        if (description) {
          filled += 1;
          perSource[source.name] += 1;
        }
      }
    })
  );

  return { attempted, filled, perSource };
}
