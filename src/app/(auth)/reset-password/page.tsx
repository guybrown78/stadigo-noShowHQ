import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { auth } from "@/auth";
import { landingPathForRole } from "@/lib/authz";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role) {
    redirect(landingPathForRole(session.user.role));
  }

  const { token } = await searchParams;

  if (!token) {
    return (
      <AuthShell
        title="Reset password"
        footer={
          <Link
            href="/forgot-password"
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            Request a new link
          </Link>
        }
      >
        <p className="text-sm text-slate-600">
          This reset link is missing or invalid.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      footer={
        <Link
          href="/login"
          className="font-medium text-slate-900 underline-offset-2 hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
