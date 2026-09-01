"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  otherTheme,
  readResolvedTheme,
  readServerTheme,
  readThemePreference,
  resolveTheme,
  subscribeTheme,
  writeThemePreference,
} from "@/lib/theme";
import { cx } from "@/components/ui";

/** The glyph names the appearance you are in, not the one you would get. */
const ICONS = { dark: "☀", light: "☾" } as const;
const LABELS = {
  dark: "Cambiar a claro",
  light: "Cambiar a oscuro",
} as const;

export function ThemeToggle({ className }: { className?: string }) {
  /**
   * The *resolved* appearance, not the stored preference. Somebody who has
   * never chosen is following the OS, and flipping from there has to land on
   * the opposite of what they are actually looking at — which is why the
   * interface needs no third "system" control to explain that state.
   */
  const theme = useSyncExternalStore(subscribeTheme, readResolvedTheme, readServerTheme);

  useEffect(() => {
    // Reads the store rather than closing over `theme`. During hydration the
    // rendered value is still the server's assumption, and applying that would
    // briefly overwrite the correct theme the boot script already wrote.
    document.documentElement.dataset.theme = resolveTheme(readThemePreference());
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => writeThemePreference(otherTheme(theme))}
      aria-label={LABELS[theme]}
      title={LABELS[theme]}
      className={cx(
        "grid size-[34px] shrink-0 place-items-center rounded-[9px] border border-line bg-surf text-[13px] text-tx2 transition hover:border-line2 hover:text-tx",
        className
      )}
    >
      <span aria-hidden="true">{ICONS[theme]}</span>
    </button>
  );
}
