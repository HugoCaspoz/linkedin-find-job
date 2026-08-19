import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { exportAccount } from "@/lib/account";
import { checkRateLimit } from "@/lib/rateLimit";

/** The CV text makes this a heavy response; it is not a browsing endpoint. */
const EXPORTS_PER_HOUR = 10;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const limit = await checkRateLimit(
    `export:${session.user.id}`,
    EXPORTS_PER_HOUR,
    60 * 60 * 1000
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Demasiadas descargas seguidas. Inténtalo más tarde." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSecs) } }
    );
  }

  const data = await exportAccount(session.user.id);
  // The session token outlives the account it points at (JWT strategy, no
  // server-side session store), so a valid token can name a deleted user.
  if (!data) {
    return NextResponse.json({ error: "La cuenta ya no existe" }, { status: 401 });
  }

  return NextResponse.json(data, {
    headers: {
      "Content-Disposition": 'attachment; filename="mis-datos.json"',
      "Cache-Control": "no-store",
    },
  });
}
