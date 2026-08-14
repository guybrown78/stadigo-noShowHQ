import { PasswordForm } from "@/components/password-form";
import { ProfileForm } from "@/components/profile-form";
import { requireAuth } from "@/lib/authz";

export default async function ProfilePage() {
  const user = await requireAuth();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Profile
      </h1>
      <p className="mt-2 text-slate-600">
        Manage your personal details and sign-in password.
      </p>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-medium text-slate-900">My Profile</h2>
        <p className="mt-1 mb-6 text-sm text-slate-600">
          Update how your name appears across NoShowHQ.
        </p>
        <ProfileForm
          email={user.email}
          firstName={user.firstName}
          lastName={user.lastName}
        />
      </section>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-medium text-slate-900">Password</h2>
        <p className="mt-1 mb-6 text-sm text-slate-600">
          Change the password used to sign in to this account.
        </p>
        <PasswordForm />
      </section>
    </div>
  );
}
