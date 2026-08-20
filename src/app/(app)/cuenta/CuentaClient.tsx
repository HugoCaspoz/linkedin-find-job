"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { errorMessage, readJson } from "@/lib/ui";
import { Banner, Button, Card, Field, buttonClass, inputClass } from "@/components/ui";

export function CuentaClient({
  email,
  hasProfile,
}: {
  email: string;
  hasProfile: boolean;
}) {
  const router = useRouter();
  const [deletePassword, setDeletePassword] = useState("");
  const [busyAction, setBusyAction] = useState<"cv" | "account" | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataNotice, setDataNotice] = useState<string | null>(null);

  async function handleDeleteCv() {
    if (
      !confirm(
        "Se borrarán tu CV y las skills detectadas. La cuenta se mantiene. ¿Seguro?"
      )
    ) {
      return;
    }

    setDataError(null);
    setDataNotice(null);
    setBusyAction("cv");

    try {
      const res = await fetch("/api/profile", { method: "DELETE" });
      const data = await readJson(res);

      if (!res.ok) {
        setDataError(errorMessage(data, "No se pudieron borrar los datos"));
        return;
      }

      setDataNotice("CV y skills borrados.");
      // The other tabs render the profile that no longer exists, and they were
      // rendered on the server — only a refresh re-runs those queries.
      router.refresh();
    } catch {
      setDataError("No se pudo contactar con el servidor");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();

    if (
      !confirm(
        "Esto borra tu cuenta y todos tus datos de forma permanente. No se puede deshacer. ¿Seguro?"
      )
    ) {
      return;
    }

    setDataError(null);
    setDataNotice(null);
    setBusyAction("account");

    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await readJson(res);

      if (!res.ok) {
        setDataError(errorMessage(data, "No se pudo borrar la cuenta"));
        return;
      }

      // The token stays valid until it expires, so signing out is what
      // actually ends the session for this browser.
      await signOut({ callbackUrl: "/" });
    } catch {
      setDataError("No se pudo contactar con el servidor");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Tu cuenta</h1>
        <p className="mt-1.5 text-muted">{email}</p>
      </header>

      {/* Both outcomes land in one live region: these follow a button press,
          so a screen reader user needs them announced, not just painted. */}
      <div aria-live="polite" className="mb-5 empty:mb-0">
        {dataError && <Banner tone="danger">{dataError}</Banner>}
        {dataNotice && <Banner tone="success">{dataNotice}</Banner>}
      </div>

      <Card>
        <h2 className="font-medium">Tus datos</h2>
        <p className="mt-1.5 text-sm text-muted">
          Guardamos el texto completo de tu CV para detectar tus skills. Puedes
          descargarlo o borrarlo cuando quieras.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <a href="/api/account/export" className={buttonClass("outline")}>
            Descargar mis datos (JSON)
          </a>
          <Button
            type="button"
            variant="outline"
            onClick={handleDeleteCv}
            disabled={busyAction !== null || !hasProfile}
          >
            {busyAction === "cv" ? "Borrando…" : "Borrar mi CV y mis skills"}
          </Button>
        </div>
      </Card>

      {/* Separated into its own card rather than a section inside the one
          above: the irreversible action should not sit two lines below a
          harmless download button. */}
      <div className="mt-6 rounded-2xl border border-danger/40 bg-danger-soft p-6">
        <h2 className="font-medium text-danger">Borrar mi cuenta</h2>
        <p className="mt-1.5 text-sm text-muted">
          Borra la cuenta y todos los datos asociados. No se puede deshacer.
          Confirma con tu contraseña.
        </p>

        <form
          onSubmit={handleDeleteAccount}
          className="mt-5 flex flex-wrap items-end gap-3"
        >
          <div className="w-full sm:w-56">
            <Field id="delete-password" label="Tu contraseña">
              <input
                id="delete-password"
                type="password"
                required
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className={inputClass()}
              />
            </Field>
          </div>
          <Button
            type="submit"
            variant="danger"
            disabled={busyAction !== null || !deletePassword}
          >
            {busyAction === "account" ? "Borrando…" : "Borrar mi cuenta"}
          </Button>
        </form>
      </div>
    </div>
  );
}
