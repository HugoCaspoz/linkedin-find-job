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
  title: string;
  company?: string;
  location?: string;
  url: string;
  workMode?: WorkMode;
  seniority?: Seniority;
  postedAt?: string;
  score?: number;
  matchedSkills?: string[];
}

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
