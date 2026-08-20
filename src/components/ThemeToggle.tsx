"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  THEME_PREFERENCES,
  readServerThemePreference,
  readThemePreference,
  resolveTheme,
  subscribeTheme,
  writeThemePreference,
  type ThemePreference,
} from "@/lib/theme";
import { cx } from "@/components/ui";

const LABELS: Record<ThemePreference, string> = {
  light: "Claro",
  dark: "Oscuro",
  system: "Sistema",
};

const ICONS: Record<ThemePreference, string> = {
  light: "☀",
  dark: "☾",
  system: "◐",
};

export function ThemeToggle({ className }: { className?: string }) {
  const preference = useSyncExternalStore(
    subscribeTheme,
    readThemePreference,
    readServerThemePreference
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");

    // Reads the stored value rather than closing over `preference`. During
    // hydration the rendered value is still the server's "system" placeholder,
    // and applying that would briefly overwrite the correct theme the boot
    // script already put on the element.
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(readThemePreference());
    };

    apply();

    // Listening unconditionally is safe: on an explicit light/dark choice the
    // handler re-reads that choice and writes back the same value, so an OS
    // flip at sunset can't override it.
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [preference]);

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className={cx(
        "inline-flex items-center gap-0.5 rounded-full border border-pauta bg-papel p-0.5",
        className
      )}
    >
      {THEME_PREFERENCES.map((option) => (
        <button
          key={option}
          role="radio"
          aria-checked={preference === option}
          title={LABELS[option]}
          onClick={() => writeThemePreference(option)}
          className={cx(
            "grid size-8 place-items-center rounded-full text-sm transition",
            preference === option
              ? "bg-tinta text-papel"
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
