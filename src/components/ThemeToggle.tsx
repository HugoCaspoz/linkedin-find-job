"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  THEME_CHOICES,
  readResolvedTheme,
  readServerTheme,
  readThemePreference,
  resolveTheme,
  subscribeTheme,
  writeThemePreference,
  type ResolvedTheme,
} from "@/lib/theme";
import { cx } from "@/components/ui";

const LABELS: Record<ResolvedTheme, string> = {
  light: "Claro",
  dark: "Oscuro",
};

const ICONS: Record<ResolvedTheme, string> = {
  light: "☀",
  dark: "☾",
};

export function ThemeToggle({ className }: { className?: string }) {
  /**
   * The *resolved* appearance, not the stored preference. Somebody who has
   * never chosen is following the OS, and this still marks the button that
   * matches what they are looking at — which is why the interface needs no
   * third "system" control to explain that state.
   */
  const theme = useSyncExternalStore(subscribeTheme, readResolvedTheme, readServerTheme);

  useEffect(() => {
    // Reads the store rather than closing over `theme`. During hydration the
    // rendered value is still the server's assumption, and applying that would
    // briefly overwrite the correct theme the boot script already wrote.
    document.documentElement.dataset.theme = resolveTheme(readThemePreference());
  }, [theme]);

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className={cx(
        "inline-flex items-center rounded-sm border border-pauta-fuerte",
        className
      )}
    >
      {THEME_CHOICES.map((option) => (
        <button
          key={option}
          role="radio"
          aria-checked={theme === option}
          title={LABELS[option]}
          onClick={() => writeThemePreference(option)}
          className={cx(
            "grid size-8 place-items-center text-sm transition",
            theme === option
              ? "bg-marca text-papel"
              : "text-tinta-2 hover:bg-pauta hover:text-tinta"
          )}
        >
          <span aria-hidden="true">{ICONS[option]}</span>
          <span className="sr-only">{LABELS[option]}</span>
        </button>
      ))}
    </div>
  );
}
