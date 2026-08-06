import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  clearActingTenantId,
  getActingTenantId,
} from "@/lib/acting-tenant";
import { prisma } from "@/lib/db";

export type AppUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  tenantId: string | null;
};

export type TenantContext = AppUser & {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  isActingAsTenant: boolean;
};

export async function requireAuth(): Promise<AppUser> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      tenantId: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireRole(...roles: Role[]): Promise<AppUser> {
  const user = await requireAuth();
  if (!roles.includes(user.role)) {
    notFound();
  }
  return user;
}

/**
 * Resolves the active tenant for an ADMIN (their own) or a SUPER_ADMIN
 * who has opened a tenant from platform admin.
 */
export async function requireTenant(): Promise<TenantContext> {
  const user = await requireAuth();

  if (user.role === Role.ADMIN) {
    if (!user.tenantId) {
      notFound();
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, name: true, slug: true },
    });
    if (!tenant) {
      notFound();
    }

    return {
      ...user,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      isActingAsTenant: false,
    };
  }

  if (user.role === Role.SUPER_ADMIN) {
    const actingTenantId = await getActingTenantId();
    if (!actingTenantId) {
      redirect("/admin");
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: actingTenantId },
      select: { id: true, name: true, slug: true },
    });

    if (!tenant) {
      await clearActingTenantId();
      redirect("/admin");
    }

    return {
      ...user,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      isActingAsTenant: true,
    };
  }

  notFound();
}

export function landingPathForRole(role: Role): string {
  return role === Role.SUPER_ADMIN ? "/admin" : "/dashboard";
}
