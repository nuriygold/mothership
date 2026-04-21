import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const OWNER_COOKIE = 'mothership-owner-id';

// Paths that never require auth
const PUBLIC_PREFIXES = [
  '/login',
  '/demo.html',
  '/api/v2/auth/',
  '/_next/',
  '/favicon',
  '/logo',
  '/manifest.json',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const ownerId = req.cookies.get(OWNER_COOKIE)?.value?.trim();
  if (!ownerId) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    if (pathname !== '/') url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|ico|webp)).*)',
  ],
};
