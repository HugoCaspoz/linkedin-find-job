import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rateLimit", () => ({
  throttleHost: vi.fn().mockResolvedValue(undefined),
}));

import { scrapeInfoJobs } from "./infojobsScrape";
import { calledUrl, stubFetch } from "./testUtils";

const HTML = readFileSync(
  new URL("./__fixtures__/infojobs-search.html", import.meta.url),
  "utf8"
);

describe("scrapeInfoJobs", () => {
  it("maps a card and turns the protocol-relative href into an absolute URL", async () => {
    stubFetch(HTML);

    const [job] = await scrapeInfoJobs("Python");

    expect(job).toEqual({
      source: "infojobs",
      externalId: "4a2b3c4d5e6f7",
      title: "Desarrollador Backend Python",
      company: "Empresa Uno S.L.",
      location: "Madrid",
      url: "https://www.infojobs.net/madrid/desarrollador-backend-python/of-i4a2b3c4d5e6f7",
      workMode: "remote",
    });
  });

  it("reads each modality wording InfoJobs uses", async () => {
    stubFetch(HTML);

    const modes = (await scrapeInfoJobs("Python")).map((j) => j.workMode);

    // "Teletrabajo", "Hibrido", "Presencial" in fixture order.
    expect(modes).toEqual(["remote", "hybrid", "onsite"]);
  });

  it("skips a card whose URL carries no of-i identifier", async () => {
    stubFetch(HTML);

    const jobs = await scrapeInfoJobs("Python");

    expect(jobs).toHaveLength(3);
    expect(jobs.every((j) => j.externalId)).toBe(true);
  });

  it("filters client-side, since InfoJobs has no modality query param", async () => {
    const fetchMock = stubFetch(HTML);

    const jobs = await scrapeInfoJobs("Python", ["remote"]);

    expect(jobs.map((j) => j.workMode)).toEqual(["remote"]);
    // The filter is applied to the results, not to the request.
    expect([...calledUrl(fetchMock).searchParams.keys()]).toEqual(["keyword"]);
  });

  it.each([
    ["none selected", [] as const],
    ["all three selected", ["remote", "hybrid", "onsite"] as const],
  ])("returns every card when %s", async (_label, modes) => {
    stubFetch(HTML);

    const jobs = await scrapeInfoJobs("Python", [...modes]);

    expect(jobs).toHaveLength(3);
  });

  it("returns no jobs when InfoJobs rejects the request", async () => {
    stubFetch("", false);

    await expect(scrapeInfoJobs("Python")).resolves.toEqual([]);
  });

  it("returns no jobs when the request fails outright", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    await expect(scrapeInfoJobs("Python")).resolves.toEqual([]);
  });
});
