import type { NextAuthConfig } from "next-auth";

const authRoutes = ["/login", "/forgot-password", "/reset-password"];

function isAuthRoute(pathname: string) {
  return authRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isProtectedRoute(pathname: string) {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/staff") ||
    pathname.startsWith("/events") ||
    pathname.startsWith("/ledger") ||
    pathname.startsWith("/absence") ||
    pathname.startsWith("/settings")
  );
}

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;

      if (pathname === "/") {
        return true;
      }

      if (isAuthRoute(pathname)) {
        return true;
      }

      if (isProtectedRoute(pathname)) {
        return isLoggedIn;
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
