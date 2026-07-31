import { scrapeLinkedIn } from "./linkedinScrape";
import { scrapeInfoJobs } from "./infojobsScrape";
import { scrapeTecnoempleo } from "./tecnoempleoScrape";
import type { NormalizedJob, WorkMode } from "./types";

export interface ScrapedSource {
  name: string;
  host: string;
  scrape: (query: string, modes: WorkMode[]) => Promise<NormalizedJob[]>;
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
  { name: "linkedin", host: "linkedin.com", scrape: scrapeLinkedIn },
  { name: "infojobs", host: "infojobs.net", scrape: scrapeInfoJobs },
  { name: "tecnoempleo", host: "tecnoempleo.com", scrape: scrapeTecnoempleo },
];
