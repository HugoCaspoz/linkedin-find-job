import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

const REGISTRATIONS_PER_HOUR = 5;

const schema = z.object({
  email: z.email("Email inválido"),
  // bcrypt silently ignores anything past 72 bytes, so reject it instead.
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(72, "La contraseña no puede pasar de 72 caracteres"),
  name: z.string().max(120, "El nombre es demasiado largo").optional(),
});

export async function POST(req: Request) {
  const limit = await checkRateLimit(
    `register:${clientIp(req)}`,
    REGISTRATIONS_PER_HOUR,
    60 * 60 * 1000
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Demasiados registros desde esta IP. Inténtalo más tarde." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSecs) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // A plain string: the client renders `error` directly, and an object here
    // would blow up the render.
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 }
    );
  }

  const { password, name } = parsed.data;
  // The unique index is case-sensitive, so normalise or the same address can
  // register twice with different casing.
  const email = parsed.data.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email ya registrado" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
  });

  return NextResponse.json({ id: user.id, email: user.email });
}
