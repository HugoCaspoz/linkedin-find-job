import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Encuentra empleos que encajan con tu perfil técnico
        </h1>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          Sube tu CV o pega tu LinkedIn. Detectamos tus lenguajes, frameworks
          y años de experiencia, y buscamos ofertas que encajan.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/register"
            className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Crear cuenta
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-black/20 px-5 py-3 text-sm font-medium dark:border-white/20"
          >
            Iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
