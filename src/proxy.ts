import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, isValidSessionCookie } from "@/lib/session";

export function proxy(request: NextRequest) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (isValidSessionCookie(sessionCookie)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except /login itself and static/build assets. Server
  // Actions ride along with the page they're invoked from, so gating the
  // page covers them too (see data-security note in Next.js docs).
  matcher: [
    "/((?!login|_next/static|_next/image|favicon.ico).*)",
  ],
};
