import * as cheerio from "cheerio";
import { FETCH_TIMEOUT_MS } from "./types";
import type { NormalizedJob, WorkMode } from "./types";
import { throttleHost } from "@/lib/rateLimit";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Tecnoempleo's own filter values: Remote=1, On-site=2, Hybrid=3.
const WORK_MODE_TO_EN_REMOTO: Record<WorkMode, string> = {
  remote: "1",
  onsite: "2",
  hybrid: "3",
};

function parseWorkMode(text: string): WorkMode | undefined {
  const normalized = text.toLowerCase();
  if (normalized.includes("híbrido") || normalized.includes("hibrido")) return "hybrid";
  if (normalized.includes("remoto") || normalized.includes("teletrabajo")) return "remote";
  if (normalized.includes("presencial")) return "onsite";
  return undefined;
}

/**
 * No public API; scrapes the public search-results HTML. No login.
 * Breaks if Tecnoempleo changes markup, and they may rate-limit/block the
 * source IP.
 */
export async function scrapeTecnoempleo(
  query: string,
  workModes: WorkMode[] = []
): Promise<NormalizedJob[]> {
  try {
    await throttleHost("tecnoempleo.com");

    const url = new URL("https://www.tecnoempleo.com/ofertas-trabajo/");
    url.searchParams.set("te", query);
    if (workModes.length > 0 && workModes.length < 3) {
      const values = workModes.map((m) => WORK_MODE_TO_EN_REMOTO[m]);
      url.searchParams.set("en_remoto", `,${values.join(",")},`);
    }

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

    $("div.p-3.border.rounded.mb-3.bg-white").each((_, el) => {
      const card = $(el);
      const titleLink = card.find("h3 a").first();
      const href = titleLink.attr("href");
      const title = titleLink.text().trim();
      const company = card.find("a.text-primary.link-muted").first().text().trim();
      const metaCol = card.find(".col-lg-3").first();
      const location = metaCol.find("b").first().text().trim();
      const metaText = metaCol.text();

      if (!href || !title) return;

      const idMatch = href.match(/rf-([a-z0-9]+)/i);
      const id = idMatch?.[1];
      if (!id) return;

      jobs.push({
        source: "tecnoempleo",
        externalId: id,
        title,
        company: company || undefined,
        location: location || undefined,
        url: href.split("?")[0],
        workMode: parseWorkMode(metaText),
      });
    });

    return jobs;
  } catch {
    return [];
  }
}
