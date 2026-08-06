import Link from "next/link";
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
      footer={
        <>
          Need a password reset?{" "}
          <Link
            href="/forgot-password"
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            Reset it here
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
