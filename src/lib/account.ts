import { prisma } from "@/lib/prisma";
import { loginEmailKey } from "@/lib/rateLimit";

/**
 * Everything the app stores about one person, in one place, so the export and
 * the deletion cannot drift apart — if a field is added to the profile it shows
 * up in the export automatically, and the cascade takes care of removing it.
 */
export interface AccountExport {
  exportedAt: string;
  user: { id: string; email: string; name: string | null; createdAt: string };
  profile: {
    linkedinUrl: string | null;
    cvText: string | null;
    yearsExp: number | null;
    summary: string | null;
    updatedAt: string;
  } | null;
  skills: {
    name: string;
    category: string | null;
    yearsExp: number | null;
    level: string | null;
  }[];
  /** Cached fit verdicts. Derived from the CV, so they are personal data too. */
  jobFits: {
    source: string;
    externalId: string;
    score: number;
    verdict: string;
    summary: string;
    strengths: string[];
    gaps: string[];
    createdAt: string;
  }[];
}

export async function exportAccount(userId: string): Promise<AccountExport | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: { include: { skills: true } },
      jobFits: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!user) return null;

  return {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    },
    profile: user.profile
      ? {
          linkedinUrl: user.profile.linkedinUrl,
          // The full CV text is included on purpose: it is the most personal
          // thing stored, so an export that left it out would be a lie.
          cvText: user.profile.cvText,
          yearsExp: user.profile.yearsExp,
          summary: user.profile.summary,
          updatedAt: user.profile.updatedAt.toISOString(),
        }
      : null,
    skills: (user.profile?.skills ?? []).map((s) => ({
      name: s.name,
      category: s.category,
      yearsExp: s.yearsExp,
      level: s.level,
    })),
    jobFits: user.jobFits.map((f) => ({
      source: f.source,
      externalId: f.externalId,
      score: f.score,
      verdict: f.verdict,
      summary: f.summary,
      strengths: f.strengths,
      gaps: f.gaps,
      createdAt: f.createdAt.toISOString(),
    })),
  };
}

/**
 * Drops the CV and everything derived from it while keeping the account.
 * Skills go through the Profile cascade.
 *
 * Fit verdicts have to be deleted explicitly: they hang off the User, not off
 * the Profile, so no cascade reaches them — and they are derived from the CV,
 * quote parts of it back, and would otherwise survive a request to delete it.
 */
export async function deleteProfileData(userId: string): Promise<boolean> {
  const [, profile] = await prisma.$transaction([
    prisma.jobFit.deleteMany({ where: { userId } }),
    prisma.profile.deleteMany({ where: { userId } }),
  ]);
  return profile.count > 0;
}

/**
 * Rate-limit rows survive the User row, and some of their keys embed personal
 * data. Only the ones identifying this person are removed: the IP-keyed
 * counters are shared with everyone behind that address, and clearing them
 * would hand someone a way to reset a brute-force counter on demand.
 */
export function personalRateLimitKeys(userId: string, email: string): string[] {
  return [
    `upload:${userId}`,
    `search:${userId}`,
    `fit:${userId}`,
    `export:${userId}`,
    `account-delete:${userId}`,
    // Built by the limiter itself, so the two cannot drift apart.
    loginEmailKey(email),
  ];
}

/**
 * Deletes the account outright. Profile, Skill and JobFit go through the FK
 * cascade declared in the schema (verified in the migrations: ON DELETE
 * CASCADE).
 */
export async function deleteAccount(userId: string, email: string): Promise<void> {
  await prisma.$transaction([
    prisma.rateLimit.deleteMany({
      where: { key: { in: personalRateLimitKeys(userId, email) } },
    }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}
