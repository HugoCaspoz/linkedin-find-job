"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        // `code` comes from the custom CredentialsSignin thrown in
        // src/lib/auth.ts; anything else stays deliberately generic so a wrong
        // password and an unknown address look identical.
        setError(
          res.code === "rate_limited"
            ? "Demasiados intentos fallidos. Espera unos minutos."
            : "Email o contraseña incorrectos"
        );
        setLoading(false);
        return;
      }

      router.push("/empleos");
    } catch {
      setError("No se pudo contactar con el servidor");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-surface p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Iniciar sesión</h1>

        {/* Visible labels rather than placeholders: a placeholder is gone the
            moment you start typing, which is when you most want to check what
            the field was asking for. */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-line-strong px-3 py-2 dark:bg-transparent"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-medium">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-line-strong px-3 py-2 dark:bg-transparent"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-foreground py-3 text-canvas transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <p className="text-sm text-muted">
          ¿No tienes cuenta?{" "}
          <Link href="/register" className="text-accent underline">
            Regístrate
          </Link>
        </p>
      </form>
    </div>
  );
}
