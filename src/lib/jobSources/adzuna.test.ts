import { beforeEach, describe, expect, it, vi } from "vitest";

const { envMock } = vi.hoisted(() => ({ envMock: vi.fn() }));
// `env()` validates DATABASE_URL and AUTH_SECRET, which this module does not
// use and a unit test should not have to supply.
vi.mock("@/lib/env", () => ({ env: envMock }));

import { searchAdzuna } from "./adzuna";
import { calledUrl, stubFetch } from "./testUtils";

const BODY = JSON.stringify({
  results: [
    {
      id: "4321",
      title: "Backend Engineer",
      company: { display_name: "Adzuna Co" },
      location: { display_name: "Madrid" },
      redirect_url: "https://www.adzuna.es/details/4321",
      description: "Python y Postgres",
      created: "2026-08-12T09:00:00Z",
    },
    { id: "8765", title: "Sin metadatos", redirect_url: "https://www.adzuna.es/details/8765" },
  ],
});

describe("searchAdzuna", () => {
  beforeEach(() => {
    envMock.mockReturnValue({ ADZUNA_APP_ID: "app-id", ADZUNA_APP_KEY: "app-key" });
  });

  it("maps results, leaving absent nested fields undefined", async () => {
    stubFetch(BODY);

    const jobs = await searchAdzuna("Python");

    expect(jobs).toEqual([
      {
        source: "adzuna",
        externalId: "4321",
        title: "Backend Engineer",
        company: "Adzuna Co",
        location: "Madrid",
        url: "https://www.adzuna.es/details/4321",
        description: "Python y Postgres",
        postedAt: "2026-08-12T09:00:00Z",
      },
      {
        source: "adzuna",
        externalId: "8765",
        title: "Sin metadatos",
        company: undefined,
        location: undefined,
        url: "https://www.adzuna.es/details/8765",
        description: undefined,
        postedAt: undefined,
      },
    ]);
  });

  it("skips the call entirely when no credentials are configured", async () => {
    envMock.mockReturnValue({});
    const fetchMock = stubFetch(BODY);

    await expect(searchAdzuna("Python")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the credentials and the query", async () => {
    const fetchMock = stubFetch(BODY);

    await searchAdzuna("Python");

    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe("/v1/api/jobs/es/search/1");
    expect(url.searchParams.get("app_id")).toBe("app-id");
    expect(url.searchParams.get("app_key")).toBe("app-key");
    expect(url.searchParams.get("what")).toBe("Python");
  });

  it("puts the country in the path", async () => {
    const fetchMock = stubFetch(BODY);

    await searchAdzuna("Python", [], "gb");

    expect(calledUrl(fetchMock).pathname).toBe("/v1/api/jobs/gb/search/1");
  });

  it("falls back to a query-text hint for a remote-only search", async () => {
    // Adzuna has no work-mode filter param, so this is the best it can do.
    const fetchMock = stubFetch(BODY);

    await searchAdzuna("Python", ["remote"]);

    expect(calledUrl(fetchMock).searchParams.get("what")).toBe("Python remoto");
  });

  it.each([
    ["several modalities", ["remote", "hybrid"] as const],
    ["onsite only", ["onsite"] as const],
  ])("leaves the query untouched for %s", async (_label, modes) => {
    const fetchMock = stubFetch(BODY);

    await searchAdzuna("Python", [...modes]);

    expect(calledUrl(fetchMock).searchParams.get("what")).toBe("Python");
  });

  it("returns no jobs when Adzuna rejects the request", async () => {
    stubFetch("", false);

    await expect(searchAdzuna("Python")).resolves.toEqual([]);
  });

  it("returns no jobs when the request fails outright", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    await expect(searchAdzuna("Python")).resolves.toEqual([]);
  });
});
