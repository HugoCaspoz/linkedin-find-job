import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CuentaClient } from "./CuentaClient";

export default async function CuentaPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, profile: { select: { id: true } } },
  });
  if (!user) redirect("/login");

  return <CuentaClient email={user.email} hasProfile={user.profile !== null} />;
}
