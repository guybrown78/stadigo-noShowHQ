import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { auth } from "@/auth";
import { landingPathForRole } from "@/lib/authz";

export default async function ForgotPasswordPage() {
  const session = await auth();
  if (session?.user?.role) {
    redirect(landingPathForRole(session.user.role));
  }

  return (
    <AuthShell
      title="Reset password"
      footer={
        <Link
          href="/login"
          className="font-medium text-slate-900 underline-offset-2 hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      <p className="mb-4 text-sm text-slate-600">
        Enter your email and we will send a reset link if an account exists.
      </p>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
