import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export function proxy(request: NextRequest, event: NextFetchEvent) {
  if (
    request.method === "POST" &&
    (request.headers.has("next-action") || request.headers.has("Next-Action"))
  ) {
    return NextResponse.next();
  }

  return auth(request as never, event as never);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
