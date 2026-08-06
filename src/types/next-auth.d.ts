import type { Role } from "@prisma/client";
import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: Role;
      tenantId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    firstName: string;
    lastName: string;
    role: Role;
    tenantId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    firstName: string;
    lastName: string;
    role: Role;
    tenantId: string | null;
  }
}
