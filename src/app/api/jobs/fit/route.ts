import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import { JobFitError, analyzeJobFit, type Verdict } from "@/lib/jobFit";

/**
 * Reads one listing's full description against the caller's CV and returns a
 * verdict on the fit.
 *
 * One listing per request, on demand, rather than as part of the search: the
 * search returns up to ninety-six results and this costs a model call, so
 * analysing a page would be up to ninety-six calls for a list the user is
 * still skimming.
 */

// One model call behind the usual 8s-ish latency; the ceiling is for a slow
// response, not for the normal case.
export const maxDuration = 30;

/** Model calls are the one thing here that costs money per request. */
const ANALYSES_PER_HOUR = 40;

const bodySchema = z.object({
  source: z.string().min(1).max(40),
  externalId: z.string().min(1).max(200),
});

export interface JobFitResponse {
  score: number;
  verdict: Verdict;
  summary: string;
  strengths: string[];
  gaps: string[];
  /** True when this came from the cache rather than from a fresh model call. */
  cached: boolean;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const userId = session.user.id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }
  const { source, externalId } = parsed.data;

  const profile = await prisma.profile.findUnique({
    where: { userId },
    include: { skills: true },
  });
  if (!profile) {
    return NextResponse.json(
      { error: "Sube tu CV primero para analizar el encaje" },
      { status: 400 }
    );
  }

  const listing = await prisma.jobListing.findUnique({
    where: { source_externalId: { source, externalId } },
    select: { title: true, company: true, location: true, description: true },
  });

  // Two different "no" answers, kept apart because the fix differs: a listing
  // that is not indexed at all (an Adzuna result) will never be analysable,
  // while an indexed one with no description yet is waiting on the worker's
  // detail pass and will be.
  if (!listing) {
    return NextResponse.json(
      { error: "Esta oferta no está indexada, así que no se puede analizar." },
      { status: 404 }
    );
  }
  if (!listing.description) {
    return NextResponse.json(
      {
        error:
          "Todavía no hemos podido leer la descripción de esta oferta. Inténtalo tras el próximo ciclo del worker.",
      },
      { status: 409 }
    );
  }

  // Read before the rate limit is consumed: serving a cached verdict costs
  // nothing, so charging quota for it would let a user run out by scrolling
  // back to offers they have already analysed.
  const cached = await prisma.jobFit.findUnique({
    where: { userId_source_externalId: { userId, source, externalId } },
  });
  if (cached && cached.profileStamp.getTime() === profile.updatedAt.getTime()) {
    return NextResponse.json(toResponse(cached, true));
  }

  const limit = await checkRateLimit(
    `fit:${userId}`,
    ANALYSES_PER_HOUR,
    60 * 60 * 1000
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Demasiados análisis seguidos. Inténtalo más tarde." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSecs) } }
    );
  }

  let result;
  try {
    result = await analyzeJobFit(
      {
        summary: profile.summary,
        yearsExp: profile.yearsExp,
        skills: profile.skills.map((s) => s.name),
        cvText: profile.cvText,
      },
      {
        title: listing.title,
        company: listing.company,
        location: listing.location,
        description: listing.description,
      }
    );
  } catch (err) {
    if (err instanceof JobFitError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error("[jobs/fit] el análisis falló", err);
    return NextResponse.json(
      { error: "No se pudo analizar el encaje" },
      { status: 500 }
    );
  }

  // Upsert rather than create: a stale row for this listing is being replaced,
  // and the unique key is what makes that a single statement.
  const saved = await prisma.jobFit.upsert({
    where: { userId_source_externalId: { userId, source, externalId } },
    create: { userId, source, externalId, profileStamp: profile.updatedAt, ...result },
    update: { profileStamp: profile.updatedAt, ...result, createdAt: new Date() },
  });

  return NextResponse.json(toResponse(saved, false));
}

interface StoredFit {
  score: number;
  verdict: string;
  summary: string;
  strengths: string[];
  gaps: string[];
}

function toResponse(fit: StoredFit, cached: boolean): JobFitResponse {
  return {
    score: fit.score,
    verdict: fit.verdict as Verdict,
    summary: fit.summary,
    strengths: fit.strengths,
    gaps: fit.gaps,
    cached,
  };
}
