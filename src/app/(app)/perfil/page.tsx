import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PerfilClient } from "./PerfilClient";

export default async function PerfilPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
    include: { skills: true },
  });

  return (
    <PerfilClient
      initialProfile={
        profile
          ? {
              summary: profile.summary,
              yearsExp: profile.yearsExp,
              skills: profile.skills.map((s) => ({
                name: s.name,
                category: s.category,
                yearsExp: s.yearsExp,
                level: s.level,
              })),
            }
          : null
      }
    />
  );
}
