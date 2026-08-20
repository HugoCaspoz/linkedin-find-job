"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { errorMessage, readJson } from "@/lib/ui";

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
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-2 text-2xl font-semibold">Tu cuenta</h1>
      <p className="mb-8 text-sm text-muted">{email}</p>

      <section className="rounded-xl border border-line bg-surface p-6 shadow-sm">
        <h2 className="font-medium">Tus datos</h2>
        <p className="mt-1 text-sm text-muted">
          Guardamos el texto completo de tu CV para detectar tus skills. Puedes
          descargarlo o borrarlo cuando quieras.
        </p>

        {/* Both outcomes land in one live region: these follow a button press,
            so a screen reader user needs them announced, not just painted. */}
        <div aria-live="polite">
          {dataError && (
            <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">
              {dataError}
            </p>
          )}
          {dataNotice && (
            <p className="mt-4 text-sm text-green-700 dark:text-green-500">
              {dataNotice}
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href="/api/account/export"
            className="rounded-md border border-line-strong px-4 py-3 text-sm"
          >
            Descargar mis datos (JSON)
          </a>
          <button
            type="button"
            onClick={handleDeleteCv}
            disabled={busyAction !== null || !hasProfile}
            className="rounded-md border border-line-strong px-4 py-3 text-sm disabled:opacity-50"
          >
            {busyAction === "cv" ? "Borrando..." : "Borrar mi CV y mis skills"}
          </button>
        </div>

        <form
          onSubmit={handleDeleteAccount}
          className="mt-8 border-t border-line pt-6"
        >
          <h3 className="text-sm font-medium text-red-700 dark:text-red-500">
            Borrar mi cuenta
          </h3>
          <p className="mt-1 text-sm text-muted">
            Borra la cuenta y todos los datos asociados. No se puede deshacer.
            Confirma con tu contraseña.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label htmlFor="delete-password" className="block text-sm font-medium">
                Tu contraseña
              </label>
              <input
                id="delete-password"
                type="password"
                required
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="rounded-md border border-line-strong px-3 py-2 text-sm dark:bg-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={busyAction !== null || !deletePassword}
              className="rounded-md bg-red-600 px-4 py-3 text-sm text-white disabled:opacity-50"
            >
              {busyAction === "account" ? "Borrando..." : "Borrar mi cuenta"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
