/**
 * How a listing is ranked against a profile. Shared so the two places that
 * rank jobs agree: Postgres does it for the indexed listings (in SQL, because
 * ranking has to happen before the LIMIT), and this module does it in JS for
 * the Adzuna results, which arrive from an API already fetched.
 */

/** A hit in the title says far more than one buried in the description. */
export const TITLE_WEIGHT = 3;
export const DESCRIPTION_WEIGHT = 1;

const BACKSLASH = "\\";

/**
 * Regex metacharacters, as a set rather than a character class: skill names
 * really do contain these ("C++", "C#", ".NET", "Node.js" all come straight
 * out of real CVs), and a set keeps the escaping readable.
 */
const META = new Set([
  BACKSLASH, "^", "$", ".", "|", "?", "*", "+", "(", ")", "[", "]", "{", "}",
]);

function escapeRegex(value: string): string {
  return [...value].map((ch) => (META.has(ch) ? BACKSLASH + ch : ch)).join("");
}

/** Postgres spells word boundaries \m and \M; JS uses \b for both. */
const PG_WORD_START = "\\m";
const PG_WORD_END = "\\M";
const JS_BOUNDARY = "\\b";

const STARTS_WITH_WORD_CHAR = /^[\p{L}\p{N}_]/u;
const ENDS_WITH_WORD_CHAR = /[\p{L}\p{N}_]$/u;

/**
 * Matching on a bare substring makes "Go" hit "Django" and "R" hit "React",
 * which is what turns a skill list into noise. Word boundaries fix that, but a
 * boundary only works next to a word character: anchoring the end of "C++"
 * would never match, because "+" is not one. So each side is anchored only
 * when the skill actually ends in a word character on that side.
 */
function buildPattern(skill: string, startBoundary: string, endBoundary: string): string {
  const trimmed = skill.trim();
  const prefix = STARTS_WITH_WORD_CHAR.test(trimmed) ? startBoundary : "";
  const suffix = ENDS_WITH_WORD_CHAR.test(trimmed) ? endBoundary : "";
  return `${prefix}${escapeRegex(trimmed)}${suffix}`;
}

/** Pattern for Postgres `~*`. */
export function postgresPattern(skill: string): string {
  return buildPattern(skill, PG_WORD_START, PG_WORD_END);
}

/** The same rule as a JS regexp, for results that never touch the database. */
export function jsPattern(skill: string): RegExp {
  return new RegExp(buildPattern(skill, JS_BOUNDARY, JS_BOUNDARY), "iu");
}

export interface MatchableJob {
  title: string;
  description?: string | null;
}

export interface MatchResult {
  score: number;
  matchedSkills: string[];
}

/**
 * Score of one listing against a skill list. A skill counts once for the title
 * and once for the description, so a job naming three of your skills in its
 * title outranks one that mentions six only in the body.
 */
export function scoreJob(job: MatchableJob, skills: string[]): MatchResult {
  let score = 0;
  const matchedSkills: string[] = [];

  for (const skill of skills) {
    if (!skill.trim()) continue;
    const pattern = jsPattern(skill);

    const inTitle = pattern.test(job.title);
    const inDescription = job.description ? pattern.test(job.description) : false;

    if (inTitle) score += TITLE_WEIGHT;
    if (inDescription) score += DESCRIPTION_WEIGHT;
    if (inTitle || inDescription) matchedSkills.push(skill);
  }

  return { score, matchedSkills };
}
