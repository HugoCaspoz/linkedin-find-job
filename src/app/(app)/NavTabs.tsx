"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cx } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

const TABS = [
  { href: "/empleos", label: "Empleos" },
  { href: "/perfil", label: "Perfil" },
  { href: "/cuenta", label: "Cuenta" },
] as const;

export function NavTabs() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-pauta bg-papel/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-6 sm:gap-8">
        {/* Hidden on phones: brand + three tabs + sign-out overflow 390px, and
            the brand is the one piece every page repeats in its own heading. */}
        <Link
          href="/empleos"
          className="hidden shrink-0 items-center gap-2 py-4 sm:flex"
        >
          <span
            aria-hidden="true"
            className="grid size-6 place-items-center rounded-sm bg-tinta text-xs font-bold text-papel"
          >
            J
          </span>
          <span className="text-sm font-semibold tracking-tight">Job Matcher</span>
        </Link>

        <nav className="flex flex-1 gap-1">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                // The active tab is marked for assistive tech too, not just
                // with the underline — the colour change alone says nothing to
                // a screen reader.
                aria-current={active ? "page" : undefined}
                className={cx(
                  "-mb-px border-b-2 px-3 py-4 text-sm transition-colors",
                  active
                    ? "border-marca font-medium text-tinta"
                    : "border-transparent text-tinta-2 hover:text-tinta"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <ThemeToggle />

          {/* py-4 rather than bare text: as an unpadded 20px line this was well
              under the 44px touch target the tabs beside it already meet. */}
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="py-4 text-sm text-tinta-2 transition-colors hover:text-tinta"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
