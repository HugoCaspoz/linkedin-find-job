"use client";

import { useState } from "react";
import Link from "next/link";
import { errorMessage, readJson, type Profile } from "@/lib/ui";

export function PerfilClient({ initialProfile }: { initialProfile: Profile | null }) {
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [linkedinText, setLinkedinText] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUploading(true);

    const formData = new FormData();
    if (file) formData.append("cv", file);
    if (linkedinText) formData.append("linkedinText", linkedinText);
    if (linkedinUrl) formData.append("linkedinUrl", linkedinUrl);

    try {
      const res = await fetch("/api/profile/upload", {
        method: "POST",
        body: formData,
      });

      const data = await readJson(res);

      if (!res.ok) {
        setError(errorMessage(data, "Error al procesar el perfil"));
        return;
      }

      setProfile({
        summary: data.profile.summary,
        yearsExp: data.profile.yearsExp,
        skills: data.skills,
      });
    } catch {
      setError("No se pudo contactar con el servidor");
    } finally {
      // In a finally block so a network error or a non-JSON error page can't
      // leave the button stuck on "Analizando...".
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-8 text-2xl font-semibold">Tu perfil</h1>

      <form
        onSubmit={handleUpload}
        className="mb-10 space-y-5 rounded-xl border border-line bg-surface p-6 shadow-sm"
      >
        <h2 className="font-medium">Sube tu CV o pega tu LinkedIn</h2>

        {/* Each control gets a real label. The file input in particular had no
            accessible name at all — a screen reader announced only "button". */}
        <div className="space-y-1.5">
          <label htmlFor="cv" className="block text-sm font-medium">
            CV en PDF
          </label>
          <input
            id="cv"
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="linkedin-url" className="block text-sm font-medium">
            URL de tu perfil de LinkedIn{" "}
            <span className="font-normal text-muted">
              (opcional)
            </span>
          </label>
          <input
            id="linkedin-url"
            type="url"
            placeholder="https://linkedin.com/in/..."
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            className="w-full rounded-md border border-line-strong px-3 py-2 text-sm dark:bg-transparent"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="linkedin-text" className="block text-sm font-medium">
            O pega el texto de tu perfil / experiencia
          </label>
          <textarea
            id="linkedin-text"
            value={linkedinText}
            onChange={(e) => setLinkedinText(e.target.value)}
            rows={5}
            className="w-full rounded-md border border-line-strong px-3 py-2 text-sm dark:bg-transparent"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={uploading || (!file && !linkedinText)}
          className="rounded-md bg-foreground px-4 py-3 text-sm text-canvas transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {uploading ? "Analizando con IA..." : "Analizar perfil"}
        </button>
      </form>

      {profile ? (
        <div>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-medium">
              Skills detectadas{" "}
              <span className="text-sm font-normal text-muted">
                ({profile.skills.length})
              </span>
            </h2>
            <Link href="/empleos" className="text-sm text-accent underline">
              Buscar ofertas
            </Link>
          </div>

          {profile.summary && (
            <p className="mb-4 text-sm text-muted">
              {profile.summary}
              {profile.yearsExp != null && ` — ~${profile.yearsExp} años de experiencia`}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {profile.skills.map((s) => (
              <span
                key={s.name}
                className="rounded-full border border-line px-3 py-1 text-sm"
              >
                {s.name}
                {s.yearsExp != null ? ` · ${s.yearsExp}a` : ""}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Todavía no hay skills detectadas. Sube un CV en PDF o pega el texto de
          tu perfil para empezar.
        </p>
      )}
    </div>
  );
}
