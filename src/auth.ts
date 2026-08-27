import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { Role } from "@prisma/client";
import { authConfig } from "@/auth.config";
import { credentialsSchema } from "@/lib/auth/schema";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          return null;
        }

        const email = parsed.data.email.toLowerCase().trim();
        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user?.passwordHash) {
          return null;
        }

        const valid = await verifyPassword(
          parsed.data.password,
          user.passwordHash,
        );
        if (!valid) {
          return null;
        }

        if (user.role === Role.ADMIN && !user.tenantId) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          tenantId: user.tenantId,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id!;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
        token.role = user.role;
        token.tenantId = user.tenantId;
        token.email = user.email;
      }

      if (trigger === "update" && session?.user) {
        if (typeof session.user.firstName === "string") {
          token.firstName = session.user.firstName;
        }
        if (typeof session.user.lastName === "string") {
          token.lastName = session.user.lastName;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.firstName = token.firstName as string;
        session.user.lastName = token.lastName as string;
        session.user.role = token.role as Role;
        session.user.tenantId = (token.tenantId as string | null) ?? null;
        session.user.email = (token.email as string) ?? "";
        session.user.name = `${session.user.firstName} ${session.user.lastName}`;
      }
      return session;
    },
  },
});
