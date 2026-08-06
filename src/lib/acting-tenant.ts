import { cookies } from "next/headers";

export const ACTING_TENANT_COOKIE = "noshowhq_acting_tenant";

export async function getActingTenantId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACTING_TENANT_COOKIE)?.value ?? null;
}

export async function setActingTenantId(tenantId: string): Promise<void> {
  const jar = await cookies();
  jar.set(ACTING_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearActingTenantId(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACTING_TENANT_COOKIE);
}
