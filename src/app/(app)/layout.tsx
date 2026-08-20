import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { NavTabs } from "./NavTabs";

/**
 * Wraps the three signed-in tabs. The session check lives here rather than in
 * each page so a new tab added under this group can't be shipped unguarded —
 * forgetting the redirect would otherwise be invisible until someone tried it
 * logged out.
 *
 * A route group `(app)` keeps the URLs flat: /empleos, /perfil, /cuenta.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <>
      <NavTabs />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
    </>
  );
}
