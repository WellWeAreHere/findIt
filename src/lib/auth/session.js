// Signed session tokens (JWT, HS256) stored in an httpOnly cookie.
// Uses only `jose`, so it also runs in Next.js middleware (edge runtime).
import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'findit_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters');
  return new TextEncoder().encode(secret);
}

export async function createSessionToken({ user_id, role, name }) {
  return new SignJWT({ role, name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user_id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

// Returns { userId, role, name } or null for a missing/invalid/expired token.
export async function verifySessionToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    return { userId: Number(payload.sub), role: payload.role, name: payload.name };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_MAX_AGE,
};
