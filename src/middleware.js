// Edge middleware:
//  * redirects signed-out visitors away from protected pages, and students
//    away from /admin (API routes re-check everything on the server);
//  * rejects cross-site state-changing API requests (CSRF defence on top of
//    the SameSite=Lax session cookie).
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './lib/auth/session.js';

const PROTECTED = ['/dashboard', '/report', '/claims', '/notifications', '/admin'];

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.get('origin');
      if (origin && new URL(origin).host !== request.headers.get('host')) {
        return NextResponse.json({ error: 'Cross-site request blocked' }, { status: 403 });
      }
    }
    return NextResponse.next();
  }

  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }
  if (pathname.startsWith('/admin') && session.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*', '/report/:path*', '/claims/:path*', '/notifications/:path*', '/admin/:path*'],
};
