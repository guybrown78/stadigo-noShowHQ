import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { landingPathForRole } from "@/lib/authz";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.role) {
    redirect("/login");
  }
  redirect(landingPathForRole(session.user.role));
}
