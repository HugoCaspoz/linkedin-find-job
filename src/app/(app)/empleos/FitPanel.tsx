"use client";

import { useState } from "react";
import {
  FIT_VERDICT_LABELS,
  errorMessage,
  readJson,
  type Job,
  type JobFit,
} from "@/lib/ui";
import { Button, Skeleton, cx } from "@/components/ui";

/**
 * What a listing actually asks for, and whether the CV answers it.
 *
 * Two layers, deliberately separated on the page because they are worth
 * different amounts of trust:
 *
 *  - The excerpt and the years asked for are read straight off the description
 *    with no judgement involved, so they are shown as soon as the row opens.
 *  - The verdict is a model reading the whole description against the CV. It
 *    costs a call, so it happens only when asked for, and says so.
 */

const VERDICT_STYLES: Record<string, { bar: string; text: string }> = {
  strong: { bar: "bg-ok", text: "text-ok" },
  partial: { bar: "bg-medida", text: "text-medida" },
  weak: { bar: "bg-aviso", text: "text-aviso" },
};

export function FitPanel({ job, yearsExp }: { job: Job; yearsExp: number | null }) {
  const [fit, setFit] = useState<JobFit>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function analyze() {
    setLoading(true);
    setError(undefined);

    try {
      const res = await fetch("/api/jobs/fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: job.source, externalId: job.externalId }),
      });
      const data = await readJson(res);

      if (!res.ok) {
        setError(errorMessage(data, "No se pudo analizar el encaje"));
        return;
      }
      setFit(data as JobFit);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  }

  const shortfall =
    job.requiredYears != null && yearsExp != null && job.requiredYears > yearsExp
      ? job.requiredYears - yearsExp
      : undefined;

  return (
    <div className="motion-fade mt-4 border-t border-pauta pt-4">
      {job.excerpt ? (
        <p className="max-w-prose text-sm leading-relaxed text-tinta-2">{job.excerpt}</p>
      ) : (
        <p className="text-sm text-tinta-2">
          Todavía no hemos leído la descripción de esta oferta. El worker la busca
          en su propia página en el siguiente ciclo.
        </p>
      )}

      {job.requiredYears != null && (
        <p className="valor mt-3 text-xs text-tinta-2">
          Pide {job.requiredYears} años de experiencia
          {shortfall != null && (
            <span className="text-aviso"> · te faltan {shortfall}</span>
          )}
        </p>
      )}

      {fit ? (
        <FitVerdict fit={fit} />
      ) : (
        <div className="mt-4">
          {job.canAnalyze ? (
            <Button variant="outline" onClick={analyze} disabled={loading}>
              {loading ? "Analizando…" : "Analizar encaje con mi CV"}
            </Button>
          ) : (
            <p className="text-xs text-tinta-2">
              {job.hasDescription
                ? // Adzuna: served live from their API and never stored, so by the
                  // time an analysis was requested the text would be gone.
                  "Esta oferta se sirve en directo desde su API y no se guarda, así que no se puede analizar."
                : "El análisis necesita la descripción completa, que aún no está disponible."}
            </p>
          )}
        </div>
      )}

      {loading && !fit && (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-aviso">
          {error}
        </p>
      )}
    </div>
  );
}

function FitVerdict({ fit }: { fit: JobFit }) {
  const style = VERDICT_STYLES[fit.verdict] ?? VERDICT_STYLES.weak;

  return (
    <div className="motion-fade mt-4">
      <div className="flex items-baseline gap-3">
        <span className={cx("display text-sm", style.text)}>
          {FIT_VERDICT_LABELS[fit.verdict]}
        </span>
        <span className="valor text-xs text-tinta-2">{fit.score}/100</span>
      </div>

      {/* The score as a measure rather than a number alone, in the same
          vocabulary as the skills gauge above it. */}
      <div
        role="img"
        aria-label={`Encaje ${fit.score} sobre 100`}
        className="mt-2 h-1.5 w-full max-w-64 bg-pauta"
      >
        <div className={cx("h-full", style.bar)} style={{ width: `${fit.score}%` }} />
      </div>

      <p className="mt-3 max-w-prose text-sm leading-relaxed">{fit.summary}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <FitList label="a favor" items={fit.strengths} tone="text-ok" />
        <FitList label="te falta" items={fit.gaps} tone="text-aviso" />
      </div>

      {fit.cached && (
        <p className="valor mt-3 text-xs text-tinta-2">
          Análisis guardado. Se rehace solo si actualizas tu CV.
        </p>
      )}
    </div>
  );
}

function FitList({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: string;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <p className="rotulo">{label}</p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-relaxed">
            <span aria-hidden="true" className={cx("select-none", tone)}>
              ·
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
