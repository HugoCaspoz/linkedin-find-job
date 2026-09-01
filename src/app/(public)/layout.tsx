import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

/**
 * Shell for the signed-out pages: landing, login and register. Same header and
 * footer as the signed-in side, with the destinations that exist before you
 * have an account.
 *
 * A route group, so the URLs stay `/`, `/login` and `/register`.
 */
const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/login", label: "Acceso", alsoMatches: ["/register"] },
];

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <SiteHeader items={NAV} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
