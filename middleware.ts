import { NextRequest, NextResponse } from "next/server";

const LEGACY_REDIRECTS: Record<string, string> = {
  "/tiquete.html": "/tiquete",
  "/buscar.html": "/buscar",
  "/entrega.html": "/entrega",
  "/pagar.html": "/pagar",
  "/aprobar.html": "/aprobar",
  "/registro.html": "/registro",
  "/index.html": "/",
  "/mini-landing.html": "/"
};

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const match = LEGACY_REDIRECTS[pathname];
  if (match) {
    return NextResponse.redirect(new URL(`${match}${search}`, request.url), { status: 308 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/tiquete.html",
    "/buscar.html",
    "/entrega.html",
    "/pagar.html",
    "/aprobar.html",
    "/registro.html",
    "/index.html",
    "/mini-landing.html"
  ]
};