"use client";

import { useState } from "react";
import Link from "next/link";
import { errorMessage, groupByCategory, readJson, type Profile } from "@/lib/ui";
import {
  Banner,
  Button,
  Card,
  Field,
  buttonClass,
  inputClass,
} from "@/components/ui";

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

  const groups = profile ? groupByCategory(profile.skills) : [];

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Tu perfil</h1>
        <p className="mt-1.5 text-muted">
          De tu CV salen las skills, y de las skills salen las ofertas. Todo lo
          demás depende de este paso.
        </p>
      </header>

      <Card>
        <form onSubmit={handleUpload} className="space-y-5">
          <h2 className="font-medium">Sube tu CV o pega tu LinkedIn</h2>

          {/* Each control gets a real label. The file input in particular had
              no accessible name at all — a screen reader announced only
              "button". */}
          <Field id="cv" label="CV en PDF">
            <input
              id="cv"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-line-strong file:bg-transparent file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground"
            />
          </Field>

          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted">
            <span className="h-px flex-1 bg-line" />o<span className="h-px flex-1 bg-line" />
          </div>

          <Field id="linkedin-text" label="Pega el texto de tu perfil / experiencia">
            <textarea
              id="linkedin-text"
              value={linkedinText}
              onChange={(e) => setLinkedinText(e.target.value)}
              rows={5}
              placeholder="Desarrollador backend con 6 años en PHP y Laravel…"
              className={inputClass("min-h-32 py-2 leading-relaxed")}
            />
          </Field>

          <Field id="linkedin-url" label="URL de tu perfil de LinkedIn" optional>
            <input
              id="linkedin-url"
              type="url"
              placeholder="https://linkedin.com/in/…"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              className={inputClass()}
            />
          </Field>

          {error && <Banner tone="danger">{error}</Banner>}

          <Button type="submit" disabled={uploading || (!file && !linkedinText)}>
            {uploading ? "Analizando con IA…" : "Analizar perfil"}
          </Button>
        </form>
      </Card>

      {profile ? (
        <section className="mt-10">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg font-medium">
              Skills detectadas
              <span className="ml-1.5 text-sm font-normal text-muted">
                {profile.skills.length}
              </span>
            </h2>
            <Link href="/empleos" className={buttonClass("outline")}>
              Buscar ofertas con estas skills
            </Link>
          </div>

          {profile.summary && (
            <Card className="mb-6 bg-accent-soft/50">
              <p className="text-sm leading-relaxed">
                {profile.summary}
                {profile.yearsExp != null && (
                  <span className="text-muted">
                    {" "}
                    — ~{profile.yearsExp} años de experiencia
                  </span>
                )}
              </p>
            </Card>
          )}

          {/* Grouped by category: twenty pills in one heap is a wall, the same
              twenty under five headings is a summary. */}
          <div className="space-y-5">
            {groups.map(([label, items]) => (
              <div key={label}>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                  {label}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((s) => (
                    <span
                      key={s.name}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm"
                    >
                      {s.name}
                      {s.yearsExp != null && (
                        <span className="text-xs text-muted">{s.yearsExp}a</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <p className="mt-8 text-center text-sm text-muted">
          Todavía no hay skills detectadas. Sube un CV en PDF o pega el texto de
          tu perfil para empezar.
        </p>
      )}
    </div>
  );
}
