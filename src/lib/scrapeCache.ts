import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { NormalizedJob } from "./jobSources/types";

const DEFAULT_TTL_MS = 15 * 60 * 1000;
/** Empty results are cached too, but briefly — a blocked or changed page
 * shouldn't turn into a retry on every single search. */
const EMPTY_TTL_MS = 2 * 60 * 1000;

export async function withCache(
  key: string,
  fn: () => Promise<NormalizedJob[]>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<NormalizedJob[]> {
  const hit = await prisma.scrapeCache.findFirst({
    where: { key, expiresAt: { gt: new Date() } },
  });
  if (hit) return hit.payload as unknown as NormalizedJob[];

  const jobs = await fn();
  const expiresAt = new Date(Date.now() + (jobs.length > 0 ? ttlMs : EMPTY_TTL_MS));
  const payload = jobs as unknown as Prisma.InputJsonValue;

  await prisma.scrapeCache.upsert({
    where: { key },
    create: { key, payload, expiresAt },
    update: { payload, expiresAt },
  });

  if (Math.random() < 0.05) {
    await prisma.scrapeCache.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }

  return jobs;
}
