import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteProfileData } from "@/lib/account";

/**
 * Removes the CV and everything derived from it, keeping the account. Skills
 * go with it through the Profile cascade.
 */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const deleted = await deleteProfileData(session.user.id);

  // Idempotent on purpose: deleting data that is already gone is a success,
  // not a 404, and the client needs no special case for it.
  return NextResponse.json({ deleted });
}
