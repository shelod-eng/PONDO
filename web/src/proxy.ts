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
  const { pathname } = request.nextUrl;

  if (process.env.PONDO_MAINTENANCE_MODE === "true") {
    if (isAssetPath(pathname) || pathname === "/under-construction") {
      return NextResponse.next();
    }

    return NextResponse.rewrite(new URL("/under-construction", request.url));
  }

  if (process.env.PONDO_ADMIN_MODE !== "true") {
    return NextResponse.next();
  }

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
