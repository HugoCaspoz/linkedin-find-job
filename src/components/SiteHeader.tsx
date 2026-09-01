"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";

export interface NavItem {
  href: string;
  label: string;
  /** Extra paths this item stands for. "Acceso" is one destination in the nav
   * but two routes underneath, and the tab has to stay lit across both. */
  alsoMatches?: string[];
}

/**
 * One header for the whole app, signed in or out. It used to be two — a brand
 * bar on the public pages and a tab strip on the private ones — which is how
 * the two sides drifted into different heights, different type and, for a
 * while, only one of them having the theme switch.
 *
 * What changes between the two states is the list of destinations, and that is
 * passed in by the layout that knows the session.
 */
export function SiteHeader({
  items,
  showSignOut = false,
}: {
  items: NavItem[];
  showSignOut?: boolean;
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg">
      <div className="mx-auto flex h-[60px] w-full max-w-[1180px] items-center gap-4 px-6 sm:gap-7">
        <Link
          href={items[0]?.href ?? "/"}
          aria-label="JobMatch, inicio"
          className="flex shrink-0 items-center gap-[9px]"
        >
          <Logo />
          {/* The wordmark is the first thing to go on a narrow screen: the mark
              alone still identifies the app, and the nav needs the room. */}
          <span className="hidden text-[16.5px] font-bold leading-none tracking-[-0.02em] sm:block">
            JobMatch
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-0.5">
          {items.map((item) => {
            const active =
              pathname === item.href || (item.alsoMatches?.includes(pathname) ?? false);

            // The current page is not a link. Marked for assistive tech too,
            // not only by the underline — colour alone says nothing aloud.
            return active ? (
              <span
                key={item.href}
                aria-current="page"
                className="rounded-lg bg-surf2 px-2.5 py-[7px] text-[13.5px] font-semibold text-tx shadow-[inset_0_-2px_0_var(--acc)] sm:px-[13px]"
              >
                {item.label}
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-2.5 py-[7px] text-[13.5px] font-medium text-tx2 transition hover:bg-surf2 hover:text-tx sm:px-[13px]"
              >
                {item.label}
              </Link>
            );
          })}

          {showSignOut && (
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="rounded-lg px-2.5 py-[7px] text-[13.5px] font-medium text-tx2 transition hover:bg-surf2 hover:text-tx sm:px-[13px]"
            >
              Salir
            </button>
          )}
        </nav>

        <ThemeToggle />
      </div>
    </header>
  );
}
