import { vi } from "vitest";

/**
 * Stubs the one `fetch` the scrapers make. Returns the mock so a test can
 * assert on the URL that was built, which is half of what these sources get
 * wrong — the filter params are as easy to break as the CSS selectors.
 */
export function stubFetch(body: string, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    text: async () => body,
    json: async () => JSON.parse(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The URL a stubbed fetch was called with, parsed. */
export function calledUrl(fetchMock: ReturnType<typeof stubFetch>): URL {
  return new URL(fetchMock.mock.calls[0][0] as string);
}
