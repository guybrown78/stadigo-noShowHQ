import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
import { auth } from "@/auth";
import { landingPathForRole } from "@/lib/authz";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.role) {
    redirect(landingPathForRole(session.user.role));
  }

  return (
    <AuthShell
      title="Sign in"
      footer="Need a password reset? Ask your NoShowHQ platform administrator."
    >
      <LoginForm />
    </AuthShell>
  );
}
