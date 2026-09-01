import * as cheerio from "cheerio";
import { FETCH_TIMEOUT_MS } from "./types";
import { extractDescription, fetchDetailHtml } from "./detail";
import type { NormalizedJob, WorkMode } from "./types";
import { throttleHost } from "@/lib/rateLimit";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function parseWorkMode(text: string): WorkMode | undefined {
  const normalized = text.toLowerCase();
  if (normalized.includes("híbrido") || normalized.includes("hibrido")) return "hybrid";
  if (normalized.includes("remoto") || normalized.includes("teletrabajo")) return "remote";
  if (normalized.includes("presencial")) return "onsite";
  return undefined;
}

/**
 * InfoJobs disabled their public developer API for new keys, so this scrapes
 * the public search-results HTML instead. No login. Breaks if InfoJobs
 * changes markup, and they may rate-limit/block the source IP.
 *
 * There's no public query param for the work-mode filter (it's applied
 * client-side on their end), so we scrape everything and filter by the
 * modality text each card already shows.
 */
export async function scrapeInfoJobs(
  query: string,
  workModes: WorkMode[] = []
): Promise<NormalizedJob[]> {
  try {
    await throttleHost("infojobs.net");

    const url = new URL(
      "https://www.infojobs.net/jobsearch/search-results/list.xhtml"
    );
    url.searchParams.set("keyword", query);

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
        "Accept-Language": "es-ES,es;q=0.9",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const jobs: NormalizedJob[] = [];

    $(".ij-OfferCardContent").each((_, el) => {
      const card = $(el);
      const titleLink = card
        .find("a.ij-OfferCardContent-description-link")
        .first();
      const href = titleLink.attr("href");
      const title = titleLink.text().trim();
      const company = card
        .find(".ij-OfferCardContent-description-subtitle")
        .first()
        .text()
        .trim();

      const listItems = card.find(".ij-OfferCardContent-description-list-item");
      const location = listItems.eq(0).text().trim();
      const workMode = parseWorkMode(listItems.eq(1).text().trim());

      if (!href || !title) return;

      const fullUrl = href.startsWith("//") ? `https:${href}` : href;
      const idMatch = fullUrl.match(/of-i([a-z0-9]+)/i);
      const id = idMatch?.[1];
      if (!id) return;

      jobs.push({
        source: "infojobs",
        externalId: id,
        title,
        company: company || undefined,
        location: location || undefined,
        url: fullUrl.split("?")[0],
        workMode,
      });
    });

    if (workModes.length === 0 || workModes.length === 3) return jobs;
    return jobs.filter((j) => !j.workMode || workModes.includes(j.workMode));
  } catch {
    return [];
  }
}

/**
 * InfoJobs' detail markup, most specific first. It has been through several
 * redesigns and older offers are still served with the previous wrappers, so
 * this is a list rather than a single selector — and `extractDescription`
 * falls back to reading the page structurally when every one of them misses.
 */
const DESCRIPTION_SELECTORS = [
  "[data-testid='offer-description']",
  "#prefijo-descripcion",
  ".ij-OfferDetail-description",
  ".panel-canvas-item",
  "#mainContent",
];

/** The description of a single offer, from its own page. */
export async function fetchInfoJobsDescription(job: {
  externalId: string;
  url: string;
}): Promise<string | undefined> {
  const html = await fetchDetailHtml(job.url, "infojobs.net", "es-ES,es;q=0.9");
  if (!html) return undefined;

  return extractDescription(html, DESCRIPTION_SELECTORS);
}
