import { NextRequest, NextResponse } from 'next/server';

/**
 * Pre-launch gate.
 * Set LAUNCH_CODE env var to enable. When set, visitors must enter the
 * code to access the site. A cookie remembers them so they don't repeat.
 * API endpoints always bypass (desktop app needs them).
 */

const BYPASS_PATHS = [
  '/api/',
  '/verify-email',
  '/reset-password',
  '/_next/',
  '/favicon.ico',
  '/icon-192.png',
  '/apple-touch-icon.png',
];

export function middleware(request: NextRequest) {
  const launchCode = process.env.LAUNCH_CODE;

  // No launch code configured = site is public
  if (!launchCode) return NextResponse.next();

  const pathname = request.nextUrl.pathname;

  // Always bypass API and static paths
  if (BYPASS_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // The launch gate page itself
  if (pathname === '/launch') return NextResponse.next();

  // Check cookie
  const cookie = request.cookies.get('purroxy-launch')?.value;
  if (cookie === launchCode) return NextResponse.next();

  // Redirect to launch gate
  return NextResponse.redirect(new URL('/launch', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
