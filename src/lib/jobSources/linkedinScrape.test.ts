import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";

// Throttling reserves a slot in Postgres. Parsing tests have no business
// booting Prisma, and the worker's pacing is not what is under test here.
vi.mock("@/lib/rateLimit", () => ({
  throttleHost: vi.fn().mockResolvedValue(undefined),
}));

import { scrapeLinkedIn } from "./linkedinScrape";
import { calledUrl, stubFetch } from "./testUtils";

const HTML = readFileSync(
  new URL("./__fixtures__/linkedin-search.html", import.meta.url),
  "utf8"
);

describe("scrapeLinkedIn", () => {
  it("maps a complete card onto NormalizedJob", async () => {
    stubFetch(HTML);

    const [job] = await scrapeLinkedIn("React");

    expect(job).toEqual({
      source: "linkedin",
      externalId: "3812345678",
      title: "Senior React Developer",
      company: "Acme Corp",
      location: "Madrid, Community of Madrid, Spain",
      // The tracking query string is dropped so the same posting does not
      // produce a different URL on every crawl.
      url: "https://es.linkedin.com/jobs/view/senior-react-developer-at-acme-3812345678",
      postedAt: "2026-08-14",
    });
  });

  it("skips cards with no URN and cards with no link", async () => {
    stubFetch(HTML);

    const jobs = await scrapeLinkedIn("React");

    expect(jobs.map((j) => j.externalId)).toEqual(["3812345678", "3899999999"]);
  });

  it("leaves absent optional fields undefined rather than empty strings", async () => {
    stubFetch(HTML);

    const job = (await scrapeLinkedIn("React")).find(
      (j) => j.externalId === "3899999999"
    );

    expect(job?.company).toBeUndefined();
    expect(job?.postedAt).toBeUndefined();
    expect(job?.location).toBe("Remote");
  });

  it("sends LinkedIn's own f_WT codes for the selected modalities", async () => {
    const fetchMock = stubFetch(HTML);

    await scrapeLinkedIn("React", ["remote", "hybrid"]);

    expect(calledUrl(fetchMock).searchParams.get("f_WT")).toBe("2,3");
  });

  it.each([
    ["none selected", [] as const],
    ["all three selected", ["remote", "hybrid", "onsite"] as const],
  ])("omits f_WT when %s, which LinkedIn reads as any", async (_label, modes) => {
    const fetchMock = stubFetch(HTML);

    await scrapeLinkedIn("React", [...modes]);

    expect(calledUrl(fetchMock).searchParams.has("f_WT")).toBe(false);
  });

  it("passes the query and location through", async () => {
    const fetchMock = stubFetch(HTML);

    await scrapeLinkedIn("Go", [], "Portugal");

    const url = calledUrl(fetchMock);
    expect(url.searchParams.get("keywords")).toBe("Go");
    expect(url.searchParams.get("location")).toBe("Portugal");
  });

  it("returns no jobs when LinkedIn rejects the request", async () => {
    stubFetch("", false);

    await expect(scrapeLinkedIn("React")).resolves.toEqual([]);
  });

  it("returns no jobs when the request fails outright", async () => {
    // What a timeout looks like: one dead source must not fail the cycle.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    await expect(scrapeLinkedIn("React")).resolves.toEqual([]);
  });
});
