import { requireTenant } from "@/lib/authz";
import { ProfileForm } from "@/components/profile-form";

export default async function SettingsPage() {
  const user = await requireTenant();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Settings
      </h1>
      <p className="mt-2 text-slate-600">
        Manage your personal profile details for this organisation.
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
    </div>
  );
}
