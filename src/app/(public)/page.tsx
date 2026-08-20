import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { buttonClass } from "@/components/ui";

const STEPS = [
  {
    title: "Sube tu CV",
    body: "Un PDF, o el texto de tu perfil de LinkedIn pegado tal cual.",
  },
  {
    title: "Detectamos tus skills",
    body: "Lenguajes, frameworks, bases de datos y años de experiencia por cada uno.",
  },
  {
    title: "Filtras las ofertas",
    body: "Por skill, nivel, modalidad, fecha y ubicación, sobre InfoJobs, LinkedIn y Tecnoempleo.",
  },
];

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/empleos");

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Ofertas que encajan con tu perfil técnico
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-lg text-muted text-balance">
          Sin escribir la búsqueda. Tus skills salen del CV, y las ofertas se
          ordenan por cuántas de ellas cumplen.
        </p>

        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/register" className={buttonClass("primary", "px-6")}>
            Crear cuenta
          </Link>
          <Link href="/login" className={buttonClass("outline", "px-6")}>
            Iniciar sesión
          </Link>
        </div>
      </div>

      <ol className="mt-20 grid w-full max-w-4xl gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="rounded-2xl border border-line bg-surface p-6 text-left shadow-sm"
          >
            <span
              // Decorative: the ordinal is already conveyed by the <ol>, so
              // repeating it to a screen reader is noise.
              aria-hidden="true"
              className="grid size-7 place-items-center rounded-full bg-accent-soft text-sm font-medium text-accent"
            >
              {i + 1}
            </span>
            <h2 className="mt-4 font-medium">{step.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
