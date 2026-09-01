import { fetchLinkedInDescription, scrapeLinkedIn } from "./linkedinScrape";
import { fetchInfoJobsDescription, scrapeInfoJobs } from "./infojobsScrape";
import { fetchTecnoempleoDescription, scrapeTecnoempleo } from "./tecnoempleoScrape";
import type { NormalizedJob, WorkMode } from "./types";

/** The listing fields the detail pass needs to find a job's own page. */
export interface JobRef {
  externalId: string;
  url: string;
}

export interface ScrapedSource {
  name: string;
  host: string;
  scrape: (query: string, modes: WorkMode[]) => Promise<NormalizedJob[]>;
  /**
   * Second pass: the description, read from the listing's own page.
   *
   * Separate from `scrape` because it costs one request per listing rather
   * than one per query — a different order of magnitude, which is why the
   * worker budgets it and paces it behind the same host cooldown instead of
   * folding it into the search scrape.
   *
   * Resolves to undefined when the page is gone, gated or unparseable; the
   * caller records the attempt so a permanently broken listing is not retried
   * on every cycle.
   */
  fetchDescription: (job: JobRef) => Promise<string | undefined>;
}

/**
 * Sources that are scraped rather than queried through an API. These only run
 * in the background worker — never in the request path — so the outbound IP is
 * whatever machine runs the worker, and a blocked or slow source can't take a
 * user-facing request down with it.
 *
 * Adzuna isn't here: it's an official API with a key, so it's safe to call
 * live while handling a search.
 */
export const SCRAPED_SOURCES: ScrapedSource[] = [
  {
    name: "linkedin",
    host: "linkedin.com",
    scrape: scrapeLinkedIn,
    fetchDescription: fetchLinkedInDescription,
  },
  {
    name: "infojobs",
    host: "infojobs.net",
    scrape: scrapeInfoJobs,
    fetchDescription: fetchInfoJobsDescription,
  },
  {
    name: "tecnoempleo",
    host: "tecnoempleo.com",
    scrape: scrapeTecnoempleo,
    fetchDescription: fetchTecnoempleoDescription,
  },
];

/** By `name`, for the enrichment pass, which starts from a stored row's source. */
export const SOURCE_BY_NAME = new Map(SCRAPED_SOURCES.map((s) => [s.name, s]));
