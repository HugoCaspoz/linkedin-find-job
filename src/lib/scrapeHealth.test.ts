import { describe, expect, it, vi } from "vitest";

// The module pulls in prisma and the scraper registry for `getScrapeHealth`;
// only the pure summary is under test here.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/jobSources", () => ({ SCRAPED_SOURCES: [] }));

import {
  MAX_RUN_AGE_HOURS,
  MAX_SOURCE_AGE_HOURS,
  summarizeHealth,
  type HealthInput,
  type RunRecord,
} from "./scrapeHealth";

const NOW = new Date("2026-08-19T12:00:00.000Z");
const KNOWN = ["linkedin", "infojobs", "tecnoempleo"];

function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * 3_600_000);
}

function run(over: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "run-1",
    startedAt: hoursAgo(2),
    finishedAt: hoursAgo(1),
    queries: 20,
    upserted: 140,
    failures: 0,
    error: null,
    ...over,
  };
}

/** All three sources fresh unless a test says otherwise. */
function freshSources(ageHours = 1) {
  return KNOWN.map((source) => ({
    source,
    listings: 50,
    freshestAt: hoursAgo(ageHours),
  }));
}

function summarize(over: Partial<HealthInput> = {}) {
  const lastRun = over.lastRun !== undefined ? over.lastRun : run();
  return summarizeHealth({
    now: NOW,
    lastRun,
    lastCompletedRun: over.lastCompletedRun !== undefined ? over.lastCompletedRun : lastRun,
    sourceRows: over.sourceRows ?? freshSources(),
    knownSources: over.knownSources ?? KNOWN,
  });
}

describe("summarizeHealth", () => {
  it("reports ok when a recent cycle finished and every source is fresh", () => {
    const health = summarize();

    expect(health.status).toBe("ok");
    expect(health.sources.every((s) => !s.stale)).toBe(true);
    expect(health.lastRun).toMatchObject({ upserted: 140, durationSecs: 3600 });
  });

  it("reports never_run when the table is empty", () => {
    const health = summarize({ lastRun: null, lastCompletedRun: null });

    expect(health.status).toBe("never_run");
    expect(health.lastRun).toBeNull();
  });

  it("reports running while the first cycle is still in flight", () => {
    const health = summarize({
      lastRun: run({ finishedAt: null, startedAt: hoursAgo(0.2) }),
      lastCompletedRun: null,
      // An in-flight first cycle has not indexed anything yet; that must not
      // be mistaken for three broken scrapers.
      sourceRows: [],
    });

    expect(health.status).toBe("running");
  });

  it("reports stale when a cycle started long ago and never finished", () => {
    const health = summarize({
      lastRun: run({ finishedAt: null, startedAt: hoursAgo(MAX_RUN_AGE_HOURS + 1) }),
      lastCompletedRun: null,
    });

    expect(health.status).toBe("stale");
    expect(health.reason).toMatch(/nunca termin/);
  });

  it("reports stale when the last completed cycle is older than the limit", () => {
    const old = run({ startedAt: hoursAgo(30), finishedAt: hoursAgo(29) });

    const health = summarize({ lastRun: old, lastCompletedRun: old });

    expect(health.status).toBe("stale");
    expect(health.reason).toMatch(/cron probablemente/);
  });

  it("still reports stale even when the sources look fresh", () => {
    // Cron down is the more urgent fact; listings stay fresh for a while after.
    const old = run({ startedAt: hoursAgo(30), finishedAt: hoursAgo(29) });

    const health = summarize({
      lastRun: old,
      lastCompletedRun: old,
      sourceRows: freshSources(1),
    });

    expect(health.status).toBe("stale");
  });

  it("reports degraded and names the source whose listings went cold", () => {
    // This is the scraper-drift signal: broken selectors return an empty list
    // rather than an error, so the cycle succeeds while one source dries up.
    const health = summarize({
      sourceRows: [
        { source: "linkedin", listings: 50, freshestAt: hoursAgo(1) },
        { source: "infojobs", listings: 20, freshestAt: hoursAgo(MAX_SOURCE_AGE_HOURS + 5) },
        { source: "tecnoempleo", listings: 30, freshestAt: hoursAgo(1) },
      ],
    });

    expect(health.status).toBe("degraded");
    expect(health.reason).toContain("infojobs");
    expect(health.reason).not.toContain("linkedin");
  });

  it("treats a source that never produced a listing as stale", () => {
    const health = summarize({
      sourceRows: [
        { source: "linkedin", listings: 50, freshestAt: hoursAgo(1) },
        { source: "infojobs", listings: 20, freshestAt: hoursAgo(1) },
      ],
    });

    const tecnoempleo = health.sources.find((s) => s.source === "tecnoempleo");
    expect(tecnoempleo).toMatchObject({ listings: 0, freshestAt: null, ageHours: null, stale: true });
    expect(health.status).toBe("degraded");
  });

  it("keeps a source exactly at the limit healthy", () => {
    // Guards the boundary against flipping to > vs >=.
    const health = summarize({
      sourceRows: KNOWN.map((source) => ({
        source,
        listings: 10,
        freshestAt: hoursAgo(MAX_SOURCE_AGE_HOURS),
      })),
    });

    expect(health.status).toBe("ok");
  });

  it("leaves durationSecs null while a run is unfinished", () => {
    const health = summarize({
      lastRun: run({ finishedAt: null, startedAt: hoursAgo(0.1) }),
      lastCompletedRun: null,
    });

    expect(health.lastRun?.durationSecs).toBeNull();
  });

  it("surfaces the error message the worker stored", () => {
    const failed = run({ error: "connect ETIMEDOUT", failures: 3 });

    const health = summarize({ lastRun: failed, lastCompletedRun: failed });

    expect(health.lastRun).toMatchObject({ error: "connect ETIMEDOUT", failures: 3 });
  });
});
