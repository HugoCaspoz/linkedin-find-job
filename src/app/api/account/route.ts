import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteAccount } from "@/lib/account";
import { checkRateLimit, isRateLimited } from "@/lib/rateLimit";

/**
 * Irreversible, so it asks for the password again: a session alone should not
 * be enough to destroy the account behind it. Only wrong passwords burn quota,
 * matching how the login limiter works.
 */
const CONFIRM_WINDOW_MS = 15 * 60 * 1000;
const FAILED_CONFIRMS = 5;

const schema = z.object({ password: z.string().min(1, "Falta la contraseña") });

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const userId = session.user.id;

  const limitKey = `account-delete:${userId}`;
  if (await isRateLimited(limitKey, FAILED_CONFIRMS)) {
    return NextResponse.json(
      { error: "Demasiados intentos fallidos. Espera unos minutos." },
      { status: 429 }
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
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  // A JWT outlives the row it names, so this is reachable with a valid token.
  if (!user) {
    return NextResponse.json({ error: "La cuenta ya no existe" }, { status: 401 });
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    await checkRateLimit(limitKey, FAILED_CONFIRMS, CONFIRM_WINDOW_MS);
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 403 });
  }

  await deleteAccount(userId, user.email);

  // The client still holds a usable token; it has to sign out itself. Nothing
  // server-side can revoke it under the JWT strategy — see the README.
  return NextResponse.json({ deleted: true });
}
