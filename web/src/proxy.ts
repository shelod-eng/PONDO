import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function isAssetPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/next.svg") ||
    pathname.startsWith("/globe.svg") ||
    pathname.startsWith("/file.svg") ||
    pathname.startsWith("/vercel.svg") ||
    pathname.startsWith("/window.svg")
  );
}

export function proxy(request: NextRequest) {
  if (process.env.PONDO_ADMIN_MODE !== "true") {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (isAssetPath(pathname)) {
    return NextResponse.next();
  }

  const allowedAdminPaths = ["/", "/PondoAdmin", "/checkout", "/sponsor"];

  if (allowedAdminPaths.some((allowedPath) => pathname === allowedPath || pathname.startsWith(`${allowedPath}/`))) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/((?!api).*)"],
};
