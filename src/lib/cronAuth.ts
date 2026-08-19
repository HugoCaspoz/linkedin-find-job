import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

function matchesSecret(provided: string, expected: string): boolean {
  // Hash first so a length mismatch doesn't make timingSafeEqual throw.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Guards the operational endpoints. Returns the response to send when the
 * caller is not allowed, or `null` to continue — shared so the worker trigger
 * and the status read can't drift into two different checks.
 */
export function denyCronRequest(req: Request): NextResponse | null {
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

  return null;
}
