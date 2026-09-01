/**
 * Background scraping cycle, run from wherever you want the traffic to appear
 * to come from — a VPS, a home box, a CI runner.
 *
 *   npm run scrape
 *   npm run scrape -- --queries "React,Python" --max 10
 *   npm run scrape -- --descriptions 100   # detail pages per source, 0 skips
 *
 * Point cron at it, e.g. every 6 hours:
 *   0 *\/6 * * * cd /srv/link && npm run scrape >> /var/log/link-scrape.log 2>&1
 */
import { prisma } from "@/lib/prisma";
import { runScrapeCycle } from "@/lib/scrapeWorker";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const queriesArg = flag("queries");
  const maxArg = flag("max");
  const descriptionsArg = flag("descriptions");

  const started = Date.now();
  const summary = await runScrapeCycle({
    queries: queriesArg?.split(",").map((q) => q.trim()).filter(Boolean),
    maxQueries: maxArg ? Number(maxArg) : undefined,
    // No deadline: run from cron on a machine you control, this is allowed to
    // take as long as the per-host cooldowns need.
    descriptionBudget: descriptionsArg ? Number(descriptionsArg) : undefined,
  });

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `[scrape] ${summary.queries} queries en ${secs}s — ` +
      `${summary.upserted} ofertas, ${summary.failures} fallos, ${summary.pruned} podadas`
  );
  for (const [source, count] of Object.entries(summary.perSource)) {
    console.log(`  ${source}: ${count}`);
  }

  const { attempted, filled } = summary.descriptions;
  console.log(
    `[scrape] descripciones: ${filled}/${attempted} páginas de detalle leídas`
  );
}

main()
  .catch((err) => {
    console.error("[scrape] el ciclo falló", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
