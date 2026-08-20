import { redirect } from "next/navigation";

/**
 * The single dashboard was split into /empleos, /perfil and /cuenta. Kept as a
 * redirect rather than deleted: it is what every existing bookmark, and the
 * post-login push in older client bundles, still points at.
 */
export default function DashboardPage() {
  redirect("/empleos");
}
