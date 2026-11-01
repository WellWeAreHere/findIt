// Server-side authorisation. The token only identifies the user; role and
// active status are re-read from MySQL on every request, so a deactivated
// or demoted account loses access immediately.
import { cookies } from 'next/headers';
import { queryOne } from '../db/mysql.js';
import { forbidden, unauthorized } from '../errors.js';
import { SESSION_COOKIE, verifySessionToken } from './session.js';

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);
  if (!session) return null;
  const user = await queryOne(
    'SELECT user_id, name, email, srn, role, is_active FROM users WHERE user_id = ?',
    [session.userId],
  );
  return user?.is_active ? { ...user, is_active: Boolean(user.is_active) } : null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'ADMIN') throw forbidden('Administrators only');
  return user;
}

export async function requireStudent() {
  const user = await requireUser();
  if (user.role !== 'STUDENT') throw forbidden('Only students can do this');
  return user;
}

export { isAdmin } from './roles.js';
