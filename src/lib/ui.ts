/**
 * Types and helpers shared by the client components. They live here rather
 * than in one of the pages because three tabs now render the same shapes, and
 * a copy per tab is how the labels drift apart.
 */

import type { Seniority } from "@/lib/seniority";
import type { WorkMode } from "@/lib/jobSources/types";

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  remote: "Remoto",
  hybrid: "Híbrido",
  onsite: "Presencial",
};

export const SENIORITY_LABELS: Record<Seniority, string> = {
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
};

export const SOURCE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  infojobs: "InfoJobs",
  tecnoempleo: "Tecnoempleo",
  adzuna: "Adzuna",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export interface Skill {
  name: string;
  category: string | null;
  yearsExp: number | null;
  level: string | null;
}

export interface Profile {
  summary: string | null;
  yearsExp: number | null;
  skills: Skill[];
}

export interface Job {
  source: string;
  /** The listing's id at its source. Identifies it to /api/jobs/fit. */
  externalId: string;
  title: string;
  company?: string;
  location?: string;
  url: string;
  workMode?: WorkMode;
  seniority?: Seniority;
  postedAt?: string;
  score?: number;
  matchedSkills?: string[];
  /** Subset of matchedSkills found in the title, which the scoring weights at
   * three times a description hit. The fit gauge shows that split. */
  titleSkills?: string[];
  /** Opening of the description. The full text stays on the server. */
  excerpt?: string;
  /** False while the worker has not managed to read the listing's own page. */
  hasDescription?: boolean;
  /** Whether /api/jobs/fit can analyse this one — see ScoredJob in jobQuery. */
  canAnalyze?: boolean;
  /** Years of experience the description asks for, when it says so. */
  requiredYears?: number;
}

export type FitVerdict = "strong" | "partial" | "weak";

/** What POST /api/jobs/fit answers with. */
export interface JobFit {
  score: number;
  verdict: FitVerdict;
  summary: string;
  strengths: string[];
  gaps: string[];
  cached: boolean;
}

export const FIT_VERDICT_LABELS: Record<FitVerdict, string> = {
  strong: "Encajas",
  partial: "Encajas en parte",
  weak: "Encaje flojo",
};

/** A 500 can come back as an HTML error page rather than JSON. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function errorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const { error } = data as { error: unknown };
    if (typeof error === "string") return error;
  }
  return fallback;
}

/**
 * "hace 3 días" instead of a raw timestamp. Listings are at most a fortnight
 * old by the time they're served, so a relative age is both shorter and easier
 * to judge than a date.
 */
export function relativeDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;

  const days = Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

/**
 * The categories `extractProfile` assigns. Grouping the skill list by these
 * turns twenty loose pills into five short, labelled rows — the same
 * information, but readable at a glance.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  language: "Lenguajes",
  framework: "Frameworks",
  database: "Bases de datos",
  cloud: "Cloud y DevOps",
  tool: "Herramientas",
  other: "Otras",
};

/** Fixed order so the list doesn't reshuffle between uploads. */
export const CATEGORY_ORDER = [
  "language",
  "framework",
  "database",
  "cloud",
  "tool",
  "other",
] as const;

export function groupByCategory(skills: Skill[]): [string, Skill[]][] {
  const groups = new Map<string, Skill[]>();

  for (const skill of skills) {
    // A category the model invented, or none at all, still has to appear
    // somewhere — dropping it would silently lose a skill from the list.
    const key = skill.category && CATEGORY_LABELS[skill.category] ? skill.category : "other";
    const bucket = groups.get(key);
    if (bucket) bucket.push(skill);
    else groups.set(key, [skill]);
  }

  return CATEGORY_ORDER.filter((key) => groups.has(key)).map((key) => [
    CATEGORY_LABELS[key],
    groups.get(key)!,
  ]);
}
