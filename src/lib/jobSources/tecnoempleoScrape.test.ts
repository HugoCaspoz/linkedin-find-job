import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rateLimit", () => ({
  throttleHost: vi.fn().mockResolvedValue(undefined),
}));

import { scrapeTecnoempleo } from "./tecnoempleoScrape";
import { calledUrl, stubFetch } from "./testUtils";

const HTML = readFileSync(
  new URL("./__fixtures__/tecnoempleo-search.html", import.meta.url),
  "utf8"
);

describe("scrapeTecnoempleo", () => {
  it("maps a card onto NormalizedJob", async () => {
    stubFetch(HTML);

    const [job] = await scrapeTecnoempleo("Java");

    expect(job).toEqual({
      source: "tecnoempleo",
      externalId: "a1b2c3d4e5",
      title: "Desarrollador Java / Spring Boot",
      company: "Consultora Dos",
      location: "Madrid",
      url: "https://www.tecnoempleo.com/desarrollador-java-spring/madrid/rf-a1b2c3d4e5",
      workMode: "hybrid",
    });
  });

  it("reads the modality out of the metadata column's free text", async () => {
    stubFetch(HTML);

    const modes = (await scrapeTecnoempleo("Java")).map((j) => j.workMode);

    // "Hibrido" and "100% remoto" — the second is why this is a substring
    // match rather than an equality check.
    expect(modes).toEqual(["hybrid", "remote"]);
  });

  it("skips a card with no rf- reference and a block missing card classes", async () => {
    stubFetch(HTML);

    const jobs = await scrapeTecnoempleo("Java");

    expect(jobs.map((j) => j.externalId)).toEqual(["a1b2c3d4e5", "f6e5d4c3b2"]);
  });

  it("sends Tecnoempleo's own en_remoto codes, comma-wrapped", async () => {
    const fetchMock = stubFetch(HTML);

    await scrapeTecnoempleo("Java", ["remote", "hybrid"]);

    expect(calledUrl(fetchMock).searchParams.get("en_remoto")).toBe(",1,3,");
  });

  it.each([
    ["none selected", [] as const],
    ["all three selected", ["remote", "hybrid", "onsite"] as const],
  ])("omits en_remoto when %s", async (_label, modes) => {
    const fetchMock = stubFetch(HTML);

    await scrapeTecnoempleo("Java", [...modes]);

    expect(calledUrl(fetchMock).searchParams.has("en_remoto")).toBe(false);
  });

  it("returns no jobs when Tecnoempleo rejects the request", async () => {
    stubFetch("", false);

    await expect(scrapeTecnoempleo("Java")).resolves.toEqual([]);
  });

  it("returns no jobs when the request fails outright", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    await expect(scrapeTecnoempleo("Java")).resolves.toEqual([]);
  });
});
