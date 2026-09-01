/**
 * Theme preference, shared by the inline boot script and the toggle so the two
 * can't disagree about the storage key or the accepted values.
 *
 * localStorage is modelled as an external store rather than mirrored into
 * component state: it is written by the toggle, by the boot script, and by any
 * other tab, and `useSyncExternalStore` is what keeps all three in step
 * without a setState-in-effect round trip.
 */

export const THEME_STORAGE_KEY = "tema";

/**
 * What the user picked. `system` is a real state but not an offered one: it is
 * where everybody starts, and it is what "no choice stored" resolves to. There
 * is no button for it, because the toggle already shows the resolved
 * appearance — a third control for "whatever the OS says" is a state people
 * have to reason about rather than see.
 */
export type ThemePreference = "system" | "light" | "dark";

/** What actually gets written to `data-theme`. */
export type ResolvedTheme = "light" | "dark";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/** The toggle flips; it does not offer a list. */
export function otherTheme(theme: ResolvedTheme): ResolvedTheme {
  return theme === "dark" ? "light" : "dark";
}

/**
 * Runs before the first paint, inlined into <head>.
 *
 * It has to be a string rather than an imported function: a module would be
 * fetched and executed after the document has already painted, which is the
 * flash of the wrong theme this exists to prevent.
 *
 * The try/catch is not defensive padding — reading localStorage throws
 * outright in a cross-origin iframe and under "block third-party cookies",
 * and an exception here would abort the script before the attribute is set.
 * Dark is what it falls back to, because dark is what the stylesheet does with
 * no attribute at all.
 */
export const THEME_BOOT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();
`;

/**
 * Subscribers to same-tab writes. The `storage` event covers other tabs but
 * deliberately never fires in the tab that made the change, so a write has to
 * announce itself.
 */
const listeners = new Set<() => void>();

export function subscribeTheme(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);

  // While no choice is stored the OS *is* the setting, so a sunset flip has to
  // reach the toggle as well as the page.
  const query = window.matchMedia("(prefers-color-scheme: light)");
  query.addEventListener("change", onChange);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
    query.removeEventListener("change", onChange);
  };
}

/** Snapshot for `useSyncExternalStore`. Returns a plain string, so React's
 * referential comparison is a value comparison and no cache is needed. */
export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    // Unreadable storage in some embedding contexts. Following the OS is the
    // right behaviour there.
    return "system";
  }
}

/** There is no storage while rendering on the server, and no way to know the
 * OS setting either. Dark is the assumption, matching the stylesheet's default;
 * the first client render corrects it, and the paint was already correct
 * because the boot script ran first. */
export function readServerTheme(): ResolvedTheme {
  return "dark";
}

/**
 * The appearance actually in force: the stored choice, or the OS when there
 * isn't one. This is what the toggle reports, so the control always shows the
 * truth without needing a third "system" state on screen.
 */
export function readResolvedTheme(): ResolvedTheme {
  return resolveTheme(readThemePreference());
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    // "system" is stored as the absence of a choice, so a browser that later
    // arrives with no value behaves identically to one that picked it.
    if (preference === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The choice still applies to this page; it just won't survive a reload.
  }

  for (const listener of listeners) listener();
}

/** Resolves a preference against the OS setting. Browser-only — it reads
 * matchMedia, which does not exist while rendering on the server. */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}
