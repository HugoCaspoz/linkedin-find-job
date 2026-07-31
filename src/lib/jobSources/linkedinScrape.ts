import * as cheerio from "cheerio";
import { FETCH_TIMEOUT_MS } from "./types";
import type { NormalizedJob, WorkMode } from "./types";
import { throttleHost } from "@/lib/rateLimit";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// LinkedIn's own filter values: On-site=1, Remote=2, Hybrid=3.
const WORK_MODE_TO_F_WT: Record<WorkMode, string> = {
  onsite: "1",
  remote: "2",
  hybrid: "3",
};

/**
 * Uses LinkedIn's public "guest" job search endpoint (no login) that
 * linkedin.com/jobs/search itself calls for pagination. No official API for
 * this; scraping public HTML — can break if LinkedIn changes markup, and
 * LinkedIn may rate-limit/block the source IP.
 */
export async function scrapeLinkedIn(
  query: string,
  workModes: WorkMode[] = [],
  location: string = "Spain"
): Promise<NormalizedJob[]> {
  try {
    await throttleHost("linkedin.com");

    const url = new URL(
      "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
    );
    url.searchParams.set("keywords", query);
    url.searchParams.set("location", location);
    url.searchParams.set("start", "0");
    // Omit the filter entirely when all/none are selected — same as "any".
    if (workModes.length > 0 && workModes.length < 3) {
      url.searchParams.set(
        "f_WT",
        workModes.map((m) => WORK_MODE_TO_F_WT[m]).join(",")
      );
    }

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const jobs: NormalizedJob[] = [];

    $("li > div.base-card").each((_, el) => {
      const card = $(el);
      const urn = card.attr("data-entity-urn") ?? "";
      const id = urn.split(":").pop();
      const title = card.find(".base-search-card__title").first().text().trim();
      const company = card.find(".base-search-card__subtitle").first().text().trim();
      const jobLocation = card.find(".job-search-card__location").first().text().trim();
      const href = card.find("a.base-card__full-link").first().attr("href");
      const postedAt = card.find("time").first().attr("datetime");

      if (!id || !title || !href) return;

      jobs.push({
        source: "linkedin",
        externalId: id,
        title,
        company: company || undefined,
        location: jobLocation || undefined,
        url: href.split("?")[0],
        postedAt: postedAt || undefined,
      });
    });

    return jobs;
  } catch {
    return [];
  }
}
