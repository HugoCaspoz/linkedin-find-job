import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolves the `@/*` alias from tsconfig, so tests import modules by the
    // same specifier the app does.
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
    // `restoreMocks` only covers spies, so `vi.fn()` call history would
    // otherwise carry over and a test could assert on a previous test's call.
    clearMocks: true,
    // Every scraper test stubs `fetch`; without this a stub leaks into the
    // next file and the failure lands nowhere near its cause.
    unstubGlobals: true,
  },
});
