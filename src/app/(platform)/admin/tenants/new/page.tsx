import { CreateTenantForm } from "@/components/create-tenant-form";

export default function NewTenantPage() {
  return (
    <div>
      <h1 className="text-[1.75rem] leading-8 font-semibold tracking-[-0.02em] text-foreground">
        Create tenant
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Add a customer organisation and provision its initial administrator
        login.
      </p>
      <div className="mt-8 rounded-lg border border-border bg-surface p-6">
        <CreateTenantForm />
      </div>
    </div>
  );
}
