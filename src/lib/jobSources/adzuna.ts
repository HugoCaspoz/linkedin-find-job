import { env } from "@/lib/env";
import { FETCH_TIMEOUT_MS } from "./types";
import type { NormalizedJob, WorkMode } from "./types";
export type { NormalizedJob, WorkMode };

interface AdzunaResult {
  id: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  redirect_url: string;
  description?: string;
  created?: string;
}

export async function searchAdzuna(
  query: string,
  workModes: WorkMode[] = [],
  country: string = "es"
): Promise<NormalizedJob[]> {
  const { ADZUNA_APP_ID: appId, ADZUNA_APP_KEY: appKey } = env();
  if (!appId || !appKey) return [];

  // Adzuna has no work-mode filter param; "remote"-only searches fall back
  // to adding the term to the query text as a best-effort heuristic.
  const what =
    workModes.length === 1 && workModes[0] === "remote"
      ? `${query} remoto`
      : query;

  const url = new URL(
    `https://api.adzuna.com/v1/api/jobs/${country}/search/1`
  );
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("what", what);
  url.searchParams.set("results_per_page", "20");
  url.searchParams.set("content-type", "application/json");

  // One dead source shouldn't fail the whole search, same as the scrapers.
  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { results: AdzunaResult[] };

    return data.results.map((r) => ({
      source: "adzuna",
      externalId: r.id,
      title: r.title,
      company: r.company?.display_name,
      location: r.location?.display_name,
      url: r.redirect_url,
      description: r.description,
      postedAt: r.created,
    }));
  } catch {
    return [];
  }
}
