"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

const MIN_PASSWORD = 8;

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Checked as you type rather than on submit: finding out the password was
  // too short only after a round trip is the part people find annoying.
  const passwordTooShort =
    passwordTouched && password.length > 0 && password.length < MIN_PASSWORD;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      if (!res.ok) {
        let message = "Error al registrar";
        try {
          const data = await res.json();
          if (typeof data?.error === "string") message = data.error;
        } catch {
          // Non-JSON error page; keep the generic message.
        }
        setError(message);
        setLoading(false);
        return;
      }

      const signInRes = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (signInRes?.error) {
        setError("Cuenta creada, pero falló el login. Intenta iniciar sesión.");
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
        className="w-full max-w-sm space-y-5 rounded-2xl border border-line bg-surface p-8 shadow-sm"
      >
        <h1 className="text-2xl font-semibold tracking-tight">Crear cuenta</h1>

        <div className="space-y-1.5">
          <label htmlFor="name" className="block text-sm font-medium">
            Nombre{" "}
            <span className="font-normal text-muted">
              (opcional)
            </span>
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full min-h-11 rounded-lg border border-line-strong bg-transparent px-3 text-sm placeholder:text-muted"
          />
        </div>

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
            className="w-full min-h-11 rounded-lg border border-line-strong bg-transparent px-3 text-sm placeholder:text-muted"
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
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            aria-describedby="password-hint"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setPasswordTouched(true)}
            className="w-full min-h-11 rounded-lg border border-line-strong bg-transparent px-3 text-sm placeholder:text-muted"
          />
          <p
            id="password-hint"
            className={
              "text-sm " +
              (passwordTooShort
                ? "text-danger"
                : "text-muted")
            }
          >
            Mínimo {MIN_PASSWORD} caracteres
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full min-h-11 rounded-lg bg-accent text-sm font-medium text-accent-contrast transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Creando..." : "Crear cuenta"}
        </button>

        <p className="text-sm text-muted">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-accent underline">
            Inicia sesión
          </Link>
        </p>
      </form>
    </div>
  );
}
