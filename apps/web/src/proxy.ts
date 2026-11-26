import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

const PUBLIC_PATHS = ["/", "/citations"];

export async function proxy(request: Request) {
  const authResponse = await auth0.middleware(request);
  const { pathname } = new URL(request.url);

  if (pathname.startsWith("/auth") || PUBLIC_PATHS.includes(pathname)) {
    return authResponse;
  }

  const session = await auth0.getSession(request as never);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL(`/auth/login?returnTo=${encodeURIComponent(pathname)}`, request.url));
  }
  return authResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
