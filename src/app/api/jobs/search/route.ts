import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchAdzuna } from "@/lib/jobSources/adzuna";
import { searchStoredJobs, indexIsEmpty } from "@/lib/jobQuery";
import { scoreJob } from "@/lib/matching";
import { checkRateLimit } from "@/lib/rateLimit";
import type { WorkMode } from "@/lib/jobSources/types";

// Only Adzuna is called live, behind an 8s timeout; the scraped sources are
// read from the DB.
export const maxDuration = 15;

const VALID_MODES: WorkMode[] = ["remote", "hybrid", "onsite"];
const SEARCHES_PER_HOUR = 60;
/** How many skills feed the query. */
const TOP_SKILLS = 5;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const limit = await checkRateLimit(
    `search:${session.user.id}`,
    SEARCHES_PER_HOUR,
    60 * 60 * 1000
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Demasiadas búsquedas seguidas. Inténtalo más tarde." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSecs) } }
    );
  }

  const { searchParams } = new URL(req.url);
  const modes = (searchParams.get("modes")?.split(",").filter(Boolean) ?? []).filter(
    (m): m is WorkMode => VALID_MODES.includes(m as WorkMode)
  );

  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
    include: { skills: true },
  });

  if (!profile || profile.skills.length === 0) {
    return NextResponse.json(
      { error: "Sube tu CV primero para detectar tus skills" },
      { status: 400 }
    );
  }

  const topSkills = [...profile.skills]
    .sort((a, b) => (b.yearsExp ?? 0) - (a.yearsExp ?? 0))
    .slice(0, TOP_SKILLS)
    .map((s) => s.name);

  // Adzuna is an official API, so it stays live. Everything scraped comes from
  // what the worker already indexed — see src/lib/scrapeWorker.ts.
  const [adzunaJobs, storedJobs] = await Promise.all([
    // Adzuna treats the query as one string, and its own relevance ranking
    // handles the combination better than an AND of five terms would.
    searchAdzuna(topSkills.slice(0, 3).join(" "), modes),
    searchStoredJobs(topSkills, modes),
  ]);

  // Adzuna arrives unranked, so it is scored here with the same rule Postgres
  // applies to the stored listings; otherwise merging the two lists would put
  // whatever Adzuna returned first above better matches from the index.
  const scoredAdzuna = adzunaJobs.map((job) => ({
    ...job,
    ...scoreJob(job, topSkills),
  }));

  const jobs = [...scoredAdzuna, ...storedJobs].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Same score: newer first, and listings with no date last.
    return (b.postedAt ?? "").localeCompare(a.postedAt ?? "");
  });

  // Adzuna results aren't persisted here: they're already a supported API, so
  // there's no reason to keep a local copy just to re-serve it.
  const response: Record<string, unknown> = {
    query: topSkills.join(", "),
    count: jobs.length,
    jobs,
  };

  if (storedJobs.length === 0 && (await indexIsEmpty())) {
    response.notice =
      "Todavía no hay ofertas indexadas. El worker de scraping aún no ha corrido.";
  }

  return NextResponse.json(response);
}
