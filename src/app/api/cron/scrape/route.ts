import { NextResponse } from "next/server";
import { denyCronRequest } from "@/lib/cronAuth";
import { runScrapeCycle } from "@/lib/scrapeWorker";

// A full cycle is minutes, not seconds. Most serverless plans cap well below
// this — on those, run `npm run scrape` from a machine you control instead
// (which is also the point: the requests should not come from a datacenter IP).
export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = denyCronRequest(req);
  if (denied) return denied;

  try {
    const summary = await runScrapeCycle();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[cron/scrape] el ciclo falló", err);
    return NextResponse.json({ error: "El ciclo de scraping falló" }, { status: 500 });
  }
}
