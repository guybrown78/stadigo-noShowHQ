import { CreateTenantForm } from "@/components/create-tenant-form";

export default function NewTenantPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Create tenant
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Add a customer organisation and provision its initial administrator
        login.
      </p>
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <CreateTenantForm />
      </div>
    </div>
  );
}
