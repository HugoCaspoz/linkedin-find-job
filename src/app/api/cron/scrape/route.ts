import { NextResponse } from "next/server";
import { denyCronRequest } from "@/lib/cronAuth";
import { runScrapeCycle } from "@/lib/scrapeWorker";

// A full cycle is minutes, not seconds. Most serverless plans cap well below
// this — on those, run `npm run scrape` from a machine you control instead
// (which is also the point: the requests should not come from a datacenter IP).
export const maxDuration = 300;

/**
 * Margin left for the prune, the bookkeeping update and the response. The
 * description pass waits on per-host cooldowns, so it would otherwise happily
 * run past `maxDuration` and get the whole cycle killed mid-write.
 */
const RESERVED_SECS = 30;

export async function POST(req: Request) {
  const denied = denyCronRequest(req);
  if (denied) return denied;

  try {
    const summary = await runScrapeCycle({
      descriptionDeadline: Date.now() + (maxDuration - RESERVED_SECS) * 1000,
    });
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[cron/scrape] el ciclo falló", err);
    return NextResponse.json({ error: "El ciclo de scraping falló" }, { status: 500 });
  }
}
