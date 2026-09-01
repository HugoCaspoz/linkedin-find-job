"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Field, inputClass } from "@/components/ui";
import { AuthShell, AuthSubmit } from "../AuthShell";

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
    <AuthShell
      mode="/login"
      title="Iniciar sesión"
      subtitle="Bienvenido de nuevo. Tus skills siguen guardadas."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Visible labels rather than placeholders: a placeholder is gone the
            moment you start typing, which is when you most want to check what
            the field was asking for. */}
        <Field id="email" label="Email">
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass()}
          />
        </Field>

        <Field id="password" label="Contraseña">
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass()}
          />
        </Field>

        {error && (
          <p role="alert" className="text-sm text-warn">
            {error}
          </p>
        )}

        <AuthSubmit disabled={loading} className="!mt-6">
          {loading ? "Entrando…" : "Entrar"}
        </AuthSubmit>
      </form>
    </AuthShell>
  );
}
