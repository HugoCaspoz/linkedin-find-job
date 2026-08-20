/**
 * Fills `JobListing.seniority` on rows indexed before the column existed.
 *
 *   npm run backfill:seniority          # local DB (.env)
 *   npm run backfill:seniority:prod     # Railway (.env.worker)
 *
 * Idempotent: rerunning it recomputes the same value from the same title, so
 * it is safe to run again after changing the rules in src/lib/seniority.ts.
 * Without it, every listing already in the index reads as "not stated" and the
 * seniority filter silently hides all of them.
 */
import { prisma } from "@/lib/prisma";
import { detectSeniority } from "@/lib/seniority";

/** Titles are short, so the whole table fits in a few round trips. */
const PAGE_SIZE = 500;

async function main() {
  const started = Date.now();
  const counts: Record<string, number> = { junior: 0, mid: 0, senior: 0, "sin nivel": 0 };
  let cursor: string | undefined;
  let scanned = 0;
  let updated = 0;

  for (;;) {
    const page = await prisma.jobListing.findMany({
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, title: true, seniority: true },
    });

    if (page.length === 0) break;

    for (const row of page) {
      const seniority = detectSeniority(row.title);
      counts[seniority ?? "sin nivel"] += 1;

      // Only writing real changes keeps a rerun almost free, and keeps the
      // reported number honest about what the rules actually moved.
      if (seniority !== row.seniority) {
        await prisma.jobListing.update({
          where: { id: row.id },
          data: { seniority },
        });
        updated += 1;
      }
    }

    scanned += page.length;
    cursor = page[page.length - 1].id;
  }

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[backfill] ${scanned} ofertas revisadas en ${secs}s — ${updated} actualizadas`);
  for (const [level, count] of Object.entries(counts)) {
    console.log(`  ${level}: ${count}`);
  }
}

main()
  .catch((err) => {
    console.error("[backfill] falló", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
