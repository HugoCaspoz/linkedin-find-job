"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Field, inputClass } from "@/components/ui";
import { AuthShell, AuthSubmit } from "../AuthShell";

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
    <AuthShell
      mode="/register"
      title="Crear cuenta"
      subtitle="Gratis, y sin tarjeta. Te lleva menos de un minuto."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field id="name" label="Nombre" optional>
          <input
            id="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass()}
          />
        </Field>

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

        <Field
          id="password"
          label="Contraseña"
          hint={`Mínimo ${MIN_PASSWORD} caracteres`}
          hintTone={passwordTooShort ? "danger" : "muted"}
        >
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
            className={inputClass()}
          />
        </Field>

        {error && (
          <p role="alert" className="text-sm text-warn">
            {error}
          </p>
        )}

        <AuthSubmit disabled={loading} className="!mt-6">
          {loading ? "Creando…" : "Crear cuenta"}
        </AuthSubmit>
      </form>
    </AuthShell>
  );
}
