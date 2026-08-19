import { describe, expect, it, vi } from "vitest";

// The module reaches for Prisma at import time; only the key derivation is
// under test here (the rest is verified end-to-end against a real database).
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { personalRateLimitKeys } from "./account";
import { loginEmailKey } from "./rateLimit";

describe("personalRateLimitKeys", () => {
  const KEYS = personalRateLimitKeys("user-123", "alguien@example.com");

  it("covers every per-user counter the app writes", () => {
    expect(KEYS).toEqual(
      expect.arrayContaining([
        "upload:user-123",
        "search:user-123",
        "export:user-123",
        "account-delete:user-123",
      ])
    );
  });

  it("derives the login key from the limiter, so the two cannot drift", () => {
    // If auth.ts changes how it keys failed logins, deletion still purges the
    // right row instead of silently leaving the email behind.
    expect(KEYS).toContain(loginEmailKey("alguien@example.com"));
  });

  it("never touches the IP-keyed counters", () => {
    // Those are shared with everyone behind the same address; clearing one on
    // request would be a way to reset a brute-force counter at will.
    expect(KEYS.some((k) => k.startsWith("login:ip:"))).toBe(false);
    expect(KEYS.some((k) => k.startsWith("register:"))).toBe(false);
  });

  it("matches the truncation the limiter applies to long addresses", () => {
    const long = `${"a".repeat(300)}@example.com`;

    const key = personalRateLimitKeys("u", long).find((k) =>
      k.startsWith("login:email:")
    );

    expect(key).toBe(loginEmailKey(long));
    expect(key!.length).toBeLessThanOrEqual("login:email:".length + 160);
  });
});
