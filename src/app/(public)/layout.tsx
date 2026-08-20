import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Brand } from "@/components/Logo";

/**
 * Shell for the signed-out pages: landing, login and register. It exists
 * mainly so the theme switcher has one home on this side of the app — putting
 * it on each of the three pages is how one of them ends up without it.
 *
 * A route group, so the URLs stay `/`, `/login` and `/register`.
 */
export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" aria-label="JobMatch, inicio">
          <Brand />
        </Link>

        <ThemeToggle />
      </header>

      {children}
    </>
  );
}
