import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { requireEnv } from "@/lib/env";

const skillSchema = z.object({
  name: z.string().min(1).max(80),
  category: z
    .enum(["language", "framework", "tool", "database", "cloud", "other"])
    .catch("other"),
  yearsExp: z.coerce.number().nullable().catch(null),
  level: z.enum(["junior", "mid", "senior"]).nullable().catch(null),
});

const profileSchema = z.object({
  summary: z.string().catch(""),
  totalYearsExp: z.coerce.number().nullable().catch(null),
  skills: z.array(skillSchema).catch([]),
});

export type ExtractedSkill = z.infer<typeof skillSchema>;
export type ExtractedProfile = z.infer<typeof profileSchema>;

/** Guard against a runaway response turning into thousands of Skill rows. */
const MAX_SKILLS = 100;

const SYSTEM_PROMPT = `Extraes datos estructurados de un CV o perfil de LinkedIn en texto plano.
Devuelve SOLO JSON valido con este shape exacto, sin texto adicional:
{
  "summary": string (2-3 frases resumen del perfil),
  "totalYearsExp": number | null (años totales de experiencia profesional estimados),
  "skills": [
    { "name": string, "category": "language"|"framework"|"tool"|"database"|"cloud"|"other", "yearsExp": number|null, "level": "junior"|"mid"|"senior"|null }
  ]
}
Incluye lenguajes de programacion, frameworks, librerias, bases de datos, cloud/devops tools. No inventes años si no hay evidencia, usa null. No repitas la misma skill dos veces.`;

let client: Anthropic | undefined;

function anthropic(): Anthropic {
  // Built on first use. The SDK doesn't fail on a missing key at construction
  // time — it fails much later with "Could not resolve authentication method"
  // — so `requireEnv` is what actually produces a readable error.
  client ??= new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  return client;
}

export class ProfileExtractionError extends Error {}

export async function extractProfile(rawText: string): Promise<ExtractedProfile> {
  const message = await anthropic().messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: rawText.slice(0, 15000) }],
  });

  if (message.stop_reason === "max_tokens") {
    throw new ProfileExtractionError("La respuesta del modelo se cortó por longitud");
  }

  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new ProfileExtractionError("El modelo no devolvió JSON");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    throw new ProfileExtractionError("El modelo devolvió JSON malformado");
  }

  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProfileExtractionError("El JSON del modelo no tiene el shape esperado");
  }

  // The unique constraint is on (profileId, name), so duplicate names coming
  // back from the model would blow up the insert.
  const seen = new Set<string>();
  const skills = parsed.data.skills.filter((s) => {
    const key = s.name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { ...parsed.data, skills: skills.slice(0, MAX_SKILLS) };
}
