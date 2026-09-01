import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { availableSources } from "@/lib/jobQuery";
import { buttonClass } from "@/components/ui";
import { EmpleosClient } from "./EmpleosClient";

/** Mirrors the API's fallback when no skill is ticked. */
const TOP_SKILLS = 5;

export default async function EmpleosPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [profile, sources] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId: session.user.id },
      include: { skills: true },
    }),
    availableSources(),
  ]);

  if (!profile || profile.skills.length === 0) {
    return (
      <div className="motion-rise mx-auto mt-11 max-w-md rounded-2xl border border-dashed border-line2 px-6 py-14 text-center">
        <h1 className="text-lg font-semibold">Aún no sabemos qué buscar</h1>
        <p className="mt-2 text-sm text-tx2">
          Sube tu CV y detectamos tus lenguajes y frameworks. Las ofertas se
          buscan a partir de esas skills.
        </p>
        <Link href="/perfil" className={buttonClass("pill", "mt-6")}>
          Subir mi CV
        </Link>
      </div>
    );
  }

  const byExperience = [...profile.skills].sort(
    (a, b) => (b.yearsExp ?? 0) - (a.yearsExp ?? 0)
  );
  const names = byExperience.map((s) => s.name);

  // Adzuna is a live API rather than something the worker indexes, so it never
  // shows up in the stored sources — but it can still produce results, so the
  // filter has to offer it.
  const withAdzuna = [...new Set([...sources, "adzuna"])];

  return (
    // useSearchParams needs a Suspense boundary above it; without one the whole
    // route opts out of static rendering with a build-time warning.
    <Suspense fallback={<p className="px-6 pt-7 text-sm text-tx2">Cargando filtros…</p>}>
      <EmpleosClient
        skills={names}
        defaultSkills={names.slice(0, TOP_SKILLS)}
        sources={withAdzuna}
        yearsExp={profile.yearsExp}
      />
    </Suspense>
  );
}
