import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";

/**
 * Register and login are one screen with two modes, not two screens that
 * happen to look alike — which is what the segmented control at the top says.
 *
 * They stay two routes underneath, because /login and /register are what the
 * redirects, the bookmarks and the password manager all point at. So the
 * inactive half of the control is a real link rather than a mode switch: the
 * design's behaviour, on the app's URLs.
 */
const MODES = [
  { href: "/register", label: "Crear cuenta" },
  { href: "/login", label: "Iniciar sesión" },
] as const;

export function AuthShell({
  mode,
  title,
  subtitle,
  children,
}: {
  mode: "/register" | "/login";
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="motion-rise mx-auto grid w-full max-w-[1180px] place-items-center px-6 pb-24 pt-16">
      <div className="w-full max-w-[400px]">
        <div
          role="tablist"
          aria-label="Acceso"
          className="mb-6 flex gap-0.5 rounded-[11px] border border-line bg-surf p-[3px]"
        >
          {MODES.map((entry) => {
            const active = entry.href === mode;

            // The current mode is not a link: it is where you already are.
            return active ? (
              <span
                key={entry.href}
                role="tab"
                aria-selected="true"
                className="flex-1 rounded-lg bg-acc py-[9px] text-center text-[13.5px] font-semibold text-acc-tx"
              >
                {entry.label}
              </span>
            ) : (
              <Link
                key={entry.href}
                href={entry.href}
                role="tab"
                aria-selected="false"
                className="flex-1 rounded-lg py-[9px] text-center text-[13.5px] font-medium text-tx2 transition hover:text-tx"
              >
                {entry.label}
              </Link>
            );
          })}
        </div>

        <div className="rounded-2xl border border-line bg-surf p-7">
          <h1 className="text-[25px] font-bold leading-tight tracking-[-0.025em]">
            {title}
          </h1>
          <p className="mt-1.5 text-sm text-tx2">{subtitle}</p>

          <div className="mt-6">{children}</div>
        </div>

        <p className="mt-[18px] text-center text-[13px] text-tx3">
          Siguiente paso: subir el CV. Un minuto.
        </p>
      </div>
    </div>
  );
}

/** The submit button on both forms: full width, and the only filled thing on
 * the card. */
export function AuthSubmit({
  children,
  disabled,
  className,
}: {
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={cx(
        "min-h-11 w-full rounded-[10px] bg-acc py-[13px] text-[15px] font-semibold text-acc-tx transition hover:opacity-[0.88] disabled:cursor-not-allowed disabled:opacity-45",
        className
      )}
    >
      {children}
    </button>
  );
}
