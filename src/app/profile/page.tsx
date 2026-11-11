import { AppearanceForm } from "@/components/appearance-form";
import { PasswordForm } from "@/components/password-form";
import { ProfileForm } from "@/components/profile-form";
import { requireAuth } from "@/lib/authz";
import { prisma } from "@/lib/db";

export default async function ProfilePage() {
  const user = await requireAuth();
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { colorScheme: true },
  });

  return (
    <div>
      <h1 className="text-[1.75rem] leading-8 font-semibold tracking-[-0.02em] text-foreground">
        Profile
      </h1>
      <p className="mt-2 text-muted">
        Manage your personal details and sign-in password.
      </p>

      <section className="mt-8 rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-medium text-foreground">Appearance</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Choose light or dark. The app changes as soon as you select one.
        </p>
        <AppearanceForm colorScheme={account?.colorScheme ?? "LIGHT"} />
      </section>

      <section className="mt-8 rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-medium text-foreground">My Profile</h2>
        <p className="mt-1 mb-6 text-sm text-muted">
          Update how your name appears across NoShowHQ.
        </p>
        <ProfileForm
          email={user.email}
          firstName={user.firstName}
          lastName={user.lastName}
        />
      </section>

      <section className="mt-8 rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-medium text-foreground">Password</h2>
        <p className="mt-1 mb-6 text-sm text-muted">
          Change the password used to sign in to this account.
        </p>
        <PasswordForm />
      </section>
    </div>
  );
}
