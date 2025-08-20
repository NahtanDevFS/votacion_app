import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const protectedRoutes = [
    "/dashboard",
    "/profile",
    "/conteo",
    "/dashboard-encuesta",
    "/conteo-encuesta",
  ];
  const path = request.nextUrl.pathname;

  //Verificar si la ruta está protegida
  const isProtected = protectedRoutes.some((route) => path.startsWith(route));

  if (isProtected) {
    const admin = request.cookies.get("admin")?.value;
    if (!admin) {
      const response = NextResponse.redirect(new URL("/", request.url));
      //Limpiar cookie si está corrupta
      response.cookies.delete("admin");
      return response;
    }
  }

  // Redirigir al dashboard si está logueado y va a login
  if (path === "/login") {
    const admin = request.cookies.get("admin")?.value;
    if (admin) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
