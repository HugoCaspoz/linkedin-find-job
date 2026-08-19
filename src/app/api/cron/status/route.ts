import { NextResponse } from "next/server";
import { denyCronRequest } from "@/lib/cronAuth";
import { getScrapeHealth } from "@/lib/scrapeHealth";

/**
 * Read side of `ScrapeRun`. Without this the table is written every cycle and
 * never looked at, so a cron that quietly stopped only shows up as an index
 * going cold weeks later.
 *
 * Anything other than `ok` answers 503 on purpose: a plain HTTP monitor can
 * then alert without parsing the body.
 */
export async function GET(req: Request) {
  const denied = denyCronRequest(req);
  if (denied) return denied;

  const health = await getScrapeHealth();

  return NextResponse.json(health, {
    status: health.status === "ok" || health.status === "running" ? 200 : 503,
    // Operational state; a cached answer is a wrong answer.
    headers: { "Cache-Control": "no-store" },
  });
}
