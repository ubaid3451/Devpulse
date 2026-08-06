import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PATHS = ["/feed", "/profile", "/chat", "/admin"];
const AUTH_PATHS = ["/login", "/register", "/verify-otp"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Check our same-domain session cookie (cross-domain backend cookies
  // are not visible to Next.js middleware)
  const session = request.cookies.get("devpulse_session")?.value
    || request.cookies.get("access_token")?.value;

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p));

  // Unauthenticated user trying to access protected route
  if (isProtected && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user trying to access auth pages
  if (isAuthPage && session) {
    return NextResponse.redirect(new URL("/feed", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)).*)",
  ],
};
