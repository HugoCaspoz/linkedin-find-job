import { prisma } from "@/lib/prisma";

/**
 * Both limiters live in Postgres rather than in process memory: on serverless
 * every instance would otherwise start with an empty map, so N concurrent
 * instances would each allow a full quota and the host throttle would never
 * actually throttle anything.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ThrottleOptions {
  /** Minimum gap between two requests to the same host. */
  minIntervalMs?: number;
  /** Random extra delay on top, so requests don't land on an exact cadence. */
  jitterMs?: number;
}

/**
 * Reserves the next request slot for `host` and waits for it. Callers are all
 * in the background worker, which has no request deadline, so waiting is
 * always the right move — there's nothing to bail out for.
 */
export async function throttleHost(
  host: string,
  { minIntervalMs = 4000, jitterMs = 3000 }: ThrottleOptions = {}
): Promise<void> {
  const intervalMs = minIntervalMs + Math.random() * jitterMs;
  const intervalSecs = intervalMs / 1000;

  // Single atomic statement so concurrent instances queue up behind each other
  // instead of all reading the same "last request" timestamp.
  // Prisma maps DateTime to `timestamp(3)` without time zone and stores UTC,
  // so NOW() has to be pinned to UTC or the comparison depends on the
  // server's TimeZone setting.
  const rows = await prisma.$queryRaw<{ nextAllowedAt: Date }[]>`
    INSERT INTO "HostCooldown" AS h ("host", "nextAllowedAt")
    VALUES (${host}, (NOW() AT TIME ZONE 'UTC') + make_interval(secs => ${intervalSecs}))
    ON CONFLICT ("host") DO UPDATE
      SET "nextAllowedAt" =
        GREATEST(h."nextAllowedAt", (NOW() AT TIME ZONE 'UTC'))
        + make_interval(secs => ${intervalSecs})
    RETURNING "nextAllowedAt"
  `;

  // RETURNING gives the advanced value, so this caller's own slot is one
  // interval earlier.
  const slotAt = rows[0].nextAllowedAt.getTime() - intervalMs;
  const wait = slotAt - Date.now();

  if (wait > 0) await sleep(wait);
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSecs: number;
}

/**
 * Fixed-window counter. `key` should already include what you're limiting on,
 * e.g. `upload:<userId>` or `register:<ip>`.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const windowSecs = windowMs / 1000;

  const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimit" AS r ("key", "count", "resetAt")
    VALUES (${key}, 1, (NOW() AT TIME ZONE 'UTC') + make_interval(secs => ${windowSecs}))
    ON CONFLICT ("key") DO UPDATE
      SET "count" = CASE
            WHEN r."resetAt" <= (NOW() AT TIME ZONE 'UTC') THEN 1
            ELSE r."count" + 1
          END,
          "resetAt" = CASE
            WHEN r."resetAt" <= (NOW() AT TIME ZONE 'UTC')
              THEN (NOW() AT TIME ZONE 'UTC') + make_interval(secs => ${windowSecs})
            ELSE r."resetAt"
          END
    RETURNING "count", "resetAt"
  `;

  const { count, resetAt } = rows[0];
  const retryAfterSecs = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));

  // Rows are only ever rewritten by the key they belong to, so sweep the
  // long-dead ones occasionally instead of scheduling a job for it.
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: cutoff } } });
  }

  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSecs,
  };
}

/**
 * Read-only quota check — unlike `checkRateLimit`, it does not consume any.
 * Lets a caller count only the attempts it cares about (failed logins) rather
 * than every attempt, so a legitimate user is never locked out by their own
 * successful sign-ins.
 */
export async function isRateLimited(key: string, limit: number): Promise<boolean> {
  const row = await prisma.rateLimit.findUnique({
    where: { key },
    select: { count: true, resetAt: true },
  });
  if (!row) return false;
  // An expired window is the same as no window at all: the next
  // `checkRateLimit` write restarts the counter.
  if (row.resetAt <= new Date()) return false;
  return row.count >= limit;
}

/**
 * The login limiter's key, in one place because two callers depend on the
 * exact string: the limiter itself and the account deletion that has to purge
 * it. Truncated because the value ends up in a primary key and nothing has
 * checked the length of the field it comes from.
 */
export function loginEmailKey(email: string): string {
  return `login:email:${email.slice(0, 160)}`;
}

/** Best-effort client IP, for limiting endpoints that have no session yet. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
