import { z } from "zod";

/**
 * Validated at first use rather than at import time, so `next build` (which
 * imports every route module to collect page data) doesn't need production
 * secrets to be present.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "falta la connection string de Postgres"),
  AUTH_SECRET: z
    .string()
    .min(32, "debe tener al menos 32 caracteres — genera uno con `openssl rand -base64 32`")
    .refine(
      (v) => !v.startsWith("changeme"),
      "sigue siendo el placeholder de .env.example — genera uno real"
    ),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ADZUNA_APP_ID: z.string().min(1).optional(),
  ADZUNA_APP_KEY: z.string().min(1).optional(),
  /** Only needed to trigger the scraping worker over HTTP. */
  CRON_SECRET: z.string().min(16).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    // next-auth v5 reads AUTH_SECRET first and falls back to NEXTAUTH_SECRET
    // (node_modules/next-auth/lib/env.js), so accept either here too.
    AUTH_SECRET: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
    ADZUNA_APP_ID: process.env.ADZUNA_APP_ID || undefined,
    ADZUNA_APP_KEY: process.env.ADZUNA_APP_KEY || undefined,
    CRON_SECRET: process.env.CRON_SECRET || undefined,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuración de entorno inválida:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

/**
 * For keys that are only needed by one feature — the app still boots and
 * serves everything else without them, so requiring them globally in `env()`
 * would couple unrelated routes to each other's config.
 */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env()[key];
  if (value == null) {
    throw new Error(`Falta la variable de entorno ${key}`);
  }
  return value as NonNullable<Env[K]>;
}
