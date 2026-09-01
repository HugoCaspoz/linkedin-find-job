"use client";

import { useState } from "react";
import Link from "next/link";
import { errorMessage, groupByCategory, readJson, type Profile } from "@/lib/ui";
import {
  Banner,
  Field,
  buttonClass,
  cx,
  inputClass,
  textareaClass,
} from "@/components/ui";

/** What /api/profile/upload accepts, said before the server has to say it. */
const MAX_MB = 5;

export function PerfilClient({ initialProfile }: { initialProfile: Profile | null }) {
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [linkedinText, setLinkedinText] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Dropping is the affordance the zone advertises, so it has to work — a
   * dashed rectangle saying "arrastra tu CV" that only responds to a click is
   * the kind of detail that costs trust everywhere else on the page.
   */
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);

    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;

    if (dropped.type !== "application/pdf") {
      setError("El CV tiene que ser un PDF.");
      return;
    }
    if (dropped.size > MAX_MB * 1024 * 1024) {
      setError(`El archivo pasa de ${MAX_MB} MB.`);
      return;
    }

    setError(null);
    setFile(dropped);
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
      // leave the button stuck on "Analizando…".
      setUploading(false);
    }
  }

  const groups = profile ? groupByCategory(profile.skills) : [];

  return (
    <div className="motion-rise mx-auto w-full max-w-[760px] px-6 pb-24 pt-11">
      <h1 className="text-[34px] font-bold leading-tight tracking-[-0.03em]">
        Tu perfil
      </h1>
      <p className="mt-2 max-w-[52ch] text-base text-tx2">
        De tu CV salen las skills, y de las skills salen las ofertas. Es el único
        paso que hay que hacer bien.
      </p>

      <form
        onSubmit={handleUpload}
        className="mt-8 rounded-2xl border border-line bg-surf p-[26px]"
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cx(
            "rounded-[13px] border-[1.5px] border-dashed bg-bg px-6 py-[34px] text-center transition-colors",
            dragging ? "border-acc-line bg-acc-soft" : "border-line2"
          )}
        >
          <svg
            viewBox="0 0 24 24"
            width="26"
            height="26"
            fill="none"
            stroke="var(--acc)"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
            className="mx-auto mb-3"
          >
            <path d="M12 16V4" />
            <path d="M7 9l5-5 5 5" />
            <path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
          </svg>

          <p className="text-base font-semibold">
            {file ? file.name : "Arrastra tu CV en PDF"}
          </p>
          <p className="mt-1 text-[13.5px] text-tx2">
            {file
              ? `${(file.size / 1024 / 1024).toFixed(1)} MB · listo para analizar`
              : `o busca el archivo en tu equipo · máx. ${MAX_MB} MB`}
          </p>

          {/* The input stays in the DOM and keeps its label: the visible button
              is a proxy for it, not a replacement, so the field is still
              reachable by keyboard and announced as a file input. */}
          <label htmlFor="cv" className={buttonClass("outline", "mt-4 cursor-pointer")}>
            {file ? "Elegir otro" : "Elegir archivo"}
          </label>
          <input
            id="cv"
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
        </div>

        <div className="my-[22px] flex items-center gap-3.5 text-xs uppercase tracking-[0.06em] text-tx3">
          <span className="h-px flex-1 bg-line" />o pégalo
          <span className="h-px flex-1 bg-line" />
        </div>

        <div className="space-y-4">
          <Field id="linkedin-text" label="Tu experiencia en texto">
            <textarea
              id="linkedin-text"
              value={linkedinText}
              onChange={(e) => setLinkedinText(e.target.value)}
              rows={4}
              placeholder="Desarrollador backend con 6 años en PHP y Laravel…"
              className={textareaClass()}
            />
          </Field>

          {/* Marked as a stored field rather than a source, because that is
              what it is: LinkedIn walls profile pages, so nothing here can read
              one. Saying so is the fix for people pasting the link and getting
              an extraction error back. */}
          <Field
            id="linkedin-url"
            label="URL de tu perfil de LinkedIn"
            optional
            hint="Solo se guarda como dato de tu perfil: LinkedIn no permite leerlo desde fuera. Para usarlo, descárgalo en PDF (Más → Guardar como PDF) y súbelo arriba."
          >
            <input
              id="linkedin-url"
              type="url"
              placeholder="https://linkedin.com/in/…"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              aria-describedby="linkedin-url-hint"
              className={inputClass()}
            />
          </Field>
        </div>

        {error && <Banner tone="danger" className="mt-4">{error}</Banner>}

        <button
          type="submit"
          disabled={uploading || (!file && !linkedinText)}
          className="mt-[18px] min-h-11 w-full rounded-[10px] bg-acc py-[13px] text-[15px] font-semibold text-acc-tx transition hover:opacity-[0.88] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {uploading ? "Analizando con IA…" : "Analizar perfil"}
        </button>
        <p className="mt-3 text-center text-[12.5px] text-tx3">
          Tarda unos 10 segundos. Puedes editar la lista después.
        </p>
      </form>

      {profile ? (
        <section className="mt-10">
          <div className="mb-[18px] flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[21px] font-bold tracking-[-0.025em]">
              Skills detectadas{" "}
              <span className="valor text-[15px] font-normal text-tx3">
                {profile.skills.length}
              </span>
            </h2>
            <Link href="/empleos" className={buttonClass("outline")}>
              Buscar ofertas con estas skills
            </Link>
          </div>

          {profile.summary && (
            <p className="mb-[22px] rounded-xl border border-line bg-acc-soft px-[18px] py-4 text-[14.5px] leading-relaxed">
              {profile.summary}
              {profile.yearsExp != null && (
                <span className="text-tx2"> — ~{profile.yearsExp} años de experiencia</span>
              )}
            </p>
          )}

          {/* Grouped by category: twenty pills in one heap is a wall, the same
              twenty under five headings is a summary. */}
          <div className="flex flex-col gap-5">
            {groups.map(([label, items]) => (
              <div key={label}>
                <h3 className="rotulo mb-2.5 text-tx3">{label}</h3>
                <div className="flex flex-wrap gap-[7px]">
                  {items.map((s) => (
                    <span
                      key={s.name}
                      className="inline-flex items-center gap-[7px] rounded-[9px] border border-line bg-surf px-3 py-[7px] text-sm"
                    >
                      {s.name}
                      {s.yearsExp != null && (
                        <span className="valor text-xs text-tx3">{s.yearsExp}a</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <p className="mt-8 text-center text-sm text-tx3">
          Todavía no hay skills detectadas. Sube un CV en PDF o pega el texto de
          tu perfil para empezar.
        </p>
      )}
    </div>
  );
}
