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

      router.push("/dashboard");
    } catch {
      setError("No se pudo contactar con el servidor");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 p-8 dark:border-white/10"
      >
        <h1 className="text-xl font-semibold">Iniciar sesión</h1>

        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
        <input
          type="password"
          required
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-black py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          ¿No tienes cuenta?{" "}
          <Link href="/register" className="underline">
            Regístrate
          </Link>
        </p>
      </form>
    </div>
  );
}
