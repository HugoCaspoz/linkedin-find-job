"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

interface Skill {
  name: string;
  category: string | null;
  yearsExp: number | null;
  level: string | null;
}

interface Profile {
  summary: string | null;
  yearsExp: number | null;
  skills: Skill[];
}

type WorkMode = "remote" | "hybrid" | "onsite";

const WORK_MODE_LABELS: Record<WorkMode, string> = {
  remote: "Remoto",
  hybrid: "Híbrido",
  onsite: "Presencial",
};

interface Job {
  source: string;
  title: string;
  company?: string;
  location?: string;
  url: string;
  workMode?: WorkMode;
}

/** A 500 can come back as an HTML error page rather than JSON. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function errorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const { error } = data as { error: unknown };
    if (typeof error === "string") return error;
  }
  return fallback;
}

export function DashboardClient({
  initialProfile,
}: {
  initialProfile: Profile | null;
}) {
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [linkedinText, setLinkedinText] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedModes, setSelectedModes] = useState<WorkMode[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  function toggleMode(mode: WorkMode) {
    setSelectedModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    );
  }

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

  async function handleSearchJobs() {
    setSearching(true);
    setError(null);

    const params = new URLSearchParams();
    if (selectedModes.length > 0) params.set("modes", selectedModes.join(","));

    try {
      const res = await fetch(`/api/jobs/search?${params.toString()}`);
      const data = await readJson(res);

      if (!res.ok) {
        setError(errorMessage(data, "Error buscando empleos"));
        return;
      }

      setJobs(data.jobs);
      setNotice(typeof data.notice === "string" ? data.notice : null);
    } catch {
      setError("No se pudo contactar con el servidor");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tu perfil</h1>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-sm text-zinc-500 underline"
        >
          Cerrar sesión
        </button>
      </div>

      <form
        onSubmit={handleUpload}
        className="mb-10 space-y-4 rounded-xl border border-black/10 p-6 dark:border-white/10"
      >
        <h2 className="font-medium">Sube tu CV o pega tu LinkedIn</h2>

        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />

        <input
          type="url"
          placeholder="URL de tu perfil de LinkedIn (opcional)"
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />

        <textarea
          placeholder="O pega aquí el texto de tu perfil de LinkedIn / experiencia"
          value={linkedinText}
          onChange={(e) => setLinkedinText(e.target.value)}
          rows={5}
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={uploading || (!file && !linkedinText)}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {uploading ? "Analizando con IA..." : "Analizar perfil"}
        </button>
      </form>

      {profile && (
        <div className="mb-10">
          <h2 className="mb-2 font-medium">Skills detectadas</h2>
          {profile.summary && (
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
              {profile.summary}
              {profile.yearsExp != null && ` — ~${profile.yearsExp} años de experiencia`}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {profile.skills.map((s) => (
              <span
                key={s.name}
                className="rounded-full border border-black/20 px-3 py-1 text-xs dark:border-white/20"
              >
                {s.name}
                {s.yearsExp != null ? ` · ${s.yearsExp}a` : ""}
              </span>
            ))}
          </div>

          <div className="mt-6">
            <p className="mb-2 text-sm font-medium">Modalidad</p>
            <div className="flex gap-4">
              {(Object.keys(WORK_MODE_LABELS) as WorkMode[]).map((mode) => (
                <label key={mode} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedModes.includes(mode)}
                    onChange={() => toggleMode(mode)}
                  />
                  {WORK_MODE_LABELS[mode]}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Ninguna marcada = todas las modalidades
            </p>
          </div>

          <button
            onClick={handleSearchJobs}
            disabled={searching}
            className="mt-4 rounded-md border border-black/20 px-4 py-2 text-sm disabled:opacity-50 dark:border-white/20"
          >
            {searching ? "Buscando..." : "Buscar empleos que encajan"}
          </button>
        </div>
      )}

      {notice && (
        <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      {jobs.length > 0 && (
        <div>
          <h2 className="mb-3 font-medium">Empleos encontrados</h2>
          <ul className="space-y-3">
            {jobs.map((j, i) => (
              <li
                key={`${j.source}-${i}`}
                className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/10"
              >
                <a
                  href={j.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline"
                >
                  {j.title}
                </a>
                <p className="text-zinc-600 dark:text-zinc-400">
                  {j.company} {j.location && `· ${j.location}`}
                  {j.workMode && ` · ${WORK_MODE_LABELS[j.workMode]}`} · vía {j.source}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
