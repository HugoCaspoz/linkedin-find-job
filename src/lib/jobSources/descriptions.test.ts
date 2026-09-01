import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rateLimit", () => ({
  throttleHost: vi.fn().mockResolvedValue(undefined),
}));

import { throttleHost } from "@/lib/rateLimit";
import { fetchLinkedInDescription } from "./linkedinScrape";
import { fetchInfoJobsDescription } from "./infojobsScrape";
import { fetchTecnoempleoDescription } from "./tecnoempleoScrape";
import { calledUrl, stubFetch } from "./testUtils";

const PROSE =
  "Trabajarás en el equipo de plataforma con TypeScript, Node.js y Postgres. " +
  "Pedimos 4 años de experiencia y ganas de participar en el diseño de los servicios.";

function page(selectorClass: string): string {
  return `<body><div class="${selectorClass}">${PROSE}</div></body>`;
}

describe("fetchLinkedInDescription", () => {
  it("asks the guest posting endpoint, not the public job URL", async () => {
    // The stored URL is what the user clicks; hitting it from a scraper gets a
    // login wall, so the description comes from the same unauthenticated
    // endpoint the search already uses.
    const fetchMock = stubFetch(page("show-more-less-html__markup"));

    await fetchLinkedInDescription({
      externalId: "3901234567",
      url: "https://www.linkedin.com/jobs/view/3901234567",
    });

    expect(calledUrl(fetchMock).pathname).toBe(
      "/jobs-guest/jobs/api/jobPosting/3901234567"
    );
  });

  it("returns the description text", async () => {
    stubFetch(page("show-more-less-html__markup"));

    const text = await fetchLinkedInDescription({ externalId: "1", url: "https://x" });

    expect(text).toContain("Postgres");
  });

  it("waits on the host cooldown before requesting", async () => {
    stubFetch(page("show-more-less-html__markup"));

    await fetchLinkedInDescription({ externalId: "1", url: "https://x" });

    expect(throttleHost).toHaveBeenCalledWith("linkedin.com");
  });

  it("returns undefined on a non-OK response", async () => {
    stubFetch("", false);

    await expect(
      fetchLinkedInDescription({ externalId: "1", url: "https://x" })
    ).resolves.toBeUndefined();
  });
});

describe("fetchInfoJobsDescription", () => {
  it("requests the listing's own page", async () => {
    const fetchMock = stubFetch(page("ij-OfferDetail-description"));
    const url = "https://www.infojobs.net/madrid/backend/of-iabc123";

    const text = await fetchInfoJobsDescription({ externalId: "abc123", url });

    expect(fetchMock.mock.calls[0][0]).toBe(url);
    expect(text).toContain("TypeScript");
  });

  it("still reads a page whose classes have been renamed", async () => {
    const text = await readWithRenamedMarkup(fetchInfoJobsDescription);
    expect(text).toContain("Node.js");
  });
});

describe("fetchTecnoempleoDescription", () => {
  it("requests the listing's own page", async () => {
    const fetchMock = stubFetch(`<body><div id="descripcion">${PROSE}</div></body>`);
    const url = "https://www.tecnoempleo.com/backend/rf-abc123";

    const text = await fetchTecnoempleoDescription({ externalId: "abc123", url });

    expect(fetchMock.mock.calls[0][0]).toBe(url);
    expect(text).toContain("Node.js");
  });

  it("still reads a page whose classes have been renamed", async () => {
    const text = await readWithRenamedMarkup(fetchTecnoempleoDescription);
    expect(text).toContain("Node.js");
  });
});

/**
 * The failure these sources are actually exposed to. A scraper pinned to one
 * class returns nothing the day the site ships a redesign, and the column goes
 * quietly back to NULL — which is the state this whole feature exists to fix.
 */
async function readWithRenamedMarkup(
  fetchDescription: (job: { externalId: string; url: string }) => Promise<string | undefined>
): Promise<string | undefined> {
  stubFetch(page("clase-que-nadie-ha-visto"));
  return fetchDescription({ externalId: "1", url: "https://x" });
}
