import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
    include: { skills: true },
  });

  return (
    <DashboardClient
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
