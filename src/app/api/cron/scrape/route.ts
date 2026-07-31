import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runScrapeCycle } from "@/lib/scrapeWorker";

// A full cycle is minutes, not seconds. Most serverless plans cap well below
// this — on those, run `npm run scrape` from a machine you control instead
// (which is also the point: the requests should not come from a datacenter IP).
export const maxDuration = 300;

function matchesSecret(provided: string, expected: string): boolean {
  // Hash first so a length mismatch doesn't make timingSafeEqual throw.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET no está configurado" },
      { status: 503 }
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided || !matchesSecret(provided, secret)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const summary = await runScrapeCycle();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[cron/scrape] el ciclo falló", err);
    return NextResponse.json({ error: "El ciclo de scraping falló" }, { status: 500 });
  }
}
