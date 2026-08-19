import { env } from "@/lib/env";

/**
 * Imported for its side effect by `instrumentation.ts`, under the Node runtime
 * only. Validating here means a placeholder AUTH_SECRET fails loudly at deploy
 * rather than silently at whichever request first happens to call `env()`.
 */
try {
  env();
} catch (err) {
  // Throwing would not be enough: Next catches it, logs an unhandledRejection,
  // and leaves the server listening, so every request 500s forever while the
  // platform still sees a healthy process and its restart policy never fires.
  // Exiting is what actually fails the deploy.
  console.error("[boot] arranque abortado:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
