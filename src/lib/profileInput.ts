/**
 * Validating what someone pasted into the profile form, before it costs a
 * model call.
 *
 * The form offers three ways in — a PDF, pasted text, and a LinkedIn URL — and
 * only the first two are a *source*. The URL is stored as a field of the
 * profile and nothing ever fetches it: LinkedIn serves `/in/…` behind an
 * authentication wall and answers datacenter IPs with 999, so the job scraper
 * working against `/jobs/search` says nothing about profiles being reachable.
 *
 * That gap is what these two functions cover. People do paste the link on its
 * own and expect it to be read, and until now the request went straight to the
 * extractor, which spent a paid call on forty characters of URL and came back
 * with "El modelo no devolvió JSON" — a failure that reads like a bug in the
 * app rather than a thing it was never able to do.
 */

/** Below this much prose alongside a link, there is nothing to extract from. */
const MIN_PROSE_CHARS = 40;

/**
 * Links in free text, in the three shapes people actually paste: with a
 * scheme, with a bare `www.`, and as a naked `host/path`.
 *
 * The last alternative requires a slash and something after it, which is what
 * keeps it from eating ordinary prose — "Node.js" and "React 18.2" have no
 * path, so they are not links and are not stripped.
 */
const URL_PATTERN =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S+/gi;

/** Letters and digits only: punctuation left behind by a stripped link is not prose. */
function proseLength(value: string): number {
  return (value.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

/**
 * Whether the paste is a link and essentially nothing else.
 *
 * Deliberately narrow: text containing no link at all is never rejected, however
 * short. A terse but genuine "Dev backend, 6 años en PHP y Laravel" is a real
 * profile the extractor handles, and this must not be the thing that turns it
 * away. The threshold only ever applies to what is left *after* a link was
 * removed, which is why it can afford to be as high as it is — "Mi perfil:
 * https://…" is caught, a CV that happens to cite a repo is not.
 */
export function isOnlyLinks(text: string): boolean {
  const stripped = text.replace(URL_PATTERN, " ");
  if (stripped === text) return false;

  return proseLength(stripped) < MIN_PROSE_CHARS;
}

/**
 * A LinkedIn profile URL in canonical form, or undefined if it is not one.
 *
 * Normalises before validating rather than the other way round: nobody types
 * "https://" by hand, and `z.url()` rejects `linkedin.com/in/nombre` outright,
 * which turned the commonest way of writing the field into an error message.
 *
 * The host is checked because the field asks for a LinkedIn profile and the
 * previous schema accepted any http(s) URL at all, so `https://ejemplo.com`
 * was stored as one.
 */
export function normalizeLinkedinUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return undefined;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;

  const host = url.hostname.toLowerCase();
  // Subdomains because the same profile is served from `www.`, `es.` and `m.`,
  // and someone copying from their phone gets the last of those.
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return undefined;

  // Share links arrive carrying `?utm_source=share&utm_medium=member_ios`,
  // which is noise in a stored field and follows the user around every time it
  // is displayed.
  url.search = "";
  url.hash = "";

  return url.toString();
}
