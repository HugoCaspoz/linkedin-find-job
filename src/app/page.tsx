import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/empleos");

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          Encuentra empleos que encajan con tu perfil técnico
        </h1>
        <p className="mt-4 text-muted">
          Sube tu CV o pega tu LinkedIn. Detectamos tus lenguajes, frameworks
          y años de experiencia, y buscamos ofertas que encajan.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/register"
            className="rounded-full bg-foreground px-5 py-3 text-sm font-medium text-canvas transition-opacity hover:opacity-90"
          >
            Crear cuenta
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-line px-5 py-3 text-sm font-medium"
          >
            Iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
