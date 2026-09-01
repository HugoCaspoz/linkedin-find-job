import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

/**
 * Wraps the three signed-in tabs. The session check lives here rather than in
 * each page so a new tab added under this group can't be shipped unguarded —
 * forgetting the redirect would otherwise be invisible until someone tried it
 * logged out.
 *
 * A route group `(app)` keeps the URLs flat: /empleos, /perfil, /cuenta.
 */
const NAV = [
  { href: "/empleos", label: "Ofertas" },
  { href: "/perfil", label: "Perfil" },
  { href: "/cuenta", label: "Cuenta" },
];

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <>
      <SiteHeader items={NAV} showSignOut />
      {/* Width is set per screen — results run to 1180px, the profile to 760 —
          so this only carries the vertical rhythm and the growth. */}
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
