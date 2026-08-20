"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const TABS = [
  { href: "/empleos", label: "Empleos" },
  { href: "/perfil", label: "Perfil" },
  { href: "/cuenta", label: "Cuenta" },
] as const;

export function NavTabs() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-6 sm:gap-6">
        {/* Hidden on phones: brand + three tabs + sign-out overflow 390px, and
            the brand is the one piece every page repeats in its own heading. */}
        <span className="hidden shrink-0 py-4 text-sm font-semibold tracking-tight sm:block">
          Job Matcher
        </span>

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
                className={
                  "border-b-2 px-3 py-4 text-sm transition-colors " +
                  (active
                    ? "border-accent font-medium text-foreground"
                    : "border-transparent text-muted hover:text-foreground")
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {/* py-4 rather than bare text: as an unpadded 20px line this was well
            under the 44px touch target the tabs beside it already meet. */}
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="shrink-0 py-4 text-sm text-muted underline"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
