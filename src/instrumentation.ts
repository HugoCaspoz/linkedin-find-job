/**
 * Runs once per server instance, before the first request is served. Next
 * skips it during `next build` (it bails on
 * `NEXT_PHASE === "phase-production-build"`), which is what lets `env()` stay
 * lazy: a build still needs no production secrets, but a booted server does.
 */
export async function register() {
  // Next calls `register` in every runtime, and the validation is Node-only
  // (it ends in `process.exit`, which the Edge runtime has no equivalent for).
  // Keeping it in a separate module means the edge bundle never compiles that
  // call at all. Only the Node runtime serves this app anyway — Prisma rules
  // out edge — and `process.env` is not fully populated there, so validating
  // outside Node would fail on variables that are in fact set.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
