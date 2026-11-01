import * as users from '../repositories/users.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../auth/password.js';
import { createSessionToken } from '../auth/session.js';
import { AppError, unauthorized } from '../errors.js';

// Simple in-memory brute-force protection: 5 failed logins per email+IP
// per 15 minutes. (Per process - enough for a single campus server.)
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function checkRateLimit(key) {
  const entry = attempts.get(key);
  if (entry && Date.now() - entry.first < WINDOW_MS && entry.count >= MAX_FAILURES) {
    throw new AppError(429, 'Too many failed attempts. Try again in a few minutes.');
  }
}

function recordFailure(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.first >= WINDOW_MS) attempts.set(key, { first: Date.now(), count: 1 });
  else entry.count += 1;
}

const publicUser = ({ password_hash, ...user }) => ({ ...user, is_active: Boolean(user.is_active) });

export async function register({ name, email, srn, password }) {
  const passwordHash = await hashPassword(password);
  const userId = await users.insertStudent({ name, email, srn, passwordHash });
  const user = await users.findById(userId);
  return { user: publicUser(user), token: await createSessionToken(user) };
}

export async function login({ email, password }, clientKey = '') {
  const key = `${email}|${clientKey}`;
  checkRateLimit(key);
  const user = await users.findByEmail(email);
  // Always run bcrypt so response time does not reveal whether the email exists.
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) {
    recordFailure(key);
    throw unauthorized('Incorrect email or password');
  }
  if (!user.is_active) throw new AppError(403, 'This account has been deactivated. Contact the Lost & Found desk.');
  attempts.delete(key);
  return { user: publicUser(user), token: await createSessionToken(user) };
}
