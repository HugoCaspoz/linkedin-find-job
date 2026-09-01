import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { FETCH_TIMEOUT_MS } from "./types";
import { throttleHost } from "@/lib/rateLimit";

/**
 * Reading the *description* off a listing, which costs one extra request per
 * job: search-result cards carry a title, a company and a location and nothing
 * else, so everything a listing actually asks for — the stack, the years, the
 * requirements — only exists on its detail page.
 *
 * That is why ranking behaved as if it were title-only even though it has
 * always weighted descriptions (src/lib/matching.ts): the column was simply
 * NULL on every scraped row.
 */

/**
 * What `$(selector)` and `.find()` hand back. Derived from cheerio's own API
 * rather than imported as `Cheerio<Element>` from `domhandler`, which cheerio
 * depends on but this project does not declare — naming it directly would mean
 * relying on npm hoisting for a type.
 */
type Block = ReturnType<CheerioAPI>;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Descriptions are stored, indexed by pg_trgm and later fed to a model, and all
 * three get worse with boilerplate. Long enough for a genuinely detailed
 * listing, short enough that a page whose whole body leaked through cannot
 * bloat the table.
 */
export const MAX_DESCRIPTION_CHARS = 12000;

/**
 * Below this, a block is a teaser or a cookie notice rather than a description.
 * Also the guard that stops the structural fallback returning a breadcrumb.
 */
export const MIN_DESCRIPTION_CHARS = 120;

/** Chrome that is never part of a job description, dropped before any text is read. */
const CHROME_SELECTOR =
  "script, style, noscript, nav, header, footer, form, iframe, svg, button, aside";

/** Block-level tags whose boundaries are real line breaks in the text. */
const BLOCK_SELECTOR = "p, div, li, br, tr, h1, h2, h3, h4, h5, h6, section, article";

/**
 * Fetches a detail page, waiting on the same per-host cooldown the search
 * scrapes use. This pass makes one request per listing instead of one per
 * query, so without sharing that throttle it would be the thing that gets the
 * worker's IP blocked.
 *
 * Returns undefined instead of throwing on every failure mode: at this volume a
 * detail page that 404s, redirects to a login wall or times out is normal, and
 * the caller records the attempt either way.
 */
export async function fetchDetailHtml(
  url: string,
  host: string,
  acceptLanguage = "es-ES,es;q=0.9,en;q=0.8"
): Promise<string | undefined> {
  try {
    await throttleHost(host);

    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
        "Accept-Language": acceptLanguage,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) return undefined;
    return await res.text();
  } catch {
    return undefined;
  }
}

/** Collapses source indentation while keeping one line per block. */
export function cleanText(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_DESCRIPTION_CHARS);
}

/**
 * Text of one element with block boundaries preserved. Cheerio's `.text()`
 * concatenates descendants with no separator at all, which turns
 * `<li>React</li><li>Node</li>` into "ReactNode" — a word the skill matcher
 * then fails to find on either side, so this is correctness and not tidiness.
 */
export function blockText($: CheerioAPI, el: Block): string {
  const clone = el.clone();
  clone.find(CHROME_SELECTOR).remove();
  clone.find(BLOCK_SELECTOR).each((_, node) => {
    $(node).before("\n").after("\n");
  });

  return cleanText(clone.text());
}

/**
 * The description, from the first candidate selector that yields enough text.
 *
 * `selectors` are each site's own markup and are the fast path; they are also
 * the part that rots, since a class rename ships without warning. When all of
 * them miss, the page is read structurally instead, so a redesign degrades the
 * description rather than emptying the column again the way it is empty today.
 */
export function extractDescription(html: string, selectors: string[]): string | undefined {
  const $ = cheerio.load(html);
  $(CHROME_SELECTOR).remove();

  for (const selector of selectors) {
    const el = $(selector).first();
    if (el.length === 0) continue;

    const text = blockText($, el);
    if (text.length >= MIN_DESCRIPTION_CHARS) return text;
  }

  return densestBlock($);
}

/**
 * Readability-lite: the block holding the most prose.
 *
 * Link text is penalised because the runner-up is always a list of related
 * offers or a footer sitemap — long, but almost entirely anchors, while a
 * description is long and almost entirely not. The tie-break favours depth
 * because the winner is otherwise a layout wrapper holding one real block plus
 * whatever chrome shares that wrapper.
 */
function densestBlock($: CheerioAPI): string | undefined {
  let best: Block | undefined;
  let bestScore = 0;

  $("body")
    .find("div, section, article, main, td")
    .each((_, node) => {
      const el = $(node);
      const length = squashed(el.text()).length;
      if (length < MIN_DESCRIPTION_CHARS) return;

      const linkLength = squashed(el.find("a").text()).length;
      const score = length - 3 * linkLength;

      // `>=` so that among wrappers holding the very same text the deepest one
      // wins: `.each` walks document order, which is parents before children.
      if (score >= bestScore) {
        bestScore = score;
        best = el;
      }
    });

  if (!best) return undefined;

  const text = blockText($, best);
  return text.length >= MIN_DESCRIPTION_CHARS ? text : undefined;
}

function squashed(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
