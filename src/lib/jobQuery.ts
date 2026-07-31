import { prisma } from "@/lib/prisma";
import type { NormalizedJob, WorkMode } from "@/lib/jobSources/types";

/** Listings older than this are treated as stale even if not pruned yet. */
const MAX_AGE_DAYS = 14;
const DEFAULT_LIMIT = 60;

/**
 * Reads what the background worker already scraped. Searches never touch a
 * scraped site themselves — see src/lib/scrapeWorker.ts.
 */
export async function searchStoredJobs(
  skills: string[],
  modes: WorkMode[],
  limit: number = DEFAULT_LIMIT
): Promise<NormalizedJob[]> {
  if (skills.length === 0) return [];

  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  const matchesSkill = {
    OR: skills.flatMap((skill) => [
      { title: { contains: skill, mode: "insensitive" as const } },
      { description: { contains: skill, mode: "insensitive" as const } },
    ]),
  };

  // A listing with no stated modality passes any filter — most sources don't
  // report it, and dropping those would throw away most of the index.
  const matchesMode =
    modes.length > 0 && modes.length < 3
      ? { OR: [{ workMode: null }, { workMode: { in: modes } }] }
      : {};

  const rows = await prisma.jobListing.findMany({
    where: { fetchedAt: { gte: cutoff }, AND: [matchesSkill, matchesMode] },
    orderBy: [{ postedAt: { sort: "desc", nulls: "last" } }, { fetchedAt: "desc" }],
    take: limit,
  });

  return rows.map((r) => ({
    source: r.source,
    externalId: r.externalId,
    title: r.title,
    company: r.company ?? undefined,
    location: r.location ?? undefined,
    url: r.url,
    description: r.description ?? undefined,
    workMode: (r.workMode as WorkMode | null) ?? undefined,
    postedAt: r.postedAt?.toISOString(),
  }));
}

/** Distinguishes "nothing matches your skills" from "the worker never ran". */
export async function indexIsEmpty(): Promise<boolean> {
  const any = await prisma.jobListing.findFirst({ select: { id: true } });
  return any === null;
}
