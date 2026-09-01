/**
 * What can be read off a job description without asking a model.
 *
 * These are the cheap signals: they run over every result on a page, cost
 * nothing, and are what the list view shows. The expensive judgement — whether
 * a CV actually fits the role — is a model call made one listing at a time
 * (src/lib/jobFit.ts), because it is not something a regex can answer.
 */

/**
 * How much of the description is read for these signals. The requirements
 * block is near the top of essentially every listing, and the alternative —
 * shipping the full 12k characters of every result out of Postgres — costs far
 * more than the tail is worth.
 */
export const SIGNAL_CHARS = 2000;

/** How much of it reaches the browser as preview text. */
export const EXCERPT_CHARS = 400;

/**
 * Years of experience the listing asks for, or undefined if it never says.
 *
 * The *lowest* number stated wins. Listings write ranges ("3-5 años"), several
 * requirements ("5 años en backend, 2 en cloud") and nice-to-haves, and the
 * lowest is the one that decides whether it is worth applying at all — taking
 * the highest would report a hard bar the listing never set.
 */
export function requiredYears(description: string | null | undefined): number | undefined {
  if (!description) return undefined;

  const years: number[] = [];
  for (const match of description.matchAll(YEARS_PATTERN)) {
    const value = Number(match[1]);
    // Past a working lifetime it is a calendar year, a headcount or a revenue
    // figure that happened to land next to the unit.
    if (!Number.isFinite(value) || value <= 0 || value > 40) continue;
    // "20 años en el mercado" is the company introducing itself, not a bar the
    // candidate has to clear. Excluded by phrase rather than by requiring a
    // word like "experiencia" nearby: plenty of real listings write "5 años en
    // backend" with no such word, and demanding one loses more than it saves.
    if (isCompanyTenure(description, match.index ?? 0, match[0].length)) continue;

    years.push(value);
  }

  return years.length > 0 ? Math.min(...years) : undefined;
}

/**
 * Both languages, because listings on these boards are written in either and
 * often in both at once. The number and the unit have to be adjacent, which is
 * what keeps "más de 3 puestos" and "2 sedes" out.
 *
 * Written as one pattern with an alternation on the unit rather than as two
 * patterns, so every match's offset is directly comparable against the text,
 * which is what the surrounding-phrase check below needs.
 */
const YEARS_PATTERN =
  /(\d{1,2})\s*(?:\+|-|–|\s+(?:a|to))?\s*(?:\d{1,2})?\s*(?:años?|anos?|years?|yrs?)\b/gi;

/** How far either side of the figure the surrounding phrase is read. */
const CONTEXT_WINDOW = 45;

/**
 * Phrases that mean the years belong to the company or to the past, not to the
 * candidate. Each one is something a listing only ever writes about itself.
 */
const COMPANY_TENURE =
  /en el mercado|de historia|de trayectoria|de vida|fundad[ao]|desde hace|hace \d|llevamos|on the market|in business|founded/i;

/** Where one claim stops and the next begins. Bullets count: listings are lists. */
const SENTENCE_BREAK = /[.;\n\u2022\u00b7|]/;

function isCompanyTenure(text: string, index: number, length: number): boolean {
  return COMPANY_TENURE.test(sentenceAround(text, index, length));
}

/**
 * The claim the figure sits in, never more.
 *
 * A fixed window either side is not enough on its own: "Empresa con 25 años en
 * el mercado. Buscamos backend con 3 años de experiencia" puts the boilerplate
 * within a few characters of a genuine requirement, and reading across the full
 * stop throws the requirement away. Stopping at the sentence break is what
 * keeps two adjacent claims from being read as one.
 */
function sentenceAround(text: string, index: number, length: number): string {
  const before = text.slice(Math.max(0, index - CONTEXT_WINDOW), index);
  const after = text.slice(index + length, index + length + CONTEXT_WINDOW);

  const breakBefore = lastMatch(before);
  const breakAfter = after.search(SENTENCE_BREAK);

  return (
    before.slice(breakBefore + 1) +
    text.slice(index, index + length) +
    (breakAfter === -1 ? after : after.slice(0, breakAfter))
  );
}

/** Index of the last sentence break in `value`, or -1. */
function lastMatch(value: string): number {
  for (let i = value.length - 1; i >= 0; i -= 1) {
    if (SENTENCE_BREAK.test(value[i])) return i;
  }
  return -1;
}

/**
 * The opening of the description, cut on a word boundary.
 *
 * Sent instead of the full text because nothing in the list view renders more
 * than a couple of lines, and a page of twenty-four full descriptions is a
 * quarter of a megabyte of JSON that the browser would parse and discard.
 */
export function excerpt(description: string | null | undefined): string | undefined {
  if (!description) return undefined;

  const flat = description.replace(/\s+/g, " ").trim();
  if (!flat) return undefined;
  if (flat.length <= EXCERPT_CHARS) return flat;

  const cut = flat.slice(0, EXCERPT_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > EXCERPT_CHARS / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Whether the listing asks for more experience than the profile has.
 *
 * Only ever reported when both numbers are known: a profile with no stated
 * years is not "under-qualified", it is unmeasured, and telling someone they
 * fall short on a comparison that never happened is worse than saying nothing.
 */
export function yearsShortfall(
  asked: number | undefined,
  has: number | null | undefined
): number | undefined {
  if (asked == null || has == null) return undefined;
  const gap = asked - has;
  return gap > 0 ? gap : undefined;
}
