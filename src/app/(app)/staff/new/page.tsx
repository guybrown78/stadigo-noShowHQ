import Link from "next/link";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { StaffForm } from "@/components/staff/staff-form";
import { getTenantProbationDefault } from "@/lib/staff/queries";

export const metadata = { title: "Add staff member" };

export default async function NewStaffPage() {
  const user = await requireTenant();
  const defaultProbationDays = await getTenantProbationDefault(
    prisma,
    user.tenantId,
  );

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href="/staff" className="hover:underline">
          Staff
        </Link>
        <span aria-hidden="true"> / </span>
        Add staff member
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        Add staff member
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Create an operational staff record. This does not create a login or send
        a message to the person.
      </p>
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <StaffForm mode="create" defaultProbationDays={defaultProbationDays} />
      </div>
    </div>
  );
}
