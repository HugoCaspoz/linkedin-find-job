import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractProfile, ProfileExtractionError } from "@/lib/extractSkills";
import { isOnlyLinks, normalizeLinkedinUrl } from "@/lib/profileInput";
import { checkRateLimit } from "@/lib/rateLimit";

// PDF parsing plus a Claude call; well over the default budget on most hosts.
export const maxDuration = 60;

/** Every upload is a paid Claude call, so this caps cost as much as abuse. */
const UPLOADS_PER_HOUR = 10;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 50_000;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const limit = await checkRateLimit(
    `upload:${session.user.id}`,
    UPLOADS_PER_HOUR,
    60 * 60 * 1000
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Demasiadas subidas seguidas. Inténtalo más tarde." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSecs) } }
    );
  }

  // A JWT keeps naming a user after the row is deleted (jwt strategy, no
  // server-side session store). Checked here, before the PDF parse and the
  // paid Claude call, so a stale token cannot cost money and then die on a
  // foreign-key violation at the final upsert.
  const userExists = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });
  if (!userExists) {
    return NextResponse.json({ error: "La cuenta ya no existe" }, { status: 401 });
  }

  const formData = await req.formData();

  const cv = formData.get("cv");
  // An empty file input still posts a zero-byte File.
  const file = cv instanceof File && cv.size > 0 ? cv : null;

  if (file) {
    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json(
        { error: `El PDF supera el límite de ${MAX_PDF_BYTES / 1024 / 1024} MB` },
        { status: 413 }
      );
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Solo se aceptan archivos PDF" },
        { status: 415 }
      );
    }
  }

  const linkedinTextRaw = formData.get("linkedinText");
  const linkedinText =
    typeof linkedinTextRaw === "string" ? linkedinTextRaw.slice(0, MAX_TEXT_CHARS) : "";

  const linkedinUrlRaw = formData.get("linkedinUrl");
  let linkedinUrl: string | undefined;
  if (typeof linkedinUrlRaw === "string" && linkedinUrlRaw.trim()) {
    linkedinUrl = normalizeLinkedinUrl(linkedinUrlRaw);
    if (!linkedinUrl) {
      return NextResponse.json(
        {
          error:
            "Esa no parece la URL de un perfil de LinkedIn. Ejemplo: https://linkedin.com/in/tu-nombre",
        },
        { status: 400 }
      );
    }
  }

  let rawText = linkedinText.trim();

  if (file) {
    try {
      const { PDFParse } = await import("pdf-parse");
      const buffer = Buffer.from(await file.arrayBuffer());
      const parser = new PDFParse({ data: buffer });
      const parsed = await parser.getText();
      await parser.destroy();
      rawText = `${rawText}\n\n${parsed.text}`.trim();
    } catch {
      return NextResponse.json(
        { error: "No se pudo leer el PDF. ¿Está protegido o es un escaneo sin texto?" },
        { status: 422 }
      );
    }
  }

  if (!rawText) {
    return NextResponse.json(
      { error: "Sube un CV en PDF o pega el texto de tu perfil de LinkedIn" },
      { status: 400 }
    );
  }

  // Before the paid call, because a link is exactly the input the extractor
  // cannot do anything with: it used to spend a Claude call on forty characters
  // of URL and fail with "El modelo no devolvió JSON", which reads like a bug
  // rather than like the thing the app never did. Nothing here fetches the
  // profile — see src/lib/profileInput.ts for why it cannot.
  if (isOnlyLinks(rawText)) {
    return NextResponse.json(
      {
        error:
          "Con el enlace no basta: LinkedIn no deja leer tu perfil desde fuera. Descárgalo en PDF (Más → Guardar como PDF) y súbelo aquí, o pega el texto de tu experiencia.",
      },
      { status: 400 }
    );
  }

  rawText = rawText.slice(0, MAX_TEXT_CHARS);

  let extracted;
  try {
    extracted = await extractProfile(rawText);
  } catch (err) {
    if (err instanceof ProfileExtractionError) {
      return NextResponse.json(
        { error: `No se pudo analizar el perfil: ${err.message}` },
        { status: 422 }
      );
    }
    console.error("extractProfile falló", err);
    return NextResponse.json(
      { error: "El servicio de análisis no está disponible ahora mismo" },
      { status: 503 }
    );
  }

  const userId = session.user.id;
  const profileFields = {
    cvText: rawText,
    linkedinUrl,
    summary: extracted.summary,
    yearsExp: extracted.totalYearsExp ?? undefined,
  };

  // One transaction so a failure can't leave the profile updated with the old
  // skills wiped.
  const profile = await prisma.$transaction(async (tx) => {
    const saved = await tx.profile.upsert({
      where: { userId },
      create: { userId, ...profileFields },
      update: profileFields,
    });

    await tx.skill.deleteMany({ where: { profileId: saved.id } });
    await tx.skill.createMany({
      data: extracted.skills.map((s) => ({
        profileId: saved.id,
        name: s.name,
        category: s.category,
        yearsExp: s.yearsExp ?? undefined,
        level: s.level ?? undefined,
      })),
    });

    return saved;
  });

  // Deliberately not echoing cvText back to the client.
  return NextResponse.json({
    profile: { summary: profile.summary, yearsExp: profile.yearsExp },
    skills: extracted.skills,
  });
}
