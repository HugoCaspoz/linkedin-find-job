import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { requireEnv } from "@/lib/env";

/**
 * The judgement a regex cannot make: does this person's experience actually
 * fit what this listing is asking for.
 *
 * Keyword matching answers "does the word React appear", which is why a listing
 * can score well while asking for eight years of Kubernetes the CV never
 * mentions — and why a listing asking for "microservicios en producción" scores
 * zero against a CV full of Kafka and Docker. This reads both texts.
 *
 * Called for one listing at a time, on request, and cached per profile version
 * (see the JobFit model). Running it over the whole index at indexing time was
 * the alternative and costs a model call per listing per cycle for results
 * nobody may ever look at.
 */

const VERDICTS = ["strong", "partial", "weak"] as const;
export type Verdict = (typeof VERDICTS)[number];

const fitSchema = z.object({
  score: z.coerce.number().min(0).max(100).catch(0),
  verdict: z.enum(VERDICTS).catch("weak"),
  summary: z.string().max(600).catch(""),
  strengths: z.array(z.string().max(200)).max(6).catch([]),
  gaps: z.array(z.string().max(200)).max(6).catch([]),
});

export type JobFitResult = z.infer<typeof fitSchema>;

export class JobFitError extends Error {}

/** Caps on what is sent, so one enormous CV or listing cannot blow the budget. */
const MAX_CV_CHARS = 6000;
const MAX_DESCRIPTION_CHARS = 8000;

const SYSTEM_PROMPT = `Evalúas si un candidato encaja en una oferta de empleo tecnológica.

Recibes el perfil del candidato (resumen, años de experiencia y skills extraídas de su CV) y el texto completo de una oferta. Juzgas la OFERTA COMPLETA, no solo su título: lee los requisitos, los años pedidos, el stack y las responsabilidades.

Reglas:
- Cuenta como fortaleza la experiencia equivalente aunque la oferta use otras palabras (por ejemplo "colas de mensajes" cubre Kafka o RabbitMQ). Di explícitamente cuál es la equivalencia.
- Cuenta como gap solo lo que la oferta pide de verdad. Distingue requisitos de deseables y no infles los gaps con deseables.
- Si la oferta pide más años de los que tiene el candidato, dilo como gap con el número concreto.
- No inventes experiencia que el perfil no menciona.
- Escribe en español, en segunda persona ("tienes", "te falta").

verdict: "strong" si cumple los requisitos principales, "partial" si cumple una parte con gaps salvables, "weak" si le faltan los requisitos centrales.
score: 0-100, coherente con verdict.

Devuelve SOLO JSON válido con este shape exacto, sin texto adicional:
{
  "score": number,
  "verdict": "strong"|"partial"|"weak",
  "summary": string (1-2 frases, el veredicto en lenguaje llano),
  "strengths": string[] (máx 5, lo que sí encaja y por qué),
  "gaps": string[] (máx 5, lo que falta o no se puede comprobar)
}`;

export interface FitCandidate {
  summary?: string | null;
  yearsExp?: number | null;
  skills: string[];
  cvText?: string | null;
}

export interface FitJob {
  title: string;
  company?: string | null;
  location?: string | null;
  description: string;
}

let client: Anthropic | undefined;

function anthropic(): Anthropic {
  // Same pattern as src/lib/extractSkills.ts: built on first use, because the
  // SDK does not fail on a missing key at construction time.
  client ??= new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  return client;
}

/**
 * The prompt's user turn. Kept as its own function because it is the part
 * worth reading when a verdict looks wrong: everything the model knows about
 * the person and the role is in here and nowhere else.
 */
export function buildPrompt(candidate: FitCandidate, job: FitJob): string {
  const years =
    candidate.yearsExp != null ? `${candidate.yearsExp} años` : "no consta";

  return [
    "## Perfil del candidato",
    `Años de experiencia: ${years}`,
    candidate.summary ? `Resumen: ${candidate.summary}` : undefined,
    `Skills detectadas: ${candidate.skills.join(", ") || "ninguna"}`,
    // The CV itself goes in last and truncated: the structured fields above are
    // what the model should lean on, and this is the context that explains them.
    candidate.cvText
      ? `\nExtracto del CV:\n${candidate.cvText.slice(0, MAX_CV_CHARS)}`
      : undefined,
    "\n## Oferta",
    `Puesto: ${job.title}`,
    job.company ? `Empresa: ${job.company}` : undefined,
    job.location ? `Ubicación: ${job.location}` : undefined,
    `\nDescripción completa:\n${job.description.slice(0, MAX_DESCRIPTION_CHARS)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function analyzeJobFit(
  candidate: FitCandidate,
  job: FitJob
): Promise<JobFitResult> {
  const message = await anthropic().messages.create({
    // Haiku rather than the model the CV extraction uses: this runs once per
    // listing a user opens rather than once per CV upload, so it is the call
    // whose cost scales with usage.
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildPrompt(candidate, job) }],
  });

  if (message.stop_reason === "max_tokens") {
    throw new JobFitError("La respuesta del modelo se cortó por longitud");
  }

  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  return parseFit(text);
}

/** Split out from the call so the parsing is testable without a network. */
export function parseFit(text: string): JobFitResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new JobFitError("El modelo no devolvió JSON");

  let raw: unknown;
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    throw new JobFitError("El modelo devolvió JSON malformado");
  }

  const parsed = fitSchema.safeParse(raw);
  if (!parsed.success) {
    throw new JobFitError("El JSON del modelo no tiene el shape esperado");
  }

  // `.catch()` on each field means a partly-malformed response still parses,
  // which is right for the lists but not for the verdict itself: a fit with no
  // summary at all is a failure worth surfacing rather than an empty panel.
  if (!parsed.data.summary.trim()) {
    throw new JobFitError("El modelo no devolvió un veredicto legible");
  }

  return parsed.data;
}
