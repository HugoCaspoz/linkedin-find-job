/**
 * Seniority of a listing, derived from its title when the worker indexes it.
 *
 * No source we scrape reports this as a field, so it has to be read out of the
 * text. Only the title is inspected: descriptions mention seniority constantly
 * without it being the level of the role ("reportarás al Senior Manager",
 * "mentorizarás a juniors"), and a rule that reads them turns a precise signal
 * into noise.
 */

export const SENIORITIES = ["junior", "mid", "senior"] as const;

export type Seniority = (typeof SENIORITIES)[number];

export function isSeniority(value: string): value is Seniority {
  return (SENIORITIES as readonly string[]).includes(value);
}

/**
 * Spanish and English markers, since the sources mix both. `\b` on each side
 * so "sr" doesn't fire on "usr" and "lead" doesn't fire on "leading"; the
 * optional dot covers "Sr." and "Jr.".
 */
const SENIOR = /\b(senior|sr\.?|lead|principal|staff|arquitect[oa]|architect|head of|responsable|expert[oa]?)\b/iu;
const JUNIOR = /\b(junior|jr\.?|becari[oa]|intern|internship|trainee|pr[áa]cticas|graduate|entry[ -]level|reci[eé]n titulad[oa])\b/iu;
const MID = /\b(mid|middle|mid[ -]level|semi[ -]?senior|ssr\.?|intermedi[oa])\b/iu;

/**
 * Returns null when the title says nothing, which is the common case. Callers
 * treat that as its own bucket rather than folding it into a level — a listing
 * that never states a level is not evidence of being mid.
 */
export function detectSeniority(title: string): Seniority | null {
  const isSenior = SENIOR.test(title);
  const isJunior = JUNIOR.test(title);

  // Ranges advertise both ends ("Desarrollador Junior/Senior", "Java Developer
  // Jr-Sr"). Picking either one would be a coin flip, so the title is treated
  // as saying nothing.
  if (isSenior && isJunior) return null;

  // Mid is checked first because "Semi-Senior" contains "Senior": the more
  // specific marker has to win or every semi-senior role reads as senior.
  if (MID.test(title)) return "mid";
  if (isSenior) return "senior";
  if (isJunior) return "junior";

  return null;
}
